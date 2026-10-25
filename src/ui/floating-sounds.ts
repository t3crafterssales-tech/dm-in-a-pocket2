// Sound buttons dragged off the soundboard onto the screen (version 3). A floating button is only
// a copy: it plays the same sound as its home button, moves anywhere like a pin, and taking it
// off the screen never touches the soundboard.

import type { FloatingButton, SoundButton } from "../app/sounds.ts";
import { api } from "./api.ts";
import { attempt } from "./common.ts";
import { h, svg } from "./dom.ts";
import { ICONS } from "./icons.ts";
import { isPlaying, onSoundChange, toggleButton } from "./sound-engine.ts";

let layer: HTMLElement | null = null;
let stopListening: (() => void) | null = null;

function host(): HTMLElement {
  if (!layer || !layer.isConnected) {
    layer = h("div", { class: "sound-floats", "aria-label": "Floating sound buttons" });
    document.body.appendChild(layer);
  }
  return layer;
}

async function save(floats: FloatingButton[]) {
  await attempt(() => api.setTableMeta({ soundFloats: floats }));
}

/** Draws the floating sound buttons of the open world. */
export async function drawSoundFloats() {
  const el = host();
  const [meta, buttons, library] = await Promise.all([attempt(() => api.tableMeta()), attempt(() => api.soundButtons()), attempt(() => api.soundLibrary())]);
  stopListening?.();
  if (!meta || !buttons) return el.replaceChildren();
  const category = (b: SoundButton) => library?.find((s) => s.id === b.sound)?.category ?? "music";
  const cards = meta.soundFloats
    .map((f): HTMLElement | null => {
      const home = buttons.find((b) => b.id === f.button);
      if (!home) return null;
      const play = h("button", { class: "sound-float-play", title: `${home.label}: click to play or stop`, onClick: () => toggleButton(home, category(home)) }, home.label || "♪");
      const card = h(
        "div",
        { class: "sound-float", style: `left:${f.x}px;top:${f.y}px`, "data-playing": isPlaying(home.id) ? "true" : "false", "data-button": home.id },
        h("span", { class: "sound-float-grip", title: "Drag to move", "aria-hidden": "true" }, "⠿"),
        play,
        h("button", { class: "icon-button tiny", title: "Take it off the screen (the soundboard keeps it)", "aria-label": "Take this button off the screen", onClick: async () => (await save(meta.soundFloats.filter((x) => x.id !== f.id)), card.remove()) }, svg(ICONS.close)),
      );
      card.querySelector(".sound-float-grip")!.addEventListener("pointerdown", (e) => {
        const ev = e as PointerEvent;
        ev.preventDefault();
        const dx = ev.clientX - f.x;
        const dy = ev.clientY - f.y;
        const move = (m: PointerEvent) => {
          f.x = Math.max(0, Math.min(window.innerWidth - 60, m.clientX - dx));
          f.y = Math.max(0, Math.min(window.innerHeight - 30, m.clientY - dy));
          card.style.left = `${f.x}px`;
          card.style.top = `${f.y}px`;
        };
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          void save(meta.soundFloats);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      });
      return card;
    })
    .filter((c): c is HTMLElement => !!c);
  el.replaceChildren(...cards);
  stopListening = onSoundChange(() => {
    for (const c of el.querySelectorAll<HTMLElement>(".sound-float")) c.dataset.playing = isPlaying(c.dataset.button ?? "") ? "true" : "false";
  });
}

export function clearSoundFloats() {
  layer?.replaceChildren();
  stopListening?.();
}

/** Puts a copy of a soundboard button on the screen where it was dropped. */
export async function floatButton(button: string, x: number, y: number) {
  const meta = await attempt(() => api.tableMeta());
  if (!meta) return;
  await save([...meta.soundFloats, { id: `${Date.now()}`, button, x: Math.max(0, x), y: Math.max(0, y) }]);
  await drawSoundFloats();
}
