// Everything the app's window can ask for. Plain TypeScript with no Electron in it, so it is tested
// like the engine. `main.ts` only connects these methods to the window.

import { readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { newId } from "../engine/index.ts";
import { panelView, readPanel } from "./flagpanel.ts";
import type { Activation, CheckCategory, CheckSettings, Id, NodeKind, Sensitivity, Slot, Uses, Value } from "../engine/index.ts";
import { Library, LibraryError, realTimers } from "../storage/index.ts";
import { SYSTEM_EXT, WORLD_EXT } from "../storage/index.ts";
import type { ImportResult, RecycledInfo, Timers } from "../storage/index.ts";
import { Editing } from "./editing.ts";
import { bookDocx } from "./docx.ts";
import type { BinView, BookData, BookRequest, Choices, FlagView, HistoryView, NodeView, RestoreResult, StepResult } from "./editing.ts";
import { BOOK_CHAPTERS, BOOK_TITLES, CHAPTER_TITLES } from "../engine/index.ts";
import type { RulesSection } from "./rules.ts";
import type { BeingKind, CategoryOption, ListEntry, SourceFilter, TemplateEntry } from "./sheets.ts";
import type { BrickType, LibrarySection } from "./library.ts";
import type { LoreSection } from "./lore.ts";
import type { TableModeView } from "./tablemode.ts";
import type { AttachmentDetail, AttachmentPatch, FamilyRow } from "./drill.ts";
import type { FlagPanelView, MissingDetail } from "./flagpanel.ts";
import { Session } from "./session.ts";
import { ensureCategories } from "./sheets.ts";
import { buildD20Starter } from "./starters/d20.ts";
import { QUICK_QUESTIONS } from "./quickstart.ts";
import type { QuickStartAnswers } from "./quickstart.ts";
import { changeInSystem, upwardView } from "./upward.ts";
import type { UpwardView } from "./upward.ts";
import { SettingsFile } from "./settings.ts";
import type { Place } from "./settings.ts";
import { whenLabel } from "./words.ts";

export type { Place } from "./settings.ts";
export type { ImportResult, RecycledInfo } from "../storage/index.ts";
export type { BinView, BookData, BookRequest, Choices, FlagView, HistoryStep, HistoryView, NodeView, Option, RestoreResult, StepResult } from "./editing.ts";
export type { RulesSection } from "./rules.ts";
export type { BeingKind, CategoryOption, ListEntry, SheetDef, SourceFilter, TemplateEntry } from "./sheets.ts";
export type { AttachmentView, BrickType, LibraryEntry, LibrarySection } from "./library.ts";
export type { AttachmentDetail, AttachmentPatch, FamilyRow } from "./drill.ts";
export type { FlagBlock, FlagPanelView, MissingDetail, BrokenSlot } from "./flagpanel.ts";
export type { UpwardRow, UpwardView, UpwardWorld } from "./upward.ts";
export type { LoreKind, LoreSection, TableRow } from "./lore.ts";

export interface SystemCard {
  id: Id;
  name: string;
  picture: Id | null;
  usedBy: number;
  /** The name of the system this one is a variant of. */
  variantOf: string | null;
  lastUsed: number;
}

export interface WorldCard {
  id: Id;
  name: string;
  systemId: Id;
  systemName: string;
  picture: Id | null;
  red: number;
  yellow: number;
  lastUsed: number;
}

export interface StartingPoint {
  id: "d20" | "scratch";
  label: string;
  /** False until its content is built; the drop-down shows it greyed out with `note`. */
  ready: boolean;
  note: string | null;
}

export const STARTING_POINTS: StartingPoint[] = [
  { id: "d20", label: "Generic d20", ready: true, note: null },
  { id: "scratch", label: "From scratch", ready: true, note: null },
];

export interface HomeData {
  folder: string;
  systems: SystemCard[];
  worlds: WorldCard[];
  binCount: number;
  startingPoints: StartingPoint[];
}

export interface PlaceView {
  type: "world" | "system";
  id: Id;
  name: string;
  systemName: string | null;
  readOnly: boolean;
  readOnlyReason: string | null;
  /** Show the blue notice "Recovered after an unexpected close." */
  recovered: boolean;
}

export type OpenResponse = { status: "open"; view: PlaceView } | { status: "in-use"; machine: string };

export interface BackupView {
  file: string;
  time: number;
  label: string;
}

export interface SettingsView {
  folder: string;
  defaultFolder: string;
  isDefault: boolean;
  author: string | null;
}

/** Events sent to the window. */
export type BackendEvent = { type: "saved" } | { type: "saveFailed"; message: string } | { type: "readOnly"; reason: string };

export interface BackendOptions {
  settingsPath: string;
  defaultFolder: string;
  machine: string;
  /** Show the picture chooser; resolves to a file path or null. */
  pickPicture: () => Promise<string | null>;
  /** Show the folder chooser; resolves to a folder path or null. */
  pickFolder: () => Promise<string | null>;
  /** Show a Save dialog for a file to share; resolves to a path or null. */
  pickSave?: (defaultName: string, kind: "world" | "system") => Promise<string | null>;
  /** Show an Open dialog for a world or system file to import; resolves to a path or null. */
  pickImport?: () => Promise<string | null>;
  /** Show a Save dialog for the rulebook as a Word file; resolves to a path or null. */
  pickWord?: (defaultName: string) => Promise<string | null>;
  emit: (event: BackendEvent) => void;
  now?: () => number;
  timers?: Timers;
}

export interface SnapshotView {
  id: Id;
  name: string;
  time: number;
  bytes: number;
  label: string;
  /** Taken by the app itself before a restore (Clean up removes these). */
  auto: boolean;
}

const AUTO_SNAPSHOT = /^Before restoring/;

export const PICTURE_TYPES = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
const MAX_PICTURE_BYTES = 25 * 1024 * 1024;
const MAX_NAME = 200;

/** The methods the window may call, by name. Nothing else is reachable from the window. */
export const BACKEND_METHODS = [
  "home",
  "pickPicture",
  "createSystem",
  "createWorld",
  "systemDependents",
  "deleteWorld",
  "deleteSystem",
  "recycleBin",
  "restore",
  "emptyBin",
  "settings",
  "chooseFolder",
  "useDefaultFolder",
  "startup",
  "open",
  "goHome",
  "backups",
  "restoreBackup",
  // Inside an open world or system: the named actions in editing.ts.
  "rulesTab",
  "node",
  "choices",
  "flags",
  "sections",
  "addRule",
  "addSection",
  "rename",
  "setText",
  "setField",
  "useSystemValue",
  "moveToSection",
  "deleteNode",
  "undo",
  "redo",
  "beingsList",
  "itemsList",
  "categories",
  "addBeing",
  "addItem",
  "addCategory",
  "setCategory",
  "setPicture",
  "toggleFavourite",
  "setScore",
  "useParentValue",
  "detach",
  "library",
  "addBrick",
  "dropNeedsAnswers",
  "attach",
  "removeAttachment",
  "attachmentDetail",
  "editAttachment",
  "attachInside",
  "familyChecklist",
  "changeParent",
  "templates",
  "copyNode",
  "setTemplate",
  "flagPanel",
  "missingDetail",
  "fixMissing",
  "meantThat",
  "ignoreFlag",
  "ignoreKind",
  "unignore",
  "markGood",
  "markSeen",
  "undoLog",
  "clearLog",
  "bin",
  "binnedNamed",
  "restoreNode",
  "reconnect",
  "emptyNodeBin",
  "history",
  "rollBackTo",
  "redoTo",
  "rollBackAll",
  "upwardView",
  "changeInSystem",
  "book",
  "bookChoices",
  "bookWord",
  "setAuthor",
  "importFile",
  "share",
  "snapshots",
  "takeSnapshot",
  "restoreSnapshot",
  "deleteSnapshot",
  "cleanUpSnapshots",
  "checkSettings",
  "setCheck",
  "loreList",
  "addLore",
  "rollTable",
  "tableMode",
  "linkTargets",
  "quickQuestions",
  "quickStart",
] as const;
export type BackendMethod = (typeof BACKEND_METHODS)[number];

export class Backend {
  readonly settingsFile: SettingsFile;
  lib: Library;
  session: Session | null = null;
  private readonly opts: BackendOptions;
  private readonly sessionId = newId();
  private readonly now: () => number;
  private readonly timers: Timers;
  private resumed: Place | null = null;

  constructor(opts: BackendOptions) {
    this.opts = opts;
    this.now = opts.now ?? (() => Date.now());
    this.timers = opts.timers ?? realTimers;
    this.settingsFile = new SettingsFile(opts.settingsPath);
    this.lib = this.makeLibrary();
  }

  get folder(): string {
    return this.settingsFile.data.mainFolder ?? this.opts.defaultFolder;
  }

  private makeLibrary(): Library {
    const lib = new Library(this.folder, { machine: this.opts.machine, session: this.sessionId }, this.now);
    lib.init();
    return lib;
  }

  // ---------- Home screen ----------

  home(): HomeData {
    const opened = this.settingsFile.data.opened;
    const systems = this.lib.listSystems();
    const names = new Map(systems.map((s) => [s.id, s.name]));
    const worlds: WorldCard[] = this.lib.listWorlds().map((w) => ({
      id: w.id,
      name: w.name,
      systemId: w.systemId,
      // The system's name as the user named it on the shelf, falling back to the copy in the world.
      systemName: names.get(w.systemId) ?? w.systemName,
      picture: w.picture,
      ...this.flagCounts(w.id),
      lastUsed: opened[w.id] ?? w.changed,
    }));
    const systemCards: SystemCard[] = systems.map((s) => ({
      id: s.id,
      name: s.name,
      picture: s.picture,
      usedBy: s.usedBy,
      variantOf: s.base ? (names.get(s.base) ?? null) : null,
      lastUsed: opened[s.id] ?? s.changed,
    }));
    const byLastUsed = (a: { lastUsed: number; name: string }, b: { lastUsed: number; name: string }) => b.lastUsed - a.lastUsed || a.name.localeCompare(b.name);
    return { folder: this.folder, systems: systemCards.sort(byLastUsed), worlds: worlds.sort(byLastUsed), binCount: this.lib.listRecycleBin().length, startingPoints: STARTING_POINTS };
  }

  private flagCounts(worldId: Id): { red: number; yellow: number } {
    try {
      const ws = this.lib.peekWorld(worldId);
      // The world's own check settings (World settings), and its ignored flags, count here too.
      const panel = readPanel(this.lib.readMeta("world", worldId).flagPanel);
      const v = panelView(ws, worldId, panel, this.now());
      return { red: v.counts.red, yellow: v.counts.yellow };
    } catch {
      return { red: 0, yellow: 0 };
    }
  }

  /** Asks for a picture file and stores it once in the picture store. Null if cancelled. */
  async pickPicture(): Promise<Id | null> {
    const path = await this.opts.pickPicture();
    if (!path) return null;
    if (!PICTURE_TYPES.includes(extname(path).toLowerCase())) throw new LibraryError("That isn't a picture the app can show. Use PNG, JPG, GIF or WebP.");
    if (statSync(path).size > MAX_PICTURE_BYTES) throw new LibraryError("That picture is over 25 MB. Try a smaller copy of it.");
    return this.lib.addPicture(readFileSync(path), basename(path));
  }

  createSystem(input: { name: string; picture: Id | null; start: StartingPoint["id"] }): Id {
    const name = cleanName(input.name);
    const start = STARTING_POINTS.find((s) => s.id === input.start);
    if (!start) throw new LibraryError("Choose a starting point.");
    if (!start.ready) throw new LibraryError(`${start.label} isn't ready yet. Choose From scratch for now.`);
    const id = this.lib.createSystem(name, null, this.settingsFile.data.author);
    // From scratch starts with the small set of categories from the design. It is the starting
    // point, not a change, so it isn't an undo step.
    const { ws } = this.lib.openSystem(id);
    if (start.id === "d20") ws.transact("Started from the generic d20", () => buildD20Starter(ws, id));
    else ws.transact("Started from scratch", () => ensureCategories(ws, id));
    ws.history = [];
    this.lib.saveSystem(ws, id);
    if (input.picture) this.lib.setPicture("system", id, input.picture);
    this.markOpened(id);
    return id;
  }

  createWorld(input: { name: string; picture: Id | null; systemId: Id }): Id {
    const name = cleanName(input.name);
    if (!input.systemId) throw new LibraryError("Choose a game system.");
    const id = this.lib.createWorld(name, input.systemId, this.settingsFile.data.author);
    if (input.picture) this.lib.setPicture("world", id, input.picture);
    this.markOpened(id);
    return id;
  }

  /** For the warning before deleting a system: "3 worlds use this system". */
  systemDependents(id: Id): { systems: string[]; worlds: string[] } {
    const d = this.lib.systemDependents(id);
    return { systems: d.systems.map((s) => s.name), worlds: d.worlds.map((w) => w.name) };
  }

  deleteWorld(id: Id): RecycledInfo {
    return this.binEntry(this.lib.deleteWorld(id));
  }

  /** Deletes a system and, with it, the worlds that use it (the user has already agreed). */
  deleteSystem(id: Id): RecycledInfo {
    return this.binEntry(this.lib.deleteSystem(id));
  }

  private binEntry(entryId: Id): RecycledInfo {
    return this.lib.listRecycleBin().find((e) => e.id === entryId)!;
  }

  recycleBin(): RecycledInfo[] {
    return this.lib.listRecycleBin();
  }

  restore(entryId: Id): RecycledInfo[] {
    return this.lib.restoreFromBin(entryId);
  }

  /** Permanent. The window always asks first. */
  emptyBin(entryIds?: Id[]) {
    this.lib.emptyRecycleBin(entryIds);
  }

  // ---------- Settings ----------

  settings(): SettingsView {
    return { folder: this.folder, defaultFolder: this.opts.defaultFolder, isDefault: this.settingsFile.data.mainFolder === null, author: this.settingsFile.data.author };
  }

  /** The optional author name ("Created by"); empty clears it. */
  setAuthor(name: string | null): SettingsView {
    const n = String(name ?? "").trim().slice(0, 120);
    this.settingsFile.update((s) => (s.author = n || null));
    return this.settings();
  }

  // ---------- Sharing ----------

  /** Import (top bar): a world or system file someone sent. Never overwrites anything. */
  async importFile(path?: string): Promise<ImportResult | null> {
    if (this.session) throw new LibraryError("Go back to the home screen first.");
    const file = path ?? (this.opts.pickImport ? await this.opts.pickImport() : null);
    if (!file) return null;
    const r = this.lib.importFile(file, this.settingsFile.data.author);
    this.markOpened(r.id);
    return r;
  }

  /** Share (World or System settings): saves a copy to send. Saves any waiting changes first. */
  async share(opts: { history?: boolean; snapshots?: boolean } = {}, dest?: string): Promise<string | null> {
    const s = this.session;
    if (!s) throw new LibraryError("Open the world or system to share first.");
    s.saveNow();
    const name = `${s.name.replace(/[\\/:*?"<>|]+/g, " ").trim() || "Shared"}${s.type === "world" ? WORLD_EXT : SYSTEM_EXT}`;
    const path = dest ?? (this.opts.pickSave ? await this.opts.pickSave(name, s.type) : null);
    if (!path) return null;
    if (s.type === "world") this.lib.exportWorld(s.id, path, opts);
    else this.lib.exportSystem(s.id, path, opts);
    return path;
  }

  // ---------- Snapshots (World settings) ----------

  snapshots(): { list: SnapshotView[]; bytes: number } {
    const s = this.worldSession();
    const now = this.now();
    return { list: this.lib.listSnapshots(s.id).map((x) => ({ ...x, label: whenLabel(x.time, now), auto: AUTO_SNAPSHOT.test(x.name) })), bytes: this.lib.historyBytes(s.id) };
  }

  takeSnapshot(name: string): Id {
    const s = this.worldSession();
    const n = String(name ?? "").trim();
    if (!n) throw new LibraryError("Give the snapshot a name, such as \"before I removed Strength\".");
    s.saveNow();
    return this.lib.snapshot(s.world!, n.slice(0, 200));
  }

  /** Restores a snapshot. A snapshot of how things are now is taken first, so it can be undone. */
  restoreSnapshot(id: Id): true {
    const s = this.worldSession();
    if (s.readOnly) throw new LibraryError(s.readOnlyReason ?? "This world is read-only.");
    s.saveNow();
    this.lib.restoreSnapshot(s.world!, id);
    this.opts.emit({ type: "saved" });
    return true;
  }

  deleteSnapshot(id: Id): true {
    this.lib.deleteSnapshot(this.worldSession().id, id);
    return true;
  }

  /** Clean up: removes the snapshots the app took by itself before restores. Yours are kept. */
  cleanUpSnapshots(): number {
    const s = this.worldSession();
    const auto = this.lib.listSnapshots(s.id).filter((x) => AUTO_SNAPSHOT.test(x.name));
    for (const x of auto) this.lib.deleteSnapshot(s.id, x.id);
    return auto.length;
  }

  private worldSession(): Session {
    const s = this.session;
    if (!s || s.type !== "world" || !s.world) throw new LibraryError("Snapshots belong to worlds. Open a world first.");
    return s;
  }

  async chooseFolder(): Promise<SettingsView> {
    if (this.session) throw new LibraryError("Go back to the home screen first.");
    const folder = await this.opts.pickFolder();
    if (folder) this.setFolder(folder);
    return this.settings();
  }

  useDefaultFolder(): SettingsView {
    if (this.session) throw new LibraryError("Go back to the home screen first.");
    this.setFolder(null);
    return this.settings();
  }

  private setFolder(folder: string | null) {
    const before = this.settingsFile.data.mainFolder;
    this.settingsFile.update((s) => (s.mainFolder = folder));
    try {
      this.lib = this.makeLibrary();
    } catch (e) {
      this.settingsFile.update((s) => (s.mainFolder = before));
      this.lib = this.makeLibrary();
      throw new LibraryError(`The app can't use that folder: ${e instanceof Error ? e.message : e}`);
    }
  }

  // ---------- Opening worlds and systems ----------

  /** Where to reopen at start-up: set only if the app was closed unexpectedly last time. */
  startup(): { resume: Place | null } {
    const place = this.settingsFile.data.place;
    const exists = place && (place.type === "world" ? this.lib.listWorlds() : this.lib.listSystems()).some((x) => x.id === place.id);
    if (!exists) {
      if (place) this.settingsFile.update((s) => (s.place = null));
      return { resume: null };
    }
    this.resumed = place;
    return { resume: place };
  }

  open(place: Place, mode: "normal" | "read-only" | "take-over" = "normal"): OpenResponse {
    this.goHome();
    const events = {
      saved: () => this.opts.emit({ type: "saved" }),
      saveFailed: (message: string) => this.opts.emit({ type: "saveFailed", message }),
      readOnly: (reason: string) => this.opts.emit({ type: "readOnly", reason }),
    };
    let session: Session;
    if (place.type === "world") {
      const res = Session.openWorld(this.lib, place.id, { readOnly: mode === "read-only", takeOver: mode === "take-over" }, events, this.timers);
      if (res.status === "in-use") return res;
      session = res.session;
    } else {
      session = Session.openSystem(this.lib, place.id, events, this.timers);
    }
    this.session = session;
    const resumed = this.resumed?.type === place.type && this.resumed.id === place.id;
    this.resumed = null;
    this.markOpened(place.id, place);
    return {
      status: "open",
      view: { type: place.type, id: place.id, name: session.name, systemName: session.systemName, readOnly: session.readOnly, readOnlyReason: session.readOnlyReason, recovered: session.recovered || resumed },
    };
  }

  /** Back to the home screen: saves anything waiting and lets go of the world. */
  goHome() {
    this.session?.close();
    this.session = null;
    if (this.settingsFile.data.place) this.settingsFile.update((s) => (s.place = null));
  }

  backups(): BackupView[] {
    const s = this.session;
    if (!s || s.type !== "world") return [];
    const now = this.now();
    return this.lib.listBackups(s.id).map((b) => ({ ...b, label: whenLabel(b.time, now) }));
  }

  restoreBackup(file: string): true {
    const s = this.session;
    if (!s || s.type !== "world") throw new LibraryError("Open a world first.");
    if (!this.lib.listBackups(s.id).some((b) => b.file === file)) throw new LibraryError("That backup is gone.");
    s.restoreBackup(file);
    return true;
  }

  // ---------- Inside an open world or system ----------

  private get editing(): Editing {
    if (!this.session) throw new LibraryError("Open a world or system first.");
    return new Editing(this.session);
  }

  rulesTab(): RulesSection[] {
    return this.editing.rulesTab();
  }
  node(id: Id): NodeView {
    return this.editing.node(id);
  }
  choices(): Choices {
    return this.editing.choices();
  }
  flags(): FlagView[] {
    return this.editing.flags();
  }
  sections(): { key: string; title: string }[] {
    return this.editing.sections();
  }
  addRule(sectionKey: string, name: string): Id {
    return this.editing.addRule(sectionKey, name);
  }
  addSection(title: string): Id {
    return this.editing.addSection(title);
  }
  rename(id: Id, name: string): true {
    this.editing.rename(id, name);
    return true;
  }
  setText(id: Id, text: string): true {
    this.editing.setText(id, text);
    return true;
  }
  setField(id: Id, key: string, value: Value): true {
    this.editing.setField(id, key, value);
    return true;
  }
  useSystemValue(id: Id, key: string): true {
    this.editing.useSystemValue(id, key);
    return true;
  }
  moveToSection(id: Id, sectionKey: string): true {
    this.editing.moveToSection(id, sectionKey);
    return true;
  }
  deleteNode(id: Id): StepResult {
    return this.editing.deleteNode(id);
  }
  undo(): StepResult | null {
    return this.editing.undo();
  }
  redo(): StepResult | null {
    return this.editing.redo();
  }

  beingsList(kind: BeingKind, sort: "name" | "challenge" = "name", source: SourceFilter = "all"): ListEntry[] {
    return this.editing.beingsList(kind, sort, source);
  }
  templates(): TemplateEntry[] {
    return this.editing.templates();
  }
  copyNode(sourceId: Id, name: string): Id {
    return this.editing.copyNode(sourceId, name);
  }
  setTemplate(id: Id, on: boolean): true {
    this.editing.setTemplate(id, on);
    return true;
  }
  itemsList(source: SourceFilter = "all"): ListEntry[] {
    return this.editing.itemsList(source);
  }
  categories(): CategoryOption[] {
    return this.editing.categories();
  }
  addBeing(input: { name: string; kind: BeingKind; variantOf: Id | null; template?: boolean }): Id {
    return this.editing.addBeing(input);
  }
  addItem(input: { name: string; categoryId: Id | null; variantOf: Id | null; template?: boolean }): Id {
    return this.editing.addItem(input);
  }
  addCategory(name: string, under: Id | null): Id {
    return this.editing.addCategory(name, under);
  }
  setCategory(id: Id, categoryId: Id | null): true {
    this.editing.setCategory(id, categoryId);
    return true;
  }
  setPicture(id: Id, picture: Id | null): true {
    this.editing.setPicture(id, picture);
    return true;
  }
  toggleFavourite(id: Id): true {
    this.editing.toggleFavourite(id);
    return true;
  }
  setScore(id: Id, ability: Id, score: number | null): true {
    this.editing.setScore(id, ability, score);
    return true;
  }
  useParentValue(id: Id, key: string): true {
    this.editing.useParentValue(id, key);
    return true;
  }
  detach(id: Id): true {
    this.editing.detach(id);
    return true;
  }

  library(): LibrarySection[] {
    return this.editing.library();
  }
  addBrick(type: BrickType, name: string): Id {
    return this.editing.addBrick(type, name);
  }
  dropNeedsAnswers(targets: Id[], bricks: Id[]): boolean {
    return this.editing.dropNeedsAnswers(targets, bricks);
  }
  attach(input: { targets: Id[]; bricks: Id[]; activation?: Activation; uses?: Uses | null }): StepResult {
    return this.editing.attach(input);
  }
  removeAttachment(nodeId: Id, aid: Id): StepResult {
    return this.editing.removeAttachment(nodeId, aid);
  }

  attachmentDetail(nodeId: Id, aid: Id): AttachmentDetail {
    return this.editing.attachmentDetail(nodeId, aid);
  }
  editAttachment(nodeId: Id, aid: Id, patch: AttachmentPatch): true {
    this.editing.editAttachment(nodeId, aid, patch);
    return true;
  }
  attachInside(nodeId: Id, aid: Id, bricks: Id[]): StepResult {
    return this.editing.attachInside(nodeId, aid, bricks);
  }
  familyChecklist(parentId: Id, fields: string[], labels: Record<string, string> = {}): FamilyRow[] {
    return this.editing.familyChecklist(parentId, fields, labels);
  }
  changeParent(parentId: Id, changes: Record<string, Value | null>, ticked: Id[] | null): StepResult {
    return this.editing.changeParent(parentId, changes, ticked);
  }

  flagPanel(): FlagPanelView {
    return this.editing.flagPanel();
  }
  missingDetail(key: string): MissingDetail {
    return this.editing.missingDetail(key);
  }
  fixMissing(key: string, slots: Slot[], to: Id | null): StepResult {
    return this.editing.fixMissing(key, slots, to);
  }
  meantThat(key: string, nodes: Id[]): StepResult {
    return this.editing.meantThat(key, nodes);
  }
  ignoreFlag(key: string): true {
    this.editing.ignoreFlag(key);
    return true;
  }
  ignoreKind(kind: string): true {
    this.editing.ignoreKind(kind);
    return true;
  }
  unignore(keyOrKind: string): true {
    this.editing.unignore(keyOrKind);
    return true;
  }
  markGood(key: string): StepResult {
    return this.editing.markGood(key);
  }
  markSeen(keys: string[] | null): true {
    this.editing.markSeen(keys);
    return true;
  }
  undoLog(logKey: string): StepResult | null {
    return this.editing.undoLog(logKey);
  }
  clearLog(): true {
    this.editing.clearLog();
    return true;
  }

  bin(): BinView[] {
    return this.editing.bin();
  }
  binnedNamed(name: string, kind: NodeKind | null = null): BinView | null {
    return this.editing.binnedNamed(name, kind);
  }
  restoreNode(binId: Id): RestoreResult {
    return this.editing.restoreNode(binId);
  }
  reconnect(nodeId: Id, slots: Slot[]): StepResult {
    return this.editing.reconnect(nodeId, slots);
  }
  /** Permanent: the window always asks first. */
  emptyNodeBin(binIds: Id[] | null): true {
    this.editing.emptyNodeBin(binIds);
    return true;
  }

  history(): HistoryView {
    return this.editing.history();
  }
  rollBackTo(stepId: Id): StepResult {
    return this.editing.rollBackTo(stepId);
  }
  redoTo(stepId: Id): StepResult {
    return this.editing.redoTo(stepId);
  }
  rollBackAll(): StepResult {
    return this.editing.rollBackAll();
  }

  /** Edit parent from a world up to its system: the system's version beside this world's. */
  upwardView(nodeId: Id): UpwardView {
    if (!this.session) throw new LibraryError("Open a world first.");
    return upwardView(this.lib, this.session, nodeId);
  }
  /** Makes the change at the system; unticked worlds keep the old value as their own. */
  changeInSystem(nodeId: Id, changes: Record<string, Value | null>, ticked: Id[]): { label: string; kept: string[]; couldNot: string[] } {
    if (!this.session) throw new LibraryError("Open a world first.");
    return changeInSystem(this.lib, this.session, nodeId, changes, ticked);
  }

  /** The rulebook's content (the window lays it out into pages; main.ts turns it into a PDF). */
  book(opts: BookRequest): BookData {
    return this.editing.book(opts);
  }
  /** Saves the rulebook as a Word file (.docx). Resolves to where it went, or null if cancelled. */
  async bookWord(opts: BookRequest, dest?: string): Promise<string | null> {
    const data = this.book(opts);
    const name = `${data.book.title} - ${data.book.subtitle}.docx`.replace(/[\\/:*?"<>|]+/g, " ");
    const path = dest ?? (this.opts.pickWord ? await this.opts.pickWord(name) : null);
    if (!path) return null;
    writeFileSync(path, bookDocx(data, (id) => this.picture(id)));
    return path;
  }
  /** The book types and chapters to choose from, with each type's usual chapters. */
  bookChoices() {
    return {
      types: Object.entries(BOOK_TITLES).map(([id, title]) => ({ id, title, chapters: BOOK_CHAPTERS[id as keyof typeof BOOK_CHAPTERS] })),
      chapters: Object.entries(CHAPTER_TITLES).map(([id, title]) => ({ id, title })),
    };
  }

  checkSettings(): CheckSettings {
    return this.editing.checkSettings();
  }
  setCheck(category: CheckCategory, change: { on?: boolean; level?: Sensitivity }): true {
    this.editing.setCheck(category, change);
    return true;
  }

  loreList(): LoreSection[] {
    return this.editing.loreList();
  }
  addLore(name: string, template: string): Id {
    return this.editing.addLore(name, template);
  }
  rollTable(id: Id): { roll: number; text: string; result: { id: Id; name: string } | null } {
    return this.editing.rollTable(id);
  }
  /** Table mode: the world as a read-only reading view for running a game. */
  tableMode(): TableModeView {
    return this.editing.tableMode();
  }
  linkTargets(): { id: Id; name: string; group: string }[] {
    return this.editing.linkTargets();
  }
  quickQuestions() {
    return QUICK_QUESTIONS;
  }
  quickStart(answers: QuickStartAnswers): string[] {
    return this.editing.quickStart(answers);
  }

  /** The app is closing normally. */
  shutdown() {
    this.goHome();
  }

  /** For the window's picture loader. */
  picture(id: Id): Buffer | null {
    try {
      return this.lib.readPicture(id);
    } catch {
      return null;
    }
  }

  private markOpened(id: Id, place: Place | null = null) {
    this.settingsFile.update((s) => {
      s.opened[id] = this.now();
      if (place) s.place = place;
    });
  }
}

function cleanName(name: string): string {
  const n = (name ?? "").trim();
  if (!n) throw new LibraryError("Give it a name (even a single letter is fine).");
  if (n.length > MAX_NAME) throw new LibraryError(`Names can be up to ${MAX_NAME} letters long.`);
  return n;
}
