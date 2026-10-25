// The named actions for changing an open world or system: add, rename, change a value, delete,
// undo and redo. Each one is a single step in history. The window and, later, the AI change
// things only through these.

import { cardLines, squaresFor } from "./printshop.ts";
import { defaultLayout, normalizeLayout, paperSheet, sheetGroups } from "./sheetdesign.ts";
import type { PaperSheet, SheetGroup, SheetLayout } from "./sheetdesign.ts";
import type { Piece, PieceKind, PrintShop } from "./printshop.ts";
import { F, levelKey, pointBuyOf, pointsSpent } from "../engine/index.ts";
import type { Spent } from "../engine/index.ts";
import { BOOK_CHAPTERS, CHAPTER_TITLES, bookEntry, isCoreCheck, DEFAULT_CHECKS, EngineError, buildBook, findAttachment, findLinks, link, redFlags, worldRuleFlags, yellowFlags } from "../engine/index.ts";
import type { Book, BookType, ChapterId, CheckCategory, CheckSettings, Sensitivity } from "../engine/index.ts";

const BOOK_TYPES = Object.keys(BOOK_CHAPTERS) as BookType[];
import type { Activation, Id, NodeKind, NodeRecord, Uses, Value, Workspace } from "../engine/index.ts";
import { LibraryError } from "../storage/index.ts";
import { createRuleNode, createSection, ensureSections, ruleSummary, rulesTab, sectionOf } from "./rules.ts";
import type { RulesSection, SectionKey } from "./rules.ts";
import type { Session } from "./session.ts";
import { beingsList, categoryTree, copyNode, createBeing, createCategory, createItem, detach, itemsList, scoreKey, scoresOf, scoreValue, setTemplate, sheetFor, templatesList } from "./sheets.ts";
import type { BeingKind, CategoryOption, ListEntry, SheetDef, SourceFilter, TemplateEntry } from "./sheets.ts";
import { attachMany, attachmentsOf, brickNote, createBrick, dropNeedsAnswers, librarySections } from "./library.ts";
import type { AttachmentView, BrickType, LibrarySection } from "./library.ts";
import { attachInside, attachmentDetail, changeParent, editAttachment, familyChecklist } from "./drill.ts";
import type { AttachmentDetail, AttachmentPatch, FamilyRow } from "./drill.ts";
import { createLore, loreList, markUsed, rollTable, rowsValue, tableFromList, tableRows, weightedRanges } from "./lore.ts";
import { tableModeView } from "./tablemode.ts";
import { STANDARD_CORE_TEXT } from "./codex-lists.ts";
import { buildAdventureBook } from "./adventure-book.ts";
import { addCondition, addConditionToCharacter, addEvent, addLog, addTimer, addToFight, advanceClock, beginSession, changeCondition, clearDefeated, damage, endFight, moveInOrder, nextTurn, openSession, revealAll, rollChain, sessionOf, setCombatant, setSession, setTimer, setTimerPaused, startFight, tableView, wrapUp } from "./table.ts";
import type { BeginInput, ClockStep, ConditionOn, LogLine, TableView, Timer } from "./table.ts";
import { blocksValue, macroOf, macroWords, runMacro } from "./macros.ts";
import type { Macro, MacroBlock, MacroResult } from "./macros.ts";
import { addBlock, createPage, diary, journalTree, mentionedIn, pageToNode, pageView, setBlock, setPage } from "./journal.ts";
import type { Block, PageView } from "./journal.ts";
import { rest as restCharacter } from "./characters.ts";
import { addPins, addShape, copyPins, createMap, deletePins, deleteShapes, editPins, fillShape, mapTree, mapView, mapsShowing, movePins, setMapSettings } from "./maps.ts";
import type { Grid, MapTreeNode, MapView, Shape } from "./maps.ts";
import { addExtra, addTracker, award, builderOptions, characterView, createCharacter, levelUp, levelUpPreview, makeItForMe, rest, roster, setAppearance, setChoice, setExtra, setTracker } from "./characters.ts";
import type { BuilderOptions, CharacterInput, CharacterView } from "./characters.ts";
import type { EncounterNumbering } from "./adventure-book.ts";
import { addToEncounter, createEncounter, deleteEncounter, encounterTree, moveEncounters, placeEncounter, saveEncounterToCodex } from "./encounters.ts";
import type { EncounterNode } from "./encounters.ts";
import { CODEX_SECTIONS, addChoice, addChoiceOptions, codexSections, makeOwnCopy, makeVariant, moveToSection as moveCodex, newInSection, quickView } from "./codex.ts";
import type { CodexKey, CodexSection, QuickView } from "./codex.ts";
import { attachAtLevel, isClass, levelTable, setFeatureLevel } from "./levels.ts";
import type { LevelTable } from "./levels.ts";
import type { TableModeView } from "./tablemode.ts";
import { buildQuickStart } from "./quickstart.ts";
import type { QuickStartAnswers } from "./quickstart.ts";
import type { LoreSection } from "./lore.ts";
import { aiBlocks, describeSlot, fixMissing, liveFlags, meantThat, missingDetail, panelView, readPanel, tidy } from "./flagpanel.ts";
import type { FlagPanelView, MissingDetail, PanelState } from "./flagpanel.ts";
import { newId } from "../engine/index.ts";
import type { Slot } from "../engine/index.ts";

export interface Option {
  id: Id;
  name: string;
  label: string | null;
  /** For abilities: how a score becomes a bonus ("d20", "score", "table", "none"). */
  bonus?: string;
}

export interface NodeView {
  id: Id;
  kind: NodeKind;
  name: string;
  text: string;
  sectionKey: string | null;
  sectionTitle: string | null;
  fields: Record<string, Value>;
  /** In a world: what this world changed from its system (pencil marks). Keys of fields, plus "name" and "text". */
  changedHere: string[];
  /** True if the node comes from the system (or a parent system) rather than this layer. */
  fromBelow: boolean;
  /** The name of every node this one links to; null for a link to something that is gone. */
  names: Record<Id, string | null>;
  /** For links to something that is gone: its name from the recycle bin, for "[missing: Constitution]". */
  missing: Record<Id, string>;
  /** Worked out from links, never stored. */
  usedBy: { id: Id; name: string }[];
  summary: string;
  readOnly: boolean;
  picture: Id | null;
  favourite: boolean;
  /** A template parent: not a real thing, just the shared parts its children inherit. */
  template: boolean;
  /** "mine" (homemade), "template" (from a starter) or "others" (imported), and its maker's name. */
  source: "mine" | "template" | "others";
  author: string | null;
  categoryId: Id | null;
  /** The node this is a variant of. */
  parent: { id: Id; name: string } | null;
  /** True if it is a variant of something that is gone. */
  parentMissing: boolean;
  /** For a variant: the fields it set for itself (pencil marks); the rest come from its parent. */
  own: string[];
  /** How many variants it has. */
  variants: number;
  /** The sheet for beings and items, from the system. */
  sheet: SheetDef | null;
  scores: { ability: Id; score: number }[];
  /** The bricks on a sheet, own first, then inherited ones. */
  attachments: AttachmentView[];
  /** For classes: the level table. */
  levels: LevelTable | null;
  /** For characters, when the system has point buy: the points spent. */
  pointBuy: (Spent & { rule: string }) | null;
}

export interface Choices {
  abilities: Option[];
  conditions: Option[];
  resources: Option[];
}

export interface FlagView {
  color: "red" | "yellow";
  title: string;
  detail: string;
  nodes: Id[];
}

export interface StepResult {
  label: string;
}

export interface HistoryStep {
  id: Id;
  label: string;
  by: "user" | "ai";
  time: number;
  /** The things it changed, by name (links that point at nothing aren't counted). */
  things: { id: Id; name: string }[];
  /** For a removal: how many things used what was removed ("Removed Strength, 214 things affected"). */
  affected: number;
}

export interface HistoryView {
  /** Newest first. The first one is where the world is now. */
  done: HistoryStep[];
  /** Steps that were undone and can be redone, the next one to redo last. */
  undone: HistoryStep[];
}

export interface SheetDesign {
  groups: SheetGroup[];
  layout: SheetLayout;
  /** Where the layout in force comes from: the character's own, one picked from the Codex, the system's, or the plain default. */
  source: { kind: "own" | "codex" | "system" | "default"; name: string | null };
}

export interface BookRequest {
  /** "adventure" is a module's booklet: its encounters in order, with appendices. "diary" is the
   * campaign diary from the journal; "handout" prints one journal page. */
  type: BookType | "adventure" | "diary" | "handout" | "printshop" | "sheet";
  /** A character's sheet on paper: which character, and a layout to try before it is kept. */
  character?: Id;
  sheetLayout?: SheetLayout;
  /** The print shop: which pieces, of what (with how many of each), and the square size. */
  pieces?: { kind: PieceKind; items: { id: Id; count: number }[]; inch?: number };
  /** Handouts: the journal page, and its look. */
  page?: Id;
  handout?: { style: string; seal: boolean; hand: boolean };
  /** Diary: put the DM's own pages in too (left out unless ticked). */
  diaryDmPages?: boolean;
  /** Adventure booklets: encounter numbers in full (2.1.3), top level only, or off. */
  encounterNumbers?: EncounterNumbering;
  /** Chapters to include, in order; leave out for the book type's usual chapters. */
  chapters?: ChapterId[];
  variants?: "differences" | "full";
  monstersByChallenge?: boolean;
  /** "Created by" line; leave empty for none. */
  author?: string | null;
  pageSize?: "Letter" | "A4";
  /** The book designer (version 2.6): things left out of this book, by id (new things go in). */
  leaveOut?: Id[];
  /** Front pages left out (journal pages in the "Front pages" category go in by priority). */
  frontOff?: Id[];
  /** The plain cover with the title; off when a front page is the cover. */
  plainCover?: boolean;
  /** Print the contents and the index (both on unless untucked). */
  contents?: boolean;
  index?: boolean;
}

/** The journal category whose pages become a book's front pages. */
export const FRONT_PAGES = "Front pages";

