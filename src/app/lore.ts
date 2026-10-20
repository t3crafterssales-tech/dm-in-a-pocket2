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
}

export function tableRows(fields: Record<string, Value>): TableRow[] {
  const rows = Array.isArray(fields.rows) ? fields.rows : [];
  return rows.flatMap((r) => {
    if (!r || typeof r !== "object" || Array.isArray(r) || isLink(r)) return [];
    const x = r as Record<string, Value>;
    return [{ from: Number(x.from ?? 1), to: Number(x.to ?? x.from ?? 1), text: typeof x.text === "string" ? x.text : "", result: isLink(x.result) ? { link: x.result.link } : null }];
  });
}

/** Rows as stored: links stay links, so a result pointing at something deleted is flagged red. */
export function rowsValue(rows: TableRow[]): Value {
  return rows.map((r) => ({ from: r.from, to: r.to, text: r.text, result: r.result ? link(r.result.link) : null }));
}

/** The highest roll of dice text: d6 is 6, 2d6 is 12, d100 is 100. */
export function dieMax(die: string): { count: number; sides: number } | null {
  const m = die.trim().match(/^(\d*)d(\d+)$/i);
  if (!m) return null;
  const count = Math.max(1, Math.min(20, Number(m[1] || 1)));
  const sides = Number(m[2]);
  return sides >= 2 && sides <= 1000 ? { count, sides } : null;
}

/** Rolls a table. Rolling changes nothing, so it isn't an undo step. */
export function rollTable(ws: Workspace, layerId: Id, id: Id, random: () => number = Math.random): { roll: number; row: TableRow | null } {
  const r = ws.resolve(layerId, id);
  if (!r || r.record.kind !== "table") throw new Error("That isn't a roll table.");
  const die = dieMax(typeof r.fields.die === "string" ? r.fields.die : "d6");
  if (!die) throw new Error("Set the dice first, such as d6, 2d6 or d100.");
  let roll = 0;
  for (let i = 0; i < die.count; i++) roll += 1 + Math.floor(random() * die.sides);
  const row = tableRows(r.fields).find((x) => roll >= x.from && roll <= x.to) ?? null;
  return { roll, row };
}
