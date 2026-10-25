// The picture library's tags (version 3). Every picture has a name, one or more single-word
// lowercase tags (the first is the main tag, used first for automatic pictures), an optional style
// and a star. Plain functions, tested without the window. The index lives beside the pictures, in
// the main folder, so it never touches the data format of worlds and systems.

import type { Id } from "../engine/index.ts";

export interface PicInfo {
  name: string;
  /** Lowercase single words; the first is the main tag. */
  tags: string[];
  style: string;
  favourite: boolean;
}

export type PicIndex = Record<Id, PicInfo>;

export interface PicEntry extends PicInfo {
  id: Id;
}

/** One word, lowercase, letters and digits and hyphens: `Sword`, `SWORD ` and `sword` are the same tag. */
export function normTag(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const word = raw.trim().toLowerCase().split(/\s+/)[0] ?? "";
  return word.replace(/[^\p{L}\p{N}-]/gu, "").slice(0, 30);
}

export function cleanTags(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[,;]/) : [];
  const out: string[] = [];
  for (const t of list) {
    const n = normTag(t);
    if (n && !out.includes(n)) out.push(n);
  }
  return out.slice(0, 30);
}

export function cleanInfo(raw: Partial<PicInfo> | undefined, fallbackName: string): PicInfo {
  return {
    name: typeof raw?.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 120) : fallbackName,
    tags: cleanTags(raw?.tags),
    style: typeof raw?.style === "string" ? raw.style.trim().slice(0, 40) : "",
    favourite: raw?.favourite === true,
  };
}

/** Words that tend to go with a main tag, nudged to the top of the second line's suggestions. */
const RELATED: Record<string, string[]> = {
  sword: ["melee", "weapon", "blade", "fantasy"],
  axe: ["melee", "weapon", "blade"],
  bow: ["ranged", "weapon", "arrow"],
  potion: ["bottle", "magic", "consumable"],
  goblin: ["monster", "humanoid", "creature"],
  dragon: ["monster", "creature", "fantasy"],
  tree: ["nature", "forest", "plant"],
  door: ["building", "wood", "entrance"],
  banner: ["faction", "flag", "heraldry"],
};

/** Tags by how often they're used, most first, then alphabetically. */
export function tagFrequency(index: PicIndex): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const info of Object.values(index)) for (const t of info.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/**
 * Suggestions for a tag line: what's been typed narrows the list (so `wea` finds `weapon` before
 * `weapons` is made by accident), words that go with the main tag come first, the rest by use.
 */
export function suggestTags(index: PicIndex, main: string, typed: string, already: string[] = []): string[] {
  const t = normTag(typed);
  const near = RELATED[normTag(main)] ?? [];
  const known = tagFrequency(index).map((x) => x.tag);
  const all = [...near, ...known.filter((k) => !near.includes(k))];
  return all.filter((tag, i) => all.indexOf(tag) === i && !already.includes(tag) && (!t || tag.startsWith(t) || tag.includes(t))).slice(0, 12);
}

/** Every tag, alphabetically, for the filter panel. */
export function allTags(index: PicIndex): string[] {
  return tagFrequency(index).map((x) => x.tag).sort((a, b) => a.localeCompare(b));
}

export interface PicQuery {
  text?: string;
  /** Every one of these tags (clicking several narrows further). */
  tags?: string[];
  style?: string;
  favourites?: boolean;
}

export function searchPictures(entries: PicEntry[], q: PicQuery): PicEntry[] {
  const text = (q.text ?? "").trim().toLowerCase();
  const tags = cleanTags(q.tags);
  return entries
    .filter((e) => (!q.favourites || e.favourite) && (!q.style || e.style.toLowerCase() === q.style.toLowerCase()) && tags.every((t) => e.tags.includes(t)) && (!text || e.name.toLowerCase().includes(text) || e.tags.some((t) => t.includes(text))))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/**
 * Pictures that fit a new thing, trying each hint in turn (its name's words first, then its
 * category, then its kind): the main tag matching counts before any other tag. Empty if nothing fits.
 */
export function matchPictures(entries: PicEntry[], hints: string[]): PicEntry[] {
  for (const raw of hints) {
    const hint = normTag(raw);
    if (!hint) continue;
    const mains = entries.filter((e) => e.tags[0] === hint);
    if (mains.length) return mains.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    const any = entries.filter((e) => e.tags.includes(hint));
    if (any.length) return any.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }
  return [];
}

/** The hints for a new thing: words of its name, then the thing it is filed as. */
export function hintsFor(name: string, ...filedAs: string[]): string[] {
  const words = name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);
  const singular = (w: string) => (w.endsWith("s") && w.length > 3 ? w.slice(0, -1) : w);
  return [...new Set([...words.flatMap((w) => [w, singular(w)]), ...filedAs.flatMap((f) => [f, singular(f)])])];
}

export function entriesOf(ids: Id[], index: PicIndex): PicEntry[] {
  return ids.map((id) => ({ id, ...cleanInfo(index[id], "Picture") }));
}
