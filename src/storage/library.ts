// The main folder ("library"), like a Steam library:
//
//   <root>/Systems/<id>.dmsys        one file per system (its rules, history and pictures)
//   <root>/Worlds/<id>.dmworld       one file per world (its things, a copy of its system, pictures)
//   <root>/Imported/                 worlds and systems from other people
//   <root>/Backups/<worldId>/        automatic daily and weekly backups
//   <root>/Snapshots/<worldId>/      named snapshots the user made
//   <root>/.pictures/                every picture, stored once, shared by backups and snapshots
//   <root>/Recycle bin/<entryId>/    deleted worlds and systems, kept until the bin is emptied
//
// World and system files are ordinary ZIP files holding a JSON file and a pictures folder.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { FORMAT_VERSION, Workspace, newId, upgrade } from "../engine/index.ts";
import type { Id, Layer, SavedFile } from "../engine/index.ts";
import { atomicWrite, clearInterruptedSave } from "./atomic.ts";
import type { WriteHooks } from "./atomic.ts";
import { LOCK_STALE_MS, LOCK_SUFFIX, WorldLock } from "./lock.ts";
import type { AcquireResult } from "./lock.ts";
import { readZip, writeZip } from "./zip.ts";

export const WORLD_EXT = ".dmworld";
export const SYSTEM_EXT = ".dmsys";
const DAY = 24 * 60 * 60 * 1000;

export class LibraryError extends Error {}

export interface WorldInfo {
  id: Id;
  name: string;
  systemId: Id;
  systemName: string;
  picture: Id | null;
  changed: number;
  path: string;
}

export interface SystemInfo {
  id: Id;
  name: string;
  base: Id | null;
  picture: Id | null;
  usedBy: number;
  changed: number;
  path: string;
}

/** One deletion from the home screen. Deleting a system takes the worlds that use it along. */
export interface RecycledInfo {
  id: Id;
  /** What the user deleted. */
  kind: "world" | "system";
  name: string;
  time: number;
  /** Everything that went into the bin together, restored together. */
  worlds: { id: Id; name: string }[];
  systems: { id: Id; name: string }[];
}

type LibraryDir = "Systems" | "Worlds" | "Imported" | "Backups" | "Snapshots" | ".pictures" | "Recycle bin";
const LIBRARY_DIRS: LibraryDir[] = ["Systems", "Worlds", "Imported", "Backups", "Snapshots", ".pictures", "Recycle bin"];

export interface OpenWorld {
  ws: Workspace;
  worldId: Id;
  path: string;
  readOnly: boolean;
  /** Why it is read-only, in plain words. */
  readOnlyReason: string | null;
  /** True if the app was closed unexpectedly last time (crash or power cut). */
  recovered: boolean;
  /** Set when another computer has it open; the user chooses read-only or take over. */
  inUseBy: { machine: string } | null;
  lock: WorldLock | null;
  upgradedFrom: string | null;
}

export interface BackupInfo {
  file: string;
  time: number;
}

export interface SnapshotInfo {
  id: Id;
  name: string;
  time: number;
  bytes: number;
}

export interface LayerMeta {
  /** For worlds and systems: the picture shown on the home screen card. */
  picture?: Id | null;
  changed?: number;
  /** The flag panel's memory: ignored flags, which are seen, and the blue and green blocks. */
  flagPanel?: unknown;
}

interface FileWithMeta extends SavedFile {
  meta?: Record<Id, LayerMeta>;
}

export class Library {
  readonly root: string;
  readonly me: { machine: string; session: string };
  readonly now: () => number;
  constructor(root: string, me: { machine: string; session: string } = { machine: "this-computer", session: newId() }, now: () => number = () => Date.now()) {
    this.root = root;
    this.me = me;
    this.now = now;
  }

  dir(name: LibraryDir): string {
    return join(this.root, name);
  }

  init() {
    for (const d of LIBRARY_DIRS) mkdirSync(this.dir(d), { recursive: true });
  }

  // ---------- Pictures (stored once) ----------

  /** Stores a picture once, named by its content, and returns its id. */
  addPicture(bytes: Buffer, fileName: string): Id {
    const ext = (extname(fileName) || ".png").toLowerCase().replace(/[^.a-z0-9]/g, "");
    const id = createHash("sha256").update(bytes).digest("hex").slice(0, 32) + ext;
    const path = join(this.dir(".pictures"), id);
    if (!existsSync(path)) atomicWrite(path, bytes);
    return id;
  }

