// Brick windows (navigation pass, item 3). Opening a brick from the Codex opens its real sheet in a
// window over the screen: move it by the top bar, resize it by the corner, click it to bring it to
// the front. Each window has Tuck away (minimise to the tray along the bottom), Close, and "Open in
// the middle" in its top-right corner. Edits save by themselves, so neither button can lose work.
// Keys (when no text box is active): Q tucks the front window away, W closes it, E brings back the
// last one closed, Z and X step through all the windows (tucked ones come back).

import { api } from "./api.ts";
import { attempt } from "./common.ts";
import { notice } from "./dialogs.ts";
import { h, svg } from "./dom.ts";
import { ICONS } from "./icons.ts";

interface Win {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  seq: number;
  min: boolean;
  el: HTMLElement;
  title: HTMLElement;
  body: HTMLElement;
}

/** What the screen behind the windows has to supply. */
export interface WindowHost {
  /** Builds a brick's sheet for a window; null when the brick no longer exists. */
  build: (id: string) => Promise<{ name: string; el: HTMLElement } | null>;
  /** Opens the brick in the middle, as the main thing being built. */
  middle: (id: string) => void;
}

const MIN_W = 300;
const MIN_H = 180;
const TRAY_H = 40;
/** A polite warning when this many are open or tucked. */
export const WINDOW_WARN = 20;

let host: WindowHost = { build: async () => null, middle: () => {} };
const wins = new Map<string, Win>();
const closed: string[] = [];
let zTop = 10;
let seqNo = 0;
let layer: HTMLElement | null = null;
let tray: HTMLElement | null = null;
let hidden = false;
let layoutMode: "grid" | "cascade" = "grid";
let building = 0;

// ---------- Remembered positions ----------

type Box = { x: number; y: number; w: number; h: number };
const KEY = "dmip.windows";
function remembered(): Record<string, Box> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Box>;
  } catch {
    return {};
  }
}
function remember(w: Win) {
  try {
    const all = remembered();
    all[w.id] = { x: w.x, y: w.y, w: w.w, h: w.h };
    const ids = Object.keys(all);
    for (const old of ids.slice(0, Math.max(0, ids.length - 200))) delete all[old];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Remembering positions is a convenience only.
  }
}

// ---------- Setup ----------

export function initWindows(h2: WindowHost) {
  host = h2;
}

function ensureLayer() {
  if (!layer || !layer.isConnected) {
    layer = h("div", { class: "win-layer", "aria-label": "Brick windows" });
    document.body.appendChild(layer);
  }
  if (!tray || !tray.isConnected) {
    tray = h("div", { class: "win-tray", role: "toolbar", "aria-label": "Window tray" });
    document.body.appendChild(tray);
  }
}

/** How many windows exist (open or tucked). */
export const windowCount = () => wins.size;

/** The front-most window that is showing, if any. */
function front(): Win | null {
  let best: Win | null = null;
  for (const w of wins.values()) if (!w.min && (!best || w.z > best.z)) best = w;
  return best;
}

export const frontWindowId = () => front()?.id ?? null;

// ---------- Opening, closing, tucking ----------

/** Opens a brick in a window, or brings its window back to the front if it is already there. */
export async function openWindow(id: string) {
  ensureLayer();
  const have = wins.get(id);
  if (have) {
    have.min = false;
    bringToFront(have);
    await fill(have);
    sync();
    return;
  }
  const built = await host.build(id);
  if (!built) return notice("That isn't there any more.", "blue", undefined, 3000);
  const saved = remembered()[id];
  const n = wins.size;
  const box: Box = saved ?? { x: 140 + (n % 8) * 32, y: 110 + (n % 8) * 32, w: 480, h: 540 };
  const w = create(id, built.name, clampBox(box));
  w.body.replaceChildren(built.el);
  wins.set(id, w);
  layer!.appendChild(w.el);
  bringToFront(w);
  sync();
  if (wins.size === WINDOW_WARN) notice(`That's ${WINDOW_WARN} windows open or tucked away. It still works, but "Tuck all away" or Close can clear some room.`, "blue", undefined, 7000);
}

function clampBox(b: Box): Box {
  const w = Math.min(Math.max(MIN_W, b.w), Math.max(MIN_W, window.innerWidth - 20));
  const hh = Math.min(Math.max(MIN_H, b.h), Math.max(MIN_H, window.innerHeight - TRAY_H - 20));
  return { w, h: hh, x: Math.min(Math.max(0, b.x), Math.max(0, window.innerWidth - Math.min(w, 120))), y: Math.min(Math.max(0, b.y), Math.max(0, window.innerHeight - TRAY_H - 40)) };
}

export function closeWindow(id: string, remember = true) {
  const w = wins.get(id);
  if (!w) return;
  w.el.remove();
  wins.delete(id);
  if (remember) {
    const at = closed.indexOf(id);
    if (at >= 0) closed.splice(at, 1);
    closed.push(id);
    if (closed.length > 30) closed.shift();
  }
  sync();
}