export interface BookData {
  book: Book;
  /** A single journal page printed as a handout (version 2), drawn from its blocks. */
  handout?: { title: string; style: string; seal: boolean; hand: boolean; blocks: Block[] };
  /** The print shop's paper pieces. */
  printshop?: PrintShop;
  /** A character's sheet, laid out in groups. */
  sheet?: PaperSheet;
  /** Front pages built from blocks, in priority order (cover, credits, foreword...). */
  front?: { title: string; blocks: Block[] }[];
  plainCover?: boolean;
  contents?: boolean;
  /** Names of everything the entries mention, for "see Poisoned, page 42". */
  names: Record<Id, string>;
  pageSize: "Letter" | "A4";
}

export interface BinView {
  binId: Id;
  nodeId: Id;
  name: string;
  kind: NodeKind;
  deleted: number;
  /** How many things used it when it was deleted. */
  usedBy: number;
  /** False if it was deleted from the system while this world was not open. */
  here: boolean;
}

export interface RestoreResult {
  label: string;
  nodeId: Id;
  name: string;
  /** Links moved elsewhere since it was deleted; changedSince marks ones changed again after that. */
  reconnect: { slot: Slot; nodeName: string; where: string; nowUses: string | null; changedSince: boolean }[];
}

export class Editing {
  private readonly session: Session;
  constructor(session: Session) {
    this.session = session;
  }

  private get ws(): Workspace {
    return this.session.ws;
  }

  private get layer(): Id {
    return this.session.id;
  }

  private writable() {
    if (this.session.readOnly) throw new LibraryError(`${this.session.readOnlyReason ?? "This is read-only."} Nothing can be changed here.`);
  }

  private must(id: Id) {
    const n = this.ws.get(this.layer, id);
    if (!n) throw new LibraryError("That isn't here any more. It may be in the recycle bin.");
    return n;
  }

  /**
   * Runs an engine action, turning its errors into plain messages. Red flags that clear on their
   * own because of it get one blue notice ("1 flag cleared by Restored Strength"); a deliberate
   * fix logs its own green block instead.
   */
  private run<T>(fn: () => T, opts: { fix?: boolean } = {}): T {
    this.writable();
    const before = new Map(liveFlags(this.ws, this.layer, true).map((f) => [f.key, f]));
    const steps = this.ws.history.length;
    let out: T;
    try {
      out = fn();
    } catch (e) {
      if (e instanceof EngineError || e instanceof LibraryError || e instanceof Error) throw new LibraryError(e.message);
      throw e;
    }
    if (!opts.fix && before.size) {
      const now = new Set(liveFlags(this.ws, this.layer, true).map((f) => f.key));
      const cleared = [...before.values()].filter((f) => !now.has(f.key));
      if (cleared.length) {
        const step = this.ws.history.length > steps ? this.ws.history.at(-1) : null;
        const why = step ? ` by "${step.label}"` : "";
        this.log("blue", `${cleared.length} flag${cleared.length === 1 ? "" : "s"} cleared${why}: ${cleared.map((f) => f.title).join("; ")}`, cleared.flatMap((f) => f.nodes.map((n) => n.id)), null);
      }
    }
    return out;
  }

  // ---------- The flag panel ----------

  private get panel(): PanelState {
    return readPanel(this.session.flagPanel);
  }

  private setPanel(state: PanelState) {
    this.session.setFlagPanel(tidy(this.ws, this.layer, state, this.ws.now()));
  }

  private log(color: "blue" | "green", title: string, nodes: Id[], stepId: string | null) {
    const p = this.panel;
    p.log.push({ id: newId(), color, title, time: this.ws.now(), stepId, nodes: [...new Set(nodes)] });
    this.setPanel(p);
  }

  flagPanel(): FlagPanelView {
    return panelView(this.ws, this.layer, this.panel, this.ws.now());
  }

  missingDetail(key: string): MissingDetail {
    try {
      return missingDetail(this.ws, this.layer, key);
    } catch (e) {
      throw new LibraryError(e instanceof Error ? e.message : String(e));
    }
  }

  /** Fix by hand: point the ticked links at something else, or remove them. Turns green. */
  fixMissing(key: string, slots: Slot[], to: Id | null): StepResult {
    const label = this.run(() => fixMissing(this.ws, this.layer, key, slots, to), { fix: true });
    this.log("green", label, slots.map((s) => s.node), this.ws.history.at(-1)?.id ?? null);
    return { label };
  }

  /** "I meant that" for a world rule: the ticked ones become deliberate exceptions. */
  meantThat(key: string, nodes: Id[]): StepResult {
    const label = this.run(() => meantThat(this.ws, this.layer, key, nodes), { fix: true });
    this.log("green", label, nodes, this.ws.history.at(-1)?.id ?? null);
    return { label };
  }

  /** Ignore this one flag. It moves to the hidden list behind Show ignored. */
  ignoreFlag(key: string) {
    this.writable();
    const p = this.panel;
    if (!p.ignored.includes(key)) p.ignored.push(key);
    this.setPanel(p);
  }

  /** Ignore all like this, world-wide. Only for yellow warnings; red can only be ignored one by one. */
  ignoreKind(kind: string) {
    this.writable();
    if (kind === "missing" || kind === "rule") throw new LibraryError("Red flags can only be ignored one at a time.");
    const p = this.panel;
    if (!p.ignoredKinds.includes(kind)) p.ignoredKinds.push(kind);
    this.setPanel(p);
  }

  /** Switches an ignored flag (or kind of flag) back on. */
  unignore(keyOrKind: string) {
    this.writable();
    const p = this.panel;
    p.ignored = p.ignored.filter((k) => k !== keyOrKind);
    p.ignoredKinds = p.ignoredKinds.filter((k) => k !== keyOrKind);
    this.setPanel(p);
  }

  /** A yellow warning marked as fine: it turns green and stays out of the way. */
  markGood(key: string): StepResult {
    this.writable();
    const f = [...liveFlags(this.ws, this.layer, false, this.panel.checks), ...aiBlocks(this.ws, this.layer, this.panel)].find((x) => x.key === key);
    if (!f) throw new LibraryError("That flag has cleared already.");
    if (f.color === "red") throw new LibraryError("A broken link can't simply be marked fine: point it somewhere else, remove it, or leave it for later.");
    const p = this.panel;
    if (!p.ignored.includes(key)) p.ignored.push(key);
    this.setPanel(p);
    this.log("green", `Marked as fine: ${f.title}`, f.nodes.map((n) => n.id), null);
    return { label: `Marked as fine: ${f.title}` };
  }

  /** Flags count as new until seen, like unread email. */
  markSeen(keys: string[] | null) {
    if (this.session.readOnly) return;
    const p = this.panel;
    const all = keys ?? liveFlags(this.ws, this.layer).map((f) => f.key);
    p.seen = [...new Set([...p.seen, ...all])];
    this.setPanel(p);
  }

  /** Undo on a green block: only while it is still the latest change. */
  undoLog(logKey: string): StepResult | null {
    const id = logKey.replace(/^log:/, "");
    const entry = this.panel.log.find((e) => e.id === id);
    if (!entry?.stepId) throw new LibraryError("That can't be undone from here.");
    if (this.ws.history.at(-1)?.id !== entry.stepId) throw new LibraryError("Something else was changed since. Undo the later changes first, or use History.");
    const r = this.undo();
    const p = this.panel;
    p.log = p.log.filter((e) => e.id !== id);
    this.setPanel(p);
    return r;
  }

  // ---------- The rulebook ----------

  /** The book's content for the chosen book type, plus the names its page references need. */
  book(opts: BookRequest): BookData {
    const pageSize = opts.pageSize === "A4" ? "A4" : "Letter";
    if (opts.type === "handout") {
      const p = pageView(this.ws, this.layer, String(opts.page ?? ""));
      const h = opts.handout ?? { style: "plain", seal: false, hand: false };
      return { book: { title: p.name, subtitle: "Handout", chapters: [], index: [], credits: [] }, names: {}, pageSize, handout: { title: p.name, style: String(h.style), seal: !!h.seal, hand: !!h.hand, blocks: p.blocks } };
    }
    if (opts.type === "sheet") {
      const id = String(opts.character ?? "");
      const v = characterView(this.ws, this.layer, id);
      const design = this.sheetDesign(id);
      return { book: { title: v.name, subtitle: "Character sheet", chapters: [], index: [], credits: [] }, names: {}, pageSize, sheet: paperSheet(v, opts.sheetLayout ?? design.layout) };
    }
    if (opts.type === "printshop") {
      const want = opts.pieces ?? { kind: "cards" as PieceKind, items: [] };
      const pieces: Piece[] = [];
      for (const { id, count } of want.items) {
        const n = this.ws.get(this.layer, id);
        if (!n) continue;
        const r = this.ws.resolve(this.layer, id)!;
        let p: { title: string; stats: string | null; paragraphs: string[] };
        try {
          p = this.printPreview(id);
        } catch {
          p = { title: n.name, stats: null, paragraphs: n.text ? n.text.split(/\n{2,}/) : [] };
        }
        const kind = n.kind === "being" ? String(r.fields.beingKind ?? "being") : n.kind === "brick" ? String(r.fields.type ?? "rule") : n.kind;
        const piece: Piece = { id, title: n.name, picture: n.picture, squares: squaresFor(r.fields.size, p.paragraphs.slice(0, 2)), stats: p.stats, lines: cardLines(p.paragraphs), kind: kind.charAt(0).toUpperCase() + kind.slice(1) };
        for (let i = 0; i < Math.max(1, Math.min(50, Math.round(count) || 1)); i++) pieces.push(piece);
      }
      return { book: { title: this.ws.layer(this.layer).name, subtitle: "Print shop", chapters: [], index: [], credits: [] }, names: {}, pageSize, printshop: { kind: want.kind, pieces, inch: want.inch && want.inch > 0.3 && want.inch < 3 ? want.inch : 1 } };
    }
    if (opts.type === "diary") {
      const nights = diary(this.ws, this.layer, { dmPages: !!opts.diaryDmPages });
      const chapters = nights.map((n, i) => ({
        id: `adv:diary-${i}` as const,
        title: n.title,
        text: n.notes.join("\n\n"),
        entries: n.log.length || n.pictures.length ? [{ node: `diary-${i}`, title: n.log.length ? "From the table" : "", stats: null, paragraphs: n.log, mentions: [], variants: [], asParent: null, picture: n.pictures[0] ?? null }] : [],
      }));
      return { book: { title: this.ws.layer(this.layer).name, subtitle: "Campaign diary", chapters, index: [], credits: opts.author?.trim() ? [`Created by ${opts.author.trim()}.`] : [] }, names: {}, pageSize };
    }
    if (opts.type === "adventure" && this.ws.layer(this.layer).type === "module") {
      const numbering = opts.encounterNumbers === "top" || opts.encounterNumbers === "off" ? opts.encounterNumbers : "full";
      return this.designed({ ...buildAdventureBook(this.ws, this.layer, { numbering, author: opts.author?.trim() || null }), pageSize }, opts);
    }
    const type = BOOK_TYPES.includes(opts.type as BookType) ? (opts.type as BookType) : "everything";
    const chapters = Array.isArray(opts.chapters) ? opts.chapters.filter((c): c is ChapterId => c in CHAPTER_TITLES) : undefined;
    const book = buildBook(this.ws, this.layer, { type, chapters, variants: opts.variants === "full" ? "full" : "differences", monstersByChallenge: !!opts.monstersByChallenge, author: opts.author?.trim() || null });
    const names: Record<Id, string> = {};
    const walk = (e: Book["chapters"][number]["entries"][number]) => {
      for (const m of e.mentions) {
        const n = this.ws.get(this.layer, m);
        if (n) names[m] = n.name;
      }
      e.variants.forEach(walk);
    };
    book.chapters.forEach((c) => c.entries.forEach(walk));
    return this.designed({ book, names, pageSize }, opts);
  }

