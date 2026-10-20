// Crash-safe writing: write a new file beside the old one, flush it to disk, then swap it in.
// If the power goes out at any moment, either the old file or the new one is whole.

import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, renameSync, rmSync, writeSync } from "node:fs";
import { dirname } from "node:path";

export const SAVING_SUFFIX = ".saving";

export interface WriteHooks {
  /** For tests: runs after the new file is written, before it replaces the old one. */
  beforeSwap?: () => void;
}

export function atomicWrite(path: string, data: Buffer | string, hooks: WriteHooks = {}) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = path + SAVING_SUFFIX;
  const fd = openSync(tmp, "w");
  try {
    writeSync(fd, typeof data === "string" ? Buffer.from(data, "utf8") : data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  hooks.beforeSwap?.();
  renameSync(tmp, path);
}

/** Clears away a save that was cut off. Returns true if there was one. */
export function clearInterruptedSave(path: string): boolean {
  const tmp = path + SAVING_SUFFIX;
  if (!existsSync(tmp)) return false;
  rmSync(tmp);
  return true;
}
