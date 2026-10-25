// Plays the table's sounds (version 3). Lives outside any screen, so redrawing the table never
// cuts the music off. A sound's category decides how loud it is next to the others: a voice turns
// music and ambience down while it speaks, and they come back up when it ends.

import { SOUND_CATEGORIES, gainFor } from "../app/sounds.ts";
import type { SoundButton, SoundCategory } from "../app/sounds.ts";

interface Playing {
  audio: HTMLAudioElement;
  category: SoundCategory;
}

const playing = new Map<string, Playing>();
const listeners = new Set<() => void>();
const volumes: Record<SoundCategory | "master", number> = { master: 1, music: 1, ambience: 1, voice: 1 };

/** Where a sound's bytes come from: the app's own protocol (the browser preview serves them over the web). */
export function soundUrl(path: string): string {
  const base = (window as unknown as { dmSoundBase?: string }).dmSoundBase ?? "dmsound://snd/";
  return base + path.split("/").map(encodeURIComponent).join("/");
}

const changed = () => listeners.forEach((fn) => fn());

/** Calls `fn` whenever something starts or stops. Returns the way to stop listening. */
export function onSoundChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const isPlaying = (id: string) => playing.has(id);
export const playingCount = () => playing.size;

/** Sets each playing sound's volume from its category, what else is playing, and the sliders. */
function mix() {
  const cats = [...playing.values()].map((p) => p.category);
  for (const p of playing.values()) p.audio.volume = Math.max(0, Math.min(1, gainFor(p.category, cats) * volumes[p.category] * volumes.master));
}

export function setVolumes(v: Partial<typeof volumes>) {
  for (const k of Object.keys(volumes) as (keyof typeof volumes)[]) {
    const n = v[k];
    if (typeof n === "number" && Number.isFinite(n)) volumes[k] = Math.max(0, Math.min(1, n));
  }
  mix();
}

export const getVolumes = () => ({ ...volumes });

/** Plays a button's sound, or stops it if it is already playing. */
export function toggleButton(b: SoundButton, category: SoundCategory): void {
  if (playing.has(b.id)) return stopButton(b.id);
  if (!b.sound) return;
  const audio = new Audio(soundUrl(b.sound));
  audio.loop = b.loop;
  const done = () => {
    if (playing.get(b.id)?.audio === audio) {
      playing.delete(b.id);
      mix();
      changed();
    }
  };
  audio.addEventListener("ended", done);
  audio.addEventListener("error", done);
  playing.set(b.id, { audio, category });
  mix();
  void audio.play().catch(done);
  changed();
}

export function stopButton(id: string) {
  const p = playing.get(id);
  if (!p) return;
  p.audio.pause();
  playing.delete(id);
  mix();
  changed();
}

export function stopAll() {
  for (const id of [...playing.keys()]) {
    playing.get(id)!.audio.pause();
    playing.delete(id);
  }
  changed();
}

/** A one-off preview of a file while choosing, never mixed with the table's sounds. */
let preview: HTMLAudioElement | null = null;
export function previewSound(path: string) {
  preview?.pause();
  if (preview && preview.dataset.path === path) return void (preview = null);
  preview = new Audio(soundUrl(path));
  preview.dataset.path = path;
  preview.volume = 0.6 * volumes.master;
  void preview.play().catch(() => (preview = null));
}

export { SOUND_CATEGORIES };