  /** The book designer's choices: what's left out, the front pages, the contents and the index. */
  private designed(data: BookData, opts: BookRequest): BookData {
    const out = new Set(Array.isArray(opts.leaveOut) ? opts.leaveOut : []);
    type E = BookData["book"]["chapters"][number]["entries"][number];
    const keep = (list: E[]): E[] => list.filter((e) => !out.has(e.node)).map((e) => ({ ...e, variants: keep(e.variants) }));
    const kept = new Set<Id>();
    const chapters = data.book.chapters
      .map((c) => ({ ...c, entries: keep(c.entries) }))
      .filter((c) => c.entries.length || (c.text ?? "").trim());
    const note = (e: E) => (kept.add(e.node), e.variants.forEach(note));
    chapters.forEach((c) => c.entries.forEach(note));
    const index = opts.index === false ? [] : data.book.index.filter((i) => kept.has(i.node));
    const off = new Set(Array.isArray(opts.frontOff) ? opts.frontOff : []);
    const front = journalTree(this.ws, this.layer)
      .filter((g) => g.category === FRONT_PAGES)
      .flatMap((g) => g.pages)
      .filter((p) => !off.has(p.id))
      .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name))
      .map((p) => ({ title: p.name, blocks: pageView(this.ws, this.layer, p.id).blocks }));
    return { ...data, book: { ...data.book, chapters, index }, front, plainCover: opts.plainCover !== false, contents: opts.contents !== false };
  }

  /** Saves the book designer's choices to the Codex (Sheet and book layouts) to use again. */
  saveBookLayout(name: string, request: BookRequest): Id {
    const n = cleanName(name);
    const req = JSON.parse(JSON.stringify(request)) as Value;
    const existing = this.ws.list(this.layer, "layout").find((x) => x.name === n && this.ws.resolve(this.layer, x.id)!.fields.layoutKind === "book" && this.ws.owner(this.layer, x.id) === this.layer);
    return this.run(() =>
      this.ws.transact(`Saved the book ${n}`, () => {
        if (existing) {
          this.ws.setField(this.layer, existing.id, "request", req);
          return existing.id;
        }
        return this.ws.create(this.layer, "layout", n, { fields: { layoutKind: "book", request: req } });
      }),
    );
  }

  /** Saved books in the Codex. */
  bookLayouts(): { id: Id; name: string; request: BookRequest }[] {
    return this.ws
      .list(this.layer, "layout")
      .filter((n) => this.ws.resolve(this.layer, n.id)!.fields.layoutKind === "book")
      .map((n) => ({ id: n.id, name: n.name, request: this.ws.resolve(this.layer, n.id)!.fields.request as unknown as BookRequest }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Everything a book could hold, chapter by chapter, for the designer's tick list. */
  bookContents(opts: BookRequest): { id: string; title: string; entries: { id: Id; title: string; depth: number }[] }[] {
    const all = this.book({ ...opts, leaveOut: [], index: true });
    type E = BookData["book"]["chapters"][number]["entries"][number];
    const flat = (list: E[], depth: number): { id: Id; title: string; depth: number }[] => list.flatMap((e) => [{ id: e.node, title: e.title, depth }, ...flat(e.variants, depth + 1)]);
    return all.book.chapters.map((c) => ({ id: c.id, title: c.title, entries: flat(c.entries, 0) }));
  }

  // ---------- The sheet designer ----------

  /** Saved sheet layouts in the Codex, the default first. */
  sheetLayouts(): { id: Id; name: string; isDefault: boolean; own: boolean }[] {
    return this.ws
      .list(this.layer, "layout")
      .filter((n) => this.ws.resolve(this.layer, n.id)!.fields.layoutKind === "sheet")
      .map((n) => ({ id: n.id, name: n.name, isDefault: this.ws.resolve(this.layer, n.id)!.fields.isDefault === true, own: this.ws.owner(this.layer, n.id) === this.layer }))
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
  }

  /** A character's groups and lines, the layout in force, and where that layout came from. */
  sheetDesign(id: Id): SheetDesign {
    const groups = sheetGroups(characterView(this.ws, this.layer, id));
    const f = this.ws.resolve(this.layer, id)?.fields ?? {};
    const stored = (nid: Id) => {
      const x = this.ws.resolve(this.layer, nid)?.fields;
      return x ? { groups: x.groups, unticked: x.unticked, hidden: x.hidden } : null;
    };
    let raw: unknown = null;
    let source: SheetDesign["source"] = { kind: "default", name: null };
    const used = typeof f.sheetUse === "object" && f.sheetUse && "link" in f.sheetUse ? String((f.sheetUse as { link: Id }).link) : null;
    const system = this.sheetLayouts().find((l) => l.isDefault);
    if (f.sheetLayout && typeof f.sheetLayout === "object" && !Array.isArray(f.sheetLayout)) {
      raw = f.sheetLayout;
      source = { kind: "own", name: null };
    } else if (used && this.ws.get(this.layer, used)) {
      raw = stored(used);
      source = { kind: "codex", name: this.ws.get(this.layer, used)!.name };
    } else if (system) {
      raw = stored(system.id);
      source = { kind: "system", name: system.name };
    }
    return { groups, layout: raw ? normalizeLayout(raw, groups) : defaultLayout(groups), source };
  }

  /** Keeps a layout as this character's own, or (null) goes back to the system's. */
  setSheetLayout(id: Id, layout: SheetLayout | null) {
    const n = this.must(id);
    const groups = sheetGroups(characterView(this.ws, this.layer, id));
    this.run(() =>
      this.ws.transact(layout ? `Rearranged ${n.name}'s sheet` : `${n.name}'s sheet follows the system's layout again`, () => {
        this.ws.setField(this.layer, id, "sheetLayout", layout ? (JSON.parse(JSON.stringify(normalizeLayout(layout, groups))) as Value) : undefined);
        if (!layout) this.ws.setField(this.layer, id, "sheetUse", undefined);
      }),
    );
  }

  /** Uses a layout from the Codex (it keeps following it), or (null) the system's. */
  useSheetLayout(id: Id, layoutId: Id | null) {
    const n = this.must(id);
    const l = layoutId ? this.must(layoutId) : null;
    this.run(() =>
      this.ws.transact(l ? `${n.name}'s sheet uses the layout ${l.name}` : `${n.name}'s sheet follows the system's layout again`, () => {
        this.ws.setField(this.layer, id, "sheetLayout", undefined);
        this.ws.setField(this.layer, id, "sheetUse", l ? link(l.id) : undefined);
      }),
    );
  }

  /** Keeps a layout in the Codex (Sheet layouts) so others can use it; optionally as everyone's default. */
  saveSheetLayout(name: string, layout: SheetLayout, makeDefault: boolean): Id {
    const n = cleanName(name);
    const value = JSON.parse(JSON.stringify(layout)) as Record<string, Value>;
    const existing = this.ws.list(this.layer, "layout").find((x) => x.name === n && this.ws.resolve(this.layer, x.id)!.fields.layoutKind === "sheet" && this.ws.owner(this.layer, x.id) === this.layer);
    return this.run(() =>
      this.ws.transact(`Saved the sheet layout ${n}`, () => {
        const id = existing ? existing.id : this.ws.create(this.layer, "layout", n, { fields: { layoutKind: "sheet" } });
        for (const k of ["groups", "unticked", "hidden"]) this.ws.setField(this.layer, id, k, value[k]);
        if (makeDefault) for (const o of this.sheetLayouts()) if (o.own && o.id !== id && o.isDefault) this.ws.setField(this.layer, o.id, "isDefault", false);
        this.ws.setField(this.layer, id, "isDefault", makeDefault ? true : existing ? (this.ws.resolve(this.layer, id)!.fields.isDefault === true) : false);
        return id;
      }),
    );
  }

  /** Everything the print shop could print: the same things the rulebook holds, picked one by one. */
  shopChoices() {
    return this.bookContents({ type: "everything" }).filter((c) => c.entries.length);
  }

  // ---------- History ----------

  history(): HistoryView {
    const view = (s: (typeof this.ws.history)[number]): HistoryStep => {
      const ids = [...new Set(s.edits.filter((e) => e.what !== "bin").map((e) => e.id))];
      return {
        id: s.id,
        label: s.label,
        by: s.by,
        time: s.time,
        things: ids.map((id) => ({ id, name: this.ws.get(this.layer, id)?.name ?? this.ws.binEntryFor(id)?.node.name ?? "" })).filter((t) => t.name),
        affected: s.edits.reduce((n, e) => {
          const entry = e.what === "bin" && !e.before && e.after ? (e.after as { pointedHere?: { node: Id }[] }) : null;
          return n + (entry?.pointedHere ? new Set(entry.pointedHere.map((p) => p.node)).size : 0);
        }, 0),
      };
    };
    return { done: [...this.ws.history].reverse().map(view), undone: [...this.ws.redoStack].reverse().map(view) };
  }

  /**
   * Rolls back to just after a step, undoing everything since, newest first. Stops (and says so)
   * if a step can't be undone safely. Everything undone can be redone.
   */
  rollBackTo(stepId: Id): StepResult {
    const i = this.ws.history.findIndex((s) => s.id === stepId);
    if (i < 0) throw new LibraryError("That step is no longer in History.");
    const target = this.ws.history[i]!;
    let n = 0;
    try {
      this.run(() => {
        while (this.ws.history.length > i + 1) {
          this.ws.undo();
          n++;
        }
      });
    } catch (e) {
      if (!n) throw e;
      return { label: `Rolled back ${n} step${n === 1 ? "" : "s"}, then stopped: ${e instanceof Error ? e.message : e}` };
    }
    return { label: n ? `Rolled back ${n} step${n === 1 ? "" : "s"} to "${target.label}"` : "Already there" };
  }

  /** Redoes undone steps up to and including this one. */
  redoTo(stepId: Id): StepResult {
    const i = this.ws.redoStack.findIndex((s) => s.id === stepId);
    if (i < 0) throw new LibraryError("That can't be redone any more.");
    let n = 0;
    this.run(() => {
      while (this.ws.redoStack.length > i) {
        this.ws.redo();
        n++;
      }
    });
    return { label: `Redid ${n} step${n === 1 ? "" : "s"}` };
  }

  /** Rolls back to before anything in History was done. */
  rollBackAll(): StepResult {
    const n = this.ws.history.length;
    if (!n) return { label: "Nothing to roll back" };
    let done = 0;
    try {
      this.run(() => {
        while (this.ws.history.length) {
          this.ws.undo();
          done++;
        }
      });
    } catch (e) {
      if (!done) throw e;
      return { label: `Rolled back ${done} steps, then stopped: ${e instanceof Error ? e.message : e}` };
    }
    return { label: `Rolled back all ${done} steps` };
  }

  // ---------- The world's recycle bin ----------

  /** Everything deleted in this world or system, newest first. */
  bin(): BinView[] {
    return [...this.ws.bin]
      .filter((b) => this.ws.chain(this.layer).some((l) => l.id === b.layer))
      .sort((a, b) => b.deleted - a.deleted)
      .map((b) => ({ binId: b.id, nodeId: b.node.id, name: b.node.name, kind: b.node.kind, deleted: b.deleted, usedBy: new Set(b.pointedHere.map((s) => s.node)).size, here: b.layer === this.layer }));
  }

  /** "You removed Strength yesterday. Restore it instead?" when making something with the same name. */
  binnedNamed(name: string, kind: NodeKind | null = null): BinView | null {
    const n = String(name ?? "").trim().toLowerCase();
    if (!n) return null;
    return this.bin().find((b) => b.name.trim().toLowerCase() === n && (!kind || b.kind === kind)) ?? null;
  }

  /**
   * Brings something back from the recycle bin. Links that still point at it work again by
   * themselves; links that were moved elsewhere meanwhile come back as a reconnect checklist.
   */
  restoreNode(binId: Id): RestoreResult {
    const entry = this.ws.bin.find((b) => b.id === binId);
    if (!entry) throw new LibraryError("That isn't in the recycle bin any more.");
    if (this.ws.exists(this.layer, entry.node.id)) throw new LibraryError(`${entry.node.name} is already back.`);
    const moved = this.run(() => this.ws.restore(binId));
    const label = `Restored ${entry.node.name}`;
    this.log("green", label, [entry.node.id], this.ws.history.at(-1)?.id ?? null);
    return {
      label,
      nodeId: entry.node.id,
      name: entry.node.name,
      reconnect: moved
        .filter((m) => this.ws.exists(this.layer, m.slot.node))
        .map((m) => ({ slot: m.slot, nodeName: this.ws.get(this.layer, m.slot.node)!.name, where: describeSlot(this.ws, this.layer, m.slot), nowUses: m.to ? (this.ws.get(this.layer, m.to)?.name ?? null) : null, changedSince: m.changedSince })),
    };
  }

  /** The reconnect checklist's answer: point the ticked links back at the restored thing. */
  reconnect(nodeId: Id, slots: Slot[]): StepResult {
    const node = this.must(nodeId);
    if (!slots.length) return { label: "Nothing reconnected" };
    const label = `${slots.length} reconnected to ${node.name}`;
    this.run(() => this.ws.transact(label, () => this.ws.reconnect(slots, nodeId)), { fix: true });
    this.log("green", label, slots.map((s) => s.node), this.ws.history.at(-1)?.id ?? null);
    return { label };
  }

  /** The only truly permanent action. The window always asks first. */
  emptyNodeBin(binIds: Id[] | null) {
    this.writable();
    this.ws.emptyBin(binIds ?? undefined);
    this.session.markChanged();
  }

  // ---------- Quick start ----------

  /** Builds the answers to Quick start's six questions into this system, as one undo step. */
  quickStart(answers: QuickStartAnswers): string[] {
    return this.run(() => buildQuickStart(this.ws, this.layer, answers));
  }

  // ---------- Lore ----------

  loreList(): LoreSection[] {
    return loreList(this.ws, this.layer);
  }

  addLore(name: string, template: string): Id {
    const n = cleanName(name);
    return this.run(() => createLore(this.ws, this.layer, n, template));
  }

  /** Things a link can point at (roll table results), grouped by kind. Not categories or library bricks. */
  linkTargets(): { id: Id; name: string; group: string }[] {
    const group: Partial<Record<NodeKind, string>> = { being: "Beings", item: "Items", lore: "Lore", table: "Roll tables", rule: "Rules", condition: "Conditions", ability: "Abilities", resource: "Resources", skill: "Skills" };
    return this.ws
      .list(this.layer)
      .filter((n) => group[n.kind] && !n.template)
      .map((n) => ({ id: n.id, name: n.name, group: group[n.kind]! }))
      .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  }

  /** Table mode: the world as a reading view for running a game. */
  tableMode(): TableModeView {
    return tableModeView(this.ws, this.layer);
  }

  /** Rolls a roll table. Nothing changes, so it isn't an undo step (and works read-only too). */
  rollTable(id: Id): { roll: number; text: string; result: { id: Id; name: string; kind: string } | null; chain: string; allUsed: boolean } {
    let r: ReturnType<typeof rollTable>;
    try {
      r = rollTable(this.ws, this.layer, id);
    } catch (e) {
      throw new LibraryError(e instanceof Error ? e.message : String(e));
    }
    const target = r.row?.result ? this.ws.get(this.layer, r.row.result.link) : null;
    // A once-only row is crossed out until the DM resets the table.
    if (r.onceRow !== null && !this.session.readOnly) this.ws.transact(`Crossed out a row on ${this.must(id).name}`, () => markUsed(this.ws, this.layer, id, r.onceRow));
    // A row that leads to another table rolls that one too ("roll on Treasure").
    let chain = "";
    if (target?.kind === "table") {
      try {
        chain = rollChain(this.ws, this.layer, target.id).text;
      } catch {
        chain = "";
      }
    }
    return { roll: r.roll, text: r.allUsed ? "Every once-only row has been rolled. Reset the table to use them again." : (r.row?.text ?? ""), result: target ? { id: target.id, name: target.name, kind: target.kind } : null, chain, allUsed: r.allUsed };
  }

  resetTable(id: Id): true {
    const n = this.must(id);
    this.run(() => this.ws.transact(`Reset ${n.name}`, () => markUsed(this.ws, this.layer, id, null)));
    return true;
  }

  /** "How common": works the ranges out on the die from each row's Common, Uncommon or Rare. */
  spreadTable(id: Id): true {
    const n = this.must(id);
    const f = this.ws.resolve(this.layer, id)!.fields;
    this.run(() => this.ws.transact(`Worked out the ranges on ${n.name}`, () => this.ws.setField(this.layer, id, "rows", rowsValue(weightedRanges(tableRows(f), typeof f.die === "string" ? f.die : "d6")))));
    return true;
  }

  /** A roll table made from things in the Codex in one go, spread evenly over the die. */
  tableFrom(name: string, ids: Id[]): Id {
    const n = cleanName(name);
    const list = ids.map((x) => this.ws.get(this.layer, x)).filter((x): x is NodeRecord => !!x).map((x) => ({ id: x.id, name: x.name }));
    if (!list.length) throw new LibraryError("Pick some things from the Codex for the table first.");
    const t = tableFromList(list);
    return this.run(() => this.ws.transact(`Made the roll table ${n}`, () => this.ws.create(this.layer, "table", n, { fields: { die: t.die, rows: rowsValue(t.rows) } })));
  }

  // ---------- The DM's table (version 2) ----------

  private now(): number {
    return this.ws.now();
  }
  tableView(glance: string[]): TableView {
    return tableView(this.ws, this.layer, glance);
  }
  private night(): Id {
    const s = openSession(this.ws, this.layer);
    if (!s) throw new LibraryError("Begin a session first.");
    return s.id;
  }
  private table<T>(label: string, fn: (sessionId: Id) => T): T {
    const id = this.night();
    return this.run(() => this.ws.transact(label, () => fn(id)));
  }
  beginSession(input: BeginInput): Id {
    if (openSession(this.ws, this.layer)) throw new LibraryError("A session is already going. Wrap it up first, or carry on with it.");
    return this.run(() => this.ws.transact("Began a session", () => beginSession(this.ws, this.layer, input, this.now())));
  }
  /** Pauses or resumes tonight's session timer. */
  setTimerPaused(paused: boolean): true {
    this.table(paused ? "Paused the session timer" : "Resumed the session timer", (id) => setTimerPaused(this.ws, this.layer, id, paused, this.now()));
    return true;
  }
  setSession(change: { present?: Id[]; starred?: Id[]; encounter?: Id | null; lastTime?: string }): true {
    this.table("Changed tonight's session", (id) => setSession(this.ws, this.layer, id, change));
    return true;
  }
  wrapUp(input: { xpEach: number; to: Id[]; remove: Id[] }): true {
    this.table("Wrapped up the session", (id) => wrapUp(this.ws, this.layer, id, input, this.now()));
    return true;
  }
  addLog(kind: LogLine["kind"], text: string): true {
    this.table("Wrote in the log", (id) => addLog(this.ws, this.layer, id, kind, text, this.now()));
    return true;
  }
  startFight(opts: { encounter: Id | null; hidden: boolean; groupFrom: number }): true {
    this.table("Started a fight", (id) => startFight(this.ws, this.layer, id, opts, this.now()));
    return true;
  }
  addToFight(being: Id, opts: { count: number; group: boolean; hidden: boolean }): Id[] {
    const n = this.must(being);
    return this.table(`${n.name} joined the fight`, (id) => addToFight(this.ws, this.layer, id, being, opts));
  }
  addEvent(name: string, init: number, note: string): Id {
    return this.table(`Added the event ${name.trim() || "Event"}`, (id) => addEvent(this.ws, this.layer, id, name, init, note));
  }
  nextTurn(opts: { rerollEachRound: boolean }): { round: number; fired: string[] } {
    return this.table("Next turn", (id) => nextTurn(this.ws, this.layer, id, opts, this.now()));
  }
  moveInOrder(combatant: Id, before: Id | null): true {
    this.table("Moved a card in the order", (id) => moveInOrder(this.ws, this.layer, id, combatant, before));
    return true;
  }
  setCombatant(combatant: Id, change: { delayed?: boolean; hidden?: boolean; init?: number; name?: string; note?: string } | null): true {
    const label = change === null ? "Took a card out of the fight" : change.hidden === false ? "Revealed a card" : change.delayed !== undefined ? (change.delayed ? "Delayed a turn" : "Back in the order") : "Changed a card";
    this.table(label, (id) => setCombatant(this.ws, this.layer, id, combatant, change));
    return true;
  }
  revealAll(): true {
    this.table("Revealed everyone", (id) => revealAll(this.ws, this.layer, id));
    return true;
  }
  clearDefeated(): true {
    this.table("Cleared the defeated", (id) => clearDefeated(this.ws, this.layer, id));
    return true;
  }
  damage(combatant: Id, member: Id | null, amount: number): string {
    return this.table(amount >= 0 ? "Damage" : "Healing", (id) => damage(this.ws, this.layer, id, combatant, member, amount, this.now()));
  }
  endFight(): true {
    this.table("Ended the fight", (id) => endFight(this.ws, this.layer, id, this.now()));
    return true;
  }
  addCondition(targets: { combatant: Id; member: Id | null }[], c: { condition: Id; left: number | null; unit: ConditionOn["unit"]; counter: number | null; source: string }): true {
    const name = this.must(c.condition).name;
    this.table(`Gave ${name}`, (id) => addCondition(this.ws, this.layer, id, targets, c, this.now()));
    return true;
  }
  /** A condition on a character, outside a fight too (from the character sheet). */
  addCharacterCondition(character: Id, c: { condition: Id; left: number | null; unit: ConditionOn["unit"]; counter: number | null; source: string }): true {
    const name = this.must(c.condition).name;
    this.run(() => this.ws.transact(`Gave ${this.must(character).name} ${name}`, () => addConditionToCharacter(this.ws, this.layer, character, c)));
    return true;
  }
  changeCondition(where: { character?: Id; combatant?: Id; member?: Id }, conditionId: Id, change: { counter?: number; left?: number } | null): true {
    const s = openSession(this.ws, this.layer);
    this.run(() => this.ws.transact(change === null ? "Removed a condition" : "Changed a condition", () => changeCondition(this.ws, this.layer, s?.id ?? null, where, conditionId, change, this.now())));
    return true;
  }
  addTimer(t: Omit<Timer, "id">): Id {
    return this.table(`Started the timer ${t.name}`, (id) => addTimer(this.ws, this.layer, id, t, this.now()));
  }
  setTimer(timer: Id, change: { paused?: boolean; left?: number; name?: string } | null): true {
    this.table(change === null ? "Stopped a timer" : change.paused ? "Paused a timer" : "Changed a timer", (id) => setTimer(this.ws, this.layer, id, timer, change, this.now()));
    return true;
  }
  advanceClock(minutes: number): ClockStep {
    return this.table(`Moved the clock on`, (id) => advanceClock(this.ws, this.layer, id, minutes, this.now()));
  }
  /** Short or long rest for everyone at the table: trackers refill, and the clock moves on. */
  partyRest(kind: "short rest" | "long rest"): true {
    this.table(`The party took a ${kind}`, (id) => {
      const s = sessionOf(this.ws, this.layer, id);
      for (const c of s.present) if (this.ws.get(this.layer, c)) restCharacter(this.ws, this.layer, c, kind);
      advanceClock(this.ws, this.layer, id, kind === "long rest" ? 480 : 60, this.now());
      addLog(this.ws, this.layer, id, "rest", `The party took a ${kind}.`, this.now());
    });
    return true;
  }

  /** Things made in this place since a time (for "keep this?" when a session wraps up). */
  madeSince(since: number): { id: Id; name: string; what: string }[] {
    const what = (n: NodeRecord) => (n.kind === "being" ? String(this.ws.resolve(this.layer, n.id)!.fields.beingKind ?? "being") : n.kind === "lore" ? "lore page" : n.kind);
    return this.ws
      .list(this.layer)
      .filter((n) => n.created >= since && this.ws.owner(this.layer, n.id) === this.layer && (n.kind === "item" || n.kind === "lore" || (n.kind === "being" && this.ws.resolve(this.layer, n.id)!.fields.beingKind !== "character")))
      .map((n) => ({ id: n.id, name: n.name, what: what(n) }));
  }

  /** The calendar: a rule in this place (made in the Time section if there isn't one yet). */
  setCalendar(cal: Value): true {
    const existing = this.ws.list(this.layer, "rule").find((n) => {
      const c = this.ws.resolve(this.layer, n.id)!.fields.calendar;
      return !!c && typeof c === "object" && !Array.isArray(c);
    });
    this.run(() =>
      this.ws.transact("Changed the calendar", () => {
        if (existing) return this.ws.setField(this.layer, existing.id, "calendar", cal);
        const time = this.ws.list(this.layer, "category").find((c) => c.fields.section === "time");
        this.ws.create(this.layer, "rule", "Calendar", { category: time ? link(time.id) : null, text: "The world's months, days, holidays, moons and seasons. The DM's table counts time with it.", fields: { calendar: cal } });
      }),
    );
    return true;
  }

  // ---------- Macros ----------

  macros(): (Macro & { words: string })[] {
    return this.ws
      .list(this.layer, "macro")
      .map((n) => macroOf(this.ws, this.layer, n.id))
      .map((m) => ({ ...m, words: macroWords(this.ws, this.layer, m) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  saveMacro(id: Id | null, input: { name: string; blocks: MacroBlock[]; against: number | null; who: Macro["who"]; see: Macro["see"] }): Id {
    const n = cleanName(input.name);
    const fields = { blocks: blocksValue(input.blocks), against: input.against, who: input.who, see: input.see, summary: macroWords(this.ws, this.layer, input) };
    if (id) {
      this.run(() =>
        this.ws.transact(`Changed the macro ${n}`, () => {
          if (this.must(id).name !== n) this.ws.edit(this.layer, id, (r) => (r.name = n));
          for (const [k, v] of Object.entries(fields)) this.ws.setField(this.layer, id, k, v as Value);
        }),
      );
      return id;
    }
    return this.run(() => this.ws.transact(`Made the macro ${n}`, () => this.ws.create(this.layer, "macro", n, { fields: fields as Record<string, Value> })));
  }
  /** Rolls a macro for the characters given. Nothing changes, so it isn't an undo step. */
  runMacro(id: Id | null, input: { blocks?: MacroBlock[]; against?: number | null }, characters: Id[], mode: "normal" | "advantage" | "disadvantage" = "normal"): MacroResult[] {
    const m = id ? macroOf(this.ws, this.layer, id) : { blocks: input.blocks ?? [], against: input.against ?? null };
    try {
      return runMacro(this.ws, this.layer, m, characters, { mode });
    } catch (e) {
      throw new LibraryError(e instanceof Error ? e.message : String(e));
    }
  }

  // ---------- The journal ----------

  journalTree(order: { name: string; priority: number }[], viewer: string | null = null) {
    return journalTree(this.ws, this.layer, order, viewer);
  }
  pageView(id: Id): PageView {
    return { ...pageView(this.ws, this.layer, id), readOnly: this.session.readOnly };
  }
  mentionedIn(id: Id): { id: Id; name: string }[] {
    return mentionedIn(this.ws, this.layer, id);
  }
  createPage(name: string, category: string, opts: { owner?: string | null; picture?: Id | null } = {}): Id {
    const n = cleanName(name);
    return this.run(() => this.ws.transact(`Added the journal page ${n}`, () => createPage(this.ws, this.layer, n, category, opts)));
  }
  setPage(id: Id, change: { category?: string; priority?: number; shared?: string[]; revealed?: boolean }): true {
    const n = this.must(id);
    this.run(() => this.ws.transact(change.category !== undefined ? `Moved ${n.name} to ${change.category}` : `Changed ${n.name}`, () => setPage(this.ws, this.layer, id, change)));
    return true;
  }
  addBlock(id: Id, type: "text" | "image", picture: Id | null = null, at: { x: number; y: number } | null = null): Id {
    const n = this.must(id);
    return this.run(() => this.ws.transact(`Added ${type === "image" ? "a picture" : "text"} to ${n.name}`, () => addBlock(this.ws, this.layer, id, type, picture, at)));
  }
  setBlock(id: Id, block: Id, change: Partial<Omit<Block, "id" | "type">> | null): true {
    const n = this.must(id);
    this.run(() => this.ws.transact(change === null ? `Removed a block from ${n.name}` : `Changed ${n.name}`, () => setBlock(this.ws, this.layer, id, block, change)));
    return true;
  }
  pageToNode(id: Id, kind: "lore" | "npc"): Id {
    const n = this.must(id);
    return this.run(() => this.ws.transact(`Made ${n.name} ${kind === "npc" ? "an NPC" : "a lore page"}`, () => pageToNode(this.ws, this.layer, id, kind)));
  }
  diary(dmPages: boolean) {
    return diary(this.ws, this.layer, { dmPages });
  }

  /** "Start blank" on the start screen. */

  /** World settings: which yellow checks run and how sensitive they are. Red flags can't be switched off. */
  checkSettings(): CheckSettings {
    return this.panel.checks;
  }

  setCheck(category: CheckCategory, change: { on?: boolean; level?: Sensitivity }) {
    this.writable();
    const p = this.panel;
    if (!(category in p.checks)) throw new LibraryError("That isn't a kind of check.");
    if (change.on !== undefined) p.checks[category].on = !!change.on;
    if (change.level !== undefined) {
      if (!["relaxed", "normal", "strict"].includes(change.level)) throw new LibraryError("Choose Relaxed, Normal or Strict.");
      p.checks[category].level = change.level;
    }
    this.setPanel(p);
  }

  /** Clears the blue and green blocks (the red and yellow ones clear only when fixed). */
  clearLog() {
    const p = this.panel;
    p.log = [];
    this.setPanel(p);
  }

  // ---------- Reading ----------

  rulesTab(): RulesSection[] {
    return rulesTab(this.ws, this.layer);
  }

  node(id: Id): NodeView {
    const ws = this.ws;
    const r = ws.resolve(this.layer, id);
    if (!r) throw new LibraryError("That isn't here any more. It may be in the recycle bin.");
    const n = r.record;
    const base = ws.layer(this.layer).base;
    const below = base ? ws.get(base, id) : null;
    const changedHere: string[] = [];
    if (below) {
      if (below.name !== n.name) changedHere.push("name");
      if (below.text !== n.text) changedHere.push("text");
      for (const k of new Set([...Object.keys(below.fields), ...Object.keys(n.fields)])) {
        if (JSON.stringify(below.fields[k]) !== JSON.stringify(n.fields[k])) changedHere.push(k);
      }
    }
    const names: Record<Id, string | null> = {};
    for (const l of findLinks(n)) names[l.to] = ws.get(this.layer, l.to)?.name ?? null;
    for (const l of findLinks(r.fields)) names[l.to] ??= ws.get(this.layer, l.to)?.name ?? null;
    const missing: Record<Id, string> = {};
    for (const [to, name] of Object.entries(names)) if (name === null) missing[to] = ws.binEntryFor(to)?.node.name ?? "something removed";
    const key = n.kind === "category" ? null : sectionOf(ws, this.layer, n);
    const sections = rulesTab(ws, this.layer);
    // Variants point at their parent, but they are listed as variants, not as "used by".
    const usedBy = [...new Set(ws.usedBy(this.layer, id).filter((s) => s.path[0] !== "parent").map((s) => s.node))].filter((x) => x !== id).map((x) => ({ id: x, name: ws.get(this.layer, x)?.name ?? "?" }));
    const parent = n.parent ? ws.get(this.layer, n.parent.link) : null;
    return {
      id,
      kind: n.kind,
      name: n.name,
      text: n.text,
      sectionKey: key,
      sectionTitle: sections.find((s) => s.key === key)?.title ?? null,
      fields: r.fields,
      changedHere,
      fromBelow: ws.owner(this.layer, id) !== this.layer,
      names,
      missing,
      usedBy: usedBy.sort((a, b) => a.name.localeCompare(b.name)),
      summary: n.kind === "being" || n.kind === "item" ? "" : n.kind === "brick" ? `${brickNote(ws, this.layer, id)}.` : ruleSummary(ws, this.layer, id),
      readOnly: this.session.readOnly,
      picture: n.picture,
      favourite: n.favourite,
      template: n.template,
      source: n.source,
      author: n.author,
      categoryId: n.category?.link ?? null,
      parent: parent ? { id: parent.id, name: parent.name } : null,
      parentMissing: r.parentMissing,
      own: n.parent ? r.ownFields : [],
      variants: ws.childrenOf(this.layer, id).length,
      sheet: sheetFor(n, r.fields),
      scores: scoresOf(r.fields),
      attachments: n.kind === "being" || n.kind === "item" ? attachmentsOf(ws, this.layer, id) : [],
      levels: isClass(ws, this.layer, id) ? levelTable(ws, this.layer, id) : null,
      pointBuy: this.pointBuyFor(n.kind, r.fields),
    };
  }

  /** A character's scores against the system's point buy, if it has one. */
  private pointBuyFor(kind: string, fields: Record<string, Value>): (Spent & { rule: string }) | null {
    if (kind !== "being" || fields[F.beingKind] !== "character") return null;
    const p = pointBuyOf(this.ws, this.layer);
    if (!p) return null;
    const scores = scoresOf(fields).map((s) => ({ name: this.ws.get(this.layer, s.ability)?.name ?? "A score", score: s.score }));
    return { ...pointsSpent(p, scores), rule: this.ws.get(this.layer, p.id)?.name ?? "Point buy" };
  }

  /** What the drop-downs offer: every ability, condition and resource, sorted by name. */
  choices(): Choices {
    const opt = (kind: NodeKind) =>
      this.ws
        .list(this.layer, kind)
        .filter((n) => !n.template)
        .sort((a, b) => (kind === "ability" ? a.created - b.created : 0))
        .map((n) => {
          const f = this.ws.resolve(this.layer, n.id)!.fields;
          return { id: n.id, name: n.name, label: typeof f.label === "string" && f.label ? f.label : null, ...(kind === "ability" ? { bonus: typeof f.bonus === "string" ? f.bonus : "d20" } : {}) };
        })
        .sort((a, b) => (kind === "ability" ? 0 : a.name.localeCompare(b.name)));
    return { abilities: opt("ability"), conditions: opt("condition"), resources: opt("resource") };
  }

  flags(): FlagView[] {
    const ws = this.ws;
    const red: FlagView[] = [
      ...redFlags(ws, this.layer).map((f) => ({ color: "red" as const, title: f.title, detail: f.inBin ? "It's in the recycle bin and can be restored." : "", nodes: [...new Set(f.slots.map((s) => s.node))] })),
      ...worldRuleFlags(ws, this.layer).map((f) => ({ color: "red" as const, title: f.title, detail: "", nodes: f.offenders })),
    ];
    const yellow: FlagView[] = yellowFlags(ws, this.layer, this.panel.checks ?? DEFAULT_CHECKS).map((f) => ({ color: "yellow" as const, title: f.title, detail: f.detail, nodes: f.nodes }));
    return [...red, ...yellow];
  }

  // ---------- Changing ----------

  addRule(sectionKey: string, name: string): Id {
    const n = cleanName(name);
    return this.run(() => createRuleNode(this.ws, this.layer, sectionKey, n));
  }

  addSection(title: string): Id {
    const n = cleanName(title);
    return this.run(() => createSection(this.ws, this.layer, n));
  }

  rename(id: Id, name: string) {
    const n = cleanName(name);
    const old = this.must(id).name;
    if (old === n) return;
    this.run(() => this.ws.transact(`Renamed ${old} to ${n}`, () => this.ws.edit(this.layer, id, (r) => (r.name = n))));
  }

  setText(id: Id, text: string) {
    const node = this.must(id);
    if (node.text === text) return;
    this.run(() => this.ws.transact(`Changed the text of ${node.name}`, () => this.ws.edit(this.layer, id, (r) => (r.text = String(text)))));
  }

  setField(id: Id, key: string, value: Value) {
    const node = this.must(id);
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key)) throw new LibraryError("That isn't a value this app knows.");
    this.run(() =>
      this.ws.transact(`Changed ${node.name}`, () => {
        // A core check's standard wording follows its kind, unless the user wrote their own (backlog 1).
        const before = this.ws.resolve(this.layer, id)!;
        this.ws.setField(this.layer, id, key, value);
        if (key === F.family && typeof value === "string" && isCoreCheck(this.ws, this.layer, before.record)) {
          const text = before.record.text.trim();
          if (!text || Object.values(STANDARD_CORE_TEXT).includes(text)) this.ws.edit(this.layer, id, (r) => (r.text = STANDARD_CORE_TEXT[value] ?? ""));
        }
      }),
    );
  }

  /** In a world: puts a value back to what the system says (removes the pencil mark). */
  useSystemValue(id: Id, key: string) {
    const base = this.ws.layer(this.layer).base;
    const below = base ? this.ws.get(base, id) : null;
    if (!below) throw new LibraryError("This doesn't come from the system, so there is nothing to go back to.");
    const node = this.must(id);
    this.run(() =>
      this.ws.transact(`Used the system's ${key === "name" ? "name" : key === "text" ? "text" : "value"} for ${node.name}`, () =>
        this.ws.edit(this.layer, id, (r) => {
          if (key === "name") r.name = below.name;
          else if (key === "text") r.text = below.text;
          else if (key in below.fields) r.fields[key] = structuredClone(below.fields[key]!);
          else delete r.fields[key];
        }),
      ),
    );
  }

  /** Sends a node to the recycle bin. Links to it stay, so they show as red flags until fixed. */
  deleteNode(id: Id): StepResult {
    const node = this.must(id);
    this.run(() => this.ws.delete(this.layer, id));
    return { label: `Removed ${node.name}` };
  }

  undo(): StepResult | null {
    const s = this.run(() => this.ws.undo());
    return s ? { label: s.label } : null;
  }

  redo(): StepResult | null {
    const s = this.run(() => this.ws.redo());
    return s ? { label: s.label } : null;
  }

  // ---------- Beings and items ----------

  beingsList(kind: BeingKind, sort: "name" | "challenge" = "name", source: SourceFilter = "all"): ListEntry[] {
    return beingsList(this.ws, this.layer, kind, sort === "challenge" ? "challenge" : "name", source);
  }

  templates(): TemplateEntry[] {
    return templatesList(this.ws, this.layer);
  }

  copyNode(sourceId: Id, name: string): Id {
    const n = cleanName(name);
    return this.run(() => copyNode(this.ws, this.layer, sourceId, n));
  }

  // ---------- The Codex and the quick sheet (milestone 11) ----------

  codex(): CodexSection[] {
    return codexSections(this.ws, this.layer);
  }

  /** Moves things into another Codex section, as one step. */
  refile(ids: Id[], to: CodexKey) {
    const nodes = ids.map((id) => this.must(id));
    const title = CODEX_SECTIONS.find((s) => s.key === to)?.title ?? to;
    this.run(() => this.ws.transact(nodes.length === 1 ? `Moved ${nodes[0]!.name} to ${title}` : `Moved ${nodes.length} things to ${title}`, () => {
      for (const n of nodes) moveCodex(this.ws, this.layer, n.id, to);
    }));
  }

  quick(id: Id): QuickView {
    this.must(id);
    return quickView(this.ws, this.layer, id);
  }

  makeOwnCopy(id: Id, name?: string): Id {
    const src = this.must(id);
    return this.run(() => this.ws.transact(`Made my own copy of ${src.name}`, () => makeOwnCopy(this.ws, this.layer, id, name)));
  }

  makeVariant(id: Id, name?: string): Id {
    const src = this.must(id);
    return this.run(() => this.ws.transact(`Made a variant of ${src.name}`, () => makeVariant(this.ws, this.layer, id, name)));
  }

  addChoice(nodeId: Id, input: { label: string; pick: number; options: Id[] }): Id {
    const n = this.must(nodeId);
    return this.run(() => this.ws.transact(`Added a choice of ${String(input.label).trim()} to ${n.name}`, () => addChoice(this.ws, this.layer, nodeId, input)));
  }

  addChoiceOptions(nodeId: Id, aid: Id, ids: Id[]) {
    const n = this.must(nodeId);
    this.run(() => this.ws.transact(`Added ${ids.length === 1 ? (this.ws.get(this.layer, ids[0]!)?.name ?? "an option") : `${ids.length} options`} to a choice on ${n.name}`, () => addChoiceOptions(this.ws, this.layer, nodeId, aid, ids)));
  }

  // ---------- Encounters (version 2) ----------

  encounterTree(): EncounterNode[] {
    return encounterTree(this.ws, this.layer);
  }

  /** The module's front page (a lore node marked modulePage), or null if there isn't one. */
  modulePage(): Id | null {
    return this.ws.list(this.layer, "lore").find((n) => this.ws.resolve(this.layer, n.id)!.fields.modulePage === true)?.id ?? null;
  }

  addEncounter(name: string, inside: Id | null = null): Id {
    const n = cleanName(name);
    return this.run(() => this.ws.transact(`Added the encounter ${n}`, () => createEncounter(this.ws, this.layer, n, inside)));
  }

  /** Drag in the tree: into an encounter, or between two (before `before`), with everything inside. */
  moveEncounters(ids: Id[], inside: Id | null, before: Id | null = null) {
    const names = ids.map((id) => this.must(id).name);
    this.run(() => this.ws.transact(names.length === 1 ? `Moved ${names[0]}` : `Moved ${names.length} encounters`, () => moveEncounters(this.ws, this.layer, ids, inside, before)));
  }

  /** Deletes an encounter; what was inside it moves up a level. */
  deleteEncounter(id: Id): StepResult {
    const n = this.must(id);
    this.run(() => this.ws.transact(`Removed ${n.name}`, () => deleteEncounter(this.ws, this.layer, id)));
    return { label: `Removed ${n.name}` };
  }

  /** Things dropped from the Codex onto an encounter. */
  addToEncounter(id: Id, ids: Id[], count = 1): { label: string } {
    const n = this.must(id);
    let label = "";
    this.run(() =>
      this.ws.transact(`Added to ${n.name}`, () => {
        const r = addToEncounter(this.ws, this.layer, id, ids, Math.max(1, Math.round(count) || 1));
        const parts = [r.creatures && `${r.creatures === 1 ? "a creature" : `${r.creatures} creatures`}`, r.treasure && "treasure", r.handouts && (r.handouts === 1 ? "a handout" : `${r.handouts} handouts`), r.leadsTo && "a link to another encounter"].filter(Boolean);
        label = parts.length ? `Added ${parts.join(", ")} to ${n.name}` : "Nothing there can go in an encounter";
      }),
    );
    return { label };
  }

  /** A ready-made encounter from the Codex: the module gets its own copy, with what's inside it. */
  placeEncounter(sourceId: Id, inside: Id | null = null): Id {
    const src = this.must(sourceId);
    return this.run(() => this.ws.transact(`Placed ${src.name}`, () => placeEncounter(this.ws, this.layer, sourceId, inside)));
  }

  saveEncounterToCodex(id: Id): Id {
    const n = this.must(id);
    return this.run(() => this.ws.transact(`Saved ${n.name} to the Codex`, () => saveEncounterToCodex(this.ws, this.layer, id)));
  }

  // ---------- Characters (version 2) ----------

  builderOptions(): BuilderOptions {
    return builderOptions(this.ws, this.layer);
  }
  makeItForMe(): CharacterInput {
    return makeItForMe(builderOptions(this.ws, this.layer));
  }
  roster() {
    return roster(this.ws, this.layer);
  }
  characterView(id: Id): CharacterView {
    return characterView(this.ws, this.layer, id);
  }
  createCharacter(input: CharacterInput): Id {
    return this.run(() => createCharacter(this.ws, this.layer, input));
  }
  /** One step on a character, labelled in plain words. */
  private onCharacter<T>(id: Id, label: string, fn: () => T): T {
    const n = this.must(id);
    return this.run(() => this.ws.transact(label.replace("{name}", n.name), fn));
  }
  setAppearance(id: Id, key: string, value: string): true {
    this.onCharacter(id, "Changed {name}'s appearance", () => setAppearance(this.ws, this.layer, id, key, value));
    return true;
  }
  addExtra(id: Id, section: string, label: string): true {
    this.onCharacter(id, `Added ${label.trim() || "a field"} to {name}`, () => addExtra(this.ws, this.layer, id, section, label));
    return true;
  }
  setExtra(id: Id, index: number, change: { label?: string; value?: string } | null): true {
    this.onCharacter(id, change === null ? "Removed a field from {name}" : "Changed {name}", () => setExtra(this.ws, this.layer, id, index, change));
    return true;
  }
  addTracker(id: Id, t: { name: string; max: number; look: string; refill: string }): Id {
    return this.onCharacter(id, `Added the ${t.name.trim() || "new"} tracker to {name}`, () => addTracker(this.ws, this.layer, id, t));
  }
  setTracker(id: Id, trackerId: Id, change: { value?: number; max?: number; name?: string } | null): true {
    this.onCharacter(id, change === null ? "Removed a tracker from {name}" : "Changed a tracker on {name}", () => setTracker(this.ws, this.layer, id, trackerId, change));
    return true;
  }
  award(id: Id, trackerId: Id): boolean {
    const t = characterView(this.ws, this.layer, id).trackers.find((x) => x.id === trackerId);
    return this.onCharacter(id, `Awarded {name} ${t?.name ?? "a point"}`, () => award(this.ws, this.layer, id, trackerId));
  }
  rest(id: Id, kind: "short rest" | "long rest"): true {
    this.onCharacter(id, `{name} took a ${kind}`, () => rest(this.ws, this.layer, id, kind));
    return true;
  }
  levelUpPreview(id: Id) {
    return levelUpPreview(this.ws, this.layer, id);
  }
  levelUp(id: Id, hpGain: number | null, picks: Record<Id, Id[]> = {}): true {
    const next = characterView(this.ws, this.layer, id).level + 1;
    this.onCharacter(id, `{name} went up to level ${next}`, () => levelUp(this.ws, this.layer, id, hpGain, picks));
    return true;
  }
  setChoice(id: Id, aid: Id, picked: Id[]): true {
    this.onCharacter(id, "Changed a choice on {name}", () => setChoice(this.ws, this.layer, id, aid, picked));
    return true;
  }

  // ---------- Maps (version 2) ----------

  mapTree(): MapTreeNode[] {
    return mapTree(this.ws, this.layer);
  }
  mapView(id: Id): MapView {
    return { ...mapView(this.ws, this.layer, id), readOnly: this.session.readOnly };
  }
  mapsShowing(id: Id): { id: Id; name: string }[] {
    return mapsShowing(this.ws, this.layer, id);
  }
  createMap(name: string, picture: Id | null, size: { width: number; height: number } | null): Id {
    const n = cleanName(name);
    return this.run(() => this.ws.transact(`Added the map ${n}`, () => createMap(this.ws, this.layer, n, { picture, ...(size ?? {}) })));
  }
  private onMap<T>(id: Id, label: string, fn: () => T): T {
    const n = this.must(id);
    return this.run(() => this.ws.transact(label.replace("{map}", n.name), fn));
  }
  addPins(mapId: Id, targets: (Id | null)[], x: number, y: number, look: { color?: string; symbol?: string; label?: string } = {}): Id[] {
    const names = targets.map((t) => (t ? (this.ws.get(this.layer, t)?.name ?? "something") : "a pin"));
    return this.onMap(mapId, names.length === 1 ? `Pinned ${names[0]} on {map}` : `Pinned ${names.length} things on {map}`, () => addPins(this.ws, this.layer, mapId, targets, x, y, look));
  }
  movePins(mapId: Id, moves: { id: Id; x: number; y: number }[]): true {
    this.onMap(mapId, moves.length === 1 ? "Moved a pin on {map}" : `Moved ${moves.length} pins on {map}`, () => movePins(this.ws, this.layer, mapId, moves));
    return true;
  }
  editPins(mapId: Id, ids: Id[], change: { label?: string; color?: string; symbol?: string; link?: Id | null }): true {
    this.onMap(mapId, ids.length === 1 ? "Changed a pin on {map}" : `Changed ${ids.length} pins on {map}`, () => editPins(this.ws, this.layer, mapId, ids, change));
    return true;
  }
  deletePins(mapId: Id, ids: Id[]): true {
    this.onMap(mapId, ids.length === 1 ? "Removed a pin from {map}" : `Removed ${ids.length} pins from {map}`, () => deletePins(this.ws, this.layer, mapId, ids));
    return true;
  }
  copyPins(mapId: Id, ids: Id[], connected: boolean): Id[] {
    return this.onMap(mapId, `Copied ${ids.length === 1 ? "a pin" : `${ids.length} pins`} on {map}`, () => copyPins(this.ws, this.layer, mapId, ids, connected));
  }
  addShape(mapId: Id, shape: Omit<Shape, "id">): Id {
    const what: Record<string, string> = { room: "a room", line: "a line", brush: "with the brush", fill: "a fill", stamp: `a ${shape.stamp ?? "stamp"}`, text: "a label" };
    return this.onMap(mapId, `Drew ${what[shape.tool] ?? "something"} on {map}`, () => addShape(this.ws, this.layer, mapId, shape));
  }
  deleteShapes(mapId: Id, ids: Id[]): true {
    this.onMap(mapId, "Erased from {map}", () => deleteShapes(this.ws, this.layer, mapId, ids));
    return true;
  }
  fillShape(mapId: Id, id: Id, fill: string | null, texture: string | null): true {
    this.onMap(mapId, "Filled on {map}", () => fillShape(this.ws, this.layer, mapId, id, fill, texture));
    return true;
  }
  setMapSettings(mapId: Id, change: { width?: number; height?: number; background?: string; grid?: Partial<Grid> }): true {
    this.onMap(mapId, "Changed {map}'s settings", () => setMapSettings(this.ws, this.layer, mapId, change));
    return true;
  }

  /** "Start blank" on the start screen. */
  newInSection(key: CodexKey, name: string): Id {
    const n = cleanName(name);
    return this.run(() => this.ws.transact(`Added ${n}`, () => newInSection(this.ws, this.layer, key, n)));
  }

  /** The thing exactly as the rulebook prints it. */
  printPreview(id: Id): { title: string; stats: string | null; paragraphs: string[] } {
    const e = bookEntry(this.ws, this.layer, this.must(id));
    return { title: e.title, stats: e.stats, paragraphs: e.paragraphs };
  }

  setTemplate(id: Id, on: boolean) {
    this.run(() => setTemplate(this.ws, this.layer, id, !!on));
  }

  itemsList(source: SourceFilter = "all"): ListEntry[] {
    return itemsList(this.ws, this.layer, source);
  }

  categories(): CategoryOption[] {
    return categoryTree(this.ws, this.layer);
  }

  addBeing(input: { name: string; kind: BeingKind; variantOf: Id | null; template?: boolean }): Id {
    const n = cleanName(input.name);
    return this.run(() => createBeing(this.ws, this.layer, n, input.kind, input.variantOf, !!input.template));
  }

  addItem(input: { name: string; categoryId: Id | null; variantOf: Id | null; template?: boolean }): Id {
    const n = cleanName(input.name);
    return this.run(() => createItem(this.ws, this.layer, n, input.categoryId, input.variantOf, !!input.template));
  }

  addCategory(name: string, under: Id | null): Id {
    const n = cleanName(name);
    return this.run(() => createCategory(this.ws, this.layer, n, under));
  }

  setCategory(id: Id, categoryId: Id | null) {
    const node = this.must(id);
    const cat = categoryId ? this.categories().find((c) => c.id === categoryId) : null;
    if (categoryId && !cat) throw new LibraryError("That category is gone.");
    this.run(() => this.ws.transact(`Filed ${node.name} under ${cat?.path ?? "nothing"}`, () => this.ws.edit(this.layer, id, (r) => (r.category = categoryId ? link(categoryId) : null))));
  }

  setPicture(id: Id, picture: Id | null) {
    const node = this.must(id);
    this.run(() => this.ws.transact(picture ? `Changed the picture of ${node.name}` : `Removed the picture of ${node.name}`, () => this.ws.edit(this.layer, id, (r) => (r.picture = picture))));
  }

  toggleFavourite(id: Id) {
    const node = this.must(id);
    this.run(() => this.ws.transact(node.favourite ? `Unstarred ${node.name}` : `Starred ${node.name}`, () => this.ws.edit(this.layer, id, (r) => (r.favourite = !r.favourite))));
  }

  /** One ability score on a sheet. Null clears it (a variant then follows its parent again). */
  setScore(id: Id, ability: Id, score: number | null) {
    const node = this.must(id);
    if (!/^[0-9a-f]+$/.test(ability)) throw new LibraryError("That isn't an ability.");
    const abilityName = this.ws.get(this.layer, ability)?.name ?? "a score";
    this.run(() => this.ws.transact(`Changed ${node.name}'s ${abilityName}`, () => this.ws.setField(this.layer, id, scoreKey(ability), score === null ? undefined : scoreValue(ability, score))));
  }

  /** For a variant: a value goes back to following its parent (removes the pencil mark). */
  useParentValue(id: Id, key: string) {
    const node = this.must(id);
    if (!node.parent) throw new LibraryError("It isn't a variant of anything.");
    this.run(() => this.ws.transact(`${node.name} follows its parent again`, () => this.ws.setField(this.layer, id, key, undefined)));
  }

  detach(id: Id) {
    this.run(() => detach(this.ws, this.layer, id));
  }

  // ---------- The library ----------

  library(): LibrarySection[] {
    return librarySections(this.ws, this.layer);
  }

  addBrick(type: BrickType, name: string): Id {
    const n = cleanName(name);
    return this.run(() => createBrick(this.ws, this.layer, type, n));
  }

  /** True when a drop should ask when and how often first (a spell on an item). */
  dropNeedsAnswers(targets: Id[], bricks: Id[]): boolean {
    return dropNeedsAnswers(this.ws, this.layer, targets, bricks);
  }

  /** Drops bricks onto sheets: one undo step however many there are. */
  attach(input: { targets: Id[]; bricks: Id[]; activation?: Activation; uses?: Uses | null }): StepResult {
    const n = this.run(() => attachMany(this.ws, this.layer, input.targets, input.bricks, { activation: input.activation, uses: input.uses }));
    return { label: this.ws.history.at(-1)?.label ?? `Added ${n}` };
  }

  removeAttachment(nodeId: Id, aid: Id): StepResult {
    const node = this.must(nodeId);
    const a = findAttachment(node.attachments, aid);
    if (!a) throw new LibraryError(node.parent ? "That comes from its parent. Change it there, or Detach this one first." : "That isn't on this sheet any more.");
    const name = a.name || (a.brick ? (this.ws.get(this.layer, a.brick.link)?.name ?? "it") : "the choice");
    this.run(() =>
      this.ws.transact(`Removed ${name} from ${node.name}`, () => {
        this.ws.removeAttachment(this.layer, nodeId, aid);
        // A class forgets the level the feature was on.
        if (this.ws.get(this.layer, nodeId)!.fields[levelKey(aid)] !== undefined) this.ws.setField(this.layer, nodeId, levelKey(aid), undefined);
      }),
    );
    return { label: `Removed ${name} from ${node.name}` };
  }

  // ---------- Class level tables ----------

  attachAtLevel(classId: Id, bricks: Id[], level: number): StepResult {
    this.must(classId);
    return { label: this.run(() => attachAtLevel(this.ws, this.layer, classId, bricks, Number(level))) };
  }

  setFeatureLevel(classId: Id, aid: Id, level: number | null): StepResult {
    this.must(classId);
    return { label: this.run(() => setFeatureLevel(this.ws, this.layer, classId, aid, level === null ? null : Number(level))) };
  }

  // ---------- Drilling in, and Edit parent ----------

  attachmentDetail(nodeId: Id, aid: Id): AttachmentDetail {
    try {
      return attachmentDetail(this.ws, this.layer, nodeId, aid);
    } catch (e) {
      throw new LibraryError(e instanceof Error ? e.message : String(e));
    }
  }

  editAttachment(nodeId: Id, aid: Id, patch: AttachmentPatch) {
    this.run(() => editAttachment(this.ws, this.layer, nodeId, aid, patch));
  }

  attachInside(nodeId: Id, aid: Id, bricks: Id[]): StepResult {
    this.run(() => attachInside(this.ws, this.layer, nodeId, aid, bricks));
    return { label: this.ws.history.at(-1)?.label ?? "Added" };
  }

  familyChecklist(parentId: Id, fields: string[], labels: Record<string, string> = {}): FamilyRow[] {
    this.must(parentId);
    return familyChecklist(this.ws, this.layer, parentId, fields, labels);
  }

  /** Edit parent's Save: the parent changes, and ticked children get it (null ticks everyone). */
  changeParent(parentId: Id, changes: Record<string, Value | null>, ticked: Id[] | null): StepResult {
    this.run(() => changeParent(this.ws, this.layer, parentId, changes, ticked));
    return { label: this.ws.history.at(-1)?.label ?? "Changed" };
  }

  /** Sections a rule can be moved to (abilities, resources, skills and conditions stay in their own). */
  sections(): { key: string; title: string }[] {
    return rulesTab(this.ws, this.layer)
      .filter((s) => s.kind === "rule")
      .map((s) => ({ key: s.key, title: s.title }));
  }

  /** Files a rule under another section. */
  moveToSection(id: Id, sectionKey: string) {
    const node = this.must(id);
    const title = this.sections().find((s) => s.key === sectionKey)?.title;
    if (!title) throw new LibraryError("That section is gone.");
    this.run(() =>
      this.ws.transact(`Moved ${node.name} to ${title}`, () => {
        const keys = ensureSections(this.ws, this.layer);
        const cat = keys.get(sectionKey as SectionKey) ?? sectionKey;
        this.ws.edit(this.layer, id, (r) => (r.category = link(cat)));
      }),
    );
  }
}

function cleanName(name: string): string {
  const n = String(name ?? "").trim();
  if (!n) throw new LibraryError("Give it a name (even a single letter is fine).");
  if (n.length > 200) throw new LibraryError("Names can be up to 200 letters long.");
  return n;
}
