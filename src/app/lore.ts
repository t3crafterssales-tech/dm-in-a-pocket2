// The Lore tab: pages, places and factions (with templates that start them off with headings),
// book pages that only appear in a rulebook (a foreword, How to play), and roll tables.

import { F, isLink, link } from "../engine/index.ts";
import type { Id, NodeRecord, Value, Workspace } from "../engine/index.ts";

export type LoreKind = "page" | "place" | "faction" | "bookPage" | "table";

export const LORE_KINDS: { id: LoreKind; label: string; plural: string }[] = [
  { id: "page", label: "Lore page", plural: "Lore pages" },
  { id: "place", label: "Place", plural: "Places" },
  { id: "faction", label: "Faction", plural: "Factions" },
  { id: "table", label: "Roll table", plural: "Roll tables" },
  { id: "bookPage", label: "Book page", plural: "Book pages" },
];

/** Templates start a page off with headings to fill in; every heading can be renamed or removed. */
export const LORE_TEMPLATES: Record<string, { label: string; kind: LoreKind; headings: string[] }> = {
  blank: { label: "Blank page", kind: "page", headings: [] },
  place: { label: "Place", kind: "place", headings: ["What it looks like", "Who lives there", "Dangers", "Adventure hooks"] },
  faction: { label: "Faction", kind: "faction", headings: ["History", "Structure", "Territory", "Allies and enemies", "What it means to players"] },
  howToPlay: { label: "How to play", kind: "bookPage", headings: [] },
  foreword: { label: "Foreword", kind: "bookPage", headings: [] },
};

export function loreKindOf(n: NodeRecord, fields: Record<string, Value>): LoreKind | null {
  if (n.kind === "table") return "table";
  if (n.kind !== "lore") return null;
  if (fields[F.bookPage] === true) return "bookPage";
  const k = fields.loreKind;
  return k === "place" || k === "faction" ? k : "page";
}

export interface LoreSection {
  kind: LoreKind;
  title: string;
  entries: { id: Id; name: string; fromBelow: boolean }[];
}

export function loreList(ws: Workspace, layerId: Id): LoreSection[] {
  const below = ws.layer(layerId).base;
  const out = LORE_KINDS.map((k) => ({ kind: k.id, title: k.plural, entries: [] as LoreSection["entries"] }));
  for (const n of ws.list(layerId).sort((a, b) => a.name.localeCompare(b.name))) {
    if (n.template) continue;
    // A module's front page belongs to the Adventure tab, not the Lore tab.
    if (ws.resolve(layerId, n.id)!.fields.modulePage === true) continue;
    const kind = loreKindOf(n, ws.resolve(layerId, n.id)!.fields);
    if (kind) out.find((s) => s.kind === kind)!.entries.push({ id: n.id, name: n.name, fromBelow: !!below && ws.owner(layerId, n.id) !== layerId });
  }
  return out;
}

/** Makes a lore page, place, faction, book page (from a template) or roll table, as one undo step. */
export function createLore(ws: Workspace, layerId: Id, name: string, template: string): Id {
  return ws.transact(`Added ${name}`, () => {
    if (template === "table") return ws.create(layerId, "table", name, { fields: { die: "d6", rows: [] } });
    const t = LORE_TEMPLATES[template];
    if (!t) throw new Error("That isn't a kind of lore page the app knows.");
    const sections = Object.fromEntries(t.headings.map((h) => [h, ""]));
    const fields: Record<string, Value> = t.kind === "bookPage" ? { [F.bookPage]: true, [F.books]: ["players", "everything"], [F.before]: template === "howToPlay" ? "abilities" : "core" } : { loreKind: t.kind };
    if (t.headings.length) fields.sections = sections;
    return ws.create(layerId, "lore", name, { fields });
  });
}

// ---------- Roll tables ----------

export interface TableRow {
  from: number;
  to: number;
  text: string;
  /** Results can link to things: roll 6, meet the Ogre. */
  result: { link: Id } | null;
  /** Version 2: crossed out once rolled, until the DM resets the table. */
  once?: boolean;
  /** Version 2: how common: "common", "uncommon", "rare" or a number. */
  weight?: string | number | null;
}

export function tableRows(fields: Record<string, Value>): TableRow[] {
  const rows = Array.isArray(fields.rows) ? fields.rows : [];
  return rows.flatMap((r) => {
    if (!r || typeof r !== "object" || Array.isArray(r) || isLink(r)) return [];
    const x = r as Record<string, Value>;
    return [{ from: Number(x.from ?? 1), to: Number(x.to ?? x.from ?? 1), text: typeof x.text === "string" ? x.text : "", result: isLink(x.result) ? { link: x.result.link } : null, once: x.once === true, weight: typeof x.weight === "string" || typeof x.weight === "number" ? x.weight : null }];
  });
}

