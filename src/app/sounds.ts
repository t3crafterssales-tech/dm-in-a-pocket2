// Sound at the table (version 3). A sound is a file plus a category, and the category is a
// behaviour: Voice turns the others down while it plays, Ambience sits underneath, Music ducks
// nothing. Buttons are separate from sounds: a button has a name (or a number) and points at one
// file, and several buttons can use the same file. The app ships no music and no narration.
// Plain functions, tested without the window.

import type { Id } from "../engine/index.ts";

export type SoundCategory = "music" | "ambience" | "voice";

export const SOUND_CATEGORIES: { id: SoundCategory; name: string; hint: string }[] = [
  { id: "music", name: "Music", hint: "Plays at full volume and turns nothing down." },
  { id: "ambience", name: "Ambience", hint: "Sits underneath: rain, a tavern, a forest." },
  { id: "voice", name: "Voice", hint: "Turns the music and ambience down while it speaks." },
];

export const SOUND_TYPES = [".mp3", ".wav", ".ogg", ".m4a"];

export const categoryOf = (x: unknown): SoundCategory => (x === "ambience" || x === "voice" ? x : "music");

/** A first guess from the file's path, so a folder called "Ambience" or "Voice" sorts itself. */
export function guessCategory(path: string): SoundCategory {
  const p = path.toLowerCase();
  if (/(voice|narrat|speech|dialog|line)/.test(p)) return "voice";
  if (/(ambien|rain|wind|fire|crowd|forest|cave|drip|wave|thunder|tavern|storm|night)/.test(p)) return "ambience";
  return "music";
}

/** How a sound reads in a list: the file's name without its folder or extension. */
export function soundName(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || path;
}

/** The folder a sound sits in ("" for none): packs from others go in a folder of their own. */
export const soundPack = (path: string): string => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

export interface SoundInfo {
  category: SoundCategory;
}

export interface SoundEntry {
  /** The path inside the Sounds folder, with forward slashes. */
  id: string;
  name: string;
  pack: string;
  category: SoundCategory;
}

export interface SoundButton {
  id: Id;
  /** A name or a number. */
  label: string;
  /** The sound it plays (a path in the Sounds folder). */
  sound: string;
  /** Plays again and again until stopped. Ambience starts that way. */
  loop: boolean;
}

/** Playing sounds turn the others down: Voice ducks Music and Ambience to 30%, Ambience sits at 60%. */
export const DUCK = 0.3;
export const UNDERNEATH = 0.6;

/** How loud a sound of this category should be right now, given what else is playing (0 to 1). */
export function gainFor(category: SoundCategory, playing: SoundCategory[]): number {
  if (category === "voice") return 1;
  const ducked = playing.includes("voice") ? DUCK : 1;
  return (category === "ambience" ? UNDERNEATH : 1) * ducked;
}

export function cleanButtons(raw: unknown): SoundButton[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: SoundButton[] = [];
  for (const b of raw) {
    if (!b || typeof b !== "object") continue;
    const o = b as Record<string, unknown>;
    if (typeof o.id !== "string" || seen.has(o.id)) continue;
    seen.add(o.id);
    out.push({ id: o.id, label: typeof o.label === "string" ? o.label.trim().slice(0, 40) : "", sound: typeof o.sound === "string" ? o.sound : "", loop: o.loop === true });
  }
  return out;
}

export interface FloatingButton {
  id: Id;
  /** The soundboard button it copies; deleting the copy never touches the home button. */
  button: Id;
  x: number;
  y: number;
}
