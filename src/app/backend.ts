// Everything the app's window can ask for. Plain TypeScript with no Electron in it, so it is tested
// like the engine. `main.ts` only connects these methods to the window.

import { readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { newId, roll } from "../engine/index.ts";
import type { RollResult } from "../engine/index.ts";
import { panelView, readPanel } from "./flagpanel.ts";
import type { Activation, CheckCategory, CheckSettings, Id, NodeKind, Sensitivity, Slot, Uses, Value } from "../engine/index.ts";
import { Library, LibraryError, realTimers } from "../storage/index.ts";
import { MODULE_EXT, SYSTEM_EXT, WORLD_EXT } from "../storage/index.ts";
import type { ImportResult, RecycledInfo, Timers } from "../storage/index.ts";
import { Editing } from "./editing.ts";
import { textSizeFor, themeFor } from "./themes.ts";
import { summarize } from "./changelog.ts";
import type { Changelog } from "./changelog.ts";
export type { Changelog };
import { bookDocx } from "./docx.ts";
import type { BinView, BookData, BookRequest, Choices, FlagView, HistoryView, NodeView, RestoreResult, SheetDesign, StepResult } from "./editing.ts";
import type { PaperGroup, PaperLine, PaperSheet, SheetGroup, SheetLayout, SheetLine } from "./sheetdesign.ts";
export type { PaperGroup, PaperLine, PaperSheet, SheetDesign, SheetGroup, SheetLayout, SheetLine };
import { BOOK_CHAPTERS, BOOK_TITLES, CHAPTER_TITLES } from "../engine/index.ts";
import type { RulesSection } from "./rules.ts";
import type { BeingKind, CategoryOption, ListEntry, SourceFilter, TemplateEntry } from "./sheets.ts";
import type { CodexKey, CodexSection, QuickView } from "./codex.ts";
import type { EncounterNode } from "./encounters.ts";
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
import { rollScores } from "./characters.ts";
import { imagesPdf } from "./pdf-image.ts";
import { pictureSize } from "./docx.ts";
import type { Grid, MapTreeNode, MapView, Shape } from "./maps.ts";
import type { BeginInput, ClockStep, ConditionOn, LogLine, TableView, Timer } from "./table.ts";
import type { Macro, MacroBlock, MacroResult } from "./macros.ts";
import type { Block, PageView } from "./journal.ts";
import { tableMetaFrom } from "./tablemeta.ts";
import type { ChatLine, Level, Part, Access, PermissionTemplate, Person, TableMeta } from "./tablemeta.ts";
import { LanServer, DEFAULT_PORT, lanAddresses } from "./lan.ts";
import { makePerson, newPin, personByPin, playerState, refuse, applyTemplate as applyPermissionTemplate, LEVELS } from "./players.ts";
import type { PlayerAction, PlayerState, ShownView } from "./players.ts";
import { blocksOf } from "./journal.ts";
import { qrSvg } from "../engine/qr.ts";
import { SAMPLE_MODULE, SAMPLE_SYSTEM, SAMPLE_WORLD, makeSample } from "./sample.ts";
import type { BuilderOptions, CharacterInput, CharacterView } from "./characters.ts";
import type { UpwardView } from "./upward.ts";
import { SettingsFile } from "./settings.ts";
import * as assistant from "./ai/assistant.ts";
import type { AiView, AskResult } from "./ai/assistant.ts";
import type { AiTransport } from "./ai/job.ts";
import { readDocument } from "./ai/documents.ts";
import { search } from "./search.ts";
import type { SearchHit } from "./search.ts";
import type { ModelChoice } from "./ai/models.ts";
import { CAREFUL, QUICK, dollars } from "./ai/models.ts";
import type { Place } from "./settings.ts";
import { whenLabel } from "./words.ts";

export type { Place } from "./settings.ts";
export type { Grid, MapTreeNode, MapView, PinView, Shape } from "./maps.ts";
export type { BeginInput, CardView, ClockStep, Combatant, ConditionOn, LogLine, Member, SessionState, TableView, Timer, WorldDate, Calendar } from "./table.ts";
export type { Macro, MacroBlock, MacroResult } from "./macros.ts";
export type { Block, PageEntry, PageView } from "./journal.ts";
export type { ChatLine, TableMeta, ToolPlace, Bookmark, FloatingPin, Person, PermissionTemplate, Level, Part, Access, Shown, LiveMap } from "./tablemeta.ts";
export type { PlayerState, PlayerCard, ShownView, PlayerAction } from "./players.ts";

/** The door for players, as the DM's screen shows it. */
export interface PlayersView {
  open: boolean;
  port: number;
  /** Addresses players type in a browser, best first. */
  addresses: string[];
  online: Id[];
  people: Person[];
  templates: PermissionTemplate[];
  /** The QR code for the first address, as a picture. */
  qr: string | null;
}
export type { BuilderOptions, CharacterInput, CharacterView, Method, OptionChoice, OptionClass, OptionRace, TrackerView } from "./characters.ts";
export type RosterEntry = ReturnType<typeof import("./characters.ts").roster>[number];
export type { ImportResult, RecycledInfo } from "../storage/index.ts";
export type { BinView, BookData, BookRequest, Choices, FlagView, HistoryStep, HistoryView, NodeView, Option, RestoreResult, StepResult } from "./editing.ts";
export type { RulesSection } from "./rules.ts";
export type { BeingKind, CategoryOption, ListEntry, SheetDef, SourceFilter, TemplateEntry } from "./sheets.ts";
export type { CodexEntry, CodexKey, CodexSection, QuickView } from "./codex.ts";
export type { EncounterNode } from "./encounters.ts";
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

/** A module (version 2) on the home screen's Modules shelf. */
export interface ModuleCard {
  id: Id;
  name: string;
  /** "Greyhollow · d20 Basic", or "Any world · d20 Basic" for a setting-free module. */
  builtOn: string;
  baseType: "world" | "system";
  picture: Id | null;
  lastUsed: number;
}

export interface HomeData {
  folder: string;
  systems: SystemCard[];
  worlds: WorldCard[];
  modules: ModuleCard[];
  binCount: number;
  startingPoints: StartingPoint[];
}

export interface PlaceView {
  type: "world" | "system" | "module";
  id: Id;
  name: string;
  systemName: string | null;
  /** For a module on a world: the world's name. */
  worldName: string | null;
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
  /** Pounds or kilograms for the weight pickers. */
  units: "lb" | "kg";
  /** The colour theme and the size of the interface text (version 3). */
  theme: string;
  textSize: "small" | "normal" | "large";
}

/** Settings → AI, and the corner of the AI panel. */
export interface AiStatus {
  hasKey: boolean;
  /** The last four characters, so the user can tell which key it is. */
  keyEnd: string | null;
  online: boolean;
  model: ModelChoice;
  models: { quick: string; careful: string };
  threshold: number;
  /** This month's AI spending in words ("$1.24 this month"). */
  spent: string;
  /** Live AI checking is on. */
  live: boolean;
  /** Show the one-time tip about live checking (a key was just added). */
  tip: boolean;
}

/** How long after the last change a live AI check waits, so typing doesn't start one per letter. */
export const LIVE_DELAY_MS = 6000;

/** Events sent to the window. */
export type BackendEvent =
  | { type: "saved" }
  | { type: "saveFailed"; message: string }
  | { type: "readOnly"; reason: string }
  /** A live AI check finished: the flag panel has new findings. */
  | { type: "aiFlags"; found: number }
  /** A background AI job didn't finish; nothing from it was applied. */
  | { type: "aiNotice"; message: string }
  /** A new line in the table's chat (a roll, a message). */
  | { type: "chat"; line: import("./tablemeta.ts").ChatLine }
  /** A player did something at the table (the DM's screen redraws). */
  | { type: "table" }
  /** Players joined or left: who is connected now. */
  | { type: "players"; online: Id[] }
  /** Someone pointed at the shown map. */
  | { type: "point"; x: number; y: number; color: string; who: string };

export interface BackendOptions {
  settingsPath: string;
  defaultFolder: string;
  machine: string;
  /** Show the picture chooser; resolves to a file path or null. */
  pickPicture: () => Promise<string | null>;
  /** Show the folder chooser; resolves to a folder path or null. */
  pickFolder: () => Promise<string | null>;
  /** Show a Save dialog for a file to share; resolves to a path or null. */
  pickSave?: (defaultName: string, kind: "world" | "system" | "module") => Promise<string | null>;
  /** Show an Open dialog for a world or system file to import; resolves to a path or null. */
  pickImport?: () => Promise<string | null>;
  /** Show a Save dialog for the rulebook as a Word file; resolves to a path or null. */
  pickWord?: (defaultName: string) => Promise<string | null>;
  /** Show a Save dialog for an exported file (png, pdf...); resolves to a path or null. */
  pickFile?: (defaultName: string, ext: string) => Promise<string | null>;
  /** The Claude API key, kept in the operating system's protected storage (main.ts). */
  secrets?: { read: () => string | null; write: (key: string | null) => void };
  /** Makes the connection to Claude for a key. */
  aiTransport?: (key: string) => AiTransport;
  /** False when the computer is offline, so the AI buttons can say Offline. */
  isOnline?: () => boolean;
  /** Show an Open dialog for the user's own document (.txt, .md, .docx); resolves to a path or null. */
  pickDocument?: () => Promise<string | null>;
  emit: (event: BackendEvent) => void;
  /** The player page's files (player.html, player.js, player.css), for players joining. */
  playerFile?: (name: string) => Buffer | string | null;
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
  "createModule",
  "deleteModule",
  "worldModules",
  "placeChoices",
  "placeModule",
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
  "codex",
  "refile",
  "quick",
  "makeOwnCopy",
  "makeVariant",
  "printPreview",
  "newInSection",
  "addChoice",
  "builderOptions",
  "makeItForMe",
  "roster",
  "characterView",
  "createCharacter",
  "setAppearance",
  "addExtra",
  "setExtra",
  "addTracker",
  "setTracker",
  "award",
  "rest",
  "levelUpPreview",
  "levelUp",
  "setChoice",
  "rollScores",
  "mapTree",
  "mapView",
  "mapsShowing",
  "createMap",
  "addPins",
  "movePins",
  "editPins",
  "deletePins",
  "copyPins",
  "addShape",
  "deleteShapes",
  "fillShape",
  "setMapSettings",
  "pictureData",
  "exportImage",
  "resetTable",
  "spreadTable",
  "tableFrom",
  "tableView",
  "beginSession",
  "setSession",
  "setTimerPaused",
  "changelog",
  "dismissChangelog",
  "wrapUp",
  "addLog",
  "startFight",
  "addToFight",
  "addEvent",
  "nextTurn",
  "moveInOrder",
  "setCombatant",
  "revealAll",
  "clearDefeated",
  "damage",
  "endFight",
  "addCondition",
  "addCharacterCondition",
  "changeCondition",
  "addTimer",
  "setTimer",
  "advanceClock",
  "partyRest",
  "macros",
  "saveMacro",
  "runMacro",
  "journalTree",
  "pageView",
  "mentionedIn",
  "createPage",
  "setPage",
  "addBlock",
  "setBlock",
  "pageToNode",
  "tableMeta",
  "setCalendar",
  "madeSince",
  "setTableMeta",
  "postChat",
  "rollDice",
  "players",
  "openTable",
  "closeTable",
  "addPerson",
  "setPerson",
  "removePerson",
  "rerollPin",
  "revokePin",
  "saveTemplate",
  "deleteTemplate",
  "useTemplate",
  "showToPlayers",
  "forgetShown",
  "showMapLive",
  "setLiveMarks",
  "pointAt",
  "qrCode",
  "playerPreview",
  "firstTime",
  "setFirstTime",
  "makeSample",
  "bookContents",
  "shopChoices",
  "sheetLayouts",
  "sheetDesign",
  "setSheetLayout",
  "useSheetLayout",
  "saveSheetLayout",
  "saveBookLayout",
  "bookLayouts",
  "encounterTree",
  "modulePage",
  "addEncounter",
  "moveEncounters",
  "deleteEncounter",
  "addToEncounter",
  "placeEncounter",
  "saveEncounterToCodex",
  "addChoiceOptions",
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
  "setUnits",
  "setTheme",
  "setTextSize",
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
  "aiStatus",
  "setAiKey",
  "setAiOptions",
  "aiView",
  "aiAsk",
  "aiAccept",
  "aiReject",
  "setWorldNotes",
  "updateWorldNotes",
  "clearAiChat",
  "aiCheck",
  "aiFixFlag",
  "setAiLive",
  "dismissAiTip",
  "search",
  "attachAtLevel",
  "setFeatureLevel",
  "aiFromDocument",
  "aiGenerate",
  "aiBuildNext",
  "aiBuildStop",
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
    const modules: ModuleCard[] = this.lib.listModules().map((m) => ({
      id: m.id,
      name: m.name,
      builtOn: m.baseType === "world" ? `${m.baseName} · ${m.systemName}` : `Any world · ${m.systemName}`,
      baseType: m.baseType,
      picture: m.picture,
      lastUsed: opened[m.id] ?? m.changed,
    }));
    return { folder: this.folder, systems: systemCards.sort(byLastUsed), worlds: worlds.sort(byLastUsed), modules: modules.sort(byLastUsed), binCount: this.lib.listRecycleBin().length, startingPoints: STARTING_POINTS };
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

  /** A new module (version 2), on a world or straight on a system (setting-free). */
  createModule(input: { name: string; picture: Id | null; baseId: Id }): Id {
    const name = cleanName(input.name);
    if (!input.baseId) throw new LibraryError("Choose what the module is built on: a world, or just a system.");
    const id = this.lib.createModule(name, input.baseId, this.settingsFile.data.author);
    // Every module starts with its front page (level range, party size, the hook). It is the
    // starting point, not a change, so it isn't an undo step.
    const open = this.lib.openModule(id);
    try {
      open.ws.transact("Front page", () => open.ws.create(id, "lore", name, { fields: { modulePage: true, levels: "", partySize: 4, sessions: 1 } }));
      open.ws.history = [];
      this.lib.saveWorld(open);
    } finally {
      this.lib.close(open);
    }
    if (input.picture) this.lib.setPicture("module", id, input.picture);
    this.markOpened(id);
    return id;
  }

  /** For the warning before deleting a system: "3 worlds use this system". */
  systemDependents(id: Id): { systems: string[]; worlds: string[]; modules: string[] } {
    const d = this.lib.systemDependents(id);
    return { systems: d.systems.map((s) => s.name), worlds: d.worlds.map((w) => w.name), modules: d.modules.map((m) => m.name) };
  }

  /** For the warning before deleting a world: the modules built on it go to the bin with it. */
  worldModules(id: Id): string[] {
    return this.lib.listModules().filter((m) => m.baseId === id).map((m) => m.name);
  }

  deleteWorld(id: Id): RecycledInfo {
    return this.binEntry(this.lib.deleteWorld(id));
  }

  deleteModule(id: Id): RecycledInfo {
    return this.binEntry(this.lib.deleteModule(id));
  }

  /** The worlds a setting-free module can be placed in: those on its own system. */
  placeChoices(moduleId: Id): { id: Id; name: string }[] {
    const m = this.lib.listModules().find((x) => x.id === moduleId);
    if (!m || m.baseType !== "system") return [];
    return this.lib
      .listWorlds()
      .filter((w) => {
        try {
          return this.lib.layersBelow(w.id).some((l) => l.id === m.baseId);
        } catch {
          return false;
        }
      })
      .map((w) => ({ id: w.id, name: w.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** "Place in a world": a copy of a setting-free module, now built on that world. */
  placeModule(moduleId: Id, worldId: Id): Id {
    const id = this.lib.placeModuleInWorld(moduleId, worldId);
    this.markOpened(id);
    return id;
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
    return { folder: this.folder, defaultFolder: this.opts.defaultFolder, isDefault: this.settingsFile.data.mainFolder === null, author: this.settingsFile.data.author, units: this.settingsFile.data.units, theme: this.settingsFile.data.theme, textSize: this.settingsFile.data.textSize };
  }

  /** Pounds or kilograms for the weight pickers. */
  setUnits(units: "lb" | "kg"): SettingsView {
    this.settingsFile.update((s) => (s.units = units === "kg" ? "kg" : "lb"));
    return this.settings();
  }

  /** The colour theme (version 3); anything unknown means Default. */
  setTheme(id: string): SettingsView {
    this.settingsFile.update((s) => (s.theme = themeFor(id).id));
    return this.settings();
  }

  /** Small, Normal or Large interface text (version 3). */
  setTextSize(size: string): SettingsView {
    this.settingsFile.update((s) => (s.textSize = textSizeFor(size)));
    return this.settings();
  }

  /** The optional author name ("Created by"); empty clears it. */
  setAuthor(name: string | null): SettingsView {
    const n = String(name ?? "").trim().slice(0, 120);
    this.settingsFile.update((s) => (s.author = n || null));
    return this.settings();
  }

  // ---------- The AI ----------

  private month(): string {
    return new Date(this.now()).toISOString().slice(0, 7);
  }

  aiStatus(): AiStatus {
    const key = this.opts.secrets?.read() ?? null;
    const d = this.settingsFile.data;
    const spent = d.aiSpend.month === this.month() ? d.aiSpend.usd : 0;
    return { hasKey: !!key, keyEnd: key ? key.slice(-4) : null, online: this.opts.isOnline?.() ?? true, model: d.aiModel, models: { quick: QUICK.name, careful: CAREFUL.name }, threshold: d.aiThreshold, spent: `${spent > 0 ? dollars(spent) : "$0.00"} this month`, live: d.aiLive, tip: !!key && !d.aiTipShown };
  }

  /** Settings → AI: paste a key (kept in the operating system's protected storage), or remove it. */
  setAiKey(key: string | null): AiStatus {
    if (!this.opts.secrets) throw new LibraryError("Keys can't be stored on this computer.");
    const k = typeof key === "string" ? key.trim() : "";
    if (k && !/^sk-ant-[A-Za-z0-9_-]{10,}$/.test(k)) throw new LibraryError('That doesn\'t look like a Claude API key. It starts with "sk-ant-".');
    this.opts.secrets.write(k || null);
    return this.aiStatus();
  }

  setAiOptions(o: { model?: ModelChoice; threshold?: number }): AiStatus {
    this.settingsFile.update((s) => {
      if (o.model === "auto" || o.model === "quick" || o.model === "careful") s.aiModel = o.model;
      if (typeof o.threshold === "number" && Number.isFinite(o.threshold) && o.threshold >= 0) s.aiThreshold = Math.min(1000, o.threshold);
    });
    return this.aiStatus();
  }

  private aiSession() {
    if (!this.session) throw new LibraryError("Open a world or system first.");
    return this.session;
  }

  private transport(): AiTransport {
    const key = this.opts.secrets?.read() ?? null;
    if (!key || !this.opts.aiTransport) throw new LibraryError("Add your Claude API key in Settings to use the AI. Everything else works without it.");
    if (this.opts.isOnline && !this.opts.isOnline()) throw new LibraryError("Offline: the AI needs the internet. Everything else works as normal.");
    return this.opts.aiTransport(key);
  }

  private recordSpend(usd: number) {
    const month = this.month();
    this.settingsFile.update((s) => (s.aiSpend = { month, usd: (s.aiSpend.month === month ? s.aiSpend.usd : 0) + usd }));
  }

  aiView(): AiView {
    return assistant.aiView(this.aiSession());
  }

  /** A request in the AI panel. Big jobs over the cost threshold first return an estimate. */
  async aiAsk(prompt: string, workingOn: Id | null, confirmed = false): Promise<AskResult> {
    const s = this.aiSession();
    return assistant.ask(s, this.transport(), { prompt, workingOn, choice: this.settingsFile.data.aiModel, threshold: this.settingsFile.data.aiThreshold, confirmed }, (usd) => this.recordSpend(usd), this.now);
  }

  aiAccept(): { label: string; view: AiView } {
    return assistant.accept(this.aiSession());
  }

  aiReject(): AiView {
    return assistant.reject(this.aiSession());
  }

  setWorldNotes(text: string): AiView {
    return assistant.setNotes(this.aiSession(), text);
  }

  /** The Update world notes button: a quick, cheap job that only rewrites the AI's own lines. */
  async updateWorldNotes(): Promise<AskResult> {
    const s = this.aiSession();
    return assistant.ask(
      s,
      this.transport(),
      { prompt: "Please update the World Notes.", shown: "Update the World Notes.", workingOn: null, choice: this.settingsFile.data.aiModel === "careful" ? "careful" : "quick", threshold: this.settingsFile.data.aiThreshold, confirmed: true, size: "small", extra: "This job only updates the World Notes: look at the recent chat and, if useful, a few things in the world, then call update_world_notes once with your lines (tone, important facts, key decisions). Change nothing else." },
      (usd) => this.recordSpend(usd),
      this.now,
    );
  }

  clearAiChat(): AiView {
    return assistant.clearChat(this.aiSession());
  }

  /** Check for errors: the AI reviews the user's own work; what it finds arrives as yellow flags. */
  async aiCheck(confirmed = false): Promise<assistant.CheckResult> {
    const s = this.aiSession();
    if (s.readOnly) throw new LibraryError(`${s.readOnlyReason ?? "This is read-only."} Nothing can be changed here.`);
    return assistant.check(s, this.transport(), { choice: this.settingsFile.data.aiModel, threshold: this.settingsFile.data.aiThreshold, confirmed }, (usd) => this.recordSpend(usd), this.now);
  }

  /** Ask AI on a flag: the most reasonable fix, shown as a proposal. "Other ideas" asks for a different one. */
  async aiFixFlag(key: string, other = false): Promise<AskResult> {
    const s = this.aiSession();
    const view = this.editing.flagPanel();
    const f = [...view.blocks, ...view.ignored].find((b) => b.key === key);
    if (!f || (f.color !== "red" && f.color !== "yellow")) throw new LibraryError("That flag has cleared already.");
    const about = f.nodes.map((n) => n.name).join(", ");
    const prompt = other
      ? `Show me other ideas for fixing "${f.title}": suggest a different fix from the one before.`
      : `Suggest the most reasonable fix for this ${f.color === "red" ? "red (broken)" : "yellow (looks off)"} flag: "${f.title}". ${f.detail} It is about: ${about}.`;
    const shown = other ? `Show me other ideas for "${f.title}"` : `Ask AI to fix "${f.title}"`;
    return assistant.ask(s, this.transport(), { prompt, shown, label: `AI: fixed "${f.title.length > 70 ? `${f.title.slice(0, 67)}…` : f.title}"`, workingOn: f.nodes[0]?.id ?? null, choice: this.settingsFile.data.aiModel, threshold: this.settingsFile.data.aiThreshold, confirmed: true }, (usd) => this.recordSpend(usd), this.now);
  }

  /** Create from a document I wrote: reads it and plans it part by part. The AI runs one part at a time. */
  async aiFromDocument(path?: string): Promise<AiView | null> {
    const s = this.aiSession();
    const file = path ?? (this.opts.pickDocument ? await this.opts.pickDocument() : null);
    if (!file) return null;
    let doc: { name: string; text: string };
    try {
      doc = readDocument(file);
    } catch (e) {
      throw new LibraryError(e instanceof Error ? e.message : String(e));
    }
    return assistant.buildStart(s, "document", doc);
  }

  /** Whole-system generation from one idea, section by section, each previewed and costed. */
  aiGenerate(prompt: string): AiView {
    return assistant.buildStart(this.aiSession(), "generate", { prompt });
  }

  async aiBuildNext(confirmed = false): Promise<AskResult> {
    return assistant.buildNext(this.aiSession(), this.transport(), { choice: this.settingsFile.data.aiModel, threshold: this.settingsFile.data.aiThreshold, confirmed }, (usd) => this.recordSpend(usd), this.now);
  }

  aiBuildStop(): AiView {
    return assistant.buildStop(this.aiSession());
  }

  setAiLive(on: boolean): AiStatus {
    this.settingsFile.update((s) => ((s.aiLive = !!on), (s.aiTipShown = true)));
    return this.aiStatus();
  }

  dismissAiTip(): AiStatus {
    this.settingsFile.update((s) => (s.aiTipShown = true));
    return this.aiStatus();
  }

  // Live checking: changes the user makes are collected, and a few seconds after the last one the
  // AI checks just those things. It never runs for the AI's own changes, read-only worlds or without a key.
  private liveStop: (() => void) | null = null;
  private liveIds = new Set<Id>();
  private liveTimer: unknown = null;
  private liveBusy = false;

  private watchLive(s: Session) {
    this.liveStop?.();
    this.liveIds.clear();
    this.liveStop = s.ws.onChange((step, kind) => {
      if (kind !== "do" || step.by !== "user" || !this.settingsFile.data.aiLive || s.readOnly) return;
      for (const e of step.edits) if (e.what === "node" || e.what === "change") this.liveIds.add(e.id);
      if (this.liveTimer !== null) this.timers.clear(this.liveTimer);
      this.liveTimer = this.timers.set(() => void this.runLive(s), LIVE_DELAY_MS);
    });
  }

  /** Runs the waiting live check now (the timer calls this). */
  async runLive(s: Session | null = this.session): Promise<void> {
    this.liveTimer = null;
    if (!s || s !== this.session || !this.liveIds.size || this.liveBusy) return;
    const key = this.opts.secrets?.read() ?? null;
    if (!key || !this.opts.aiTransport || (this.opts.isOnline && !this.opts.isOnline())) return;
    const ids = [...this.liveIds].filter((id) => s.ws.exists(s.id, id));
    this.liveIds.clear();
    if (!ids.length) return;
    this.liveBusy = true;
    try {
      const r = await assistant.check(s, this.opts.aiTransport(key), { choice: "quick", threshold: Infinity, only: ids }, (usd) => this.recordSpend(usd), this.now);
      if (r.status === "done" && s === this.session) this.opts.emit({ type: "aiFlags", found: r.found });
    } catch (e) {
      if (s === this.session) this.opts.emit({ type: "aiNotice", message: `Live checking didn't finish: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      this.liveBusy = false;
    }
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
  async share(opts: { history?: boolean; snapshots?: boolean; chat?: boolean; journal?: boolean } = {}, dest?: string): Promise<string | null> {
    const s = this.session;
    if (!s) throw new LibraryError("Open the world or system to share first.");
    s.saveNow();
    const name = `${s.name.replace(/[\\/:*?"<>|]+/g, " ").trim() || "Shared"}${s.type === "world" ? WORLD_EXT : s.type === "module" ? MODULE_EXT : SYSTEM_EXT}`;
    const path = dest ?? (this.opts.pickSave ? await this.opts.pickSave(name, s.type) : null);
    if (!path) return null;
    if (s.type === "world") this.lib.exportWorld(s.id, path, opts);
    else if (s.type === "module") this.lib.exportModule(s.id, path, opts);
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
    if (!s || s.type === "system" || !s.world) throw new LibraryError("Snapshots belong to worlds and modules. Open one first.");
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
    const exists = place && (place.type === "world" ? this.lib.listWorlds() : place.type === "module" ? this.lib.listModules() : this.lib.listSystems()).some((x) => x.id === place.id);
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
    if (place.type === "world" || place.type === "module") {
      const opener = place.type === "world" ? Session.openWorld : Session.openModule;
      const res = opener(this.lib, place.id, { readOnly: mode === "read-only", takeOver: mode === "take-over" }, events, this.timers);
      if (res.status === "in-use") return res;
      session = res.session;
    } else {
      session = Session.openSystem(this.lib, place.id, events, this.timers);
    }
    this.session = session;
    this.watchLive(session);
    this.doorWatch = session.ws.onChange(() => this.lan?.changed());
    const resumed = this.resumed?.type === place.type && this.resumed.id === place.id;
    this.resumed = null;
    this.markOpened(place.id, place);
    return {
      status: "open",
      view: { type: place.type, id: place.id, name: session.name, systemName: session.systemName, worldName: session.worldName, readOnly: session.readOnly, readOnlyReason: session.readOnlyReason, recovered: session.recovered || resumed },
    };
  }

  /** Back to the home screen: saves anything waiting and lets go of the world. */
  goHome() {
    this.doorWatch?.();
    this.doorWatch = null;
    if (this.lan) void this.closeTable();
    this.liveStop?.();
    this.liveStop = null;
    if (this.liveTimer !== null) this.timers.clear(this.liveTimer);
    this.liveTimer = null;
    this.session?.close();
    this.session = null;
    if (this.settingsFile.data.place) this.settingsFile.update((s) => (s.place = null));
  }

  backups(): BackupView[] {
    const s = this.session;
    if (!s || s.type === "system") return [];
    const now = this.now();
    return this.lib.listBackups(s.id).map((b) => ({ ...b, label: whenLabel(b.time, now) }));
  }

  restoreBackup(file: string): true {
    const s = this.session;
    if (!s || s.type === "system") throw new LibraryError("Open a world or module first.");
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
  codex(): CodexSection[] {
    return this.editing.codex();
  }
  refile(ids: Id[], to: CodexKey): true {
    this.editing.refile(ids, to);
    return true;
  }
  quick(id: Id): QuickView {
    return this.editing.quick(id);
  }
  makeOwnCopy(id: Id, name?: string): Id {
    return this.stepFor(this.editing.makeOwnCopy(id, name), true);
  }
  makeVariant(id: Id, name?: string): Id {
    return this.stepFor(this.editing.makeVariant(id, name), true);
  }
  printPreview(id: Id): { title: string; stats: string | null; paragraphs: string[] } {
    return this.editing.printPreview(id);
  }
  newInSection(key: CodexKey, name: string): Id {
    return this.stepFor(this.editing.newInSection(key, name), false);
  }
  encounterTree(): EncounterNode[] {
    return this.editing.encounterTree();
  }
  // ---------- The DM's table (version 2) ----------
  resetTable(id: Id): true {
    return this.editing.resetTable(id);
  }
  spreadTable(id: Id): true {
    return this.editing.spreadTable(id);
  }
  tableFrom(name: string, ids: Id[]): Id {
    return this.editing.tableFrom(name, ids);
  }
  tableView(glance: string[] = ["hp", "ac"]): TableView {
    return this.editing.tableView(glance);
  }
  beginSession(input: BeginInput): Id {
    return this.editing.beginSession(input);
  }
  setSession(change: { present?: Id[]; starred?: Id[]; encounter?: Id | null; lastTime?: string }): true {
    return this.editing.setSession(change);
  }
  wrapUp(input: { xpEach: number; to: Id[]; remove: Id[] }): true {
    return this.editing.wrapUp(input);
  }
  addLog(kind: LogLine["kind"], text: string): true {
    return this.editing.addLog(kind, text);
  }
  startFight(opts: { encounter: Id | null; hidden: boolean; groupFrom: number }): true {
    return this.editing.startFight(opts);
  }
  addToFight(being: Id, opts: { count: number; group: boolean; hidden: boolean }): Id[] {
    return this.editing.addToFight(being, opts);
  }
  addEvent(name: string, init: number, note: string): Id {
    return this.editing.addEvent(name, init, note);
  }
  nextTurn(opts: { rerollEachRound: boolean }): { round: number; fired: string[] } {
    return this.editing.nextTurn(opts);
  }
  moveInOrder(combatant: Id, before: Id | null): true {
    return this.editing.moveInOrder(combatant, before);
  }
  setCombatant(combatant: Id, change: { delayed?: boolean; hidden?: boolean; init?: number; name?: string; note?: string } | null): true {
    return this.editing.setCombatant(combatant, change);
  }
  revealAll(): true {
    return this.editing.revealAll();
  }
  clearDefeated(): true {
    return this.editing.clearDefeated();
  }
  damage(combatant: Id, member: Id | null, amount: number): string {
    return this.editing.damage(combatant, member, amount);
  }
  endFight(): true {
    return this.editing.endFight();
  }
  addCondition(targets: { combatant: Id; member: Id | null }[], c: { condition: Id; left: number | null; unit: ConditionOn["unit"]; counter: number | null; source: string }): true {
    return this.editing.addCondition(targets, c);
  }
  addCharacterCondition(character: Id, c: { condition: Id; left: number | null; unit: ConditionOn["unit"]; counter: number | null; source: string }): true {
    return this.editing.addCharacterCondition(character, c);
  }
  changeCondition(where: { character?: Id; combatant?: Id; member?: Id }, conditionId: Id, change: { counter?: number; left?: number } | null): true {
    return this.editing.changeCondition(where, conditionId, change);
  }
  addTimer(t: Omit<Timer, "id">): Id {
    return this.editing.addTimer(t);
  }
  setTimer(timer: Id, change: { paused?: boolean; left?: number; name?: string } | null): true {
    return this.editing.setTimer(timer, change);
  }
  advanceClock(minutes: number): ClockStep {
    return this.editing.advanceClock(minutes);
  }
  partyRest(kind: "short rest" | "long rest"): true {
    return this.editing.partyRest(kind);
  }
  macros(): (Macro & { words: string })[] {
    return this.editing.macros();
  }
  saveMacro(id: Id | null, input: { name: string; blocks: MacroBlock[]; against: number | null; who: Macro["who"]; see: Macro["see"] }): Id {
    return this.editing.saveMacro(id, input);
  }
  runMacro(id: Id | null, input: { blocks?: MacroBlock[]; against?: number | null }, characters: Id[], mode: "normal" | "advantage" | "disadvantage" = "normal"): MacroResult[] {
    return this.editing.runMacro(id, input, characters, mode);
  }
  journalTree(viewer: string | null = null): ReturnType<Editing["journalTree"]> {
    return this.editing.journalTree(this.journalOrder(), viewer);
  }
  pageView(id: Id): PageView {
    return this.editing.pageView(id);
  }
  mentionedIn(id: Id): { id: Id; name: string }[] {
    return this.editing.mentionedIn(id);
  }
  createPage(name: string, category: string, opts: { owner?: string | null; picture?: Id | null } = {}): Id {
    return this.editing.createPage(name, category, opts);
  }
  setPage(id: Id, change: { category?: string; priority?: number; shared?: string[]; revealed?: boolean }): true {
    return this.editing.setPage(id, change);
  }
  addBlock(id: Id, type: "text" | "image", picture: Id | null = null, at: { x: number; y: number } | null = null): Id {
    return this.editing.addBlock(id, type, picture, at);
  }
  setBlock(id: Id, block: Id, change: Partial<Omit<Block, "id" | "type">> | null): true {
    return this.editing.setBlock(id, block, change);
  }
  pageToNode(id: Id, kind: "lore" | "npc"): Id {
    return this.editing.pageToNode(id, kind);
  }
  setCalendar(cal: Value): true {
    return this.editing.setCalendar(cal);
  }
  madeSince(since: number): { id: Id; name: string; what: string }[] {
    return this.editing.madeSince(since);
  }
  private journalOrder(): { name: string; priority: number }[] {
    return this.tableMetaOf().journalCategories;
  }
  private need(): Session {
    if (!this.session) throw new LibraryError("Open a world, module or system first.");
    return this.session;
  }
  private tableMetaOf(): TableMeta {
    return tableMetaFrom(this.need().table);
  }
  /** The table's memory: chat and rolls, the screen's arrangement, bookmarks, pins, settings. */
  tableMeta(): TableMeta {
    return this.tableMetaOf();
  }
  /** Changes part of the table's memory (not the chat, which only grows through postChat). */
  setTableMeta(patch: Partial<Omit<TableMeta, "chat">>): TableMeta {
    const s = this.need();
    const next = { ...this.tableMetaOf(), ...patch };
    s.setTable(next);
    this.lan?.changed();
    return next;
  }
  /** A line in the table's chat: a message, a roll, or a note from the table. */
  postChat(line: Omit<ChatLine, "id" | "time">): ChatLine {
    const s = this.need();
    const meta = this.tableMetaOf();
    const full: ChatLine = { ...line, id: newId(), time: this.now() };
    meta.chat = [...meta.chat, full].slice(-1000);
    s.setTable(meta);
    this.opts.emit({ type: "chat", line: full });
    this.lan?.changed();
    return full;
  }
  /** The dice tray: rolls a formula and puts it in the chat ("Rob rolled 14"). */
  rollDice(input: { formula: string; mode?: "normal" | "advantage" | "disadvantage"; who: string; color: string; see: ChatLine["see"]; label?: string; from?: Id }): ChatLine {
    let r: RollResult;
    try {
      r = roll(input.formula, { mode: input.mode ?? "normal" });
    } catch (e) {
      throw new LibraryError(e instanceof Error ? e.message : String(e));
    }
    const mode = input.mode === "advantage" ? " with advantage" : input.mode === "disadvantage" ? " with disadvantage" : "";
    return this.postChat({ kind: "roll", who: input.who, color: input.color, see: input.see, to: [], text: `${input.label ? `${input.label}: ` : ""}${r.total}`, roll: { formula: r.formula + mode, total: r.total, breakdown: r.breakdown + (r.other !== null ? ` (the other roll was ${r.other})` : ""), natural: r.natural }, ic: false, ...(input.from ? { from: input.from } : {}) });
  }
  // ---------- The first time (version 2.6) ----------

  /** The welcome, tips and first steps: what this computer has seen. */
  firstTime(): { welcomed: boolean; tips: boolean; tipsSeen: string[]; stepsDone: string[]; stepsClosed: boolean; sample: { system: Id | null; world: Id | null; module: Id | null } } {
    const d = this.settingsFile.data;
    const find = <T extends { id: Id; name: string }>(list: T[], name: string) => list.find((x) => x.name === name)?.id ?? null;
    return {
      welcomed: d.welcomed,
      tips: d.tips,
      tipsSeen: d.tipsSeen,
      stepsDone: d.stepsDone,
      stepsClosed: d.stepsClosed,
      sample: { system: find(this.lib.listSystems(), SAMPLE_SYSTEM), world: find(this.lib.listWorlds(), SAMPLE_WORLD), module: find(this.lib.listModules(), SAMPLE_MODULE) },
    };
  }

  setFirstTime(patch: { welcomed?: boolean; tips?: boolean; tipSeen?: string; resetTips?: boolean; stepsClosed?: boolean }): true {
    this.settingsFile.update((s) => {
      if (patch.welcomed !== undefined) s.welcomed = !!patch.welcomed;
      if (patch.tips !== undefined) s.tips = !!patch.tips;
      if (patch.tipSeen && !s.tipsSeen.includes(patch.tipSeen)) s.tipsSeen = [...s.tipsSeen, patch.tipSeen];
      if (patch.resetTips) s.tipsSeen = [];
      if (patch.stepsClosed !== undefined) s.stepsClosed = !!patch.stepsClosed;
    });
    return true;
  }

  /** The sample valley: made fresh if it isn't on the shelves (Help brings it back). */
  makeSample(): { system: Id; world: Id; module: Id } {
    const have = this.firstTime().sample;
    if (have.system && have.world && have.module) return { system: have.system, world: have.world, module: have.module };
    return makeSample(this);
  }

  /** A first step ticks itself off ("Make your first monster"). */
  private step(key: string) {
    const d = this.settingsFile.data;
    if (d.stepsClosed || d.stepsDone.includes(key)) return;
    this.settingsFile.update((s) => (s.stepsDone = [...s.stepsDone, key]));
  }
  private stepFor(id: Id, copied: boolean): Id {
    try {
      const s = this.session;
      const r = s ? s.ws.resolve(s.id, id) : null;
      if (r?.record.kind === "being" && r.fields.beingKind === "monster") this.step("monster");
      if (copied && r?.record.kind === "item") this.step("weapon");
    } catch {
      // Ticking a step never gets in the way.
    }
    return id;
  }

  // ---------- Players join (version 2.5) ----------

  private lan: LanServer | null = null;
  private doorWatch: (() => void) | null = null;
  private onlineNow = new Set<Id>();

  private people(): Person[] {
    return this.tableMetaOf().people;
  }
  private setPeople(people: Person[]) {
    this.setTableMeta({ people });
  }
  private personOf(id: Id): Person {
    const p = this.people().find((x) => x.id === id);
    if (!p) throw new LibraryError("That player isn't in the party any more.");
    return p;
  }

  /** The door for players: open or closed, the addresses, PINs and who is connected. */
  players(): PlayersView {
    const meta = this.tableMetaOf();
    const addresses = this.lan ? lanAddresses().map((a) => `http://${a}:${this.lan!.port}`) : [];
    return { open: !!this.lan, port: this.lan?.port ?? DEFAULT_PORT, addresses, online: [...this.onlineNow], people: meta.people, templates: meta.templates, qr: addresses[0] ? qrSvg(addresses[0], 220) : null };
  }

  /** Opens the door: players on the same Wi-Fi can join with their PINs. */
  async openTable(port?: number): Promise<PlayersView> {
    const s = this.need();
    if (s.type === "system") throw new LibraryError("Players join a world or a module, not a system.");
    if (!this.lan) {
      const lan = new LanServer({
        who: (pin) => {
          if (!this.session) return null;
          const p = personByPin(this.tableMetaOf(), pin);
          return p ? { id: p.id, name: p.name } : null;
        },
        state: (id) => this.playerStateOf(this.personOf(id)),
        act: (id, action) => this.playerAct(id, action),
        picture: (id) => this.picture(id),
        file: (name) => this.opts.playerFile?.(name) ?? null,
        presence: (online) => {
          this.onlineNow = new Set(online);
          this.opts.emit({ type: "players", online });
        },
      }, this.now);
      await lan.start(port ?? DEFAULT_PORT);
      this.lan = lan;
    }
    return this.players();
  }

  /** Closes the door; players' screens say the table has closed. */
  async closeTable(): Promise<true> {
    const lan = this.lan;
    this.lan = null;
    this.onlineNow.clear();
    if (lan) await lan.stop();
    return true;
  }

  addPerson(name: string, character: Id | null = null): Person {
    const meta = this.tableMetaOf();
    const p = makePerson(meta, name, character);
    this.setPeople([...meta.people, p]);
    return p;
  }

  setPerson(id: Id, change: { name?: string; character?: Id | null; level?: Level; grid?: Partial<Record<Part, Access>>; color?: string }): Person {
    const p = { ...this.personOf(id) };
    if (change.name !== undefined) p.name = change.name.trim() || p.name;
    if (change.character !== undefined) p.character = change.character;
    if (change.level !== undefined && LEVELS[change.level]) p.level = change.level;
    if (change.grid !== undefined) p.grid = { ...change.grid };
    if (change.color !== undefined) p.color = change.color;
    this.setPeople(this.people().map((x) => (x.id === id ? p : x)));
    return p;
  }

  removePerson(id: Id): true {
    this.lan?.kick(id);
    this.setPeople(this.people().filter((x) => x.id !== id));
    return true;
  }

  /** A new PIN: the old one stops working at once. */
  rerollPin(id: Id): string {
    const meta = this.tableMetaOf();
    const pin = newPin(meta.people.map((x) => x.pin));
    this.setPeople(meta.people.map((x) => (x.id === id ? { ...x, pin } : x)));
    this.lan?.kick(id);
    return pin;
  }

  /** No PIN: this person can't join until given a new one. */
  revokePin(id: Id): true {
    this.setPeople(this.people().map((x) => (x.id === id ? { ...x, pin: "" } : x)));
    this.lan?.kick(id);
    return true;
  }

  /** Saves a person template (one person's level and exceptions) or a table template (everyone's). */
  saveTemplate(name: string, kind: "person" | "table", personId?: Id): PermissionTemplate[] {
    const n = cleanName(name);
    const meta = this.tableMetaOf();
    let t: PermissionTemplate;
    if (kind === "person") {
      const p = this.personOf(personId ?? "");
      t = { name: n, kind, level: p.level, grid: { ...p.grid } };
    } else t = { name: n, kind, people: meta.people.map((p) => ({ name: p.name, level: p.level, grid: { ...p.grid } })) };
    const templates = [...meta.templates.filter((x) => !(x.name === n && x.kind === kind)), t];
    this.setTableMeta({ templates });
    return templates;
  }

  deleteTemplate(name: string, kind: "person" | "table"): PermissionTemplate[] {
    const templates = this.tableMetaOf().templates.filter((x) => !(x.name === name && x.kind === kind));
    this.setTableMeta({ templates });
    return templates;
  }

  /** A person template for one person, or a table template for the whole party, in one click. */
  useTemplate(name: string, kind: "person" | "table", personId?: Id): Person[] {
    const meta = this.tableMetaOf();
    const t = meta.templates.find((x) => x.name === name && x.kind === kind);
    if (!t) throw new LibraryError("That template isn't there any more.");
    const people = applyPermissionTemplate(meta.people, t, personId);
    this.setPeople(people);
    return people;
  }

  /** Show to players: pops up on the screens of the people picked (everyone if none) and stays in their journal. */
  showToPlayers(node: Id, to: Id[] = []): true {
    const s = this.need();
    const n = s.ws.get(s.id, node);
    if (!n) throw new LibraryError("That isn't here any more.");
    const meta = this.tableMetaOf();
    const shown = [...meta.shown.filter((x) => !(x.node === node && sameSet(x.to, to))), { id: newId(), node, to: [...to], time: this.now() }];
    this.setTableMeta({ shown });
    const names = to.length ? to.map((id) => meta.people.find((p) => p.id === id)?.name ?? "someone").join(", ") : "everyone";
    try {
      this.editing.addLog("shown", `Showed ${n.name} to ${names}.`);
    } catch {
      // No session tonight: showing still works, it just isn't logged.
    }
    this.lan?.signal("shown", { node }, to.length ? to : null);
    return true;
  }

  /** Takes a shown thing back out of players' journals. */
  forgetShown(id: Id): true {
    this.setTableMeta({ shown: this.tableMetaOf().shown.filter((x) => x.id !== id) });
    return true;
  }

  /** Puts a map live on players' screens (null takes it off). */
  showMapLive(map: Id | null, to: Id[] = []): true {
    const meta = this.tableMetaOf();
    this.setTableMeta({ live: { map, to: map ? [...to] : [], marks: map === meta.live.map ? meta.live.marks : [] } });
    if (map) {
      const n = this.need().ws.get(this.need().id, map);
      try {
        this.editing.addLog("shown", `Showed the map ${n?.name ?? ""} to ${to.length ? to.map((id) => meta.people.find((p) => p.id === id)?.name ?? "someone").join(", ") : "everyone"}.`);
      } catch {
        // No session tonight.
      }
    }
    return true;
  }

  /** The table marks over the live map (never the map itself). */
  setLiveMarks(marks: unknown[]): true {
    const meta = this.tableMetaOf();
    this.setTableMeta({ live: { ...meta.live, marks: Array.isArray(marks) ? marks.slice(-500) : [] } });
    return true;
  }

  /** A pulse on the live map where the DM clicked. */
  pointAt(x: number, y: number, color = "#b93a2e"): true {
    const live = this.tableMetaOf().live;
    this.lan?.signal("point", { x, y, color, who: "DM" }, live.to.length ? live.to : null);
    return true;
  }

  /** A QR code picture for any text (a player's own join link, say). */
  qrCode(text: string): string {
    return qrSvg(String(text ?? "").slice(0, 200), 220);
  }

  /** What one player's screen shows (for the DM to check, and for the player page). */
  playerPreview(id: Id): PlayerState {
    return this.playerStateOf(this.personOf(id));
  }

  private shownContent(id: Id): Omit<ShownView, "id" | "node" | "time"> | null {
    const s = this.session;
    if (!s) return null;
    const n = s.ws.get(s.id, id);
    if (!n) return null;
    if (n.kind === "journal") {
      const blocks = blocksOf(s.ws.resolve(s.id, id)!.fields.blocks);
      return { title: n.name, kind: "journal", stats: null, paragraphs: blocks.filter((b) => b.type === "text" && b.text.trim()).flatMap((b) => b.text.split(/\n{2,}/)), picture: blocks.find((b) => b.type === "image" && b.picture)?.picture ?? n.picture };
    }
    if (n.kind === "map") return { title: n.name, kind: "map", stats: null, paragraphs: [], picture: n.picture };
    try {
      const p = this.editing.printPreview(id);
      return { title: p.title, kind: n.kind, stats: p.stats, paragraphs: p.paragraphs, picture: n.picture };
    } catch {
      return { title: n.name, kind: n.kind, stats: null, paragraphs: n.text ? n.text.split(/\n{2,}/) : [], picture: n.picture };
    }
  }

  /** A map as a player may see it: the DM-only layer and the DM's notes left out. */
  playerMap(id: Id): MapView | null {
    try {
      const v = this.editing.mapView(id);
      return { ...v, text: "", shapes: v.shapes.filter((x) => x.layer !== "dm"), readOnly: true };
    } catch {
      return null;
    }
  }

  private playerStateOf(p: Person): PlayerState & { mapView: MapView | null; shownMaps: Record<Id, MapView> } {
    const s = this.need();
    const meta = this.tableMetaOf();
    const glance = (meta.settings.initiative?.glance as string[] | undefined) ?? ["hp", "ac"];
    const ed = this.editing;
    const st = playerState(
      {
        table: ed.tableView(glance),
        meta,
        place: s.name,
        character: (id) => {
          try {
            return ed.characterView(id);
          } catch {
            return null;
          }
        },
        content: (id) => this.shownContent(id),
        tables: () => ed.codex().find((c) => c.key === "tables")?.entries.map((e) => ({ id: e.id, name: e.name })) ?? [],
        online: this.onlineNow,
      },
      p,
    );
    const shownMaps: Record<Id, MapView> = {};
    for (const x of st.shown) if (x.kind === "map") {
      const m = this.playerMap(x.node);
      if (m) shownMaps[x.node] = m;
    }
    return { ...st, mapView: st.map ? this.playerMap(st.map.id) : null, shownMaps };
  }

  /** Something a player did, checked against their permissions first. */
  private playerAct(personId: Id, raw: unknown): unknown {
    const s = this.need();
    const p = this.personOf(personId);
    const a = (raw && typeof raw === "object" ? raw : {}) as PlayerAction;
    const meta = this.tableMetaOf();
    const ed = this.editing;
    if (a.type === "lookup") {
      const why = refuse(meta, p, a, { myTurn: false, isShownToMe: () => false });
      if (why) throw new LibraryError(why);
      const words = String(a.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      if (!words.length) return [];
      return ed
        .tableMode()
        .tabs.flatMap((t) => t.entries)
        .filter((e) => words.every((w) => [e.title, e.stats ?? "", ...e.paragraphs].join(" ").toLowerCase().includes(w)))
        .slice(0, 20)
        .map((e) => ({ title: e.title, group: e.group, stats: e.stats, paragraphs: e.paragraphs }));
    }
    const st = this.playerStateOf(p);
    const why = refuse(meta, p, a, { myTurn: st.initiative?.myTurn ?? false, isShownToMe: (node) => st.shown.some((x) => x.node === node) });
    if (why) throw new LibraryError(why);
    const charName = p.character ? (s.ws.get(s.id, p.character)?.name ?? null) : null;
    let out: unknown = true;
    switch (a.type) {
      case "chat": {
        const to = (a.to ?? []).filter((x) => typeof x === "string" && x.trim());
        out = this.postChat({ kind: to.length ? "whisper" : "chat", who: a.ic && charName ? charName : p.name, color: p.color, see: "public", to, text: String(a.text).trim().slice(0, 2000), roll: null, ic: !!a.ic, from: p.id });
        break;
      }
      case "roll": {
        const see = a.see === "dm" || a.see === "blind" || a.see === "private" ? a.see : "public";
        out = this.rollDice({ formula: String(a.formula).slice(0, 100), mode: a.mode, who: p.name, color: p.color, see, label: a.label ? String(a.label).slice(0, 60) : undefined, from: p.id });
        break;
      }
      case "endTurn":
        out = ed.nextTurn({ rerollEachRound: meta.settings.initiative?.reroll === true });
        break;
      case "hp":
        if (!Number.isFinite(a.value)) throw new LibraryError("That isn't a number.");
        ed.setField(p.character!, "hpNow", Math.round(a.value));
        break;
      case "tracker":
        ed.setTracker(p.character!, a.tracker, { value: Math.max(0, Math.round(Number(a.value) || 0)) });
        break;
      case "notes":
        this.setPeople(meta.people.map((x) => (x.id === p.id ? { ...x, notes: String(a.text ?? "").slice(0, 100000) } : x)));
        break;
      case "point": {
        const live = meta.live;
        this.lan?.signal("point", { x: Number(a.x), y: Number(a.y), color: p.color, who: p.name }, live.to.length ? live.to : null);
        this.opts.emit({ type: "point", x: Number(a.x), y: Number(a.y), color: p.color, who: p.name });
        break;
      }
      case "rollTable": {
        const r = ed.rollTable(a.table);
        const name = s.ws.get(s.id, a.table)?.name ?? "a table";
        out = this.postChat({ kind: "roll", who: p.name, color: p.color, see: "public", to: [], text: `${name}: ${r.chain || r.text}`, roll: null, ic: false, from: p.id });
        break;
      }
      case "show":
        this.showToPlayers(a.node, a.to ?? []);
        break;
    }
    this.opts.emit({ type: "table" });
    this.lan?.changed();
    return out;
  }

  // ---------- Maps (version 2) ----------
  mapTree(): MapTreeNode[] {
    return this.editing.mapTree();
  }
  mapView(id: Id): MapView {
    return this.editing.mapView(id);
  }
  mapsShowing(id: Id): { id: Id; name: string }[] {
    return this.editing.mapsShowing(id);
  }
  /** A new map from a picture (sized to it) or blank. */
  createMap(input: { name: string; picture: Id | null }): Id {
    const bytes = input.picture ? this.picture(input.picture) : null;
    const dim = bytes ? pictureSize(bytes) : null;
    return this.editing.createMap(input.name, input.picture, dim && dim.w && dim.h ? { width: dim.w, height: dim.h } : null);
  }
  addPins(mapId: Id, targets: (Id | null)[], x: number, y: number, look: { color?: string; symbol?: string; label?: string } = {}): Id[] {
    return this.editing.addPins(mapId, targets, x, y, look);
  }
  movePins(mapId: Id, moves: { id: Id; x: number; y: number }[]): true {
    return this.editing.movePins(mapId, moves);
  }
  editPins(mapId: Id, ids: Id[], change: { label?: string; color?: string; symbol?: string; link?: Id | null }): true {
    return this.editing.editPins(mapId, ids, change);
  }
  deletePins(mapId: Id, ids: Id[]): true {
    return this.editing.deletePins(mapId, ids);
  }
  copyPins(mapId: Id, ids: Id[], connected: boolean): Id[] {
    return this.editing.copyPins(mapId, ids, connected);
  }
  addShape(mapId: Id, shape: Omit<Shape, "id">): Id {
    return this.editing.addShape(mapId, shape);
  }
  deleteShapes(mapId: Id, ids: Id[]): true {
    return this.editing.deleteShapes(mapId, ids);
  }
  fillShape(mapId: Id, id: Id, fill: string | null, texture: string | null): true {
    return this.editing.fillShape(mapId, id, fill, texture);
  }
  setMapSettings(mapId: Id, change: { width?: number; height?: number; background?: string; grid?: Partial<Grid> }): true {
    return this.editing.setMapSettings(mapId, change);
  }
  /** A picture as a data address, so the window can draw it into an exported image. */
  pictureData(id: Id): string | null {
    const bytes = this.picture(id);
    if (!bytes) return null;
    const ext = extname(id).toLowerCase().replace(".", "");
    const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : "image/png";
    return `data:${mime};base64,${bytes.toString("base64")}`;
  }
  /**
   * Saves pictures the window drew (a map, print-shop sheets) as a PNG, or as a PDF with one
   * picture per page (JPEGs). Resolves to where it went, or null if cancelled.
   */
  async exportImage(input: { name: string; kind: "png" | "pdf"; images: string[]; pageSize?: "Letter" | "A4" }, dest?: string): Promise<string | null> {
    const file = `${input.name}.${input.kind}`.replace(/[\\/:*?"<>|]+/g, " ");
    const path = dest ?? (this.opts.pickFile ? await this.opts.pickFile(file, input.kind) : null);
    if (!path) return null;
    const bytes = input.images.map((d) => Buffer.from(d.replace(/^data:[^,]*,/, ""), "base64"));
    if (!bytes.length) throw new LibraryError("There's nothing to save.");
    writeFileSync(path, input.kind === "pdf" ? imagesPdf(bytes, input.pageSize === "A4" ? "A4" : "Letter") : bytes[0]!);
    return path;
  }
  // ---------- Characters (version 2) ----------
  builderOptions(): BuilderOptions {
    return this.editing.builderOptions();
  }
  makeItForMe(): CharacterInput {
    return this.editing.makeItForMe();
  }
  roster(): RosterEntry[] {
    return this.editing.roster();
  }
  characterView(id: Id): CharacterView {
    return this.editing.characterView(id);
  }
  createCharacter(input: CharacterInput): Id {
    return this.editing.createCharacter(input);
  }
  setAppearance(id: Id, key: string, value: string): true {
    return this.editing.setAppearance(id, key, value);
  }
  addExtra(id: Id, section: string, label: string): true {
    return this.editing.addExtra(id, section, label);
  }
  setExtra(id: Id, index: number, change: { label?: string; value?: string } | null): true {
    return this.editing.setExtra(id, index, change);
  }
  addTracker(id: Id, t: { name: string; max: number; look: string; refill: string }): Id {
    return this.editing.addTracker(id, t);
  }
  setTracker(id: Id, trackerId: Id, change: { value?: number; max?: number; name?: string } | null): true {
    return this.editing.setTracker(id, trackerId, change);
  }
  award(id: Id, trackerId: Id): boolean {
    return this.editing.award(id, trackerId);
  }
  rest(id: Id, kind: "short rest" | "long rest"): true {
    return this.editing.rest(id, kind);
  }
  levelUpPreview(id: Id): ReturnType<Editing["levelUpPreview"]> {
    return this.editing.levelUpPreview(id);
  }
  levelUp(id: Id, hpGain: number | null, picks: Record<Id, Id[]> = {}): true {
    return this.editing.levelUp(id, hpGain, picks);
  }
  setChoice(id: Id, aid: Id, picked: Id[]): true {
    return this.editing.setChoice(id, aid, picked);
  }
  /** Rolled ability scores, shown die by die in the builder. */
  rollScores(method: "roll4d6" | "roll3d6", count: number): { score: number; breakdown: string }[] {
    return rollScores(method, Math.max(1, Math.min(20, Math.round(count) || 6)));
  }
  modulePage(): Id | null {
    return this.editing.modulePage();
  }
  addEncounter(name: string, inside: Id | null = null): Id {
    return this.editing.addEncounter(name, inside);
  }
  moveEncounters(ids: Id[], inside: Id | null, before: Id | null = null): true {
    this.editing.moveEncounters(ids, inside, before);
    return true;
  }
  deleteEncounter(id: Id): StepResult {
    return this.editing.deleteEncounter(id);
  }
  addToEncounter(id: Id, ids: Id[], count = 1): { label: string } {
    return this.editing.addToEncounter(id, ids, count);
  }
  placeEncounter(sourceId: Id, inside: Id | null = null): Id {
    return this.editing.placeEncounter(sourceId, inside);
  }
  saveEncounterToCodex(id: Id): Id {
    return this.editing.saveEncounterToCodex(id);
  }
  addChoice(nodeId: Id, input: { label: string; pick: number; options: Id[] }): Id {
    return this.editing.addChoice(nodeId, input);
  }
  addChoiceOptions(nodeId: Id, aid: Id, ids: Id[]): true {
    this.editing.addChoiceOptions(nodeId, aid, ids);
    return true;
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
    return this.stepFor(this.editing.addBeing(input), false);
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
  /** The search box in the top bar. */
  search(query: string): { hits: SearchHit[]; total: number } {
    if (!this.session) throw new LibraryError("Open a world or system first.");
    return search(this.session.ws, this.session.id, String(query ?? ""));
  }
  attachAtLevel(classId: Id, bricks: Id[], level: number): StepResult {
    return this.editing.attachAtLevel(classId, bricks, level);
  }
  setFeatureLevel(classId: Id, aid: Id, level: number | null): StepResult {
    return this.editing.setFeatureLevel(classId, aid, level);
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
  saveBookLayout(name: string, request: BookRequest): Id {
    return this.editing.saveBookLayout(name, request);
  }
  bookLayouts(): { id: Id; name: string; request: BookRequest }[] {
    return this.editing.bookLayouts();
  }
  /** Everything a book could hold, for the book designer's tick list. */
  bookContents(opts: BookRequest) {
    return this.editing.bookContents(opts);
  }
  sheetLayouts() {
    return this.editing.sheetLayouts();
  }
  sheetDesign(id: Id) {
    return this.editing.sheetDesign(id);
  }
  setSheetLayout(id: Id, layout: SheetLayout | null) {
    this.editing.setSheetLayout(id, layout);
  }
  useSheetLayout(id: Id, layoutId: Id | null) {
    this.editing.useSheetLayout(id, layoutId);
  }
  saveSheetLayout(name: string, layout: SheetLayout, makeDefault: boolean): Id {
    return this.editing.saveSheetLayout(name, layout, makeDefault);
  }
  /** Everything the print shop could print, grouped like the rulebook's chapters. */
  shopChoices() {
    return this.editing.shopChoices();
  }
  book(opts: BookRequest): BookData {
    const data = this.editing.book(opts);
    this.step("print");
    return data;
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
    const types: { id: string; title: string; chapters: string[] }[] = Object.entries(BOOK_TITLES).map(([id, title]) => ({ id, title, chapters: BOOK_CHAPTERS[id as keyof typeof BOOK_CHAPTERS] }));
    // A module prints its adventure booklet first; the rulebooks of its world and system are still there.
    if (this.session?.type === "module") types.unshift({ id: "adventure", title: "Adventure booklet", chapters: [] });
    return {
      types,
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
  rollTable(id: Id): ReturnType<Editing["rollTable"]> {
    const r = this.editing.rollTable(id);
    this.step("roll");
    return r;
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

  /** When each place was last open before this time, for "what changed since you were here" (kept in memory only). */
  private since = new Map<Id, number>();
  private glanced = new Set<Id>();

  /** What changed in the open place since it was last open, in plain words; null when nothing did or it was dismissed. */
  changelog(): Changelog | null {
    const id = this.session?.id;
    if (!id || this.glanced.has(id)) return null;
    const h = this.editing.history();
    return summarize(h.done, this.since.get(id) ?? null);
  }

  /** Hides the changelog until the next time the place is opened. */
  dismissChangelog(): true {
    if (this.session) this.glanced.add(this.session.id);
    return true;
  }

  setTimerPaused(paused: boolean): true {
    return this.editing.setTimerPaused(paused);
  }

  private markOpened(id: Id, place: Place | null = null) {
    const before = this.settingsFile.data.opened[id];
    if (before !== undefined) this.since.set(id, before);
    else this.since.delete(id);
    this.glanced.delete(id);
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

const sameSet = (a: Id[], b: Id[]) => a.length === b.length && a.every((x) => b.includes(x));
