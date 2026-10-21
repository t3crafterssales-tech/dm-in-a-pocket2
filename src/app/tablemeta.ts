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
}

export const DEFAULT_ARRANGEMENT: ToolPlace[] = [
  { tool: "encounter", area: "left", order: 0 },
  { tool: "initiative", area: "middle", order: 0 },
  { tool: "dice", area: "right", order: 0 },
  { tool: "clock", area: "right", order: 1 },
  { tool: "log", area: "right", order: 2 },
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
  };
}
