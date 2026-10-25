// The flexible panel layout (version 3): drag the divider to resize the side column, double-click it
// to snap back, fold panels to a thin strip, pull a panel out as its own floating window (for a
// second monitor), and switch the whole arrangement with a preset. Panels keep their identity.

import { DEFAULT_SIDE, PANEL_NAMES, SIDE_MAX, SIDE_MIN, cleanLayout, defaultLayout } from "../app/layout.ts";
import type { Layout, PanelId } from "../app/layout.ts";
import { api } from "./api.ts";
import { attempt } from "./common.ts";
import { notice, openDialog } from "./dialogs.ts";
import { h, svg } from "./dom.ts";
import { ICONS } from "./icons.ts";

let layout: Layout = defaultLayout();

export async function loadLayout(): Promise<Layout> {
  const s = await attempt(() => api.layoutState());
  layout = s ? cleanLayout(s.layout) : defaultLayout();
  return layout;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void attempt(() => api.setLayout(layout)), 250);
}

/** Saves right now, so a redraw that reads the layout back sees the change. */
async function flush() {
  clearTimeout(saveTimer);
  await attempt(() => api.setLayout(layout));
}

const clampSide = (w: number) => Math.min(SIDE_MAX, Math.max(SIDE_MIN, Math.round(w)));

/** A panel inside a frame with a small bar: fold it, or pull it out into its own window. */
function frame(id: PanelId, el: HTMLElement, refresh: () => void, grow = false): HTMLElement {
  const folded = id === "flags" ? layout.flagsFolded : id === "ai" ? layout.aiFolded : false;
  const fold = id === "codex" ? null : h("button", { class: "frame-btn", title: folded ? `Open the ${PANEL_NAMES[id]} panel` : `Fold the ${PANEL_NAMES[id]} panel to a thin strip`, "aria-label": `${folded ? "Open" : "Fold"} ${PANEL_NAMES[id]}`, "aria-expanded": String(!folded), onClick: () => {
    if (id === "flags") layout.flagsFolded = !layout.flagsFolded;
    else layout.aiFolded = !layout.aiFolded;
    save();
    refresh();
  } }, svg(ICONS.chevron));
  if (fold) fold.classList.toggle("is-open", !folded);
  const detach = h("button", { class: "frame-btn", title: `Float the ${PANEL_NAMES[id]} as its own window (drag it to another screen)`, "aria-label": `Float ${PANEL_NAMES[id]}`, onClick: () => {
    layout.floating[id] = layout.floating[id] ?? { x: 80 + Object.keys(layout.floating).length * 40, y: 100 + Object.keys(layout.floating).length * 40, w: id === "codex" ? 340 : 380, h: id === "codex" ? 520 : 300 };
    save();
    refresh();
  } }, "⧉");
  const bar = h("div", { class: "frame-bar" }, h("span", { class: "frame-name" }, PANEL_NAMES[id]), fold, detach);
  return h("div", { class: `panel-frame${folded ? " folded" : ""}${grow ? " grow" : ""}`, "data-panel": id }, bar, h("div", { class: "frame-body" }, el));
}

/** A floating window around a panel's frame. Drag the title, resize the corner, Dock puts it back. */
function floatWindow(id: PanelId, content: HTMLElement, refresh: () => void): HTMLElement {
  const box = layout.floating[id]!;
  const win = h("div", { class: "float-window", "data-panel": id, role: "dialog", "aria-label": `${PANEL_NAMES[id]} window`, style: `left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px` });
  const dock = h("button", { class: "frame-btn", title: `Put the ${PANEL_NAMES[id]} back in the window`, "aria-label": `Dock ${PANEL_NAMES[id]}`, onClick: () => {
    delete layout.floating[id];
    save();
    refresh();
  } }, "⇲");
  const title = h("div", { class: "float-title" }, h("span", null, PANEL_NAMES[id]), dock);
  title.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const sx = e.clientX - box.x;
    const sy = e.clientY - box.y;
    title.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) => {
      box.x = Math.round(m.clientX - sx);
      box.y = Math.max(0, Math.round(m.clientY - sy));
      win.style.left = `${box.x}px`;
      win.style.top = `${box.y}px`;
    };
    const up = () => {
      title.removeEventListener("pointermove", move);
      title.removeEventListener("pointerup", up);
      save();
    };
    title.addEventListener("pointermove", move);
    title.addEventListener("pointerup", up);
  });
  win.append(title, h("div", { class: "float-body" }, content));
  if (typeof ResizeObserver !== "undefined") {
    let first = true;
    new ResizeObserver(() => {
      if (first) return void (first = false);
      const w = Math.round(win.offsetWidth);
      const hh = Math.round(win.offsetHeight);
      if (w && hh && (w !== box.w || hh !== box.h)) {
        box.w = w;
        box.h = hh;
        save();
      }
    }).observe(win);
  }
  return win;
}

export interface Panels {
  /** The middle (what you're making) and the three panels with their natural elements. */
  editor: HTMLElement;
  codex: HTMLElement;
  flags: HTMLElement;
  ai: HTMLElement;
  refresh: () => void;
}

