// Pin anything to the screen (version 2). A pin is a small card floating over everything: a
// rule, a monster, a price list, a lore page. Drag it anywhere by its top, collapse it to a tab,
// close it with the X; double-click its top to open the thing in full. Pins stay put while you
// move between tabs and the DM's table, and are remembered with the world. A pin is only a link,
// so it always shows the latest version. Ctrl+Shift+P pins what the mouse is over.

import type { FloatingPin, PlaceView } from "../app/backend.ts";
import { api, pictureUrl } from "./api.ts";
import { attempt } from "./common.ts";
import { notice } from "./dialogs.ts";
import { h, svg } from "./dom.ts";
import { ICONS } from "./icons.ts";

let layer: HTMLElement | null = null;
let opener: (id: string) => void = () => {};

function host(): HTMLElement {
  if (!layer || !layer.isConnected) {
    layer = h("div", { class: "pins-layer", "aria-label": "Pinned" });
    document.body.appendChild(layer);
  }
  return layer;
}

async function save(pins: FloatingPin[]) {
  await attempt(() => api.setTableMeta({ pins }));
}

/** Draws the pins of the open world over whatever screen is showing. */
export async function drawPins(_view: PlaceView | null, opts: { open: (id: string) => void }) {
  opener = opts.open;
  const meta = await attempt(() => api.tableMeta());
  const el = host();
  if (!meta) return el.replaceChildren();
  const cards = await Promise.all(meta.pins.map((p) => pinCard(p, meta.pins)));
  el.replaceChildren(...cards.filter((c): c is HTMLElement => !!c));
}

/** Takes the pins off the screen (going home). */
export function clearPins() {
  layer?.replaceChildren();
}

async function pinCard(p: FloatingPin, all: FloatingPin[]): Promise<HTMLElement | null> {
  const [n, preview] = await Promise.all([api.node(p.node).catch(() => null), api.printPreview(p.node).catch(() => null)]);
  if (!n) return null;
  const close = async () => {
    await save(all.filter((x) => x.id !== p.id));
    card.remove();
  };
  const toggle = async () => {
    p.collapsed = !p.collapsed;
    await save(all);
    card.classList.toggle("collapsed", p.collapsed);
  };
  const head = h(
    "div",
    { class: "pin-head", title: "Drag to move. Double-click to open it in full." },
    h("span", { class: "pin-title" }, "📌 ", n.name),
    h("span", { class: "grow" }),
    h("button", { class: "icon-button tiny", title: p.collapsed ? "Open the pin" : "Fold it to a tab", onClick: (e: MouseEvent) => (e.stopPropagation(), void toggle()) }, p.collapsed ? "▢" : "–"),
    h("button", { class: "icon-button tiny", title: "Close the pin (the thing itself stays)", onClick: (e: MouseEvent) => (e.stopPropagation(), void close()) }, svg(ICONS.close)),
  );
  const body = h(
    "div",
    { class: "pin-body" },
    n.picture ? h("img", { class: "pin-pic", src: pictureUrl(n.picture), alt: "" }) : null,
    preview?.stats ? h("div", { class: "stats-line small" }, preview.stats) : null,
    ...(preview?.paragraphs.length ? preview.paragraphs.slice(0, 12).map((t) => h("p", { class: "small" }, t)) : [h("p", { class: "small" }, n.text || "Nothing written yet.")]),
  );
  const card = h("div", { class: `floating-pin${p.collapsed ? " collapsed" : ""}`, style: `left:${p.x}px;top:${p.y}px` }, head, body);
  head.addEventListener("dblclick", () => opener(p.node));
  head.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const sx = e.clientX - p.x;
    const sy = e.clientY - p.y;
    const move = (ev: PointerEvent) => {
      p.x = Math.max(0, Math.min(window.innerWidth - 80, ev.clientX - sx));
      p.y = Math.max(0, Math.min(window.innerHeight - 30, ev.clientY - sy));
      card.style.left = `${p.x}px`;
      card.style.top = `${p.y}px`;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      void save(all);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });
  return card;
}

/** Pins a thing (Ctrl+Shift+P, or a pin button). Does nothing if it is already pinned. */
export async function pinThing(id: string) {
  const meta = await attempt(() => api.tableMeta());
  if (!meta) return;
  if (meta.pins.some((p) => p.node === id)) return notice("That's pinned already.", "blue", undefined, 2500);
  const n = meta.pins.length;
  await save([...meta.pins, { id: `${Date.now()}`, node: id, x: Math.max(20, window.innerWidth - 380 - (n % 5) * 24), y: 90 + (n % 5) * 24, collapsed: false }]);
  await drawPins(null, { open: opener });
}
