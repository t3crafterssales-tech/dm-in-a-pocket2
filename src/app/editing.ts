// The named actions for changing an open world or system: add, rename, change a value, delete,
// undo and redo. Each one is a single step in history. The window and, later, the AI change
// things only through these.

import { DEFAULT_CHECKS, EngineError, findAttachment, findLinks, link, redFlags, worldRuleFlags, yellowFlags } from "../engine/index.ts";
import type { Activation, Id, NodeKind, Uses, Value, Workspace } from "../engine/index.ts";
import { LibraryError } from "../storage/index.ts";
import { createRuleNode, createSection, ensureSections, ruleSummary, rulesTab, sectionOf } from "./rules.ts";
import type { RulesSection, SectionKey } from "./rules.ts";
import type { Session } from "./session.ts";
import { beingsList, categoryTree, copyNode, createBeing, createCategory, createItem, detach, itemsList, scoreKey, scoresOf, scoreValue, setTemplate, sheetFor, templatesList } from "./sheets.ts";
import type { BeingKind, CategoryOption, ListEntry, SheetDef, TemplateEntry } from "./sheets.ts";
import { attachMany, attachmentsOf, brickNote, createBrick, dropNeedsAnswers, librarySections } from "./library.ts";
import type { AttachmentView, BrickType, LibrarySection } from "./library.ts";
import { attachInside, attachmentDetail, changeParent, editAttachment, familyChecklist } from "./drill.ts";
import type { AttachmentDetail, AttachmentPatch, FamilyRow } from "./drill.ts";

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

  /** Runs an engine action, turning its errors into plain messages. */
  private run<T>(fn: () => T): T {
    this.writable();
    try {
      return fn();
    } catch (e) {
      if (e instanceof EngineError || e instanceof LibraryError || e instanceof Error) throw new LibraryError(e.message);
      throw e;
    }
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
      categoryId: n.category?.link ?? null,
      parent: parent ? { id: parent.id, name: parent.name } : null,
      parentMissing: r.parentMissing,
      own: n.parent ? r.ownFields : [],
      variants: ws.childrenOf(this.layer, id).length,
      sheet: sheetFor(n, r.fields),
      scores: scoresOf(r.fields),
      attachments: n.kind === "being" || n.kind === "item" ? attachmentsOf(ws, this.layer, id) : [],
    };
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
    const yellow: FlagView[] = yellowFlags(ws, this.layer, DEFAULT_CHECKS).map((f) => ({ color: "yellow" as const, title: f.title, detail: f.detail, nodes: f.nodes }));
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
    this.run(() => this.ws.transact(`Changed ${node.name}`, () => this.ws.setField(this.layer, id, key, value)));
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

  beingsList(kind: BeingKind, sort: "name" | "challenge" = "name"): ListEntry[] {
    return beingsList(this.ws, this.layer, kind, sort === "challenge" ? "challenge" : "name");
  }

  templates(): TemplateEntry[] {
    return templatesList(this.ws, this.layer);
  }

  copyNode(sourceId: Id, name: string): Id {
    const n = cleanName(name);
    return this.run(() => copyNode(this.ws, this.layer, sourceId, n));
  }

  setTemplate(id: Id, on: boolean) {
    this.run(() => setTemplate(this.ws, this.layer, id, !!on));
  }

  itemsList(): ListEntry[] {
    return itemsList(this.ws, this.layer);
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
    this.run(() => this.ws.transact(`Removed ${name} from ${node.name}`, () => this.ws.removeAttachment(this.layer, nodeId, aid)));
    return { label: `Removed ${name} from ${node.name}` };
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
