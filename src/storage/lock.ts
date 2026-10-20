// "One copy open at a time." While a world is open, a small lock file sits next to it and is
// refreshed every few seconds. It works across computers when the main folder is in Dropbox or
// OneDrive, because the lock file syncs like any other file.

import { existsSync, readFileSync, rmSync } from "node:fs";
import { atomicWrite } from "./atomic.ts";

export const LOCK_SUFFIX = ".lock";
/** A lock not refreshed for this long belongs to an app that is no longer running. */
export const LOCK_STALE_MS = 2 * 60 * 1000;
export const HEARTBEAT_MS = 15 * 1000;

export interface LockInfo {
  machine: string;
  session: string;
  heartbeat: number;
}

export type AcquireResult =
  /** Nobody had it open. */
  | { status: "ok" }
  /** It was left open by an app that stopped without closing it (a crash or power cut). */
  | { status: "recovered" }
  /** It is open right now somewhere else. The user chooses read-only or take over. */
  | { status: "in-use"; by: LockInfo };

export class WorldLock {
  private readonly path: string;
  private readonly me: { machine: string; session: string };
  private readonly now: () => number;
  constructor(worldPath: string, me: { machine: string; session: string }, now: () => number = () => Date.now()) {
    this.path = worldPath + LOCK_SUFFIX;
    this.me = me;
    this.now = now;
  }

  read(): LockInfo | null {
    if (!existsSync(this.path)) return null;
    try {
      return JSON.parse(readFileSync(this.path, "utf8")) as LockInfo;
    } catch {
      return null;
    }
  }

  /** Tries to take the lock. Does not take it when the world is open somewhere else. */
  acquire(): AcquireResult {
    const cur = this.read();
    if (cur && cur.session !== this.me.session && this.now() - cur.heartbeat < LOCK_STALE_MS && cur.machine !== this.me.machine) {
      return { status: "in-use", by: cur };
    }
    const recovered = !!cur && cur.session !== this.me.session;
    this.write();
    return recovered ? { status: "recovered" } : { status: "ok" };
  }

  /** "Take over": the other copy loses the lock at its next heartbeat and goes read-only. */
  takeOver() {
    this.write();
  }

  /**
   * Called every few seconds while open. Returns "lost" if another computer took over, in which
   * case the app must stop editing and switch to read-only.
   */
  heartbeat(): "ok" | "lost" {
    const cur = this.read();
    if (cur && cur.session !== this.me.session) return "lost";
    this.write();
    return "ok";
  }

  release() {
    const cur = this.read();
    if (cur && cur.session === this.me.session) rmSync(this.path);
  }

  private write() {
    atomicWrite(this.path, JSON.stringify({ ...this.me, heartbeat: this.now() } satisfies LockInfo));
  }
}
