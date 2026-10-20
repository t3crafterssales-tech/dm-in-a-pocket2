// Table mode: the world as a read-only reading view for running a game, with tabs Rules, Monsters,
// Items and Tables. Entries are the rulebook's own words, so what is read at the table is what
// prints. Variants are shown in full here, since a GM looks one thing up at a time.

import { buildBook } from "../engine/index.ts";
import type { ChapterId, Id, Workspace } from "../engine/index.ts";
import { dieMax, tableRows } from "./lore.ts";

export type TableTab = "rules" | "monsters" | "items" | "tables";

export const TABLE_TABS: { id: TableTab; title: string }[] = [
  { id: "rules", title: "Rules" },
  { id: "monsters", title: "Monsters" },
  { id: "items", title: "Items" },
  { id: "tables", title: "Tables" },
];

const TAB_OF: Record<ChapterId, TableTab> = {
  core: "rules",
  abilities: "rules",
  resources: "rules",
  conditions: "rules",
  skills: "rules",
  rules: "rules",
  races: "rules",
  classes: "rules",
  spells: "rules",
  lore: "rules",
  monsters: "monsters",
  npcs: "monsters",
  items: "items",
};

export interface TableEntry {
  id: Id;
  title: string;
  /** The chapter it sits in, such as Conditions or Characters of the world. */
  group: string;
  /** 0 for a main entry, 1 for a variant under it, and so on. */
  depth: number;
  stats: string | null;
  paragraphs: string[];
  /** Things this entry mentions that can be opened from it. */
  mentions: { id: Id; name: string }[];
  picture: Id | null;
  favourite: boolean;
  /** Roll tables only: the dice and the rows. */
  table: { die: string; canRoll: boolean; rows: { range: string; text: string; result: { id: Id; name: string } | null }[] } | null;
}

export interface TableModeView {
  tabs: { id: TableTab; title: string; entries: TableEntry[] }[];
}

export function tableModeView(ws: Workspace, layerId: Id): TableModeView {
  const book = buildBook(ws, layerId, { type: "everything", variants: "full" });
  const tabs = TABLE_TABS.map((t) => ({ ...t, entries: [] as TableEntry[] }));
  const opened = new Set<Id>();
  for (const ch of book.chapters) {
    if (ch.id.startsWith("page:")) continue;
    const walk = (e: (typeof ch.entries)[number], depth: number) => {
      const n = ws.get(layerId, e.node);
      if (!n) return;
      const tab = n.kind === "table" ? "tables" : TAB_OF[ch.id as ChapterId];
      const f = ws.resolve(layerId, n.id)!.fields;
      const table = n.kind === "table" ? tableOf(ws, layerId, f) : null;
      tabs.find((t) => t.id === tab)!.entries.push({
        id: n.id,
        title: e.title,
        group: tab === "tables" ? "Roll tables" : ch.id === "lore" ? "Lore" : ch.title,
        depth,
        stats: e.stats,
        // A table's rows are shown as a table, not as the book's sentences.
        paragraphs: table ? [] : e.paragraphs,
        mentions: e.mentions.filter((m) => m !== n.id).map((m) => ({ id: m, name: ws.get(layerId, m)?.name ?? "" })),
        picture: e.picture,
        favourite: !!n.favourite,
        table,
      });
      opened.add(n.id);
      e.variants.forEach((v) => walk(v, depth + 1));
    };
    ch.entries.forEach((e) => walk(e, 0));
  }
  // Only things that can be opened here are offered as links.
  for (const t of tabs) for (const e of t.entries) e.mentions = e.mentions.filter((m) => m.name && opened.has(m.id));
  return { tabs };
}

function tableOf(ws: Workspace, layerId: Id, f: Record<string, unknown>): TableEntry["table"] {
  const die = typeof f.die === "string" ? f.die : "d6";
  const rows = tableRows(f as Parameters<typeof tableRows>[0]).map((r) => {
    const target = r.result ? ws.get(layerId, r.result.link) : null;
    return { range: r.from === r.to ? String(r.from) : `${r.from}-${r.to}`, text: r.text, result: target ? { id: target.id, name: target.name } : null };
  });
  return { die, canRoll: !!dieMax(die) && rows.length > 0, rows };
}