  readPicture(id: Id): Buffer | null {
    const path = join(this.dir(".pictures"), safeName(id));
    return existsSync(path) ? readFileSync(path) : null;
  }

  // ---------- Systems ----------

  systemPath(id: Id) {
    return join(this.dir("Systems"), `${safeName(id)}${SYSTEM_EXT}`);
  }

  worldPath(id: Id) {
    return join(this.dir("Worlds"), `${safeName(id)}${WORLD_EXT}`);
  }

  /** Creates a new, empty system file (optionally a variant of another system). */
  createSystem(name: string, base: Id | null = null, author: string | null = null): Id {
    const ws = new Workspace();
    ws.now = this.now;
    if (base) for (const l of this.loadSystemChain(base)) ws.layers.set(l.id, l);
    const id = ws.addLayer("system", name, base, author);
    this.writeSystem(ws, id);
    return id;
  }

  /** A system and every system under it, bottom first, read from the Systems folder. */
  loadSystemChain(id: Id): Layer[] {
    const out: Layer[] = [];
    let cur: Id | null = id;
    const seen = new Set<Id>();
    while (cur) {
      if (seen.has(cur)) throw new LibraryError("A system can't be built on itself.");
      seen.add(cur);
      const file = this.readSystemFile(cur);
      const layer = file.layers.find((l) => l.id === cur);
      if (!layer) throw new LibraryError("That system file is damaged.");
      out.unshift(layer);
      cur = layer.base;
    }
    return out;
  }

  private readSystemFile(id: Id): FileWithMeta {
    const path = this.systemPath(id);
    if (!existsSync(path)) throw new LibraryError("That system isn't in the Systems folder.");
    return readArchive(path, "system.json", this).data;
  }

  /** Opens a system on its own, for editing from the home screen. */
  openSystem(id: Id): { ws: Workspace; systemId: Id } {
    const file = this.readSystemFile(id);
    const ws = Workspace.fromFile({ ...file, layers: this.loadSystemChain(id) });
    ws.now = this.now;
    return { ws, systemId: id };
  }

  /** Saves a system opened on its own (its own history and bin stay with it). */
  saveSystem(ws: Workspace, systemId: Id, hooks: WriteHooks = {}, extra: Partial<LayerMeta> = {}) {
    this.writeSystem(ws, systemId, hooks, true, extra);
  }

  /** Home-screen and flag-panel details stored with a world or system. */
  readMeta(type: "world" | "system", id: Id): LayerMeta {
    const path = type === "world" ? this.worldPath(id) : this.systemPath(id);
    if (!existsSync(path)) return {};
    return readArchive(path, type === "world" ? "world.json" : "system.json", this, false).data.meta?.[id] ?? {};
  }

  private writeSystem(ws: Workspace, systemId: Id, hooks: WriteHooks = {}, withHistory = true, extra: Partial<LayerMeta> = {}) {
    const layer = ws.layer(systemId);
    const old = existsSync(this.systemPath(systemId)) ? this.readSystemFile(systemId) : null;
    let file: FileWithMeta;
    if (withHistory) {
      file = { ...ws.toFile(systemId), layers: [layer] };
    } else {
      file = { format: FORMAT_VERSION, app: ws.toFile().app, main: systemId, layers: [structuredClone(layer)], bin: old?.bin ?? [], history: old?.history ?? [], redo: old?.redo ?? [] };
    }
    file.meta = { ...old?.meta, [systemId]: { ...old?.meta?.[systemId], ...extra, changed: this.now() } };
    writeArchive(this.systemPath(systemId), "system.json", file, this, hooks);
  }

  listSystems(): SystemInfo[] {
    const worlds = this.listWorlds();
    return listFiles(this.dir("Systems"), SYSTEM_EXT).flatMap((path) => {
      try {
        const f = readArchive(path, "system.json", this, false).data;
        const l = f.layers.find((x) => x.id === f.main) ?? f.layers[0]!;
        const changed = f.meta?.[l.id]?.changed ?? statSync(path).mtimeMs;
        return [{ id: l.id, name: l.name, base: l.base, picture: f.meta?.[l.id]?.picture ?? null, usedBy: worlds.filter((w) => w.systemId === l.id).length, changed, path }];
      } catch {
        return [];
      }
    });
  }

  // ---------- Worlds ----------

