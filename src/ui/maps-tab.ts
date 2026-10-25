// The Maps tab (version 2): maps inside maps in a tree on the right (or the Codex, to drag pins
// from), and the open map in the middle with its tools. Bring in a picture, draw on top, drop
// anything from the Codex to pin it. Click a pin to open what it links to; double-click to change
// it. Ctrl+D copies a pin with its link, Ctrl+Shift+D just its look.

import type { MapTreeNode, MapView, PinView, Shape } from "../app/backend.ts";
import { api, pictureUrl } from "./api.ts";
import { choosePicture } from "./picture-chooser.ts";
import { attempt } from "./common.ts";
import { ask, notice, openDialog } from "./dialogs.ts";
import { h, svg } from "./dom.ts";
import { ICONS } from "./icons.ts";
import { DRAG_TYPE } from "./library-panel.ts";
import { NODE_DRAG, codexPanel } from "./codex-panel.ts";
import { askText } from "./pickers.ts";
import type { PlaceCtx } from "./place.ts";
import { PIN_GLYPH, PIN_NAMES, mapPictureIds, mapSvg, shapeSvg, stampSvg } from "./map-render.ts";
import type { MapShow } from "./map-render.ts";

type Tool = "select" | "pin" | "room" | "line" | "brush" | "fill" | "stamp" | "text" | "eraser" | "ruler";

const TOOLS: { id: Tool; label: string; key: string; tip: string }[] = [
  { id: "select", label: "↖", key: "V", tip: "Select and move: click a pin to open it, drag to move it, drag empty space to look around" },
  { id: "pin", label: "📍", key: "P", tip: "Pin: click to put a pin (or drag anything from the Codex onto the map)" },
  { id: "room", label: "▭", key: "R", tip: "Room: drag a rectangle (walls and floor)" },
  { id: "line", label: "╱", key: "L", tip: "Wall and line: click each corner, double-click to finish (walls, rivers, roads, borders)" },
  { id: "brush", label: "✎", key: "B", tip: "Freehand brush: drag to draw (coastlines, forests)" },
  { id: "fill", label: "🪣", key: "F", tip: "Fill: click a room or closed shape to colour it; click empty space to fill the whole map" },
  { id: "stamp", label: "🌲", key: "S", tip: "Stamps: doors, stairs, trees, tables, buildings, mountains" },
  { id: "text", label: "T", key: "T", tip: "Text label: click where it goes" },
  { id: "eraser", label: "⌫", key: "E", tip: "Eraser: click a drawing or a pin to remove it" },
  { id: "ruler", label: "📏", key: "M", tip: "Ruler: drag to measure, using the grid's scale" },
];
const COLOURS = ["#1f1b16", "#b93a2e", "#2f6fb0", "#3c8a4a", "#b8860b", "#7b3fa0", "#fffaf0"];
const STAMP_LIST = [
  ["door", "Door"],
  ["stairs", "Stairs"],
  ["tree", "Tree"],
  ["table", "Table"],
  ["building", "Building"],
  ["mountain", "Mountain"],
  ["chest", "Chest"],
  ["pillar", "Pillar"],
];
const TEXTURE_LIST = [
  ["", "Colour"],
  ["grass", "Grass"],
  ["water", "Water"],
  ["stone", "Stone"],
  ["wood", "Wood"],
  ["sand", "Sand"],
  ["lava", "Lava"],
];

// ---------- The picture palette (version 3) ----------

/** Library pictures picked this time round, newest first. */
const recentPics: string[] = [];
const palette = { text: "", tag: "", style: "", stars: false, open: false };

/** Pictures from the shared library: search, tag, style, favourites and recents. Click to stamp, or use as a floor. */
function picturePalette(refresh: () => Promise<void> | void, asStamp: boolean): HTMLElement {
  const box = h("div", { class: "pic-palette" });
  const pick = (id: string) => {
    if (asStamp) stamp = `pic:${id}`;
    else texture = `pic:${id}`;
    const at = recentPics.indexOf(id);
    if (at >= 0) recentPics.splice(at, 1);
    recentPics.unshift(id);
    recentPics.length = Math.min(recentPics.length, 12);
    void refresh();
  };
  const toggle = h("button", { class: "link small", "aria-expanded": palette.open ? "true" : "false", onClick: () => ((palette.open = !palette.open), void draw()) }, palette.open ? "Hide the picture library" : "Pictures from the library…");
  const draw = async () => {
    toggle.textContent = palette.open ? "Hide the picture library" : "Pictures from the library…";
    toggle.setAttribute("aria-expanded", palette.open ? "true" : "false");
    box.replaceChildren(toggle);
    if (!palette.open) return;
    const all = (await attempt(() => api.pictureLibrary())) ?? [];
    const q = palette.text.trim().toLowerCase();
    const shown = all.filter((e) => (!palette.stars || e.favourite) && (!palette.style || e.style === palette.style) && (!palette.tag || e.tags.includes(palette.tag)) && (!q || e.name.toLowerCase().includes(q) || e.tags.some((t) => t.includes(q))));
    const tags = [...new Set(all.flatMap((e) => e.tags))].sort();
    const styles = [...new Set(all.map((e) => e.style).filter(Boolean))].sort();
    const search = h("input", { class: "text-input small-select", type: "search", value: palette.text, placeholder: "Search…", "aria-label": "Search pictures" });
    search.addEventListener("input", () => ((palette.text = search.value), void draw().then(() => box.querySelector<HTMLInputElement>("input[type=search]")?.focus())));
    const tag = h("select", { class: "text-input select small-select", "aria-label": "Category" }, h("option", { value: "" }, "Any category"), tags.map((t) => h("option", { value: t, selected: t === palette.tag }, t)));
    tag.addEventListener("change", () => ((palette.tag = tag.value), void draw()));
    const style = h("select", { class: "text-input select small-select", "aria-label": "Style" }, h("option", { value: "" }, "Any style"), styles.map((t) => h("option", { value: t, selected: t === palette.style }, t)));
    style.addEventListener("change", () => ((palette.style = style.value), void draw()));
    const stars = h("input", { type: "checkbox", checked: palette.stars });
    stars.addEventListener("change", () => ((palette.stars = stars.checked), void draw()));
    const thumb = (e: (typeof all)[number]) => h("button", { class: "stamp-pick pic-thumb", title: `${e.name}${asStamp ? "" : " (as a floor)"}`, "aria-label": e.name, onClick: () => pick(e.id) }, h("img", { src: pictureUrl(e.id), alt: "" }));
    const recent = recentPics.map((id) => all.find((e) => e.id === id)).filter((e): e is (typeof all)[number] => !!e);
    box.append(
      h("div", { class: "inline small" }, search, tag, style, h("label", { class: "inline small" }, stars, "★")),
      ...(recent.length ? [h("div", { class: "pic-recent" }, h("span", { class: "muted tiny" }, "Recent"), recent.map(thumb))] : []),
      h("div", { class: "pic-palette-grid" }, shown.length ? shown.map(thumb) : h("span", { class: "muted small" }, all.length ? "Nothing matches." : "The library is empty. Add pictures from any picture slot: Upload your own.")),
    );
  };
  void draw();
  return box;
}

