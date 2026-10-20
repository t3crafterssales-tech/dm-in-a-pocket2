// One open world or system: constant saving, the lock heartbeat and the save signal for the logo.

import type { Id, Workspace } from "../engine/index.ts";
import { Autosaver, HEARTBEAT_MS, Library, LibraryError, realTimers } from "../storage/index.ts";
import type { OpenWorld, Timers } from "../storage/index.ts";

export interface SessionEvents {
  /** A save finished: the logo pulses. */
  saved?: () => void;
  /** A save failed. Nothing is lost: it is tried again with the next change. */
  saveFailed?: (message: string) => void;
  /** The world became read-only while open (another computer took over). */
  readOnly?: (reason: string) => void;
}

export type OpenResult =
  | { status: "open"; session: Session }
  /** Open on another computer right now: the user picks Open read-only or Take over. */
  | { status: "in-use"; machine: string };

export class Session {
  readonly type: "world" | "system";
  readonly id: Id;
  readonly ws: Workspace;
  readonly world: OpenWorld | null;
  readOnly: boolean;
  readOnlyReason: string | null;
  /** The world was left open by an app that stopped unexpectedly. */
  readonly recovered: boolean;
  private readonly lib: Library;
  private readonly events: SessionEvents;
  private readonly timers: Timers;
  private readonly saver: Autosaver;
  private heartbeat: unknown = null;
  private stopListening: () => void;
  private closed = false;
  /** The flag panel's memory, saved with the world (see flagpanel.ts). Plain JSON. */
  flagPanel: unknown;

  private constructor(lib: Library, type: "world" | "system", id: Id, ws: Workspace, world: OpenWorld | null, events: SessionEvents, timers: Timers) {
    this.lib = lib;
    this.type = type;
    this.id = id;
    this.ws = ws;
    this.world = world;
    this.readOnly = world?.readOnly ?? false;
    this.readOnlyReason = world?.readOnlyReason ?? null;
    this.recovered = world?.recovered ?? false;
    this.events = events;
    this.timers = timers;
    this.flagPanel = lib.readMeta(type, id).flagPanel ?? null;
    this.saver = new Autosaver(() => this.save(), { onSaved: () => events.saved?.(), onError: (e) => this.saveError(e) }, timers);
    this.stopListening = ws.onChange(() => {
      if (!this.readOnly) this.saver.changed();
    });
    if (world?.lock) this.armHeartbeat();
  }

  static openWorld(lib: Library, id: Id, opts: { readOnly?: boolean; takeOver?: boolean } = {}, events: SessionEvents = {}, timers: Timers = realTimers): OpenResult {
    const open = lib.openWorld(id, opts);
    if (open.inUseBy && !opts.readOnly) return { status: "in-use", machine: open.inUseBy.machine };
    return { status: "open", session: new Session(lib, "world", id, open.ws, open, events, timers) };
  }

  static openSystem(lib: Library, id: Id, events: SessionEvents = {}, timers: Timers = realTimers): Session {
    const { ws } = lib.openSystem(id);
    return new Session(lib, "system", id, ws, null, events, timers);
  }

  get name(): string {
    return this.ws.layer(this.id).name;
  }

  /** The system's name as seen from this world (or null for a system). */
  get systemName(): string | null {
    const base = this.ws.layer(this.id).base;
    return this.type === "world" && base ? this.ws.layer(base).name : null;
  }

  get pendingSave(): boolean {
    return this.saver.pending;
  }

  /** Saves anything waiting, then lets go of the world so other computers can open it. */
  close() {
    if (this.closed) return;
    if (!this.readOnly) this.saver.flush();
    this.closed = true;
    this.stopListening();
    if (this.heartbeat !== null) this.timers.clear(this.heartbeat);
    this.heartbeat = null;
    if (this.world) this.lib.close(this.world);
  }

  /** Restores a backup from World settings. A snapshot is taken first, so it can be undone. */
  restoreBackup(file: string) {
    if (!this.world || this.readOnly) throw new LibraryError(this.readOnlyReason ?? "Backups belong to worlds.");
    this.lib.restoreBackup(this.world, file);
    this.events.saved?.();
  }

  /** Saves anything waiting right now (before other worlds read the system file). */
  saveNow() {
    if (!this.readOnly) {
      this.saver.changed();
      this.saver.flush();
    }
  }

  /** For changes the engine doesn't announce (emptying the recycle bin): save soon. */
  markChanged() {
    if (!this.readOnly) this.saver.changed();
  }

  /** Changes the flag panel's memory and saves it with the next constant save. */
  setFlagPanel(state: unknown) {
    this.flagPanel = state;
    if (!this.readOnly) this.saver.changed();
  }

  private save() {
    const extra = { flagPanel: this.flagPanel ?? undefined };
    if (this.world) this.lib.saveWorld(this.world, {}, extra);
    else this.lib.saveSystem(this.ws, this.id, {}, extra);
  }

  private saveError(e: unknown) {
    if (this.world?.readOnly && !this.readOnly) return this.becomeReadOnly(this.world.readOnlyReason ?? "This world is now read-only.");
    this.events.saveFailed?.(e instanceof Error ? e.message : String(e));
  }

  private armHeartbeat() {
    this.heartbeat = this.timers.set(() => this.beat(), HEARTBEAT_MS);
  }

  private beat() {
    this.heartbeat = null;
    const lock = this.world?.lock;
    if (this.closed || !lock) return;
    if (lock.heartbeat() === "lost") {
      this.world!.lock = null;
      this.world!.readOnly = true;
      this.world!.readOnlyReason = "Another computer took over this world.";
      return this.becomeReadOnly(this.world!.readOnlyReason);
    }
    this.armHeartbeat();
  }

  private becomeReadOnly(reason: string) {
    this.readOnly = true;
    this.readOnlyReason = reason;
    if (this.heartbeat !== null) this.timers.clear(this.heartbeat);
    this.heartbeat = null;
    this.events.readOnly?.(reason);
  }
}