  createWorld(name: string, systemId: Id, author: string | null = null): Id {
    const ws = new Workspace();
    ws.now = this.now;
    for (const l of this.loadSystemChain(systemId)) ws.layers.set(l.id, l);
    const id = ws.addLayer("world", name, systemId, author);
    writeArchive(this.worldPath(id), "world.json", { ...ws.toFile(id), meta: { [id]: { changed: this.now() } } }, this);
    return id;
  }

  listWorlds(): WorldInfo[] {
    return listFiles(this.dir("Worlds"), WORLD_EXT).flatMap((path) => {
      try {
        const f = readArchive(path, "world.json", this, false).data;
        const w = f.layers.find((x) => x.id === f.main)!;
        const sys = f.layers.find((x) => x.id === w.base);
        return [{ id: w.id, name: w.name, systemId: w.base!, systemName: sys?.name ?? "", picture: f.meta?.[w.id]?.picture ?? null, changed: f.meta?.[w.id]?.changed ?? 0, path }];
      } catch {
        return [];
      }
    });
  }

  /**
   * Opens a world. Its system comes from the Systems folder, so changes made to the system
   * elsewhere flow in. If the system file is missing (a world someone sent you), the copy
   * inside the world file is put back into the Systems folder.
   */
  openWorld(id: Id, opts: { readOnly?: boolean; takeOver?: boolean } = {}): OpenWorld {
    const path = this.worldPath(id);
    if (!existsSync(path)) throw new LibraryError("That world isn't in the Worlds folder.");
    const interrupted = clearInterruptedSave(path);
    const { data, upgradedFrom, newer } = readArchive(path, "world.json", this);
    const world = data.layers.find((l) => l.id === data.main);
    if (!world) throw new LibraryError("That world file is damaged.");
    const layers = new Map(data.layers.map((l) => [l.id, l]));
    if (world.base) {
      for (const embedded of data.layers.filter((l) => l.type === "system")) {
        if (!existsSync(this.systemPath(embedded.id))) {
          writeArchive(this.systemPath(embedded.id), "system.json", { format: FORMAT_VERSION, app: data.app, main: embedded.id, layers: [embedded], bin: [], history: [], redo: [] }, this);
        }
      }
      for (const l of this.loadSystemChain(world.base)) layers.set(l.id, l);
    }
    const ws = Workspace.fromFile({ ...data, layers: [...layers.values()] });
    ws.now = this.now;
    const open: OpenWorld = { ws, worldId: id, path, readOnly: false, readOnlyReason: null, recovered: interrupted, inUseBy: null, lock: null, upgradedFrom };
    if (newer) {
      open.readOnly = true;
      open.readOnlyReason = "Made with a newer version of DM in a Pocket. Update to edit it.";
      return open;
    }
    if (opts.readOnly) {
      open.readOnly = true;
      open.readOnlyReason = "Opened read-only.";
      return open;
    }
    const lock = new WorldLock(path, this.me, this.now);
    let res: AcquireResult;
    if (opts.takeOver) {
      lock.takeOver();
      res = { status: "ok" };
    } else res = lock.acquire();
    if (res.status === "in-use") {
      open.readOnly = true;
      open.readOnlyReason = `Open on ${res.by.machine}.`;
      open.inUseBy = { machine: res.by.machine };
      return open;
    }
    open.lock = lock;
    if (res.status === "recovered") open.recovered = true;
    this.backupIfDue(open);
    return open;
  }

  /** Saves an open world: its own file, plus any of its systems that changed. */
  saveWorld(open: OpenWorld, hooks: WriteHooks = {}, extra: Partial<LayerMeta> = {}) {
    if (open.readOnly) throw new LibraryError(open.readOnlyReason ?? "This world is read-only.");
    if (open.lock && open.lock.heartbeat() === "lost") {
      open.readOnly = true;
      open.readOnlyReason = "Another computer took over this world.";
      open.lock = null;
      throw new LibraryError(open.readOnlyReason);
    }
    const ws = open.ws;
    const chain = ws.chain(open.worldId);
    for (const l of chain) {
      if (l.type !== "system") continue;
      const onDisk = existsSync(this.systemPath(l.id)) ? this.readSystemFile(l.id).layers.find((x) => x.id === l.id) : null;
      if (!onDisk || JSON.stringify(onDisk) !== JSON.stringify(l)) this.writeSystem(ws, l.id, {}, false);
    }
    const file: FileWithMeta = { ...ws.toFile(open.worldId), layers: chain.map((l) => structuredClone(l)) };
    const old = existsSync(open.path) ? readArchive(open.path, "world.json", this, false).data.meta : undefined;
    file.meta = { ...old, [open.worldId]: { ...old?.[open.worldId], ...extra, changed: this.now() } };
    writeArchive(open.path, "world.json", file, this, hooks);
  }