export function tuckWindow(id: string) {
  const w = wins.get(id);
  if (!w) return;
  w.min = true;
  sync();
}

export function tuckAll() {
  for (const w of wins.values()) w.min = true;
  sync();
}

async function restore(id: string) {
  const w = wins.get(id);
  if (!w) return;
  w.min = false;
  bringToFront(w);
  sync();
  await fill(w);
}

/** E: brings back the window closed most recently. */
export async function reopenClosed() {
  while (closed.length) {
    const id = closed.pop()!;
    if (wins.has(id)) continue;
    if (!(await attempt(() => api.node(id)))) continue;
    return openWindow(id);
  }
  notice("There's no closed window to bring back.", "blue", undefined, 2500);
}

/** Z (previous) and X (next): steps through every window in the order they were opened. */
export async function stepWindow(dir: 1 | -1) {
  const list = [...wins.values()].sort((a, b) => a.seq - b.seq);
  if (!list.length) return;
  const cur = front();
  const at = cur ? list.indexOf(cur) : dir === 1 ? -1 : 0;
  const next = list[(at + dir + list.length) % list.length]!;
  await restore(next.id);
}

/** The letter keys, for the place's key handler. True when the key was used. */
export function windowKey(key: string): boolean {
  if (!wins.size && key !== "e") return false;
  const f = front();
  if (key === "q") return f ? (tuckWindow(f.id), true) : false;
  if (key === "w") return f ? (closeWindow(f.id), true) : false;
  if (key === "e") return closed.length ? (void reopenClosed(), true) : false;
  if (key === "z" || key === "x") return void stepWindow(key === "x" ? 1 : -1), true;
  return false;
}

/** Takes every window off the screen (going home). */
export function clearWindows() {
  for (const w of wins.values()) w.el.remove();
  wins.clear();
  closed.length = 0;
  sync();
}

/** Hides the windows while something else owns the screen (the DM's table). */
export function hideWindows(on: boolean) {
  hidden = on;
  sync();
}

// ---------- One window ----------

function bringToFront(w: Win) {
  w.z = ++zTop;
  w.el.style.zIndex = String(w.z);
  for (const x of wins.values()) x.el.classList.toggle("front", x === front());
}

function create(id: string, name: string, box: Box): Win {
  const title = h("span", { class: "bw-title" }, name);
  const body = h("div", { class: "bw-body" });
  const el = h("div", { class: "brick-window", role: "dialog", "aria-label": name, "data-window": id, style: `left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px` });
  const w: Win = { id, name, ...box, z: 0, seq: ++seqNo, min: false, el, title, body };

  const middle = h("button", { class: "bw-btn", title: "Open this in the middle, as the main thing you're building", "aria-label": "Open in the middle", onClick: () => (closeWindow(id, false), host.middle(id)) }, "Open in middle");
  const tuck = h("button", { class: "bw-btn icon", title: "Tuck away to the tray at the bottom (Q)", "aria-label": "Tuck away to the tray", onClick: () => tuckWindow(id) }, h("span", { class: "bw-dash", "aria-hidden": "true" }));
  const close = h("button", { class: "bw-btn icon", title: "Close (W). Your changes are already saved.", "aria-label": "Close", onClick: () => closeWindow(id) }, svg(ICONS.close));
  const head = h("div", { class: "bw-head", title: "Drag to move. Double-click to tuck away." }, title, h("span", { class: "grow" }), middle, tuck, close);
  const grip = h("div", { class: "bw-grip", title: "Drag to resize", "aria-hidden": "true" });
  el.append(head, body, grip);

  el.addEventListener("pointerdown", () => bringToFront(w), true);
  head.addEventListener("dblclick", (e) => {
    if (!(e.target as HTMLElement).closest("button")) tuckWindow(id);
  });
  drag(head, w, (dx, dy, start) => {
    const b = clampBox({ ...start, x: start.x + dx, y: start.y + dy });
    w.x = b.x;
    w.y = b.y;
    place(w);
  });
  drag(grip, w, (dx, dy, start) => {
    w.w = Math.min(Math.max(MIN_W, start.w + dx), Math.max(MIN_W, window.innerWidth - w.x));
    w.h = Math.min(Math.max(MIN_H, start.h + dy), Math.max(MIN_H, window.innerHeight - TRAY_H - w.y));
    place(w);
  });
  return w;
}

function place(w: Win) {
  w.el.style.left = `${w.x}px`;
  w.el.style.top = `${w.y}px`;
  w.el.style.width = `${w.w}px`;
  w.el.style.height = `${w.h}px`;
}

