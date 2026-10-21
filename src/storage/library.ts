// The main folder ("library"), like a Steam library:
//
//   <root>/Systems/<id>.dmsys        one file per system (its rules, history and pictures)
//   <root>/Worlds/<id>.dmworld       one file per world (its things, a copy of its system, pictures)
//   <root>/Modules/<id>.dmmod        one file per module (version 2: an adventure, with a copy of its
//                                    world and system underneath)
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
export const MODULE_EXT = ".dmmod";
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

export interface ModuleInfo {
  id: Id;
  name: string;
  /** What it is built on: a world, or straight on a system (a setting-free module). */
  baseId: Id;
  baseType: "world" | "system";
  baseName: string;
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
  kind: "world" | "system" | "module";
  name: string;
  time: number;
  /** Everything that went into the bin together, restored together. */
  worlds: { id: Id; name: string }[];
  systems: { id: Id; name: string }[];
  /** Modules (version 2); older entries have none. */
  modules?: { id: Id; name: string }[];
}

type LibraryDir = "Systems" | "Worlds" | "Modules" | "Imported" | "Backups" | "Snapshots" | ".pictures" | "Recycle bin";
const LIBRARY_DIRS: LibraryDir[] = ["Systems", "Worlds", "Modules", "Imported", "Backups", "Snapshots", ".pictures", "Recycle bin"];

