// The soundboard (version 3): buttons that play the user's own sounds. A button is a name or a
// number pointing at one sound; several buttons can share a file. Drag a button off the board and
// it floats on the screen. Drop files on the board to add sounds. Nothing is shipped: no music,
// no narration. Erase all clears the buttons, never the files, and Ctrl+Z brings them back.

import { SOUND_CATEGORIES } from "../../app/sounds.ts";
import type { SoundButton, SoundCategory, SoundEntry } from "../../app/sounds.ts";
import { api } from "../api.ts";
import { attempt } from "../common.ts";
import { notice, openDialog } from "../dialogs.ts";
import { h } from "../dom.ts";
import { floatButton } from "../floating-sounds.ts";
import { getVolumes, isPlaying, onSoundChange, previewSound, setVolumes, stopAll, toggleButton } from "../sound-engine.ts";
import type { DeskCtx } from "./registry.ts";

let showSounds = false;
let stopListening: (() => void) | null = null;

export async function soundboardTool(ctx: DeskCtx): Promise<HTMLElement> {
  const ro = ctx.view.readOnly;
  const [buttons, library] = await Promise.all([attempt(() => api.soundButtons()), attempt(() => api.soundLibrary())]);
  const sounds = library ?? [];
  const list = buttons ?? [];
  const categoryOf = (b: SoundButton): SoundCategory => sounds.find((s) => s.id === b.sound)?.category ?? "music";
  const saved = (ctx.settings("soundboard").volumes as Partial<ReturnType<typeof getVolumes>> | undefined) ?? {};
  setVolumes(saved);

  const body = h("div", { class: "soundboard" });

  const grid = h(
    "div",
    { class: "sound-grid" },
    list.length
      ? list.map((b) => {
          const missing = !!b.sound && !sounds.some((s) => s.id === b.sound);
          const play = h("button", { class: `sound-btn${isPlaying(b.id) ? " on" : ""}${missing ? " missing" : ""}`, "data-button": b.id, title: missing ? `The file ${b.sound} isn't in the Sounds folder any more` : `${b.label}: ${b.sound}${b.loop ? " (repeats)" : ""}. Click to play or stop. Drag off the board to float it.`, draggable: ro ? "false" : "true", onClick: () => toggleButton(b, categoryOf(b)) }, b.label || "♪", b.loop ? h("span", { class: "sound-loop", "aria-hidden": "true" }, "↻") : null);
          play.addEventListener("dragend", (e) => {
            if (ro) return;
            const box = body.closest(".tool")?.getBoundingClientRect();
            const outside = !box || e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom;
            if (outside) void floatButton(b.id, e.clientX - 20, e.clientY - 14);
          });
          return h("span", { class: "sound-cell" }, play, ro ? null : h("button", { class: "icon-button tiny", title: "Change this button", "aria-label": `Change ${b.label}`, onClick: () => void buttonDialog(ctx, sounds, b) }, "✎"));
        })
      : h("p", { class: "muted small" }, sounds.length ? "No buttons yet. Press + Button to make one." : "No sounds yet. Add sounds, or drop files here, then make buttons for them."),
  );

  const slider = (key: "master" | SoundCategory, label: string) => {
    const input = h("input", { type: "range", min: "0", max: "100", value: String(Math.round(getVolumes()[key] * 100)), "aria-label": `${label} volume` });
    input.addEventListener("input", () => setVolumes({ [key]: Number(input.value) / 100 }));
    input.addEventListener("change", () => void ctx.setSettings("soundboard", { volumes: getVolumes() }));
    return h("label", { class: "sound-volume small" }, label, input);
  };

  const bar = ro
    ? null
    : h(
        "div",
        { class: "inline sound-bar" },
        h("button", { class: "button plain small-button", onClick: () => void buttonDialog(ctx, sounds, null) }, "+ Button"),
        h("button", { class: "button plain small-button", title: "Copy sound files into your Sounds folder", onClick: async () => ((await addSounds(ctx)), void 0) }, "Add sounds…"),
        h("button", { class: "button plain small-button", title: "Clears the buttons, never the files. Ctrl+Z brings them back.", disabled: !list.length, onClick: async () => {
            const n = await attempt(() => api.eraseSoundButtons());
            if (n) notice(`Erased ${n} button${n === 1 ? "" : "s"}. Ctrl+Z brings them back.`, "blue", undefined, 6000);
            await ctx.refresh();
          } }, "Erase all buttons"),
      );

  const soundList = h(
    "details",
    { class: "sound-library", open: showSounds },
    h("summary", { class: "small" }, `Sounds (${sounds.length})`),
    sounds.length
      ? h(
          "ul",
          { class: "sound-files" },
          sounds.map((s) => soundRow(s, ctx)),
        )
      : h("p", { class: "muted small" }, "Nothing here yet."),
    h("p", { class: "muted tiny" }, "They live in the Sounds folder in your main folder. Files you drop in there in Windows show up here; deleting files is done in Windows. A folder is a pack from someone else."),
  );
  soundList.addEventListener("toggle", () => (showSounds = soundList.open));

  body.append(
    h("div", { class: "sound-volumes" }, slider("master", "Master"), ...SOUND_CATEGORIES.map((c) => slider(c.id, c.name)), h("button", { class: "link small", onClick: () => stopAll() }, "Stop all")),
    ...(bar ? [bar] : []),
    grid,
    soundList,
  );

  // Drop files anywhere on the board to add them.
  if (!ro) {
    body.addEventListener("dragover", (e) => {
      if (e.dataTransfer?.types.includes("Files")) {
        e.preventDefault();
        body.classList.add("drop-here");
      }
    });
    body.addEventListener("dragleave", () => body.classList.remove("drop-here"));
    body.addEventListener("drop", (e) => {
      body.classList.remove("drop-here");
      const files = [...(e.dataTransfer?.files ?? [])];
      if (!files.length) return;
      e.preventDefault();
      void (async () => {
        let added = 0;
        for (const f of files) {
          const ok = await attempt(async () => api.addSoundData(f.name, new Uint8Array(await f.arrayBuffer())));
          if (ok) added++;
        }
        if (added) notice(`Added ${added} sound${added === 1 ? "" : "s"} to your Sounds folder.`, "green", undefined, 4000);
        await ctx.refresh();
      })();
    });
  }

  // Playing buttons light up without redrawing the table (which would never stop the music anyway).
  stopListening?.();
  stopListening = onSoundChange(() => {
    for (const el of document.querySelectorAll<HTMLElement>(".sound-btn")) el.classList.toggle("on", isPlaying(el.dataset.button ?? ""));
  });
  return body;
}