// What the tools remember while the app is open.
let side: "maps" | "codex" = "maps";
let tool: Tool = "select";
let colour = COLOURS[0]!;
let width = 4;
let stamp = "door";
let texture = "";
let layer: Shape["layer"] = "drawing";
const show: MapShow = { grid: true, pins: true, labels: true, dm: true, drawing: true };
const views = new Map<string, { x: number; y: number; z: number }>();
const pickedPins = new Set<string>();
/** Maps opened by clicking pins, for the breadcrumb ("Region > Town > The Mill"). */
let trail: { id: string; name: string }[] = [];
let current: { ctx: PlaceCtx; view: MapView } | null = null;

export async function mapsPanels(ctx: PlaceCtx): Promise<{ list: HTMLElement; editor: HTMLElement }> {
  const tree = (await attempt(() => api.mapTree())) ?? [];
  let view: MapView | null = null;
  if (ctx.selected) view = (await attempt(() => api.mapView(ctx.selected!))) ?? null;
  current = view ? { ctx, view } : null;
  if (!view) trail = [];
  else if (!trail.length || trail[trail.length - 1]!.id !== view.id) {
    const i = trail.findIndex((t) => t.id === view!.id);
    trail = i >= 0 ? trail.slice(0, i + 1) : [{ id: view.id, name: view.name }];
  }
  const editor = view ? await mapEditor(view, ctx) : emptyEditor(tree, ctx);
  const switcher = h(
    "div",
    { class: "switch", role: "tablist", "aria-label": "Show" },
    h("button", { class: `switch-button${side === "maps" ? " active" : ""}`, role: "tab", onClick: () => ((side = "maps"), void ctx.refresh()) }, "Maps"),
    h("button", { class: `switch-button${side === "codex" ? " active" : ""}`, role: "tab", onClick: () => ((side = "codex"), void ctx.refresh()) }, "Codex"),
  );
  const list = side === "codex" ? h("div", { class: "codex adventure-side" }, h("div", { class: "pad tight" }, switcher), await codexPanel(ctx)) : treePanel(tree, switcher, ctx);
  return { list, editor };
}

function treePanel(tree: MapTreeNode[], switcher: HTMLElement, ctx: PlaceCtx): HTMLElement {
  const ro = ctx.view.readOnly;
  const rows = (list: MapTreeNode[], depth: number): HTMLElement[] =>
    list.flatMap((m) => [
      h("button", { class: `tree-row${m.id === ctx.selected ? " selected" : ""}`, style: `padding-left:${10 + depth * 16}px`, onClick: () => ((trail = []), ctx.select(m.id)) }, svg(ICONS.map), h("span", { class: "tree-name" }, m.name)),
      ...rows(m.children, depth + 1),
    ]);
  return h(
    "aside",
    { class: "panel list-panel encounter-tree", "aria-label": "Maps", "data-scroll": "map-tree" },
    h("div", { class: "panel-head" }, switcher, ro ? null : h("button", { class: "button primary small-button head-button", onClick: () => void newMap(ctx) }, svg(ICONS.plus), "Map")),
    h("div", { class: "tree-rows" }, tree.length ? rows(tree, 0) : [h("p", { class: "muted small pad" }, ro ? "No maps." : "No maps yet. Press + Map to bring in a picture or start a blank one.")]),
    h("p", { class: "codex-hint" }, "A map pinned on another map sits under it: world, region, town, building."),
  );
}

function emptyEditor(tree: MapTreeNode[], ctx: PlaceCtx): HTMLElement {
  return h(
    "section",
    { class: "panel editor" },
    h(
      "div",
      { class: "empty-editor" },
      h("h2", null, "Maps"),
      h("p", { class: "muted" }, tree.length ? "Pick a map on the right." : "World maps, towns, dungeons and battle maps. Bring in a picture you already have, draw on top, and drop places, monsters and encounters on it as pins."),
      ctx.view.readOnly ? null : h("button", { class: "button primary", onClick: () => void newMap(ctx) }, svg(ICONS.plus), "New map"),
    ),
  );
}