/** An open world, or an open module (version 2), which works the same way. */
export interface OpenWorld {
  ws: Workspace;
  /** The world's id, or the module's. */
  worldId: Id;
  /** Which kind of file is open. Older code that never sets it means a world. */
  kind?: "world" | "module";
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

export interface ImportResult {
  type: "world" | "system";
  id: Id;
  name: string;
  /** Systems that were already on the shelf, identical, so they are shared. */
  sharedSystems: string[];
  /** Systems added to the shelf (as copies if a different version was already there). */
  newSystems: string[];
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
  /** The AI's memory: { notes: World Notes lines, chat: the conversation }. */
  ai?: unknown;
}

/** What a shared file carries of the AI's memory: always the World Notes, the chat only if ticked. */
function sharedAi(ai: unknown, chat: boolean): unknown {
  if (!ai || typeof ai !== "object") return undefined;
  const a = ai as { notes?: unknown; chat?: unknown };
  return { notes: a.notes ?? [], chat: chat ? (a.chat ?? []) : [] };
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

  modulePath(id: Id) {
    return join(this.dir("Modules"), `${safeName(id)}${MODULE_EXT}`);
  }

  /** The file and the JSON inside it for an open world or module. */
  private placeFile(open: OpenWorld): string {
    return open.kind === "module" ? "module.json" : "world.json";
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
  readMeta(type: "world" | "system" | "module", id: Id): LayerMeta {
    const path = type === "world" ? this.worldPath(id) : type === "module" ? this.modulePath(id) : this.systemPath(id);
    if (!existsSync(path)) return {};
    return readArchive(path, `${type}.json`, this, false).data.meta?.[id] ?? {};
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

  // ---------- Modules (version 2) ----------

  /** A new module on a world, or straight on a system (a setting-free module). */
  createModule(name: string, baseId: Id, author: string | null = null): Id {
    const ws = new Workspace();
    ws.now = this.now;
    let below: Layer[];
    try {
      below = this.layersBelow(baseId);
    } catch {
      throw new LibraryError("A module needs a world or a system to be built on.");
    }
    for (const l of below) ws.layers.set(l.id, l);
    const id = ws.addLayer("module", name, baseId, author);
    writeArchive(this.modulePath(id), "module.json", { ...ws.toFile(id), meta: { [id]: { changed: this.now() } } }, this);
    return id;
  }

  listModules(): ModuleInfo[] {
    return listFiles(this.dir("Modules"), MODULE_EXT).flatMap((path) => {
      try {
        const f = readArchive(path, "module.json", this, false).data;
        const m = f.layers.find((x) => x.id === f.main)!;
        const base = f.layers.find((x) => x.id === m.base);
        const sys = base?.type === "world" ? f.layers.find((x) => x.id === base.base) : base;
        // The shelf's own world or system name wins (it may have been renamed since).
        const live = base?.type === "world" ? this.listWorlds().find((w) => w.id === base.id)?.name : this.listSystems().find((x) => x.id === m.base)?.name;
        return [{ id: m.id, name: m.name, baseId: m.base!, baseType: base?.type === "world" ? ("world" as const) : ("system" as const), baseName: live ?? base?.name ?? "", systemName: sys?.name ?? "", picture: f.meta?.[m.id]?.picture ?? null, changed: f.meta?.[m.id]?.changed ?? 0, path }];
      } catch {
        return [];
      }
    });
  }

  /** Opens a module, with its world and system from the shelves (or the copies inside it). */
  openModule(id: Id, opts: { readOnly?: boolean; takeOver?: boolean } = {}): OpenWorld {
    const path = this.modulePath(id);
    if (!existsSync(path)) throw new LibraryError("That module isn't in the Modules folder.");
    return this.openPlace("module", id, path, opts);
  }

  /** Moves a module to the recycle bin. */
  deleteModule(id: Id): Id {
    const m = this.listModules().find((x) => x.id === id);
    if (!m) throw new LibraryError("That module isn't in the Modules folder.");
    return this.recycle("module", m.name, [], [], [m]);
  }

  /**
   * Opens a world. Its system comes from the Systems folder, so changes made to the system
   * elsewhere flow in. If the system file is missing (a world someone sent you), the copy
   * inside the world file is put back into the Systems folder.
   */
  openWorld(id: Id, opts: { readOnly?: boolean; takeOver?: boolean } = {}): OpenWorld {
    const path = this.worldPath(id);
    if (!existsSync(path)) throw new LibraryError("That world isn't in the Worlds folder.");
    return this.openPlace("world", id, path, opts);
  }

  private openPlace(kind: "world" | "module", id: Id, path: string, opts: { readOnly?: boolean; takeOver?: boolean }): OpenWorld {
    const interrupted = clearInterruptedSave(path);
    const { data, upgradedFrom, newer } = readArchive(path, `${kind}.json`, this);
    const main = data.layers.find((l) => l.id === data.main);
    if (!main) throw new LibraryError(`That ${kind} file is damaged.`);
    const layers = new Map(data.layers.map((l) => [l.id, l]));
    if (main.base) {
      // Systems (and a module's world) missing from the shelf are put back from the copy inside.
      for (const embedded of data.layers.filter((l) => l.type === "system")) {
        if (!existsSync(this.systemPath(embedded.id))) {
          writeArchive(this.systemPath(embedded.id), "system.json", { format: FORMAT_VERSION, app: data.app, main: embedded.id, layers: [embedded], bin: [], history: [], redo: [] }, this);
        }
      }
      for (const embedded of data.layers.filter((l) => l.type === "world")) {
        if (!existsSync(this.worldPath(embedded.id))) {
          writeArchive(this.worldPath(embedded.id), "world.json", { format: FORMAT_VERSION, app: data.app, main: embedded.id, layers: data.layers.filter((l) => l.type === "system" || l.id === embedded.id), bin: [], history: [], redo: [] }, this);
        }
      }
      for (const l of this.layersBelow(main.base)) layers.set(l.id, l);
    }
    const ws = Workspace.fromFile({ ...data, layers: [...layers.values()] });
    ws.now = this.now;
    const open: OpenWorld = { ws, worldId: id, kind, path, readOnly: false, readOnlyReason: null, recovered: interrupted, inUseBy: null, lock: null, upgradedFrom };
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

  /**
   * Everything under a module or world, bottom first, from the shelves: a system chain, or a
   * world's system chain plus the world itself.
   */
  layersBelow(baseId: Id): Layer[] {
    if (existsSync(this.worldPath(baseId))) {
      const { data } = readArchive(this.worldPath(baseId), "world.json", this, false);
      const world = data.layers.find((l) => l.id === data.main);
      if (!world) throw new LibraryError("That world file is damaged.");
      let below: Layer[];
      try {
        below = world.base ? this.loadSystemChain(world.base) : [];
      } catch {
        below = orderChain(data.layers.filter((l) => l.type === "system"));
      }
      return [...below, world];
    }
    return this.loadSystemChain(baseId);
  }

  /** Saves an open world: its own file, plus any of its systems that changed. */
  saveWorld(open: OpenWorld, hooks: WriteHooks = {}, extra: Partial<LayerMeta> = {}) {
    if (open.readOnly) throw new LibraryError(open.readOnlyReason ?? `This ${open.kind ?? "world"} is read-only.`);
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
    // A module's world, changed from inside the module (Edit parent), is written back to its file.
    for (const l of chain) {
      if (l.type !== "world" || l.id === open.worldId) continue;
      const wp = this.worldPath(l.id);
      if (!existsSync(wp)) continue;
      const wf = readArchive(wp, "world.json", this, false).data;
      const onDisk = wf.layers.find((x) => x.id === l.id);
      if (onDisk && JSON.stringify(onDisk) === JSON.stringify(l)) continue;
      const held = new WorldLock(wp, this.me, this.now).read();
      if (held && held.session !== this.me.session && this.now() - held.heartbeat < LOCK_STALE_MS) {
        throw new LibraryError(`${l.name} is open on ${held.machine}, so its changes can't be saved from here. Close it there first.`);
      }
      writeArchive(wp, "world.json", { ...wf, layers: wf.layers.map((x) => (x.id === l.id ? structuredClone(l) : x)) }, this);
    }
    const json = this.placeFile(open);
    const file: FileWithMeta = { ...ws.toFile(open.worldId), layers: chain.map((l) => structuredClone(l)) };
    const old = existsSync(open.path) ? readArchive(open.path, json, this, false).data.meta : undefined;
    file.meta = { ...old, [open.worldId]: { ...old?.[open.worldId], ...extra, changed: this.now() } };
    writeArchive(open.path, json, file, this, hooks);
  }

  setWorldPicture(open: OpenWorld, picture: Id | null) {
    this.setPicture("world", open.worldId, picture);
  }

  /** Sets the picture on a world, system or module card. */
  setPicture(type: "world" | "system" | "module", id: Id, picture: Id | null) {
    const path = type === "world" ? this.worldPath(id) : type === "module" ? this.modulePath(id) : this.systemPath(id);
    const json = `${type}.json`;
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

  /**
   * What else goes into the bin with a system: the systems built on it, every world using any of
   * them, and every module built on those worlds or systems.
   */
  systemDependents(id: Id): { systems: SystemInfo[]; worlds: WorldInfo[]; modules: ModuleInfo[] } {
    const all = this.listSystems();
    const family = new Set<Id>([id]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const s of all) if (s.base && family.has(s.base) && !family.has(s.id)) (family.add(s.id), (grew = true));
    }
    const worlds = this.listWorlds().filter((w) => family.has(w.systemId));
    const under = new Set<Id>([...family, ...worlds.map((w) => w.id)]);
    return { systems: all.filter((s) => s.id !== id && family.has(s.id)), worlds, modules: this.listModules().filter((m) => under.has(m.baseId)) };
  }

  /** Moves a world to the recycle bin, with the modules built on it. Its backups and snapshots stay until the bin is emptied. */
  deleteWorld(id: Id): Id {
    const w = this.listWorlds().find((x) => x.id === id);
    if (!w) throw new LibraryError("That world isn't in the Worlds folder.");
    return this.recycle("world", w.name, [w], [], this.listModules().filter((m) => m.baseId === id));
  }

  /** Moves a system to the recycle bin, together with the systems built on it and the worlds and modules that use them. */
  deleteSystem(id: Id): Id {
    const s = this.listSystems().find((x) => x.id === id);
    if (!s) throw new LibraryError("That system isn't in the Systems folder.");
    const dep = this.systemDependents(id);
    return this.recycle("system", s.name, dep.worlds, [s, ...dep.systems], dep.modules);
  }

  private recycle(kind: "world" | "system" | "module", name: string, worlds: WorldInfo[], systems: SystemInfo[], modules: ModuleInfo[] = []): Id {
    const id = newId();
    const dir = join(this.dir("Recycle bin"), id);
    mkdirSync(dir, { recursive: true });
    const info: RecycledInfo = { id, kind, name, time: this.now(), worlds: worlds.map((w) => ({ id: w.id, name: w.name })), systems: systems.map((s) => ({ id: s.id, name: s.name })), modules: modules.map((m) => ({ id: m.id, name: m.name })) };
    // The list is written first, so a crash part-way through still shows what went in.
    atomicWrite(join(dir, "entry.json"), JSON.stringify(info));
    for (const f of [...worlds, ...systems, ...modules]) {
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
    for (const m of entry.modules ?? []) back(join(dir, basename(this.modulePath(m.id))), this.modulePath(m.id));
    rmSync(dir, { recursive: true, force: true });
    const restored = [entry];
    // A module whose world or system is also in the bin brings it back too.
    for (const m of entry.modules ?? []) {
      const base = this.listModules().find((x) => x.id === m.id)?.baseId;
      if (!base || existsSync(this.worldPath(base)) || existsSync(this.systemPath(base))) continue;
      const other = this.listRecycleBin().find((e) => e.worlds.some((w) => w.id === base) || e.systems.some((x) => x.id === base));
      if (other) restored.push(...this.restoreFromBin(other.id));
    }
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
      for (const w of [...e.worlds, ...(e.modules ?? [])]) {
        rmSync(this.backupDir(w.id), { recursive: true, force: true });
        rmSync(this.snapshotDir(w.id), { recursive: true, force: true });
      }
      rmSync(join(this.dir("Recycle bin"), safeName(e.id)), { recursive: true, force: true });
    }
  }

  // ---------- Sharing and importing ----------

  /**
   * Writes a copy of a world to send to someone: always the world, its whole system chain and its
   * pictures; undo history and snapshots only if ticked. Settings are never in a world file.
   */
  exportWorld(worldId: Id, dest: string, opts: { history?: boolean; snapshots?: boolean; chat?: boolean } = {}) {
    const path = this.worldPath(worldId);
    if (!existsSync(path)) throw new LibraryError("That world isn't in the Worlds folder.");
    const { data } = readArchive(path, "world.json", this, false);
    const world = data.layers.find((l) => l.id === data.main);
    if (!world) throw new LibraryError("That world file is damaged.");
    let chain = data.layers.filter((l) => l.type === "system");
    try {
      if (world.base) chain = this.loadSystemChain(world.base); // the shelf's systems are the newest
    } catch {
      // A system missing from the shelf: the copy inside the world file goes along instead.
    }
    const file: FileWithMeta = {
      format: FORMAT_VERSION,
      app: data.app,
      main: worldId,
      layers: [...chain, world].map((l) => structuredClone(l)),
      bin: opts.history ? data.bin : [],
      history: opts.history ? data.history : [],
      redo: opts.history ? data.redo : [],
      meta: { [worldId]: { picture: data.meta?.[worldId]?.picture ?? null, changed: data.meta?.[worldId]?.changed, ai: sharedAi(data.meta?.[worldId]?.ai, !!opts.chat) } },
    };
    const extra: { name: string; data: Buffer }[] = [];
    if (opts.snapshots) {
      const dir = this.snapshotDir(worldId);
      if (existsSync(dir)) for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) extra.push({ name: `snapshots/${f}`, data: readFileSync(join(dir, f)) });
    }
    writeArchive(dest, "world.json", file, this, {}, extra);
  }

  /** Writes a copy of a system to send to someone (with its parent systems if it is a variant). */
  exportSystem(systemId: Id, dest: string, opts: { history?: boolean; chat?: boolean } = {}) {
    const chain = this.loadSystemChain(systemId);
    const own = this.readSystemFile(systemId);
    const file: FileWithMeta = {
      format: FORMAT_VERSION,
      app: own.app,
      main: systemId,
      layers: chain.map((l) => structuredClone(l)),
      bin: opts.history ? own.bin : [],
      history: opts.history ? own.history : [],
      redo: opts.history ? own.redo : [],
      meta: { [systemId]: { picture: own.meta?.[systemId]?.picture ?? null, ai: sharedAi(own.meta?.[systemId]?.ai, !!opts.chat) } },
    };
    writeArchive(dest, "system.json", file, this);
  }

  /**
   * Brings in a world or system file someone sent. Importing never overwrites: a system identical
   * to one on the shelf is shared, a different one arrives as its own copy ("d20 Basic (from Dave)"),
   * and a world already on the shelf arrives as a copy. Imported things are marked as from others.
   */
  importFile(src: string, me: string | null = null): ImportResult {
    let files: Map<string, Buffer>;
    try {
      files = readZip(readFileSync(src));
    } catch {
      throw new LibraryError("That file is damaged, or isn't a DM in a Pocket file.");
    }
    const json = files.get("world.json") ?? files.get("system.json");
    if (!json) throw new LibraryError("That isn't a DM in a Pocket world or system file.");
    const isWorld = files.has("world.json");
    let data: FileWithMeta;
    try {
      data = JSON.parse(json.toString("utf8")) as FileWithMeta;
    } catch {
      throw new LibraryError("That file is damaged, or isn't a DM in a Pocket file.");
    }
    if (data.format > FORMAT_VERSION) throw new LibraryError("That file was made with a newer version of DM in a Pocket. Update the app to import it.");
    if (data.format < FORMAT_VERSION) data = { ...upgrade(data), meta: data.meta };
    const main = data.layers.find((l) => l.id === data.main);
    if (!main) throw new LibraryError("That file is damaged.");
    for (const [name, bytes] of files) if (name.startsWith("pictures/")) this.addPictureNamed(name.slice(9), bytes);

    // Systems, bottom first: shared if identical to the shelf's, else installed (as a copy if the id is taken).
    const ids = new Map<Id, Id>();
    const result: ImportResult = { type: isWorld ? "world" : "system", id: "", name: "", sharedSystems: [], newSystems: [] };
    const systems = orderChain(data.layers.filter((l) => l.type === "system"));
    for (const s of systems) {
      const layer: Layer = { ...structuredClone(s), base: s.base ? (ids.get(s.base) ?? s.base) : null };
      if (layer.base && !existsSync(this.systemPath(layer.base))) throw new LibraryError(`That file needs the system it is built on, which isn't on this computer.`);
      const onShelf = existsSync(this.systemPath(s.id)) ? this.readSystemFile(s.id).layers.find((l) => l.id === s.id) : null;
      if (onShelf && JSON.stringify(onShelf) === JSON.stringify(layer)) {
        ids.set(s.id, s.id);
        result.sharedSystems.push(s.name);
        continue;
      }
      if (onShelf) {
        layer.id = newId();
        layer.name = `${s.name} (from ${s.author ?? "someone else"})`;
      }
      markFromOthers(layer, me);
      ids.set(s.id, layer.id);
      const own = s.id === data.main && !isWorld;
      const file: FileWithMeta = { format: FORMAT_VERSION, app: data.app, main: layer.id, layers: [layer], bin: own && !onShelf ? data.bin : [], history: own && !onShelf ? data.history : [], redo: own && !onShelf ? data.redo : [], meta: { [layer.id]: { picture: data.meta?.[s.id]?.picture ?? null, changed: this.now(), ai: own && !onShelf ? data.meta?.[s.id]?.ai : undefined } } };
      writeArchive(this.systemPath(layer.id), "system.json", file, this);
      result.newSystems.push(layer.name);
      if (own) Object.assign(result, { id: layer.id, name: layer.name });
    }
    if (!isWorld) {
      if (!result.id) Object.assign(result, { id: main.id, name: main.name });
      return result;
    }

    // The world: a copy if it is already on the shelf. Undo history only travels if nothing moved.
    const world: Layer = { ...structuredClone(main), base: main.base ? (ids.get(main.base) ?? main.base) : null };
    const copied = existsSync(this.worldPath(world.id));
    if (copied) {
      world.id = newId();
      world.name = `${main.name} (copy)`;
    }
    markFromOthers(world, me);
    const keepHistory = !copied && [...ids].every(([a, b]) => a === b);
    const chain = this.loadSystemChain(world.base!);
    const file: FileWithMeta = {
      format: FORMAT_VERSION,
      app: data.app,
      main: world.id,
      layers: [...chain, world],
      bin: keepHistory ? data.bin : [],
      history: keepHistory ? data.history : [],
      redo: keepHistory ? data.redo : [],
      meta: { [world.id]: { picture: data.meta?.[main.id]?.picture ?? null, changed: this.now(), ai: data.meta?.[main.id]?.ai } },
    };
    writeArchive(this.worldPath(world.id), "world.json", file, this);
    if (keepHistory) {
      for (const [name, bytes] of files) {
        if (!name.startsWith("snapshots/") || !/^[A-Za-z0-9._-]+\.json$/.test(name.slice(10))) continue;
        const target = join(this.snapshotDir(world.id), name.slice(10));
        if (!existsSync(target)) atomicWrite(target, bytes);
      }
    }
    Object.assign(result, { id: world.id, name: world.name });
    return result;
  }

  /** Puts a picture from an imported file into the store under its own (content) name. */
  private addPictureNamed(name: string, bytes: Buffer) {
    const target = join(this.dir(".pictures"), safeName(name));
    if (!existsSync(target)) atomicWrite(target, bytes);
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
    const { data } = readArchive(open.path, this.placeFile(open), this, false);
    atomicWrite(path, JSON.stringify(data));
    this.pruneBackups(open.worldId);
    return true;
  }

  listBackups(worldId: Id): BackupInfo[] {
    const dir = this.backupDir(worldId);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map((f) => ({ file: join(dir, f), // Noon of that (UTC) day, so the day reads the same in every time zone ("Today", not "Yesterday").
      time: Date.parse(f.slice(0, 10) + "T12:00:00Z") }))
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

/** Systems in a file, parents before the variants built on them. */
function orderChain(systems: Layer[]): Layer[] {
  const out: Layer[] = [];
  const left = [...systems];
  while (left.length) {
    const i = left.findIndex((s) => !s.base || !left.some((x) => x.id === s.base));
    out.push(...left.splice(i < 0 ? 0 : i, 1));
  }
  return out;
}

/**
 * Homemade things in someone else's file arrive marked as from others, keeping their maker's name.
 * Things with your own name on them (a file from your laptop) stay yours.
 */
function markFromOthers(layer: Layer, me: string | null) {
  for (const n of Object.values(layer.nodes)) if (n.source === "mine" && (!me || n.author !== me)) n.source = "others";
}

function writeArchive(path: string, jsonName: string, data: FileWithMeta, lib: Library, hooks: WriteHooks = {}, extra: { name: string; data: Buffer }[] = []) {
  const entries: { name: string; data: Buffer }[] = [{ name: jsonName, data: Buffer.from(JSON.stringify(data), "utf8") }, ...extra];
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
