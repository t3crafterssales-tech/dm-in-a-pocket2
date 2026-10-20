// Safe saving and opening. Saving writes a new file beside the old one and swaps it in, so a
// crash or power cut in the middle of a save always leaves a whole file behind.

import { closeSync, copyFileSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, rmSync, writeSync } from "node:fs";
import type { SavedFile } from "./types.ts";
import { FORMAT_VERSION } from "./types.ts";

export const SAVING_SUFFIX = ".saving";

export interface SaveHooks {
  /** For tests: runs after the new file is written, before it replaces the old one. */
  beforeSwap?: () => void;
}

export function saveFile(path: string, data: SavedFile, hooks: SaveHooks = {}) {
  const tmp = path + SAVING_SUFFIX;
  const fd = openSync(tmp, "w");
  try {
    writeSync(fd, JSON.stringify(data));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  hooks.beforeSwap?.();
  renameSync(tmp, path);
}

export interface Opened {
  data: SavedFile;
  /** True when the file was made by a newer version of the app. */
  readOnly: boolean;
  /** True when a half-finished save from a crash was found and set aside. */
  recovered: boolean;
  /** Where the original was copied before upgrading, if it was upgraded. */
  upgradedFrom: string | null;
}

export class OpenError extends Error {}

export function openFile(path: string): Opened {
  const tmp = path + SAVING_SUFFIX;
  let recovered = false;
  if (existsSync(tmp)) {
    // A save was cut off before it finished. The main file is still the last whole save.
    rmSync(tmp);
    recovered = true;
  }
  if (!existsSync(path)) throw new OpenError("That file isn't there.");
  let data: SavedFile;
  try {
    data = JSON.parse(readFileSync(path, "utf8")) as SavedFile;
  } catch {
    throw new OpenError("That file is damaged. Try a backup from World settings.");
  }
  if (typeof data.format !== "number") throw new OpenError("That isn't a DM in a Pocket file.");
  if (data.format > FORMAT_VERSION) return { data, readOnly: true, recovered, upgradedFrom: null };
  let upgradedFrom: string | null = null;
  if (data.format < FORMAT_VERSION) {
    upgradedFrom = `${path}.v${data.format}.bak`;
    copyFileSync(path, upgradedFrom);
    data = upgrade(data);
  }
  return { data, readOnly: false, recovered, upgradedFrom };
}

/** Upgrades an older file one format version at a time. There are no older formats yet. */
export function upgrade(data: SavedFile): SavedFile {
  const steps: Record<number, (d: SavedFile) => SavedFile> = {};
  let d = data;
  while (d.format < FORMAT_VERSION) {
    const fn = steps[d.format];
    if (!fn) throw new OpenError(`Can't upgrade a format ${d.format} file.`);
    d = fn(d);
  }
  return d;
}