  setWorldPicture(open: OpenWorld, picture: Id | null) {
    this.setPicture("world", open.worldId, picture);
  }

  /** Sets the picture on a world or system card. */
  setPicture(type: "world" | "system", id: Id, picture: Id | null) {
    const path = type === "world" ? this.worldPath(id) : this.systemPath(id);
    const json = type === "world" ? "world.json" : "system.json";
    if (!existsSync(path)) throw new LibraryError(`That ${type} isn't in the main folder.`);
    const f = readArchive(path, json, this, false).data;
    f.meta = { ...f.meta, [id]: { ...f.meta?.[id], picture } };
    writeArchive(path, json, f, this);
  }

  /**
   * Reads a world without opening it: no lock, no backup, nothing written. For the home screen's
   * flag counts. Uses the Systems folder's copy of each system when there is one.
   */
  peekWorld(id: Id): Workspace {
    const { data } = readArchive(this.worldPath(id), "world.json", this, false);
    const world = data.layers.find((l) => l.id === data.main);
    if (!world) throw new LibraryError("That world file is damaged.");
    const layers = new Map(data.layers.map((l) => [l.id, l]));
    if (world.base) {
      try {
        for (const l of this.loadSystemChain(world.base)) layers.set(l.id, l);
      } catch {
        // The system isn't on the shelf: the copy inside the world file is used.
      }
    }
    return Workspace.fromFile({ ...data, layers: [...layers.values()] });
  }

  close(open: OpenWorld) {
    open.lock?.release();
    open.lock = null;
  }

  // ---------- Recycle bin (whole worlds and systems) ----------