function soundRow(s: SoundEntry, ctx: DeskCtx): HTMLElement {
  const pick = h("select", { class: "text-input select small-select", "aria-label": `Category for ${s.name}`, disabled: ctx.view.readOnly }, SOUND_CATEGORIES.map((c) => h("option", { value: c.id, selected: c.id === s.category, title: c.hint }, c.name)));
  pick.addEventListener("change", async () => {
    await attempt(() => api.setSoundCategory(s.id, pick.value));
    await ctx.refresh();
  });
  return h("li", { class: "sound-file" }, h("button", { class: "icon-button tiny", title: "Listen", "aria-label": `Listen to ${s.name}`, onClick: () => previewSound(s.id) }, "▶"), h("span", { class: "sound-file-name", title: s.id }, s.name), s.pack ? h("span", { class: "muted tiny" }, s.pack) : null, pick);
}

async function addSounds(ctx: DeskCtx) {
  const added = await attempt(() => api.addSounds());
  if (added?.length) notice(`Added ${added.length} sound${added.length === 1 ? "" : "s"}.`, "green", undefined, 3500);
  await ctx.refresh();
}

/** Make a button, or change or remove one. Several buttons can point at the same sound. */
function buttonDialog(ctx: DeskCtx, sounds: SoundEntry[], existing: SoundButton | null) {
  const d = openDialog(existing ? "Change this button" : "New sound button");
  const label = h("input", { class: "text-input", value: existing?.label ?? "", placeholder: "Thunder, or a number like 3", maxlength: 40, "aria-label": "Button name" });
  const sound = h(
    "select",
    { class: "text-input select", "aria-label": "Sound" },
    h("option", { value: "" }, sounds.length ? "Choose a sound…" : "No sounds yet: add some first"),
    SOUND_CATEGORIES.map((c) => {
      const mine = sounds.filter((s) => s.category === c.id);
      return mine.length ? h("optgroup", { label: c.name }, mine.map((s) => h("option", { value: s.id, selected: s.id === existing?.sound }, s.pack ? `${s.name} (${s.pack})` : s.name))) : null;
    }),
  );
  const loop = h("input", { type: "checkbox", checked: existing?.loop ?? false });
  sound.addEventListener("change", () => {
    // Ambience usually wants to repeat; the choice is still the user's.
    const s = sounds.find((x) => x.id === sound.value);
    if (s && !existing) loop.checked = s.category === "ambience";
    if (s && !label.value.trim()) label.value = s.name;
  });
  d.body.replaceChildren(h("label", { class: "field-label" }, "Name or number"), label, h("label", { class: "field-label spaced" }, "Plays"), sound, h("label", { class: "inline spaced" }, loop, "Repeats until stopped"));
  const ok = h("button", { class: "button primary" }, existing ? "Save" : "Make the button");
  ok.addEventListener("click", async () => {
    if (!sound.value) return void notice("Choose a sound for the button.", "blue", undefined, 3000);
    const done = existing ? await attempt(() => api.setSoundButton(existing.id, { label: label.value, sound: sound.value, loop: loop.checked })) : await attempt(() => api.addSoundButton(label.value, sound.value, loop.checked));
    if (done !== undefined) {
      d.close();
      await ctx.refresh();
    }
  });
  d.footer.replaceChildren(
    existing ? h("button", { class: "button plain", onClick: async () => ((await attempt(() => api.removeSoundButton(existing.id))) !== undefined && (d.close(), await ctx.refresh())) }, "Remove") : h("span"),
    h("span", { class: "grow" }),
    h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"),
    ok,
  );
  label.focus();
}
