// The DM's table's memory (version 2), kept with the file like the AI's chat and not in undo
// history: the chat and rolls, how the DM arranged their screen (and named arrangements such as
// "Combat" or "Town"), bookmarks, floating pins, journal category order and each tool's settings.

import type { Id } from "../engine/index.ts";

export interface ChatLine {
  id: Id;
  time: number;
  kind: "chat" | "roll" | "note" | "whisper";
  /** Who said or rolled it ("Rob", "DM"). */
  who: string;
  color: string;
  /** Public (everyone), private (just me), DM only, or blind (only the DM sees the result). */
  see: "public" | "private" | "dm" | "blind";
  /** Whispers: the names it goes to. */
  to: string[];
  text: string;
  roll: { formula: string; total: number; breakdown: string; natural: number | null } | null;
  /** In character (written differently from out of character). */
  ic: boolean;
  /** The player who wrote it (a person's id); missing for the DM. */
  from?: Id;
}

// ---------- Players (version 2.5) ----------

/** The parts of the game in the permissions grid. */
export type Part = "characters" | "initiative" | "hidden" | "monsters" | "journal" | "tables" | "codex" | "codexAdd" | "pointer" | "whispers" | "share";
export type Access = "hidden" | "see" | "change";
/** The ready-made levels, like Foundry's. The DM is whoever runs the app. */
export type Level = "new" | "player" | "trusted" | "assistant";

export interface Person {
  id: Id;
  name: string;
  /** Five digits: both the key and who you are. Empty when revoked. */
  pin: string;
  /** The character they play. */
  character: Id | null;
  level: Level;
  /** Exceptions to their level, square by square. */
  grid: Partial<Record<Part, Access>>;
  color: string;
  /** Their own private notes (their journal). */
  notes: string;
}

export interface PermissionTemplate {
  name: string;
  kind: "person" | "table";
  /** A person template: a level and its exceptions. */
  level?: Level;
  grid?: Partial<Record<Part, Access>>;
  /** A table template: each person's level and exceptions, by name. */
  people?: { name: string; level: Level; grid: Partial<Record<Part, Access>> }[];
}

/** Something shown to players: it pops up on their screens and stays in their journal. */
export interface Shown {
  id: Id;
  node: Id;
  /** Person ids; empty means everyone. */
  to: Id[];
  time: number;
}

/** The map showing on players' screens, with the table marks over it. */
export interface LiveMap {
  map: Id | null;
  to: Id[];
  marks: unknown[];
}

/** Where a tool sits on the DM's screen: one of five areas, in order. */
export interface ToolPlace {
  tool: string;
  area: "left" | "right" | "top" | "bottom" | "middle";
  order: number;
}

export interface Bookmark {
  id: Id;
  /** What it opens: a thing in the Codex, or a whole Codex section shown as a little table. */
  node: Id | null;
  section: string | null;
  label: string;
  group: string;
}

export interface FloatingPin {
  id: Id;
  node: Id;
  x: number;
  y: number;
  collapsed: boolean;
}

export interface TableMeta {
  chat: ChatLine[];
  /** The screen as arranged now, and arrangements saved by name. */
  arrangement: ToolPlace[];
  arrangements: { name: string; places: ToolPlace[] }[];
  bookmarks: Bookmark[];
  pins: FloatingPin[];
  journalCategories: { name: string; priority: number }[];
  /** Each tool's own settings (its gear), by tool name. */
  settings: Record<string, Record<string, unknown>>;
  /** Saved glance combinations ("Gauntlet: Dex saves"). */
  glances: { name: string; fields: string[] }[];
  /** The players: names, PINs, levels and exceptions (remembered with the party). */
  people: Person[];
  templates: PermissionTemplate[];
  shown: Shown[];
  live: LiveMap;
}

export const DEFAULT_ARRANGEMENT: ToolPlace[] = [
  { tool: "encounter", area: "left", order: 0 },
  { tool: "initiative", area: "middle", order: 0 },
  { tool: "dice", area: "right", order: 0 },
  { tool: "clock", area: "right", order: 1 },
  { tool: "log", area: "right", order: 2 },
  { tool: "codex", area: "left", order: 1 },
  { tool: "players", area: "left", order: 2 },
];

export const TOOL_NAMES: Record<string, string> = {
  encounter: "Encounter",
  initiative: "Initiative",
  dice: "Dice tray",
  clock: "Clock and timers",
  tables: "Roll tables",
  journal: "Journal",
  bookmarks: "Bookmarks",
  party: "Party",
  map: "Map",
  log: "Chat and log",
  reference: "Rules reference",
  codex: "Codex",
  players: "Players",
};

export function tableMetaFrom(v: unknown): TableMeta {
  const o = v && typeof v === "object" ? (v as Partial<TableMeta>) : {};
  return {
    chat: Array.isArray(o.chat) ? o.chat : [],
    arrangement: Array.isArray(o.arrangement) && o.arrangement.length ? o.arrangement : DEFAULT_ARRANGEMENT,
    arrangements: Array.isArray(o.arrangements) ? o.arrangements : [],
    bookmarks: Array.isArray(o.bookmarks) ? o.bookmarks : [],
    pins: Array.isArray(o.pins) ? o.pins : [],
    journalCategories: Array.isArray(o.journalCategories) ? o.journalCategories : [],
    settings: o.settings && typeof o.settings === "object" ? o.settings : {},
    glances: Array.isArray(o.glances) ? o.glances : [],
    people: Array.isArray(o.people) ? o.people : [],
    templates: Array.isArray(o.templates) ? o.templates : [],
    shown: Array.isArray(o.shown) ? o.shown : [],
    live: o.live && typeof o.live === "object" ? { map: o.live.map ?? null, to: Array.isArray(o.live.to) ? o.live.to : [], marks: Array.isArray(o.live.marks) ? o.live.marks : [] } : { map: null, to: [], marks: [] },
  };
}