  /** What else goes into the bin with a system: the systems built on it and every world using any of them. */
  systemDependents(id: Id): { systems: SystemInfo[]; worlds: WorldInfo[] } {
    const all = this.listSystems();
    const family = new Set<Id>([id]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const s of all) if (s.base && family.has(s.base) && !family.has(s.id)) (family.add(s.id), (grew = true));
    }
    return { systems: all.filter((s) => s.id !== id && family.has(s.id)), worlds: this.listWorlds().filter((w) => family.has(w.systemId)) };
  }

  /** Moves a world to the recycle bin. Its backups and snapshots stay until the bin is emptied. */
  deleteWorld(id: Id): Id {
    const w = this.listWorlds().find((x) => x.id === id);
    if (!w) throw new LibraryError("That world isn't in the Worlds folder.");
    return this.recycle("world", w.name, [w], []);
  }

  /** Moves a system to the recycle bin, together with the systems built on it and the worlds that use them. */
  deleteSystem(id: Id): Id {
    const s = this.listSystems().find((x) => x.id === id);
    if (!s) throw new LibraryError("That system isn't in the Systems folder.");
    const dep = this.systemDependents(id);
    return this.recycle("system", s.name, dep.worlds, [s, ...dep.systems]);
  }

  private recycle(kind: "world" | "system", name: string, worlds: WorldInfo[], systems: SystemInfo[]): Id {
    const id = newId();
    const dir = join(this.dir("Recycle bin"), id);
    mkdirSync(dir, { recursive: true });
    const info: RecycledInfo = { id, kind, name, time: this.now(), worlds: worlds.map((w) => ({ id: w.id, name: w.name })), systems: systems.map((s) => ({ id: s.id, name: s.name })) };
    // The list is written first, so a crash part-way through still shows what went in.
    atomicWrite(join(dir, "entry.json"), JSON.stringify(info));
    for (const f of [...worlds, ...systems]) {
      renameSync(f.path, join(dir, basename(f.path)));
      const lock = f.path + LOCK_SUFFIX;
      const held = new WorldLock(f.path, this.me, this.now).read();
      if (held && (held.session === this.me.session || held.machine === this.me.machine || this.now() - held.heartbeat >= LOCK_STALE_MS)) rmSync(lock, { force: true });
    }
    return id;
  }

  listRecycleBin(): RecycledInfo[] {
    const dir = this.dir("Recycle bin");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .flatMap((d) => {
        try {
          return [JSON.parse(readFileSync(join(dir, d, "entry.json"), "utf8")) as RecycledInfo];
        } catch {
          return [];
        }
      })
      .sort((a, b) => b.time - a.time);
  }

  /**
   * Puts a deletion back, with everything that went in with it. A world whose system is also in
   * the bin brings its system back too, so it opens connected. Never overwrites a file that is
   * already back on the shelf.
   */
  restoreFromBin(entryId: Id): RecycledInfo[] {
    const entry = this.listRecycleBin().find((e) => e.id === entryId);
    if (!entry) throw new LibraryError("That isn't in the recycle bin any more.");
    const dir = join(this.dir("Recycle bin"), safeName(entryId));
    const back = (from: string, to: string) => {
      if (existsSync(from) && !existsSync(to)) renameSync(from, to);
    };
    for (const s of entry.systems) back(join(dir, basename(this.systemPath(s.id))), this.systemPath(s.id));
    for (const w of entry.worlds) back(join(dir, basename(this.worldPath(w.id))), this.worldPath(w.id));
    rmSync(dir, { recursive: true, force: true });
    const restored = [entry];
    for (const w of entry.worlds) {
      const systemId = this.listWorlds().find((x) => x.id === w.id)?.systemId;
      if (!systemId || existsSync(this.systemPath(systemId))) continue;
      const other = this.listRecycleBin().find((e) => e.systems.some((s) => s.id === systemId));
      if (other) restored.push(...this.restoreFromBin(other.id));
    }
    return restored;
  }

  /** The only truly permanent action: removes the files, and the worlds' backups and snapshots. */
  emptyRecycleBin(entryIds?: Id[]) {
    for (const e of this.listRecycleBin()) {
      if (entryIds && !entryIds.includes(e.id)) continue;
      for (const w of e.worlds) {
        rmSync(this.backupDir(w.id), { recursive: true, force: true });
        rmSync(this.snapshotDir(w.id), { recursive: true, force: true });
      }
      rmSync(join(this.dir("Recycle bin"), safeName(e.id)), { recursive: true, force: true });
    }
  }

  // ---------- Backups ----------

  backupDir(worldId: Id) {
    return join(this.dir("Backups"), safeName(worldId));
  }

  /** Makes today's backup if there isn't one yet, then tidies old ones. */
  backupIfDue(open: OpenWorld): boolean {
    const dir = this.backupDir(open.worldId);
    const day = dateKey(this.now());
    const path = join(dir, `${day}.json`);
    if (existsSync(path) || !existsSync(open.path)) return false;
    const { data } = readArchive(open.path, "world.json", this, false);
    atomicWrite(path, JSON.stringify(data));
    this.pruneBackups(open.worldId);
    return true;
  }

  listBackups(worldId: Id): BackupInfo[] {
    const dir = this.backupDir(worldId);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map((f) => ({ file: join(dir, f), time: Date.parse(f.slice(0, 10) + "T00:00:00Z") }))
      .sort((a, b) => b.time - a.time);
  }

  /** Keeps one per day for the last 7 days and one per week for the last month. */
  pruneBackups(worldId: Id) {
    const now = this.now();
    const keep = new Set<string>();
    const weeks = new Set<string>();
    for (const b of this.listBackups(worldId)) {
      const age = now - b.time;
      if (age < 7 * DAY) keep.add(b.file);
      else if (age < 31 * DAY) {
        const wk = weekKey(b.time);
        if (!weeks.has(wk)) {
          weeks.add(wk);
          keep.add(b.file);
        }
      }
    }
    for (const b of this.listBackups(worldId)) if (!keep.has(b.file)) rmSync(b.file);
  }

  /** Restores a backup into an open world. Takes a snapshot first, so the restore can be undone. */
  restoreBackup(open: OpenWorld, backupFile: string) {
    this.snapshot(open, "Before restoring a backup");
    const data = JSON.parse(readFileSync(backupFile, "utf8")) as SavedFile;
    this.replaceContents(open, data);
  }

  // ---------- Snapshots ----------

  snapshotDir(worldId: Id) {
    return join(this.dir("Snapshots"), safeName(worldId));
  }

  /** A named save point. Holds the world and its system together; pictures are shared, not copied. */
  snapshot(open: OpenWorld, name: string): Id {
    const id = newId();
    const file = { id, name, time: this.now(), data: { ...open.ws.toFile(open.worldId), layers: open.ws.chain(open.worldId) } };
    atomicWrite(join(this.snapshotDir(open.worldId), `${id}.json`), JSON.stringify(file));
    return id;
  }

  listSnapshots(worldId: Id): SnapshotInfo[] {
    const dir = this.snapshotDir(worldId);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const path = join(dir, f);
        const s = JSON.parse(readFileSync(path, "utf8")) as { id: Id; name: string; time: number };
        return { id: s.id, name: s.name, time: s.time, bytes: statSync(path).size };
      })
      .sort((a, b) => b.time - a.time);
  }

  /** Restores a snapshot. Takes a snapshot of the current state first, so this can be undone. */
  restoreSnapshot(open: OpenWorld, snapshotId: Id) {
    const path = join(this.snapshotDir(open.worldId), `${safeName(snapshotId)}.json`);
    if (!existsSync(path)) throw new LibraryError("That snapshot is gone.");
    const s = JSON.parse(readFileSync(path, "utf8")) as { name: string; data: SavedFile };
    this.snapshot(open, `Before restoring "${s.name}"`);
    this.replaceContents(open, s.data);
  }

  deleteSnapshot(worldId: Id, snapshotId: Id) {
    rmSync(join(this.snapshotDir(worldId), `${safeName(snapshotId)}.json`), { force: true });
  }

  /** How much space a world's history (backups and snapshots) uses, for the Clean up button. */
  historyBytes(worldId: Id): number {
    let total = 0;
    for (const dir of [this.backupDir(worldId), this.snapshotDir(worldId)]) {
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir)) total += statSync(join(dir, f)).size;
    }
    return total;
  }

  private replaceContents(open: OpenWorld, data: SavedFile) {
    const restored = Workspace.fromFile(data);
    for (const l of restored.layers.values()) open.ws.layers.set(l.id, l);
    open.ws.bin = restored.bin;
    open.ws.history = restored.history;
    open.ws.redoStack = restored.redoStack;
    this.saveWorld(open);
  }
}