/** Builds the workspace and the AI panel under it, and any floating windows. */
export function arrange(panels: Panels): { workspace: HTMLElement; ai: HTMLElement | null } {
  const p: Panels = { ...panels, refresh: () => void flush().then(panels.refresh) };
  for (const old of document.querySelectorAll(".float-window")) old.remove();
  const floating = (id: PanelId) => !!layout.floating[id];
  const make = (id: PanelId, el: HTMLElement, grow = false) => {
    const f = frame(id, el, p.refresh, grow);
    if (!floating(id)) return f;
    const win = floatWindow(id, f, p.refresh);
    document.body.append(win);
    return null;
  };
  const codex = make("codex", p.codex, true);
  const flags = make("flags", p.flags);
  const ai = make("ai", p.ai);

  const docked = [codex, flags].filter((x): x is HTMLElement => !!x);
  const workspace = h("div", { class: `workspace two arranged${layout.sideFolded || !docked.length ? " side-folded" : ""}` }, p.editor);
  workspace.style.setProperty("--side-w", `${layout.sideWidth}px`);

  if (docked.length) {
    const side = h("aside", { class: "side" }, ...docked);
    const toggle = h("button", { class: "divider-btn", title: layout.sideFolded ? "Open the side panels" : "Fold the side panels to a thin strip", "aria-label": layout.sideFolded ? "Open side panels" : "Fold side panels", "aria-expanded": String(!layout.sideFolded), onClick: () => {
      layout.sideFolded = !layout.sideFolded;
      save();
      p.refresh();
    } }, svg(ICONS.chevron));
    toggle.classList.toggle("is-open", !layout.sideFolded);
    const divider = h("div", { class: "divider", role: "separator", "aria-orientation": "vertical", "aria-label": "Resize the side panels. Double-click to reset.", tabindex: "0", title: "Drag to resize. Double-click to reset." }, toggle);
    divider.addEventListener("pointerdown", (e) => {
      if ((e.target as HTMLElement).closest("button") || layout.sideFolded) return;
      divider.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const startW = layout.sideWidth;
      const move = (m: PointerEvent) => {
        layout.sideWidth = clampSide(startW - (m.clientX - startX));
        workspace.style.setProperty("--side-w", `${layout.sideWidth}px`);
      };
      const up = () => {
        divider.removeEventListener("pointermove", move);
        divider.removeEventListener("pointerup", up);
        save();
      };
      divider.addEventListener("pointermove", move);
      divider.addEventListener("pointerup", up);
    });
    divider.addEventListener("dblclick", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      layout.sideWidth = DEFAULT_SIDE;
      workspace.style.setProperty("--side-w", `${DEFAULT_SIDE}px`);
      save();
    });
    divider.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowLeft" ? 24 : e.key === "ArrowRight" ? -24 : 0;
      if (!d) return;
      e.preventDefault();
      layout.sideWidth = clampSide(layout.sideWidth + d);
      workspace.style.setProperty("--side-w", `${layout.sideWidth}px`);
      save();
    });
    workspace.append(divider, side);
  }
  return { workspace, ai };
}

/** The Layout menu: the built-in arrangements, your own, and saving the current one. */
export async function layoutDialog(refresh: () => void) {
  const dlg = openDialog("Panel layout");
  const draw = async () => {
    const s = await attempt(() => api.layoutState());
    if (!s) return;
    dlg.body.replaceChildren(
      h("p", { class: "muted" }, "Drag the line between the middle and the side panels to resize it, double-click the line to reset it, and use the small buttons on a panel to fold it or float it as its own window."),
      h(
        "div",
        { class: "preset-list" },
        s.presets.map((p) =>
          h(
            "div",
            { class: "preset-row" },
            h("button", { class: "button preset-pick", onClick: async () => {
              layout = cleanLayout(p.layout);
              await attempt(() => api.applyLayoutPreset(p.name));
              dlg.close();
              refresh();
            } }, h("strong", null, p.name), h("span", { class: "muted small" }, p.blurb)),
            p.own ? h("button", { class: "icon-button", title: `Delete "${p.name}"`, "aria-label": `Delete ${p.name}`, onClick: async () => (await attempt(() => api.deleteLayoutPreset(p.name)), void draw()) }, svg(ICONS.trash)) : null,
          ),
        ),
      ),
    );
    const name = h("input", { class: "text-input", placeholder: "Name this arrangement", "aria-label": "Name for your layout", maxlength: "40" });
    const saveBtn = h("button", { class: "button primary", onClick: async () => {
      const r = await attempt(() => api.saveLayoutPreset(name.value));
      if (r) {
        notice(`Saved "${r.name}". Find it in this list any time.`, "green");
        void draw();
      }
    } }, "Save current layout");
    dlg.footer.replaceChildren(name, saveBtn, h("button", { class: "button", onClick: () => dlg.close() }, "Done"));
  };
  await draw();
}