/** Pointer dragging for the title bar (move) and the corner (resize). */
function drag(handle: HTMLElement, w: Win, step: (dx: number, dy: number, start: Box) => void) {
  handle.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest("button") || e.button !== 0) return;
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    const start = { x: w.x, y: w.y, w: w.w, h: w.h };
    w.el.classList.add("moving");
    const move = (m: PointerEvent) => step(m.clientX - sx, m.clientY - sy, start);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      w.el.classList.remove("moving");
      remember(w);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });
}

// ---------- Contents ----------

/** Redraws one window's sheet, keeping the box you were typing in and where you had scrolled to. */
async function fill(w: Win) {
  const built = await host.build(w.id);
  if (!wins.has(w.id)) return;
  if (!built) return closeWindow(w.id, false);
  const ae = document.activeElement as HTMLElement | null;
  const key = ae && w.body.contains(ae) ? ae.dataset?.key ?? null : null;
  const caret = ae instanceof HTMLInputElement || ae instanceof HTMLTextAreaElement ? ae.selectionStart : null;
  const scroll = w.body.scrollTop;
  w.body.replaceChildren(built.el);
  w.body.scrollTop = scroll;
  if (built.name !== w.name) {
    w.name = built.name;
    w.title.textContent = built.name;
    w.el.setAttribute("aria-label", built.name);
  }
  if (key) {
    const back = w.body.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`);
    back?.focus();
    if (back && caret !== null && (back instanceof HTMLInputElement || back instanceof HTMLTextAreaElement)) back.setSelectionRange(caret, caret);
  }
}

/** Redraws every showing window after something changed (called after each screen redraw). */
export async function refreshWindows() {
  if (!wins.size) return;
  const mine = ++building;
  const open = [...wins.values()].filter((w) => !w.min);
  for (const w of open) {
    if (mine !== building) return;
    await fill(w);
  }
  sync();
}

// ---------- The tray and the Arrange button ----------

function sync() {
  if (!layer) return;
  layer.classList.toggle("hidden", hidden);
  for (const w of wins.values()) w.el.classList.toggle("tucked", w.min);
  for (const x of wins.values()) x.el.classList.toggle("front", x === front());
  const any = wins.size > 0 && !hidden;
  document.body.classList.toggle("has-tray", any);
  if (!tray) return;
  tray.classList.toggle("on", any);
  if (!any) return tray.replaceChildren();
  const tucked = [...wins.values()].filter((w) => w.min).sort((a, b) => a.seq - b.seq);
  const shown = [...wins.values()].filter((w) => !w.min).length;
  tray.replaceChildren(
    h("span", { class: "tray-label" }, `${wins.size} window${wins.size === 1 ? "" : "s"}`),
    h("button", { class: "button plain small-button", title: "Tidy the open windows: a grid, then a cascade (press again to switch)", disabled: shown < 1, onClick: () => arrange() }, "Arrange"),
    h("button", { class: "button plain small-button", title: "Tuck every open window away to the tray", disabled: shown < 1, onClick: () => tuckAll() }, "Tuck all away"),
    h(
      "div",
      { class: "tray-chips" },
      tucked.length ? null : h("span", { class: "muted small" }, "Tucked-away windows wait here."),
      tucked.map((w) =>
        h(
          "span",
          { class: "tray-chip" },
          h("button", { class: "tray-open", title: `Bring back ${w.name}`, onClick: () => void restore(w.id) }, w.name),
          h("button", { class: "tray-x", title: `Close ${w.name}`, "aria-label": `Close ${w.name}`, onClick: () => closeWindow(w.id) }, svg(ICONS.close)),
        ),
      ),
    ),
  );
}

/** Tiles the open windows in a grid, or stacks them in a cascade; each press switches. */
export function arrange() {
  const open = [...wins.values()].filter((w) => !w.min).sort((a, b) => a.seq - b.seq);
  if (!open.length) return;
  const W = window.innerWidth;
  const H = window.innerHeight - TRAY_H;
  if (layoutMode === "grid") {
    const cols = Math.ceil(Math.sqrt(open.length * (W / H)));
    const rows = Math.ceil(open.length / cols);
    const cw = Math.max(MIN_W, Math.floor((W - 24) / cols));
    const ch = Math.max(MIN_H, Math.floor((H - 70) / rows));
    open.forEach((w, i) => {
      w.w = cw - 8;
      w.h = ch - 8;
      w.x = 12 + (i % cols) * cw;
      w.y = 64 + Math.floor(i / cols) * ch;
    });
    layoutMode = "cascade";
  } else {
    open.forEach((w, i) => {
      w.w = 520;
      w.h = Math.min(560, H - 140);
      w.x = 60 + i * 34;
      w.y = 80 + i * 34;
    });
    layoutMode = "grid";
  }
  for (const w of open) {
    const b = clampBox(w);
    Object.assign(w, b);
    place(w);
    remember(w);
    bringToFront(w);
  }
}