/** Rows as stored: links stay links, so a result pointing at something deleted is flagged red. */
export function rowsValue(rows: TableRow[]): Value {
  return rows.map((r) => ({ from: r.from, to: r.to, text: r.text, result: r.result ? link(r.result.link) : null, ...(r.once ? { once: true } : {}), ...(r.weight !== undefined && r.weight !== null ? { weight: r.weight } : {}) }));
}

/** The highest roll of dice text: d6 is 6, 2d6 is 12, d100 is 100. */
export function dieMax(die: string): { count: number; sides: number } | null {
  const m = die.trim().match(/^(\d*)d(\d+)$/i);
  if (!m) return null;
  const count = Math.max(1, Math.min(20, Number(m[1] || 1)));
  const sides = Number(m[2]);
  return sides >= 2 && sides <= 1000 ? { count, sides } : null;
}

/** Rows already rolled on a table, for its once-only rows. */
export function usedRows(fields: Record<string, Value>): number[] {
  return Array.isArray(fields.used) ? fields.used.filter((x): x is number => typeof x === "number") : [];
}

/**
 * Rolls a table. A once-only row already rolled is crossed out: the dice are rolled again until
 * they land somewhere else. Rolling itself changes nothing; `onceRow` says which once-only row
 * came up, so the caller can cross it out.
 */
export function rollTable(ws: Workspace, layerId: Id, id: Id, random: () => number = Math.random): { roll: number; row: TableRow | null; onceRow: number | null; allUsed: boolean } {
  const r = ws.resolve(layerId, id);
  if (!r || r.record.kind !== "table") throw new Error("That isn't a roll table.");
  const die = dieMax(typeof r.fields.die === "string" ? r.fields.die : "d6");
  if (!die) throw new Error("Set the dice first, such as d6, 2d6 or d100.");
  const rows = tableRows(r.fields);
  const used = new Set(usedRows(r.fields));
  const open = rows.some((x, i) => !(x.once && used.has(i)));
  let roll = 0;
  let index = -1;
  for (let tries = 0; tries < 40; tries++) {
    roll = 0;
    for (let i = 0; i < die.count; i++) roll += 1 + Math.floor(random() * die.sides);
    index = rows.findIndex((x) => roll >= x.from && roll <= x.to);
    if (index < 0 || !(rows[index]!.once && used.has(index)) || !open) break;
  }
  const row = index >= 0 && !(rows[index]!.once && used.has(index)) ? rows[index]! : null;
  return { roll, row, onceRow: row?.once ? index : null, allUsed: !open && rows.length > 0 };
}

/** Crosses out a once-only row (or, with null, resets the table). Inside the caller's step. */
export function markUsed(ws: Workspace, layerId: Id, id: Id, row: number | null) {
  const used = usedRows(ws.resolve(layerId, id)!.fields);
  ws.setField(layerId, id, "used", row === null ? [] : [...new Set([...used, row])]);
}

const WEIGHTS: Record<string, number> = { common: 6, uncommon: 3, rare: 1 };

/** "How common": works out each row's range on the die from Common, Uncommon, Rare or a number. */
export function weightedRanges(rows: TableRow[], dieText: string): TableRow[] {
  const die = dieMax(dieText);
  if (!die || !rows.length) return rows;
  const lo = die.count;
  const hi = die.count * die.sides;
  const span = hi - lo + 1;
  const w = rows.map((r) => Math.max(0.0001, typeof r.weight === "number" ? r.weight : WEIGHTS[String(r.weight ?? "common").toLowerCase()] ?? 1));
  const total = w.reduce((a, b) => a + b, 0);
  let at = lo;
  let acc = 0;
  return rows.map((r, i) => {
    acc += w[i]!;
    const end = i === rows.length - 1 ? hi : Math.max(at, lo + Math.round((acc / total) * span) - 1);
    const out = { ...r, from: at, to: Math.min(hi, end) };
    at = Math.min(hi, end + 1);
    return out;
  });
}

/** "Make a table from the Codex": one row each, spread evenly over the smallest die that fits. */
export function tableFromList(ids: { id: Id; name: string }[]): { die: string; rows: TableRow[] } {
  const n = Math.max(1, ids.length);
  const sides = [4, 6, 8, 10, 12, 20, 100].find((s) => s >= n) ?? 100;
  const per = sides / n;
  const rows = ids.slice(0, 100).map((x, i) => ({ from: Math.floor(i * per) + 1, to: i === n - 1 ? sides : Math.floor((i + 1) * per), text: "", result: { link: x.id } }));
  return { die: `d${sides}`, rows };
}
