// The named actions for changing an open world or system: add, rename, change a value, delete,
// undo and redo. Each one is a single step in history. The window and, later, the AI change
// things only through these.

import { DEFAULT_CHECKS, EngineError, findLinks, link, redFlags, worldRuleFlags, yellowFlags } from "../engine/index.ts";
import type { Id, NodeKind, Value, Workspace } from "../engine/index.ts";
import { LibraryError } from "../storage/index.ts";
import { createRuleNode, createSection, ensureSections, ruleSummary, rulesTab, sectionOf } from "./rules.ts";
import type { RulesSection, SectionKey } from "./rules.ts";
import type { Session } from "./session.ts";

export interface Option {
  id: Id;
  name: string;
  label: string | null;
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
      if (e instanceof EngineError || e instanceof LibraryError) throw new LibraryError(e.message);
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
    const usedBy = [...new Set(ws.usedBy(this.layer, id).map((s) => s.node))].filter((x) => x !== id).map((x) => ({ id: x, name: ws.get(this.layer, x)?.name ?? "?" }));
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
      summary: ruleSummary(ws, this.layer, id),
      readOnly: this.session.readOnly,
    };
  }

  /** What the drop-downs offer: every ability, condition and resource, sorted by name. */
  choices(): Choices {
    const opt = (kind: NodeKind) =>
      this.ws
        .list(this.layer, kind)
        .filter((n) => !n.template)
        .map((n) => ({ id: n.id, name: n.name, label: typeof n.fields.label === "string" && n.fields.label ? n.fields.label : null }))
        .sort((a, b) => a.name.localeCompare(b.name));
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
