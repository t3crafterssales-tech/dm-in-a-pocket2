// A map at the table (version 2): the map to look at during play, with table marks on their own
// layer so they never touch the map itself: a pointer (a pulse where you click), a marker pen
// (thickness, see-through, six colours) and short notes. Marks fade with Clear, or Keep saves them
// for next session. Clicking a pin opens what it links to over the table.

import type { MapView } from "../../app/backend.ts";
import { api, pictureUrl } from "../api.ts";
import { attempt } from "../common.ts";
import { h } from "../dom.ts";
import { askText } from "../pickers.ts";
import { mapSvg, marksSvg } from "../map-render.ts";
import type { Mark } from "../map-render.ts";
export { marksSvg } from "../map-render.ts";
export type { Mark } from "../map-render.ts";
import type { DeskCtx } from "./registry.ts";
import { showToPlayers } from "../players-panel.ts";

const MARK_COLOURS = ["#1f1b16", "#b93a2e", "#2f6fb0", "#3c8a4a", "#b8860b", "#7b3fa0"];
let mapId: string | null = null;
let tool: "point" | "pen" | "note" = "point";
let colour = MARK_COLOURS[1]!;
let width = 6;
let opacity = 0.6;
/** Marks not kept: they last until Clear or the app closes. */
const loose = new Map<string, Mark[]>();
let zoom = 1;