async function newMap(ctx: PlaceCtx) {
  const d = openDialog("New map");
  let picture: string | null = null;
  const name = h("input", { class: "text-input", placeholder: "Greyhollow region", "aria-label": "Name", maxlength: 120 });
  const pic = h("button", { class: "button plain" }, svg(ICONS.image), "Bring in a picture…");
  const note = h("p", { class: "muted small" }, "Or leave it blank to draw from scratch.");
  pic.addEventListener("click", async () => {
    const id = await choosePicture();
    if (id) {
      picture = id;
      note.replaceChildren(h("img", { class: "map-new-pic", src: pictureUrl(id), alt: "" }));
    }
  });
  const go = h("button", { class: "button primary" }, "Make the map");
  go.addEventListener("click", async () => {
    const id = await attempt(() => api.createMap({ name: name.value || "New map", picture }));
    if (!id) return;
    d.close();
    trail = [];
    await ctx.refresh();
    ctx.select(id);
  });
  d.body.replaceChildren(h("label", { class: "field-label" }, "Name"), name, h("div", { class: "spaced" }, pic), note);
  d.footer.replaceChildren(h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"), go);
  name.focus();
}

// ---------- The editor ----------

async function mapEditor(v: MapView, ctx: PlaceCtx): Promise<HTMLElement> {
  const ro = !!v.readOnly || ctx.view.readOnly;
  if (ro) tool = tool === "ruler" ? "ruler" : "select";
  for (const id of [...pickedPins]) if (!v.pins.some((p) => p.id === id)) pickedPins.delete(id);
  const stage = h("div", { class: "map-stage", tabindex: 0, "aria-label": `Map: ${v.name}` });
  const board = h("div", { class: "map-board" });
  board.innerHTML = mapSvg(v, { pictureHref: v.picture ? pictureUrl(v.picture) : null, show, interactive: true, selected: pickedPins });
  const overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  overlay.setAttribute("class", "map-overlay");
  overlay.setAttribute("viewBox", `0 0 ${v.width} ${v.height}`);
  overlay.setAttribute("width", String(v.width));
  overlay.setAttribute("height", String(v.height));
  board.appendChild(overlay);
  stage.appendChild(board);

  // Zoom and pan, remembered per map.
  const cam = views.get(v.id) ?? { x: 0, y: 0, z: 0 };
  views.set(v.id, cam);
  const apply = () => (board.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})`);
  const fit = () => {
    const r = stage.getBoundingClientRect();
    if (!r.width) return;
    cam.z = Math.min(r.width / v.width, r.height / v.height) * 0.96;
    cam.x = (r.width - v.width * cam.z) / 2;
    cam.y = (r.height - v.height * cam.z) / 2;
    apply();
  };
  // The stage has no size until it is on screen, so the first fit waits for it.
  const sized = new ResizeObserver(() => {
    if (!stage.isConnected || !stage.clientWidth) return;
    if (!cam.z) fit();
    else apply();
  });
  sized.observe(stage);
  if (cam.z) apply();
  const zoomAt = (factor: number, cx: number, cy: number) => {
    const nz = Math.max(0.05, Math.min(8, cam.z * factor));
    cam.x = cx - ((cx - cam.x) * nz) / cam.z;
    cam.y = cy - ((cy - cam.y) * nz) / cam.z;
    cam.z = nz;
    apply();
  };
  stage.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
    },
    { passive: false },
  );
  const toMap = (e: { clientX: number; clientY: number }) => {
    if (!cam.z) fit();
    const r = stage.getBoundingClientRect();
    return { x: (e.clientX - r.left - cam.x) / cam.z, y: (e.clientY - r.top - cam.y) / cam.z };
  };
  const snap = (p: { x: number; y: number }) => (v.grid.kind === "square" && v.grid.show ? { x: Math.round(p.x / v.grid.size) * v.grid.size, y: Math.round(p.y / v.grid.size) * v.grid.size } : p);
  const temp = (markup: string) => (overlay.innerHTML = markup);
  const refresh = () => ctx.refresh();
  const done = async (fn: () => Promise<unknown>) => {
    if ((await attempt(fn)) !== undefined) await refresh();
  };

  // ---------- Pointer work ----------
  let drag: null | { kind: "pan"; sx: number; sy: number; cx: number; cy: number } | { kind: "pins"; ids: string[]; start: { x: number; y: number }; moved: boolean; origin: Map<string, { x: number; y: number }>; el: Element[] } | { kind: "room" | "ruler"; start: { x: number; y: number }; end: { x: number; y: number } } | { kind: "brush"; points: number[] } = null;
  let linePoints: number[] = [];
  const pinAt = (t: EventTarget | null) => (t instanceof Element ? (t.closest("[data-pin]")?.getAttribute("data-pin") ?? null) : null);
  const shapeAt = (t: EventTarget | null) => (t instanceof Element ? (t.closest("[data-shape]")?.getAttribute("data-shape") ?? null) : null);
  const pinById = (id: string) => v.pins.find((p) => p.id === id);

  stage.addEventListener("pointerdown", (e) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      drag = { kind: "pan", sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y };
      stage.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    stage.focus();
    const at = toMap(e);
    const pin = pinAt(e.target);
    if (tool === "select" || (ro && tool !== "ruler")) {
      if (pin) {
        if (e.ctrlKey || e.shiftKey || e.metaKey) {
          if (pickedPins.has(pin)) pickedPins.delete(pin);
          else pickedPins.add(pin);
          void refresh();
          return;
        }
        const ids = pickedPins.has(pin) ? [...pickedPins] : [pin];
        const origin = new Map(ids.map((id) => [id, { x: pinById(id)!.x, y: pinById(id)!.y }]));
        drag = { kind: "pins", ids, start: at, moved: false, origin, el: ids.map((id) => board.querySelector(`[data-pin="${CSS.escape(id)}"]`)!).filter(Boolean) };
      } else {
        if (!(e.ctrlKey || e.shiftKey) && pickedPins.size) (pickedPins.clear(), void refresh());
        drag = { kind: "pan", sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y };
      }
      stage.setPointerCapture(e.pointerId);
      return;
    }
    if (tool === "ruler") {
      drag = { kind: "ruler", start: at, end: at };
      stage.setPointerCapture(e.pointerId);
      return;
    }
    if (ro) return;
    if (tool === "eraser") {
      const shape = shapeAt(e.target);
      if (pin) void done(() => api.deletePins(v.id, [pin]));
      else if (shape) void done(() => api.deleteShapes(v.id, [shape]));
      return;
    }
    if (tool === "fill") {
      const shape = shapeAt(e.target);
      const s = shape ? v.shapes.find((x) => x.id === shape) : null;
      if (s && (s.tool === "room" || s.tool === "brush" || s.tool === "line" || s.tool === "fill")) void done(() => api.fillShape(v.id, s.id, texture ? null : colour, texture || null));
      else if (texture) void done(() => api.addShape(v.id, { layer: "drawing", tool: "fill", points: [0, 0, v.width, v.height], color: colour, width: 0, fill: null, texture, stamp: null, text: null, size: 0 }));
      else void done(() => api.setMapSettings(v.id, { background: colour }));
      return;
    }
    if (tool === "pin") {
      void (async () => {
        const ids = await attempt(() => api.addPins(v.id, [null], at.x, at.y, { color: colour === "#fffaf0" ? "#1f1b16" : colour, symbol: "star" }));
        if (ids?.[0]) await editPinDialog(v, [ids[0]], ctx, true);
        await refresh();
      })();
      return;
    }
    if (tool === "stamp") {
      const p = snap(at);
      void done(() => api.addShape(v.id, { layer, tool: "stamp", points: [p.x, p.y], color: colour === "#fffaf0" ? "#1f1b16" : colour, width: 2, fill: null, texture: null, stamp, text: null, size: v.grid.kind !== "none" ? v.grid.size : Math.max(30, Math.min(v.width, v.height) / 25) }));
      return;
    }
    if (tool === "text") {
      void (async () => {
        const t = await askText("Label", "", "Words", "For example: The Old Mill, or Here be dragons.");
        if (t) await done(() => api.addShape(v.id, { layer: layer === "drawing" ? "labels" : layer, tool: "text", points: [at.x, at.y], color: colour, width: 0, fill: null, texture: null, stamp: null, text: t, size: Math.max(18, Math.min(v.width, v.height) / 35) }));
      })();
      return;
    }
    if (tool === "room") {
      const p = snap(at);
      drag = { kind: "room", start: p, end: p };
      stage.setPointerCapture(e.pointerId);
      return;
    }
    if (tool === "brush") {
      drag = { kind: "brush", points: [at.x, at.y] };
      stage.setPointerCapture(e.pointerId);
      return;
    }
    if (tool === "line") {
      const p = snap(at);
      linePoints.push(p.x, p.y);
      drawLinePreview(p);
    }
  });

  const drawLinePreview = (to: { x: number; y: number } | null) => {
    if (!linePoints.length) return temp("");
    const pts = [...linePoints, ...(to ? [to.x, to.y] : [])];
    temp(shapeSvg({ id: "", layer, tool: "line", points: pts, color: colour, width, fill: null, texture: null, stamp: null, text: null, size: 0 }, false));
  };

  stage.addEventListener("pointermove", (e) => {
    if (tool === "line" && linePoints.length && !drag) drawLinePreview(snap(toMap(e)));
    if (!drag) return;
    if (drag.kind === "pan") {
      cam.x = drag.cx + (e.clientX - drag.sx);
      cam.y = drag.cy + (e.clientY - drag.sy);
      apply();
      return;
    }
    const at = toMap(e);
    if (drag.kind === "pins") {
      const dx = at.x - drag.start.x;
      const dy = at.y - drag.start.y;
      if (Math.abs(dx) + Math.abs(dy) > 3 / cam.z) drag.moved = true;
      if (!drag.moved || ro) return;
      drag.el.forEach((el, i) => {
        const o = drag && drag.kind === "pins" ? drag.origin.get(drag.ids[i]!) : null;
        if (o) el.setAttribute("transform", `translate(${o.x + dx} ${o.y + dy})`);
      });
      return;
    }
    if (drag.kind === "room") {
      drag.end = snap(at);
      temp(shapeSvg({ id: "", layer, tool: "room", points: [drag.start.x, drag.start.y, drag.end.x, drag.end.y], color: colour, width, fill: null, texture: null, stamp: null, text: null, size: 0 }, false));
      return;
    }
    if (drag.kind === "ruler") {
      drag.end = at;
      const label = measureText(v, drag.start, at);
      temp(`<line x1="${drag.start.x}" y1="${drag.start.y}" x2="${at.x}" y2="${at.y}" stroke="#2f6fb0" stroke-width="${3 / cam.z}" stroke-dasharray="${8 / cam.z} ${5 / cam.z}"/><text x="${at.x + 10 / cam.z}" y="${at.y - 10 / cam.z}" font-size="${16 / cam.z}" font-family="Segoe UI, sans-serif" fill="#2f6fb0" stroke="#fff" stroke-width="${4 / cam.z}" paint-order="stroke">${label}</text>`);
      return;
    }
    if (drag.kind === "brush") {
      const last = drag.points.length;
      if (Math.hypot(at.x - drag.points[last - 2]!, at.y - drag.points[last - 1]!) > 4 / cam.z) drag.points.push(at.x, at.y);
      temp(shapeSvg({ id: "", layer, tool: "brush", points: drag.points, color: colour, width, fill: null, texture: null, stamp: null, text: null, size: 0 }, false));
    }
  });

  stage.addEventListener("pointerup", () => {
    const d = drag;
    drag = null;
    if (!d) return;
    if (d.kind === "pins") {
      if (!d.moved) {
        // A click: open what the pin links to (a map opens here, with the breadcrumb).
        const p = pinById(d.ids[0]!);
        if (p) openPin(p, v, ctx);
        return;
      }
      if (ro) return;
      const moves = d.ids.map((id, i) => {
        const tr = d.el[i]?.getAttribute("transform") ?? "";
        const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(tr);
        return { id, x: m ? Number(m[1]) : pinById(id)!.x, y: m ? Number(m[2]) : pinById(id)!.y };
      });
      void done(() => api.movePins(v.id, moves));
      return;
    }
    if (d.kind === "room") {
      temp("");
      if (Math.abs(d.end.x - d.start.x) < 4 || Math.abs(d.end.y - d.start.y) < 4) return;
      void done(() => api.addShape(v.id, { layer, tool: "room", points: [d.start.x, d.start.y, d.end.x, d.end.y], color: colour, width, fill: texture ? null : null, texture: texture || null, stamp: null, text: null, size: 0 }));
      return;
    }
    if (d.kind === "brush") {
      temp("");
      if (d.points.length < 4) return;
      void done(() => api.addShape(v.id, { layer, tool: "brush", points: d.points, color: colour, width, fill: null, texture: null, stamp: null, text: null, size: 0 }));
      return;
    }
    if (d.kind === "ruler") setTimeout(() => temp(""), 2500);
  });

  const finishLine = () => {
    if (linePoints.length >= 4) {
      const pts = linePoints;
      void done(() => api.addShape(v.id, { layer, tool: "line", points: pts, color: colour, width, fill: null, texture: null, stamp: null, text: null, size: 0 }));
    }
    linePoints = [];
    temp("");
  };
  stage.addEventListener("dblclick", (e) => {
    if (tool === "line") {
      // The double-click's two clicks each added a corner; drop the repeat.
      linePoints.splice(-2);
      finishLine();
      return;
    }
    const pin = pinAt(e.target);
    if (pin && !ro) void editPinDialog(v, pickedPins.has(pin) && pickedPins.size > 1 ? [...pickedPins] : [pin], ctx, false);
  });
  stage.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && tool === "line") finishLine();
    if (e.key === "Escape") ((linePoints = []), temp(""), pickedPins.clear(), void refresh());
    if ((e.key === "Delete" || e.key === "Backspace") && pickedPins.size && !ro) {
      e.preventDefault();
      const ids = [...pickedPins];
      pickedPins.clear();
      void done(() => api.deletePins(v.id, ids));
    }
  });

  // Dropping things from the Codex makes pins where they land; on a pin, it relinks that pin.
  stage.addEventListener("dragover", (e) => {
    const types = e.dataTransfer?.types ?? [];
    if (ro || !(types.includes(NODE_DRAG) || types.includes(DRAG_TYPE))) return;
    e.preventDefault();
    stage.classList.add("drop-over");
  });
  stage.addEventListener("dragleave", () => stage.classList.remove("drop-over"));
  stage.addEventListener("drop", (e) => {
    e.preventDefault();
    stage.classList.remove("drop-over");
    const ids = (JSON.parse(e.dataTransfer?.getData(NODE_DRAG) || "{}") as { ids?: string[] }).ids ?? (JSON.parse(e.dataTransfer?.getData(DRAG_TYPE) || "[]") as string[]);
    if (!ids.length) return;
    const onPin = pinAt(e.target);
    if (onPin && ids.length === 1) return void done(() => api.editPins(v.id, [onPin], { link: ids[0]! }));
    const at = toMap(e);
    void done(() => api.addPins(v.id, ids, at.x, at.y));
  });

  // ---------- Toolbars ----------
  const toolButtons = h(
    "div",
    { class: "map-tools", role: "toolbar", "aria-label": "Map tools" },
    TOOLS.filter((t) => !ro || t.id === "select" || t.id === "ruler").map((t) => h("button", { class: `map-tool${tool === t.id ? " on" : ""}`, title: `${t.tip} (${t.key})`, "aria-pressed": tool === t.id ? "true" : "false", onClick: () => ((tool = t.id), (linePoints = []), void refresh()) }, t.label)),
  );
  const options: HTMLElement[] = [];
  if (!ro && ["room", "line", "brush", "fill", "stamp", "text", "pin"].includes(tool)) {
    options.push(h("div", { class: "swatches" }, COLOURS.map((c) => h("button", { class: `swatch${c === colour ? " on" : ""}`, style: `background:${c}`, title: c, "aria-label": `Colour ${c}`, onClick: () => ((colour = c), void refresh()) }))));
  }
  if (!ro && ["room", "line", "brush"].includes(tool)) {
    const w = h("input", { type: "range", min: "1", max: "24", value: String(width), "aria-label": "Thickness" });
    w.addEventListener("change", () => (width = Number(w.value)));
    options.push(h("label", { class: "inline small" }, "Thickness", w));
  }
  if (!ro && (tool === "fill" || tool === "room")) {
    const t = h("select", { class: "text-input select small-select", "aria-label": "Fill with" }, [...TEXTURE_LIST, ...(texture.startsWith("pic:") ? [["" + texture, "Library picture"]] : [])].map(([k, l]) => h("option", { value: k, selected: k === texture }, l)));
    t.addEventListener("change", () => (texture = t.value));
    options.push(h("label", { class: "inline small" }, tool === "room" ? "Floor" : "Fill with", t));
  }
  if (!ro && (tool === "stamp" || tool === "fill" || tool === "room")) options.push(picturePalette(refresh, tool === "stamp"));
  if (!ro && tool === "stamp") {
    options.push(
      h(
        "div",
        { class: "stamp-picks" },
        STAMP_LIST.map(([k, l]) => {
          const b = h("button", { class: `stamp-pick${k === stamp ? " on" : ""}`, title: l, onClick: () => ((stamp = k!), void refresh()) });
          b.innerHTML = `<svg viewBox="-20 -20 40 40" width="26" height="26">${stampSvg(k!, 0, 0, 30, "#1f1b16")}</svg>`;
          return b;
        }),
      ),
    );
  }
  if (!ro && ["room", "line", "brush", "stamp", "text"].includes(tool)) {
    const l = h("select", { class: "text-input select small-select", "aria-label": "Layer" }, h("option", { value: "drawing", selected: layer === "drawing" }, "Drawing"), h("option", { value: "labels", selected: layer === "labels" }, "Labels"), h("option", { value: "dm", selected: layer === "dm" }, "DM-only notes"));
    l.addEventListener("change", () => (layer = l.value as Shape["layer"]));
    options.push(h("label", { class: "inline small" }, "Layer", l));
  }
  if (tool === "line") options.push(h("span", { class: "muted small" }, "Click each corner; double-click or Enter to finish; Escape to stop."));
  if (tool === "select" && pickedPins.size) options.push(h("span", { class: "muted small" }, `${pickedPins.size} pins picked: double-click one to change them together, Delete to remove, Ctrl+D to copy.`));

  const toggles = h(
    "div",
    { class: "map-toggles" },
    (["grid", "pins", "labels", "dm"] as const).map((k) => {
      const box = h("input", { type: "checkbox", checked: show[k] });
      box.addEventListener("change", () => ((show[k] = box.checked), void refresh()));
      return h("label", { class: "check small" }, box, { grid: "Grid", pins: "Pins", labels: "Labels", dm: "DM notes" }[k]);
    }),
  );
  const zoomBar = h(
    "div",
    { class: "map-zoom" },
    h("button", { class: "icon-button", title: "Zoom out", onClick: () => zoomAt(1 / 1.25, stage.clientWidth / 2, stage.clientHeight / 2) }, "−"),
    h("button", { class: "icon-button", title: "Zoom in", onClick: () => zoomAt(1.25, stage.clientWidth / 2, stage.clientHeight / 2) }, "+"),
    h("button", { class: "button plain small-button", title: "Show the whole map", onClick: fit }, "Fit"),
  );

  // Breadcrumb: maps opened through pins, or the maps this one is pinned on.
  const crumbs = trail.length > 1 ? trail : v.inside.length ? [{ id: v.inside[0]!.id, name: v.inside[0]!.name }, { id: v.id, name: v.name }] : [];
  const breadcrumb = crumbs.length
    ? h(
        "nav",
        { class: "breadcrumb", "aria-label": "Maps above this one" },
        crumbs.map((c, i) => [i ? h("span", { class: "muted" }, " › ") : null, i === crumbs.length - 1 ? h("strong", null, c.name) : h("button", { class: "link", onClick: () => ((trail = crumbs.slice(0, i + 1)), ctx.select(c.id)) }, c.name)]),
      )
    : null;

  const name = h("input", { class: "title-input map-name", value: v.name, disabled: ro, "aria-label": "Map name", maxlength: 200 });
  name.addEventListener("change", () => name.value.trim() && void done(() => api.rename(v.id, name.value)));

  const head = h(
    "div",
    { class: "map-head" },
    h("div", { class: "map-title" }, breadcrumb, name),
    h(
      "div",
      { class: "map-head-actions" },
      ro ? null : h("button", { class: "button plain small-button", title: "Size, background and grid", onClick: () => void mapSettings(v, ctx) }, svg(ICONS.gear), "Map settings"),
      h("button", { class: "button plain small-button", title: "Save as a picture or PDF", onClick: () => void exportMap(v) }, svg(ICONS.printer), "Export…"),
      ro
        ? null
        : h(
            "button",
            {
              class: "icon-button",
              title: `Delete ${v.name}`,
              onClick: async () => {
                const ok = await ask(`Delete ${v.name}?`, [`${v.name} goes to the recycle bin. Pins that open it go red until you restore it.`], [
                  { label: "Cancel", value: false },
                  { label: "Move to recycle bin", value: true, kind: "danger" },
                ]);
                if (ok && (await attempt(() => api.deleteNode(v.id))) !== undefined) {
                  ctx.select(null);
                  await refresh();
                }
              },
            },
            svg(ICONS.trash),
          ),
    ),
  );

  return h("section", { class: "panel editor map-editor" }, head, h("div", { class: "map-bar" }, toolButtons, h("div", { class: "map-options" }, options), h("span", { class: "grow" }), toggles, zoomBar), stage, h("div", { class: "map-foot muted small" }, v.grid.kind !== "none" ? `Grid: 1 ${v.grid.kind === "hex" ? "hex" : "square"} = ${v.grid.scale}. ` : "", "Wheel to zoom, drag empty space to look around. Drag anything from the Codex onto the map to pin it."));
}

function measureText(v: MapView, a: { x: number; y: number }, b: { x: number; y: number }): string {
  const units = Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, v.grid.size);
  const m = /^\s*([\d.]+)\s*(.*)$/.exec(v.grid.scale);
  const per = m ? Number(m[1]) : 1;
  const word = m ? m[2]!.trim() || "squares" : v.grid.scale || "squares";
  return v.grid.kind === "none" ? `${Math.round(Math.hypot(b.x - a.x, b.y - a.y))} units (set a grid for real distances)` : `${Math.round(units * per * 10) / 10} ${word}`;
}

function openPin(p: PinView, v: MapView, ctx: PlaceCtx) {
  if (p.missing) return notice("What this pin linked to was deleted. Restore it from the recycle bin, or drop something else on the pin.", "red", undefined, 6000);
  if (!p.target) return notice("This pin isn't linked to anything. Drop something from the Codex onto it to link it, or double-click it to change it.", "blue", undefined, 5000);
  if (p.target.isMap) {
    if (!trail.length) trail = [{ id: v.id, name: v.name }];
    trail.push({ id: p.target.id, name: p.target.name });
    ctx.select(p.target.id);
    return;
  }
  void ctx.open(p.target.id);
}

/** Double-click: name, colour and symbol for one pin or several together; unlink. */
async function editPinDialog(v: MapView, ids: string[], ctx: PlaceCtx, fresh: boolean) {
  const view = (await attempt(() => api.mapView(v.id))) ?? v;
  const pins = view.pins.filter((p) => ids.includes(p.id));
  if (!pins.length) return;
  const first = pins[0]!;
  const d = openDialog(pins.length === 1 ? (fresh ? "New pin" : "Change the pin") : `Change ${pins.length} pins`);
  const label = h("input", { class: "text-input", value: pins.length === 1 ? first.label : "", placeholder: pins.length === 1 ? (first.target?.name ?? "A name for the pin") : "Leave empty to keep each pin's name", "aria-label": "Name" });
  let color = first.color;
  let symbol = first.symbol;
  const draw = () =>
    d.body.replaceChildren(
      h("label", { class: "field-label" }, "Name"),
      label,
      h("label", { class: "field-label spaced" }, "Colour"),
      h("div", { class: "swatches" }, COLOURS.slice(0, 6).map((c) => h("button", { class: `swatch${c === color ? " on" : ""}`, style: `background:${c}`, "aria-label": `Colour ${c}`, onClick: () => ((color = c), draw()) }))),
      h("label", { class: "field-label spaced" }, "Symbol"),
      h("div", { class: "pin-symbols" }, Object.keys(PIN_GLYPH).map((k) => h("button", { class: `pin-symbol${k === symbol ? " on" : ""}`, title: PIN_NAMES[k], onClick: () => ((symbol = k), draw()) }, PIN_GLYPH[k]))),
      pins.length === 1 ? h("p", { class: "muted small spaced" }, first.target ? ["Links to ", h("strong", null, first.target.name), ". Drop something else from the Codex on the pin to relink it."] : "Not linked to anything yet: drop something from the Codex onto the pin to link it.") : h("span"),
    );
  draw();
  const ok = h("button", { class: "button primary" }, "Done");
  ok.addEventListener("click", async () => {
    const change: { label?: string; color: string; symbol: string } = { color, symbol };
    if (pins.length === 1 || label.value.trim()) change.label = label.value;
    if ((await attempt(() => api.editPins(v.id, ids, change))) !== undefined) {
      d.close();
      await ctx.refresh();
    }
  });
  const unlink = pins.length === 1 && first.link ? h("button", { class: "button plain", onClick: async () => ((await attempt(() => api.editPins(v.id, ids, { link: null }))) !== undefined && (d.close(), await ctx.refresh())) }, "Unlink") : null;
  d.footer.replaceChildren(unlink ?? h("span"), h("span", { class: "grow" }), h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"), ok);
  label.focus();
}

async function mapSettings(v: MapView, ctx: PlaceCtx) {
  const d = openDialog(`${v.name}: settings`);
  const w = h("input", { class: "text-input", inputmode: "numeric", value: String(v.width), "aria-label": "Width" });
  const hgt = h("input", { class: "text-input", inputmode: "numeric", value: String(v.height), "aria-label": "Height" });
  const kind = h("select", { class: "text-input select", "aria-label": "Grid" }, h("option", { value: "none", selected: v.grid.kind === "none" }, "No grid"), h("option", { value: "square", selected: v.grid.kind === "square" }, "Squares"), h("option", { value: "hex", selected: v.grid.kind === "hex" }, "Hexes"));
  const size = h("input", { class: "text-input", inputmode: "numeric", value: String(v.grid.size), "aria-label": "Grid size" });
  const scale = h("input", { class: "text-input", value: v.grid.scale, placeholder: "5 feet, or 6 miles", "aria-label": "Each square is" });
  const bg = h("input", { type: "color", value: /^#[0-9a-f]{6}$/i.test(v.background) ? v.background : "#efe6d2", "aria-label": "Background" });
  d.body.replaceChildren(
    h("label", { class: "field-label" }, "Size"),
    h("div", { class: "inline" }, w, h("span", null, "×"), hgt, h("span", { class: "muted small" }, "The picture stretches to fill it.")),
    h("label", { class: "field-label spaced" }, "Grid"),
    kind,
    h("label", { class: "field-label spaced" }, "Grid size (map units across one square or hex)"),
    size,
    h("label", { class: "field-label spaced" }, "Each square or hex is"),
    scale,
    h("label", { class: "field-label spaced" }, "Background colour (seen where there's no picture)"),
    bg,
  );
  const ok = h("button", { class: "button primary" }, "Save");
  ok.addEventListener("click", async () => {
    const change = { width: Number(w.value) || v.width, height: Number(hgt.value) || v.height, background: bg.value, grid: { kind: kind.value as "none" | "square" | "hex", size: Number(size.value) || v.grid.size, scale: scale.value.trim() || "5 feet", show: true } };
    if ((await attempt(() => api.setMapSettings(v.id, change))) !== undefined) {
      d.close();
      views.delete(v.id);
      await ctx.refresh();
    }
  });
  d.footer.replaceChildren(h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"), ok);
}

/** Draws the map into a picture in the window: SVG, then a canvas, then PNG or JPEG data. */
export async function renderMapImage(v: MapView, opts: { show: MapShow; type: "image/png" | "image/jpeg"; maxSide?: number }): Promise<string> {
  const href = v.picture ? await attempt(() => api.pictureData(v.picture!)) : null;
  const pictureHrefs: Record<string, string> = {};
  for (const id of mapPictureIds(v)) {
    const data = await attempt(() => api.pictureData(id));
    if (data) pictureHrefs[id] = data;
  }
  const text = mapSvg(v, { pictureHref: href ?? null, show: opts.show, pictureHrefs });
  const img = new Image();
  const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("The map couldn't be drawn."));
      img.src = url;
    });
    const scale = Math.min(1, (opts.maxSide ?? 4000) / Math.max(v.width, v.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.width * scale);
    canvas.height = Math.round(v.height * scale);
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL(opts.type, 0.92);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function exportMap(v: MapView) {
  const d = openDialog(`Export ${v.name}`);
  const ticks: Record<keyof MapShow, HTMLInputElement> = {
    grid: h("input", { type: "checkbox", checked: v.grid.kind !== "none" }),
    pins: h("input", { type: "checkbox", checked: true }),
    labels: h("input", { type: "checkbox", checked: true }),
    drawing: h("input", { type: "checkbox", checked: true }),
    dm: h("input", { type: "checkbox", checked: false }),
  };
  const size = h("select", { class: "text-input select", "aria-label": "Page size" }, h("option", { value: "Letter" }, "Letter"), h("option", { value: "A4" }, "A4"));
  d.body.replaceChildren(
    h("p", { class: "muted" }, "What goes on it:"),
    h("label", { class: "check" }, ticks.grid, "Grid"),
    h("label", { class: "check" }, ticks.pins, "Pins"),
    h("label", { class: "check" }, ticks.labels, "Labels"),
    h("label", { class: "check" }, ticks.drawing, "Drawings"),
    h("label", { class: "check" }, ticks.dm, "DM-only notes ", h("span", { class: "muted small" }, "(off, so a players' copy never gives secrets away)")),
    h("label", { class: "field-label spaced" }, "Page size for PDF"),
    size,
  );
  const shown = (): MapShow => ({ grid: ticks.grid.checked, pins: ticks.pins.checked, labels: ticks.labels.checked, drawing: ticks.drawing.checked, dm: ticks.dm.checked });
  const save = async (kind: "png" | "pdf") => {
    const data = await renderMapImage(v, { show: shown(), type: kind === "png" ? "image/png" : "image/jpeg" }).catch((e: Error) => (notice(e.message, "red"), null));
    if (!data) return;
    const path = await attempt(() => api.exportImage({ name: v.name, kind, images: [data], pageSize: size.value as "Letter" | "A4" }));
    if (path) {
      d.close();
      notice(`Saved ${path.split(/[\\/]/).pop()}.`, "green", { label: "Open it", run: () => void window.dm.openPdf(path) }, 8000);
    }
  };
  d.footer.replaceChildren(h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"), h("button", { class: "button plain", onClick: () => void save("png") }, "Save as picture (PNG)…"), h("button", { class: "button primary", onClick: () => void save("pdf") }, "Save as PDF…"));
}

// Ctrl+D and Ctrl+Shift+D copy the picked pins, before the app's own Ctrl+D (make a variant).
document.addEventListener(
  "keydown",
  (e) => {
    if (!current || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "d" || !pickedPins.size || !document.querySelector(".map-stage")) return;
    if (current.view.readOnly || current.ctx.view.readOnly) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const { ctx, view } = current;
    const ids = [...pickedPins];
    void (async () => {
      const made = await attempt(() => api.copyPins(view.id, ids, !e.shiftKey));
      if (made) {
        pickedPins.clear();
        made.forEach((id) => pickedPins.add(id));
        notice(e.shiftKey ? "Copied: same look, no link (drop something on it to link it)." : "Copied, still linked to the same thing.", "green", undefined, 3000);
        await ctx.refresh();
      }
    })();
  },
  true,
);

// Tool keys while the map has the keyboard: V, P, R, L, B, F, S, T, E, M.
document.addEventListener("keydown", (e) => {
  if (!current || e.ctrlKey || e.metaKey || e.altKey || !(document.activeElement instanceof HTMLElement) || !document.activeElement.classList.contains("map-stage")) return;
  const t = TOOLS.find((x) => x.key === e.key.toUpperCase());
  if (!t) return;
  tool = t.id;
  void current.ctx.refresh();
});
