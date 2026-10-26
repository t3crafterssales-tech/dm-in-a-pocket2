// The app's own settings, kept on this computer only (not in the main folder, so two computers
// sharing a folder through Dropbox never fight over them).

import { existsSync, readFileSync } from "node:fs";
import type { Id } from "../engine/index.ts";
import { atomicWrite } from "../storage/index.ts";
import { type Layout, type RecentThing, type Where, cleanLayout, cleanPresetName, cleanRecent, cleanWhere, defaultLayout } from "./layout.ts";
import { textSizeFor, themeFor } from "./themes.ts";

export interface Place {
  type: "world" | "system" | "module";
  id: Id;
}

export interface Settings {
  /** The main folder. Null means the default (Documents\DM in a Pocket). */
  mainFolder: string | null;
  /** When each world and system was last opened on this computer, for "last opened first". */
  opened: Record<Id, number>;
  /**
   * Where the user is right now. Set when a world or system opens and cleared when they go home or
   * close the app normally, so finding it at start-up means the app was closed unexpectedly.
   */
  place: Place | null;
  /** Optional maker's name, stored on every world, system and thing the user creates. No account. */
  author: string | null;
  /** Which Claude model AI jobs use: Automatic, Always quick or Always careful. */
  aiModel: "auto" | "quick" | "careful";
  /** Jobs estimated above this many dollars show the estimate first. */
  aiThreshold: number;
  /** What AI jobs cost this month, for the running total in the AI panel ("2026-10"). */
  aiSpend: { month: string; usd: number };
  /** Live AI checking: the AI checks each change as it happens. Starts off (it costs money). */
  aiLive: boolean;
  /** The one-time tip about live checking, shown when a key is first added. */
  aiTipShown: boolean;
  /** How the weight pickers count: pounds or kilograms (backlog 12). */
  units: "lb" | "kg";
  /** The first-time welcome has been seen (version 2.6). */
  welcomed: boolean;
  /** Small tips the first time each tool opens; tipsSeen lists the ones already shown. */
  tips: boolean;
  tipsSeen: string[];
  /** The first steps checklist: steps done, and whether it was closed. */
  stepsDone: string[];
  stepsClosed: boolean;
  /** The colour theme (version 3) and the size of the interface text. Screen only. */
  theme: string;
  textSize: "small" | "normal" | "large";
  /** New things get a fitting picture from the library by themselves (version 3). On by default. */
  autoPictures: boolean;
  /** The Codex opens the list that fits what you are working on (version 3). On by default. */
  autoCodex: boolean;
  /** Plain-letter shortcuts (A back, S forward) while no text box is active. */
  letterKeys: boolean;
  /** How many versions the AI offers of anything creative (version 4): 1 to 6, default 2. */
  aiVersions: number;
  /** How the panels are arranged, and the arrangements the user saved (version 3). Screen only. */
  layout: Layout;
  layoutPresets: Record<string, Layout>;
  /** The last things opened, and where each world or system was left (navigation stage 1). Screen only. */
  recent: RecentThing[];
  where: Record<string, Where>;
}

export function defaultSettings(): Settings {
  return { mainFolder: null, opened: {}, place: null, author: null, aiModel: "auto", aiThreshold: 0.5, aiSpend: { month: "", usd: 0 }, aiLive: false, aiTipShown: false, units: "lb", welcomed: false, tips: true, tipsSeen: [], stepsDone: [], stepsClosed: false, theme: "default", textSize: "normal", autoPictures: true, autoCodex: true, letterKeys: true, aiVersions: 2, layout: defaultLayout(), layoutPresets: {}, recent: [], where: {} };
}

export class SettingsFile {
  readonly path: string;
  data: Settings;
  constructor(path: string) {
    this.path = path;
    this.data = SettingsFile.read(path);
  }

  /** A missing or damaged settings file never stops the app: it starts with the defaults. */
  static read(path: string): Settings {
    if (!existsSync(path)) return defaultSettings();
    try {
      const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<Settings>;
      const d = defaultSettings();
      return {
        mainFolder: typeof raw.mainFolder === "string" ? raw.mainFolder : d.mainFolder,
        opened: raw.opened && typeof raw.opened === "object" ? raw.opened : d.opened,
        place: raw.place && (raw.place.type === "world" || raw.place.type === "system" || raw.place.type === "module") && typeof raw.place.id === "string" ? raw.place : null,
        author: typeof raw.author === "string" && raw.author.trim() ? raw.author.trim().slice(0, 120) : null,
        aiModel: raw.aiModel === "quick" || raw.aiModel === "careful" ? raw.aiModel : d.aiModel,
        aiThreshold: typeof raw.aiThreshold === "number" && raw.aiThreshold >= 0 ? raw.aiThreshold : d.aiThreshold,
        aiSpend: raw.aiSpend && typeof raw.aiSpend.month === "string" && typeof raw.aiSpend.usd === "number" ? raw.aiSpend : d.aiSpend,
        aiLive: raw.aiLive === true,
        aiTipShown: raw.aiTipShown === true,
        units: raw.units === "kg" ? "kg" : "lb",
        // Settings from before version 2.6 belong to someone who has used the app already.
        welcomed: raw.welcomed === undefined ? true : raw.welcomed === true,
        tips: raw.tips !== false,
        tipsSeen: Array.isArray(raw.tipsSeen) ? raw.tipsSeen.filter((x): x is string => typeof x === "string") : [],
        stepsDone: Array.isArray(raw.stepsDone) ? raw.stepsDone.filter((x): x is string => typeof x === "string") : [],
        stepsClosed: raw.welcomed === undefined ? true : raw.stepsClosed === true,
        theme: themeFor(raw.theme).id,
        textSize: textSizeFor(raw.textSize),
        autoPictures: raw.autoPictures !== false,
        autoCodex: raw.autoCodex !== false,
        letterKeys: raw.letterKeys !== false,
        aiVersions: typeof raw.aiVersions === "number" && Number.isFinite(raw.aiVersions) ? Math.min(6, Math.max(1, Math.round(raw.aiVersions))) : 2,
        recent: cleanRecent(raw.recent),
        where: cleanWhere(raw.where),
        layout: cleanLayout(raw.layout),
        layoutPresets: Object.fromEntries(Object.entries(raw.layoutPresets && typeof raw.layoutPresets === "object" ? raw.layoutPresets : {}).flatMap(([k, v]) => { const n = cleanPresetName(k); return n ? [[n, cleanLayout(v)]] : []; })),
      };
    } catch {
      return defaultSettings();
    }
  }

  update(fn: (s: Settings) => void) {
    fn(this.data);
    atomicWrite(this.path, JSON.stringify(this.data, null, 2));
  }
}