export async function mapTool(ctx: DeskCtx): Promise<HTMLElement> {
  const maps = ((await attempt(() => api.codex())) ?? []).find((s) => s.key === "maps")?.entries ?? [];
  if (!maps.length) return h("div", { class: "pad" }, h("p", { class: "muted small" }, "No maps yet. Make them in the Maps tab."));
  if (!mapId || !maps.some((m) => m.id === mapId)) mapId = maps[0]!.id;
  const v = await attempt(() => api.mapView(mapId!));
  if (!v) return h("div");
  const kept = ((ctx.settings("map").kept as Record<string, Mark[]> | undefined) ?? {})[v.id] ?? [];
  const mine = loose.get(v.id) ?? [];
  // A map live on players' screens follows the marks as they're drawn.
  const isLive = ctx.meta.live.map === v.id;
  if (isLive && JSON.stringify(ctx.meta.live.marks) !== JSON.stringify([...kept, ...mine])) void attempt(() => api.setLiveMarks([...kept, ...mine]));
  const pick = h("select", { class: "text-input select small-select", "aria-label": "Map" }, maps.map((m) => h("option", { value: m.id, selected: m.id === mapId }, m.name)));
  pick.addEventListener("change", () => ((mapId = pick.value), void ctx.refresh()));
  const board = h("div", { class: "table-map", style: `width:${Math.round(100 * zoom)}%` });
  board.innerHTML = mapSvg(v, { pictureHref: v.picture ? pictureUrl(v.picture) : null, show: { grid: true, pins: true, labels: true, drawing: true, dm: true }, interactive: true });
  const svgEl = board.querySelector("svg")!;
  svgEl.removeAttribute("width");
  svgEl.removeAttribute("height");
  const layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
  layer.innerHTML = marksSvg([...kept, ...mine]);
  svgEl.appendChild(layer);
  const live = document.createElementNS("http://www.w3.org/2000/svg", "g");
  svgEl.appendChild(live);
  const toMap = (e: PointerEvent) => {
    const r = svgEl.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * v.width, y: ((e.clientY - r.top) / r.height) * v.height };
  };
  let stroke: number[] | null = null;
  svgEl.addEventListener("pointerdown", (e) => {
    const pin = (e.target as Element).closest?.("[data-pin]")?.getAttribute("data-pin");
    if (pin && tool === "point") {
      const p = v.pins.find((x) => x.id === pin);
      if (p?.target) void ctx.peek(p.target.id);
      return;
    }
    const at = toMap(e);
    if (tool === "point") {
      pulse(live, at, v);
      if (isLive) void attempt(() => api.pointAt(at.x, at.y, colour));
      return;
    }
    if (tool === "note") {
      void (async () => {
        const t = await askText("A note on the map", "", "Note", "Short: Goblins here!");
        if (t) {
          loose.set(v.id, [...mine, { kind: "note", points: [at.x, at.y], color: colour, width, opacity: 1, text: t }]);
          await ctx.refresh();
        }
      })();
      return;
    }
    stroke = [at.x, at.y];
    svgEl.setPointerCapture(e.pointerId);
  });
  svgEl.addEventListener("pointermove", (e) => {
    if (!stroke) return;
    const at = toMap(e);
    stroke.push(at.x, at.y);
    live.innerHTML = marksSvg([{ kind: "pen", points: stroke, color: colour, width: width * (v.width / 800), opacity, text: "" }]);
  });
  svgEl.addEventListener("pointerup", () => {
    if (!stroke) return;
    if (stroke.length >= 4) loose.set(v.id, [...mine, { kind: "pen", points: stroke.map((n) => Math.round(n)), color: colour, width: width * (v.width / 800), opacity, text: "" }]);
    stroke = null;
    void ctx.refresh();
  });

  const tools = h(
    "div",
    { class: "inline map-marks" },
    pick,
    ...(["point", "pen", "note"] as const).map((t) => h("button", { class: `map-tool${tool === t ? " on" : ""}`, title: { point: "Pointer: a pulse where you click (click a pin to open it)", pen: "Marker: draw on the map's own layer", note: "Note: a short label on the map" }[t], onClick: () => ((tool = t), void ctx.refresh()) }, { point: "👆", pen: "🖍", note: "🏷" }[t])),
    h("div", { class: "swatches" }, MARK_COLOURS.map((c) => h("button", { class: `swatch${c === colour ? " on" : ""}`, style: `background:${c}`, "aria-label": `Colour ${c}`, onClick: () => ((colour = c), void ctx.refresh()) }))),
  );
  const thick = h("input", { type: "range", min: "1", max: "30", value: String(width), "aria-label": "Thickness" });
  thick.addEventListener("change", () => (width = Number(thick.value)));
  const see = h("input", { type: "range", min: "10", max: "100", value: String(Math.round(opacity * 100)), "aria-label": "See-through" });
  see.addEventListener("change", () => (opacity = Number(see.value) / 100));
  return h(
    "div",
    { class: "map-tool-body" },
    tools,
    tool === "pen" ? h("div", { class: "inline small" }, "Thin", thick, "Fat", h("span", { class: "spacer-small" }), "See-through", see, "Solid") : null,
    h("div", { class: "table-map-scroll", "data-scroll": "table-map" }, board),
    h(
      "div",
      { class: "inline small" },
      h("button", { class: "link small", onClick: () => ((zoom = Math.max(0.5, zoom - 0.25)), void ctx.refresh()) }, "Zoom out"),
      h("button", { class: "link small", onClick: () => ((zoom = Math.min(4, zoom + 0.25)), void ctx.refresh()) }, "Zoom in"),
      h("span", { class: "grow" }),
      isLive
        ? h("button", { class: "link small", title: "Take the map off players' screens", onClick: () => void attempt(() => api.showMapLive(null)).then(() => ctx.refresh()) }, "Stop showing")
        : h("button", { class: "link small", title: "Put this map on players' screens, live, with your marks", onClick: () => void showToPlayers(v.id, v.name, { live: true }).then(() => ctx.refresh()) }, "Show to players…"),
      mine.length ? h("button", { class: "link small", title: "Save these marks for next session (they never change the map itself)", onClick: () => (loose.delete(v.id), void ctx.setSettings("map", { kept: { ...((ctx.settings("map").kept as Record<string, Mark[]>) ?? {}), [v.id]: [...kept, ...mine] } })) }, "Keep marks") : null,
      mine.length || kept.length ? h("button", { class: "link small", onClick: () => (loose.delete(v.id), void ctx.setSettings("map", { kept: { ...((ctx.settings("map").kept as Record<string, Mark[]>) ?? {}), [v.id]: [] } })) }, "Clear marks") : null,
    ),
  );
}

/** A player pointed at the shown map: the pulse shows on the DM's map too. */
export function pulseFromPlayer(x: number, y: number, color: string) {
  const svgEl = document.querySelector<SVGSVGElement>(".table-map svg");
  if (!svgEl) return;
  const vb = svgEl.viewBox.baseVal;
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  svgEl.appendChild(g);
  pulse(g, { x, y }, { width: vb.width, height: vb.height } as MapView, color);
  setTimeout(() => g.remove(), 1700);
}

function pulse(layer: SVGGElement, at: { x: number; y: number }, v: MapView, color?: string) {
  const r = Math.max(v.width, v.height) / 40;
  const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  c.setAttribute("cx", String(at.x));
  c.setAttribute("cy", String(at.y));
  c.setAttribute("r", String(r));
  c.setAttribute("class", "map-pulse");
  if (color) c.setAttribute("style", `stroke:${color}`);
  c.setAttribute("stroke-width", String(r / 4));
  layer.appendChild(c);
  setTimeout(() => c.remove(), 1600);
}