// ---------- Helpers ----------

function safeName(id: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(id) || id.includes("..")) throw new LibraryError("That isn't a valid id.");
  return id;
}

function listFiles(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(ext)).map((f) => join(dir, f));
}

function dateKey(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

function weekKey(t: number): string {
  const d = new Date(t);
  const day = (d.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return monday.toISOString().slice(0, 10);
}

/** Every picture id used anywhere in these layers. */
function picturesIn(layers: Layer[], meta: Record<Id, LayerMeta> | undefined): Set<Id> {
  const out = new Set<Id>();
  for (const l of layers) {
    for (const n of Object.values(l.nodes)) if (n.picture) out.add(n.picture);
    for (const c of Object.values(l.changes)) if (c.picture) out.add(c.picture);
  }
  for (const m of Object.values(meta ?? {})) if (m.picture) out.add(m.picture);
  return out;
}

function writeArchive(path: string, jsonName: string, data: FileWithMeta, lib: Library, hooks: WriteHooks = {}) {
  const entries: { name: string; data: Buffer }[] = [{ name: jsonName, data: Buffer.from(JSON.stringify(data), "utf8") }];
  for (const pic of picturesIn(data.layers, data.meta)) {
    const bytes = lib.readPicture(pic);
    if (bytes) entries.push({ name: `pictures/${pic}`, data: bytes });
  }
  atomicWrite(path, writeZip(entries), hooks);
}

function readArchive(path: string, jsonName: string, lib: Library, unpackPictures = true): { data: FileWithMeta; upgradedFrom: string | null; newer: boolean } {
  let files: Map<string, Buffer>;
  try {
    files = readZip(readFileSync(path));
  } catch {
    throw new LibraryError("That file is damaged. Try a backup from World settings.");
  }
  const json = files.get(jsonName);
  if (!json) throw new LibraryError("That isn't a DM in a Pocket file.");
  let data = JSON.parse(json.toString("utf8")) as FileWithMeta;
  if (unpackPictures) {
    for (const [name, bytes] of files) {
      if (name.startsWith("pictures/")) {
        const target = join(lib.dir(".pictures"), safeName(name.slice(9)));
        if (!existsSync(target)) atomicWrite(target, bytes);
      }
    }
  }
  if (data.format > FORMAT_VERSION) return { data, upgradedFrom: null, newer: true };
  let upgradedFrom: string | null = null;
  if (data.format < FORMAT_VERSION) {
    upgradedFrom = `${path}.v${data.format}.bak`;
    atomicWrite(upgradedFrom, readFileSync(path));
    data = { ...upgrade(data), meta: data.meta };
  }
  return { data, upgradedFrom, newer: false };
}
