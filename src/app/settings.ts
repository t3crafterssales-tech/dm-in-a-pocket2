// The app's own settings, kept on this computer only (not in the main folder, so two computers
// sharing a folder through Dropbox never fight over them).

import { existsSync, readFileSync } from "node:fs";
import type { Id } from "../engine/index.ts";
import { atomicWrite } from "../storage/index.ts";

export interface Place {
  type: "world" | "system";
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
}

export function defaultSettings(): Settings {
  return { mainFolder: null, opened: {}, place: null };
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
        place: raw.place && (raw.place.type === "world" || raw.place.type === "system") && typeof raw.place.id === "string" ? raw.place : null,
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
