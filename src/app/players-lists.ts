// The permissions grid's parts and the ready-made levels (version 2.5). No imports, so the
// window can use them too.

import type { Access, Level, Part } from "./tablemeta.ts";

export const PARTS: { key: Part; label: string; hint: string }[] = [
  { key: "characters", label: "Other characters", hint: "See the other players' sheets" },
  { key: "initiative", label: "Initiative", hint: "See the order; Can change moves it on (End my turn, Next turn)" },
  { key: "hidden", label: "Hidden monsters", hint: "See monsters the DM hasn't revealed" },
  { key: "monsters", label: "Monster numbers", hint: "Hit points as numbers instead of words like \"bloodied\"" },
  { key: "journal", label: "DM's journal", hint: "Read (or write in) the DM's journal pages" },
  { key: "tables", label: "Roll tables", hint: "Roll on the roll tables" },
  { key: "codex", label: "Rules reference", hint: "Look up rules, spells and items" },
  { key: "codexAdd", label: "Add to own sheet", hint: "Drag things from the Codex onto their own character" },
  { key: "pointer", label: "Map pointer", hint: "Point at the shown map" },
  { key: "whispers", label: "Others' whispers", hint: "Read whispers between other people" },
  { key: "share", label: "Show to others", hint: "Show things they can see to other players" },
];

const row = (o: Partial<Record<Part, Access>>): Record<Part, Access> => Object.fromEntries(PARTS.map((p) => [p.key, o[p.key] ?? "hidden"])) as Record<Part, Access>;

export const LEVELS: Record<Level, { label: string; grid: Record<Part, Access> }> = {
  new: { label: "New player", grid: row({ initiative: "see" }) },
  player: { label: "Player", grid: row({ characters: "see", initiative: "see", codex: "see" }) },
  trusted: { label: "Trusted player", grid: row({ characters: "see", initiative: "change", codex: "see", tables: "see", codexAdd: "change", pointer: "change" }) },
  assistant: { label: "Assistant GM", grid: row({ characters: "change", initiative: "change", hidden: "see", monsters: "see", journal: "change", tables: "change", codex: "see", codexAdd: "change", pointer: "change", share: "change" }) },
};

export const LEVEL_ORDER: Level[] = ["new", "player", "trusted", "assistant"];
