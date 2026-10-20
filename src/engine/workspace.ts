// The engine: systems and worlds as layers, nodes, links, variants, undo, recycle bin.
// Everything that changes data goes through `transact`, so it lands in history as one step.

import { newId } from "./ids.ts";
import { deepEqual, findLinks, getAt, isLink, link, samePath, setAt } from "./links.ts";
import type {
  Activation,
  Attachment,
  BinEntry,
  Edit,
  Id,
  Layer,
  LayerType,
  NodeChange,
  NodeKind,
  NodeRecord,
  SavedFile,
  Slot,
  Step,
  Value,
} from "./types.ts";
import { APP_VERSION, FORMAT_VERSION } from "./types.ts";

export const HISTORY_MAX_STEPS = 5000;
export const HISTORY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export class EngineError extends Error {}

/** A node as it should be shown: own data plus everything inherited from its parent. */
export interface Resolved {
  record: NodeRecord;
  fields: Record<string, Value>;
  /** Field keys this node set for itself (pencil marks). */
  ownFields: string[];
  /** Own attachments first, then inherited ones with the name of the node they came from. */
  attachments: { attachment: Attachment; from: Id | null }[];
  parentMissing: boolean;
}

export interface FamilyMember {
  id: Id;
  name: string;
  /** True if this node set the asked-about field itself. */
  ownsField: boolean;
  children: FamilyMember[];
}

const clone = <T>(v: T): T => (v === undefined ? v : structuredClone(v));

export function defaultActivation(): Activation {
  return { when: ["always"], join: "any" };
}

export class Workspace {
  layers = new Map<Id, Layer>();
  bin: BinEntry[] = [];
  history: Step[] = [];
  redoStack: Step[] = [];
  /** Lets tests run with a fixed clock. */
  now: () => number = () => Date.now();

  private tx: { edits: Edit[]; seen: Set<string> } | null = null;

  static fromFile(file: SavedFile): Workspace {
    const ws = new Workspace();
    for (const l of file.layers) ws.layers.set(l.id, clone(l));
    ws.bin = clone(file.bin);
    ws.history = clone(file.history);
    ws.redoStack = clone(file.redo ?? []);
    return ws;
  }

  toFile(): SavedFile {
    return {
      format: FORMAT_VERSION,
      app: APP_VERSION,
      layers: [...this.layers.values()].map(clone),
      bin: clone(this.bin),
      history: clone(this.history),
      redo: clone(this.redoStack),
    };
  }

  // ---------- Layers ----------

  /** Creates a system (optionally a variant of another system) or a world on a system. */
  addLayer(type: LayerType, name: string, base: Id | null = null, author: string | null = null): Id {
    if (type === "world" && !base) throw new EngineError("A world needs a system.");
    if (base && !this.layers.has(base)) throw new EngineError("That system doesn't exist.");
    if (base && this.layers.get(base)!.type === "world") throw new EngineError("Only a system can be built on.");
    const id = newId();
    this.layers.set(id, { id, type, name, author, base, nodes: {}, changes: {}, hidden: [] });
    return id;
  }

  layer(id: Id): Layer {
    const l = this.layers.get(id);
    if (!l) throw new EngineError("That system or world doesn't exist.");
    return l;
  }

  /** The layer and everything under it, bottom first. */
  chain(layerId: Id): Layer[] {
    const out: Layer[] = [];
    let cur: Layer | undefined = this.layer(layerId);
    while (cur) {
      out.unshift(cur);
      cur = cur.base ? this.layers.get(cur.base) : undefined;
    }
    return out;
  }

  /** Every layer whose chain includes this one (itself, its worlds, its variants and their worlds). */
  layersAbove(layerId: Id): Id[] {
    return [...this.layers.keys()].filter((id) => this.chain(id).some((l) => l.id === layerId));
  }

  // ---------- Reading ----------

  /** The node as seen from a layer, with layer changes applied but not variant inheritance. */
  get(layerId: Id, nodeId: Id): NodeRecord | null {
    let rec: NodeRecord | null = null;
    for (const l of this.chain(layerId)) {
      if (l.nodes[nodeId]) rec = clone(l.nodes[nodeId]!);
      if (!rec) continue;
      if (l.hidden.includes(nodeId)) return null;
      const ch = l.changes[nodeId];
      if (ch) rec = applyChange(rec, ch);
    }
    return rec;
  }

  exists(layerId: Id, nodeId: Id): boolean {
    return this.get(layerId, nodeId) !== null;
  }

  /** Ids of every node visible from a layer. */
  ids(layerId: Id): Id[] {
    const seen = new Set<Id>();
    for (const l of this.chain(layerId)) for (const id of Object.keys(l.nodes)) seen.add(id);
    return [...seen].filter((id) => this.exists(layerId, id));
  }

  list(layerId: Id, kind?: NodeKind): NodeRecord[] {
    return this.ids(layerId)
      .map((id) => this.get(layerId, id)!)
      .filter((n) => !kind || n.kind === kind);
  }

  /** Which layer owns (stores in full) this node. */
  owner(layerId: Id, nodeId: Id): Id | null {
    for (const l of this.chain(layerId).reverse()) if (l.nodes[nodeId]) return l.id;
    return null;
  }

  resolve(layerId: Id, nodeId: Id, seen: Set<Id> = new Set()): Resolved | null {
    const rec = this.get(layerId, nodeId);
    if (!rec) return null;
    const own = { fields: rec.fields, ownFields: Object.keys(rec.fields), attachments: rec.attachments.map((a) => ({ attachment: a, from: null as Id | null })) };
    if (!rec.parent || seen.has(nodeId)) return { record: rec, ...own, parentMissing: false };
    seen.add(nodeId);
    const p = this.resolve(layerId, rec.parent.link, seen);
    if (!p) return { record: rec, ...own, parentMissing: true };
    return {
      record: rec,
      fields: { ...p.fields, ...rec.fields },
      ownFields: own.ownFields,
      attachments: [...own.attachments, ...p.attachments.map((x) => ({ attachment: x.attachment, from: x.from ?? p.record.id }))],
      parentMissing: false,
    };
  }

  /**
   * Every link that points at a node, as seen from one layer. Worked out, never stored.
   * A slot's layer is where a fix would be written: fixing it from a world changes that world only.
   */
  usedBy(layerId: Id, target: Id): Slot[] {
    return this.links(layerId).filter((s) => s.to === target).map(({ to: _to, ...slot }) => slot);
  }

  /** Every link in every node visible from a layer. */
  links(layerId: Id): (Slot & { to: Id })[] {
    const out: (Slot & { to: Id })[] = [];
    for (const id of this.ids(layerId)) {
      for (const f of findLinks(this.get(layerId, id)!)) out.push({ layer: layerId, node: id, path: f.path, to: f.to });
    }
    return out;
  }

  /** Links pointing at a node from this layer and every layer built on it (its worlds and variants). */
  usedByEverywhere(layerId: Id, target: Id): Slot[] {
    return this.layersAbove(layerId).flatMap((ctx) => this.usedBy(ctx, target));
  }

  /** Variants of a node (direct children), seen from a layer. */
  childrenOf(layerId: Id, nodeId: Id): Id[] {
    return this.ids(layerId).filter((id) => this.get(layerId, id)!.parent?.link === nodeId);
  }

  family(layerId: Id, nodeId: Id, field?: string): FamilyMember {
    const rec = this.get(layerId, nodeId);
    if (!rec) throw new EngineError("That doesn't exist.");
    return {
      id: nodeId,
      name: rec.name,
      ownsField: field ? field in rec.fields : false,
      children: this.childrenOf(layerId, nodeId).map((c) => this.family(layerId, c, field)),
    };
  }

  // ---------- Transactions, undo and redo ----------

  transact<T>(label: string, fn: () => T, by: "user" | "ai" = "user"): T {
    if (this.tx) return fn();
    this.tx = { edits: [], seen: new Set() };
    let result: T;
    try {
      result = fn();
    } catch (e) {
      // All or nothing: put back everything this step touched.
      const edits = this.tx.edits;
      this.tx = null;
      for (const e2 of [...edits].reverse()) this.applyEdit(e2, "before");
      throw e;
    }
    const edits = this.tx.edits;
    this.tx = null;
    for (const e of edits) e.after = clone(this.readEditTarget(e));
    const real = edits.filter((e) => !deepEqual(e.before, e.after));
    if (real.length) {
      this.history.push({ id: newId(), label, by, time: this.now(), edits: real });
      this.redoStack = [];
      this.pruneHistory();
    }
    return result!;
  }

  undo(): Step | null {
    const s = this.history.pop();
    if (!s) return null;
    for (const e of [...s.edits].reverse()) this.applyEdit(e, "before");
    this.redoStack.push(s);
    return s;
  }

  redo(): Step | null {
    const s = this.redoStack.pop();
    if (!s) return null;
    for (const e of s.edits) this.applyEdit(e, "after");
    this.history.push(s);
    return s;
  }

  private pruneHistory() {
    const cutoff = this.now() - HISTORY_MAX_AGE_MS;
    this.history = this.history.filter((s) => s.time >= cutoff);
    if (this.history.length > HISTORY_MAX_STEPS) this.history = this.history.slice(-HISTORY_MAX_STEPS);
  }

  private readEditTarget(e: Edit): unknown {
    if (e.what === "bin") return this.bin.find((b) => b.id === e.id);
    const l = this.layers.get(e.layer);
    if (!l) return undefined;
    if (e.what === "node") return l.nodes[e.id];
    if (e.what === "change") return l.changes[e.id];
    return l.hidden.includes(e.id);
  }

  private applyEdit(e: Edit, side: "before" | "after") {
    const v = clone(e[side]);
    if (e.what === "bin") {
      this.bin = this.bin.filter((b) => b.id !== e.id);
      if (v) this.bin.push(v as BinEntry);
      return;
    }
    const l = this.layers.get(e.layer);
    if (!l) return;
    if (e.what === "node") {
      if (v === undefined) delete l.nodes[e.id];
      else l.nodes[e.id] = v as NodeRecord;
    } else if (e.what === "change") {
      if (v === undefined) delete l.changes[e.id];
      else l.changes[e.id] = v as NodeChange;
    } else {
      l.hidden = l.hidden.filter((h) => h !== e.id);
      if (v === true) l.hidden.push(e.id);
    }
  }

  /** Remember the state of something before the current step changes it. */
  private touch(layer: Id, what: Edit["what"], id: Id) {
    if (!this.tx) throw new EngineError("Changes must happen inside a step.");
    const key = `${layer}|${what}|${id}`;
    if (this.tx.seen.has(key)) return;
    this.tx.seen.add(key);
    const e: Edit = { layer, what, id, before: undefined, after: undefined };
    e.before = clone(this.readEditTarget(e));
    this.tx.edits.push(e);
  }

  // ---------- Writing ----------

  create(layerId: Id, kind: NodeKind, name: string, extra: Partial<NodeRecord> = {}): Id {
    return this.transact(`Created ${name}`, () => {
      const l = this.layer(layerId);
      const id = extra.id ?? newId();
      if (this.exists(layerId, id)) throw new EngineError("That id is already used.");
      const t = this.now();
      const rec: NodeRecord = {
        id,
        kind,
        name,
        category: null,
        picture: null,
        text: "",
        source: "mine",
        author: l.author,
        favourite: false,
        template: false,
        created: t,
        changed: t,
        parent: null,
        fields: {},
        attachments: [],
        ...clone(extra),
      };
      if (rec.parent) this.checkNoLoop(layerId, id, rec.parent.link);
      this.touch(layerId, "node", id);
      l.nodes[id] = rec;
      return id;
    });
  }

  /**
   * Changes a node as seen from a layer. If the node lives in this layer it is changed in place;
   * if it lives below, the change is stored in this layer only, so it never travels up or sideways.
   */
  edit(layerId: Id, nodeId: Id, fn: (rec: NodeRecord) => void) {
    this.transact(`Changed ${this.get(layerId, nodeId)?.name ?? "something"}`, () => {
      const before = this.get(layerId, nodeId);
      if (!before) throw new EngineError("That doesn't exist.");
      const after = clone(before);
      fn(after);
      after.id = before.id;
      after.kind = before.kind;
      if (after.parent && !deepEqual(after.parent, before.parent)) this.checkNoLoop(layerId, nodeId, after.parent.link);
      if (deepEqual(after, before)) return;
      after.changed = this.now();
      const l = this.layer(layerId);
      if (l.nodes[nodeId]) {
        this.touch(layerId, "node", nodeId);
        l.nodes[nodeId] = after;
        return;
      }
      // Store only the difference against what the layers below say.
      const below = this.getBelow(layerId, nodeId)!;
      const ch: NodeChange = {};
      for (const k of ["name", "category", "picture", "text", "favourite", "template", "parent", "changed"] as const) {
        if (!deepEqual(after[k], below[k])) (ch as Record<string, unknown>)[k] = clone(after[k]);
      }
      const fields: Record<string, Value> = {};
      for (const [k, v] of Object.entries(after.fields)) if (!(k in below.fields) || !deepEqual(v, below.fields[k])) fields[k] = clone(v);
      const removed = Object.keys(below.fields).filter((k) => !(k in after.fields));
      if (Object.keys(fields).length) ch.fields = fields;
      if (removed.length) ch.removedFields = removed;
      if (!deepEqual(after.attachments, below.attachments)) ch.attachments = clone(after.attachments);
      this.touch(layerId, "change", nodeId);
      if (Object.keys(ch).length === 0 || (Object.keys(ch).length === 1 && "changed" in ch)) delete l.changes[nodeId];
      else l.changes[nodeId] = ch;
    });
  }

  private getBelow(layerId: Id, nodeId: Id): NodeRecord | null {
    const base = this.layer(layerId).base;
    return base ? this.get(base, nodeId) : null;
  }

  /** Sets one field. `undefined` removes this node's own value so it follows its parent again. */
  setField(layerId: Id, nodeId: Id, key: string, value: Value | undefined) {
    this.edit(layerId, nodeId, (r) => {
      if (value === undefined) delete r.fields[key];
      else r.fields[key] = clone(value);
    });
  }

  setParent(layerId: Id, nodeId: Id, parentId: Id | null) {
    if (parentId && !this.exists(layerId, parentId)) throw new EngineError("That parent doesn't exist.");
    this.edit(layerId, nodeId, (r) => {
      r.parent = parentId ? link(parentId) : null;
    });
  }

  private checkNoLoop(layerId: Id, nodeId: Id, parentId: Id) {
    let cur: Id | undefined = parentId;
    const seen = new Set<Id>();
    while (cur) {
      if (cur === nodeId) throw new EngineError("That would make something a variant of itself.");
      if (seen.has(cur)) break;
      seen.add(cur);
      cur = this.get(layerId, cur)?.parent?.link;
    }
  }

  /** Attaches a brick (or an item) to a node, optionally inside another attachment. Returns its aid. */
  attach(layerId: Id, nodeId: Id, brickId: Id | null, opts: Partial<Attachment> = {}, insideAid?: Id): Id {
    const aid = newId();
    const att: Attachment = {
      aid,
      brick: brickId ? link(brickId) : null,
      name: null,
      overrides: {},
      activation: defaultActivation(),
      uses: null,
      save: null,
      children: [],
      tiers: [],
      choice: null,
      ...clone(opts),
    };
    att.aid = aid;
    this.edit(layerId, nodeId, (r) => {
      if (!insideAid) {
        r.attachments.push(att);
        return;
      }
      const parent = findAttachment(r.attachments, insideAid);
      if (!parent) throw new EngineError("That piece isn't on this sheet.");
      parent.children.push(att);
    });
    return aid;
  }

  editAttachment(layerId: Id, nodeId: Id, aid: Id, fn: (a: Attachment) => void) {
    this.edit(layerId, nodeId, (r) => {
      const a = findAttachment(r.attachments, aid);
      if (!a) throw new EngineError("That piece isn't on this sheet.");
      fn(a);
      a.aid = aid;
    });
  }

  removeAttachment(layerId: Id, nodeId: Id, aid: Id) {
    this.edit(layerId, nodeId, (r) => {
      if (!removeAttachmentFrom(r.attachments, aid)) throw new EngineError("That piece isn't on this sheet.");
    });
  }

  /** Points a link somewhere else (or clears it with null). */
  setLink(slot: Slot, to: Id | null) {
    this.edit(slot.layer, slot.node, (r) => {
      if (!setAt(r, slot.path, to ? link(to) : null)) throw new EngineError("That link is gone.");
    });
  }

  // ---------- Deleting and the recycle bin ----------

  /** Moves a node to the recycle bin. Its variants are promoted, so they keep working. */
  delete(layerId: Id, nodeId: Id): Id {
    const rec = this.get(layerId, nodeId);
    if (!rec) throw new EngineError("That doesn't exist.");
    return this.transact(`Removed ${rec.name}`, () => {
      const binId = newId();
      const pointedHere = this.usedByEverywhere(layerId, nodeId).filter((s) => s.node !== nodeId);
      const moved: BinEntry["moved"] = [];
      // Promote variants: copy in what they inherited, then stand alone.
      // Each variant is promoted in the layer that stores it.
      for (const ctx of this.layersAbove(layerId)) {
        for (const child of this.childrenOf(ctx, nodeId)) {
          if (this.owner(ctx, child) !== ctx) continue;
          const r = this.resolve(ctx, child)!;
          this.edit(ctx, child, (c) => {
            c.fields = clone(r.fields);
            c.attachments = [
              ...c.attachments,
              ...r.attachments.filter((x) => x.from !== null).map((x) => withNewAids(x.attachment)),
            ];
            c.parent = null;
          });
          moved.push({ slot: { layer: ctx, node: child, path: ["parent"] }, to: null });
        }
      }
      const l = this.layer(layerId);
      const owned = !!l.nodes[nodeId];
      if (owned) {
        this.touch(layerId, "node", nodeId);
        delete l.nodes[nodeId];
      } else {
        this.touch(layerId, "hidden", nodeId);
        l.hidden.push(nodeId);
      }
      this.touch("", "bin", binId);
      this.bin.push({ id: binId, deleted: this.now(), layer: layerId, owned, node: rec, pointedHere, moved });
      return binId;
    });
  }

  binEntryFor(nodeId: Id): BinEntry | undefined {
    return this.bin.find((b) => b.node.id === nodeId);
  }

  /**
   * Brings a node back. Links that still point at it work again on their own. Returns the links
   * that were moved elsewhere in the meantime, so the user can choose which to reconnect.
   */
  restore(binId: Id): { slot: Slot; to: Id | null; changedSince: boolean }[] {
    const entry = this.bin.find((b) => b.id === binId);
    if (!entry) throw new EngineError("That isn't in the recycle bin.");
    return this.transact(`Restored ${entry.node.name}`, () => {
      const l = this.layer(entry.layer);
      if (entry.owned) {
        this.touch(entry.layer, "node", entry.node.id);
        l.nodes[entry.node.id] = clone(entry.node);
      } else {
        this.touch(entry.layer, "hidden", entry.node.id);
        l.hidden = l.hidden.filter((h) => h !== entry.node.id);
      }
      this.touch("", "bin", binId);
      this.bin = this.bin.filter((b) => b.id !== binId);
      return entry.moved.map((m) => {
        const now = this.get(m.slot.layer, m.slot.node);
        const cur = now ? getAt(now, m.slot.path) : undefined;
        const curId = isLink(cur) ? cur.link : null;
        return { slot: m.slot, to: m.to, changedSince: curId !== m.to };
      });
    });
  }

  /** Points the chosen links back at a restored node. Restored parents drop copied values they no longer need. */
  reconnect(slots: Slot[], to: Id) {
    this.transact(`Reconnected ${slots.length} to ${this.anyName(to)}`, () => {
      for (const s of slots) {
        if (samePath(s.path, ["parent"])) {
          const parent = this.resolve(s.layer, to);
          this.edit(s.layer, s.node, (c) => {
            c.parent = link(to);
            if (!parent) return;
            for (const [k, v] of Object.entries(c.fields)) if (deepEqual(v, parent.fields[k])) delete c.fields[k];
          });
        } else this.setLink(s, to);
      }
    });
  }

  /**
   * Fixes links that point at something deleted: either move them to `to`, or remove them.
   * Removing a link that is the brick of an attachment removes that attachment.
   * Moves are remembered in the bin so a restore can offer to undo them.
   */
  fixLinks(slots: Slot[], missing: Id, to: Id | null) {
    const entry = this.binEntryFor(missing);
    this.transact(to ? `${slots.length} now use ${this.anyName(to)} instead of ${entry?.node.name ?? "it"}` : `${slots.length} no longer link to ${entry?.node.name ?? "it"}`, () => {
      for (const s of slots) {
        const last = s.path[s.path.length - 1];
        const owner = s.path[s.path.length - 2];
        if (!to && last === "brick" && typeof owner === "object") this.removeAttachment(s.layer, s.node, owner.aid);
        else this.setLink(s, to);
      }
      if (entry) {
        this.touch("", "bin", entry.id);
        entry.moved.push(...slots.map((slot) => ({ slot: clone(slot), to })));
      }
    });
  }

  /**
   * The one truly permanent action (the app always asks first). So that undo can't quietly bring
   * an emptied item back, undo history up to the last step that touched an emptied item is cleared.
   */
  emptyBin(binIds?: Id[]) {
    const gone = new Set((binIds ? this.bin.filter((b) => binIds.includes(b.id)) : this.bin).map((b) => b.id));
    this.bin = this.bin.filter((b) => !gone.has(b.id));
    let last = -1;
    this.history.forEach((s, i) => {
      if (s.edits.some((e) => e.what === "bin" && gone.has(e.id))) last = i;
    });
    if (last >= 0) this.history = this.history.slice(last + 1);
    this.redoStack = this.redoStack.filter((s) => !s.edits.some((e) => e.what === "bin" && gone.has(e.id)));
  }

  // ---------- Changes flowing down with the checklist ----------

  /**
   * Changes fields on a parent and decides, child by child, who gets the change.
   * `ticked` lists the variants that should get it; leave it out to give it to everyone.
   * Unticked variants keep the old value as their own (a pencil mark). Variants that already set
   * the field themselves are never touched.
   */
  changeDown(layerId: Id, nodeId: Id, changes: Record<string, Value | undefined>, ticked?: Set<Id>) {
    const rec = this.get(layerId, nodeId);
    if (!rec) throw new EngineError("That doesn't exist.");
    this.transact(`Changed ${rec.name}`, () => {
      const descendants: { id: Id; depth: number }[] = [];
      const walk = (id: Id, depth: number) => {
        for (const c of this.childrenOf(layerId, id)) {
          descendants.push({ id: c, depth });
          walk(c, depth + 1);
        }
      };
      walk(nodeId, 1);
      const oldValues = new Map(descendants.map((d) => [d.id, this.resolve(layerId, d.id)!.fields]));
      // Before the change: does this variant's value come from the node being changed, or did
      // it (or something between them) set the value itself?
      const follows = (d: Id, k: string): boolean => {
        let cur: Id | undefined = d;
        while (cur && cur !== nodeId) {
          const r = this.get(layerId, cur);
          if (!r || k in r.fields) return false;
          cur = r.parent?.link;
        }
        return cur === nodeId;
      };
      const followed = new Map(descendants.map((d) => [d.id, new Set(Object.keys(changes).filter((k) => follows(d.id, k)))]));
      this.edit(layerId, nodeId, (r) => {
        for (const [k, v] of Object.entries(changes)) {
          if (v === undefined) delete r.fields[k];
          else r.fields[k] = clone(v);
        }
      });
      descendants.sort((a, b) => a.depth - b.depth);
      for (const d of descendants) {
        const own = this.get(layerId, d.id)!;
        const parentFields = this.resolve(layerId, own.parent!.link)!.fields;
        const gets = !ticked || ticked.has(d.id);
        for (const k of Object.keys(changes)) {
          if (k in own.fields) continue;
          const desired = gets && followed.get(d.id)!.has(k) ? this.resolve(layerId, nodeId)!.fields[k] : oldValues.get(d.id)![k];
          if (!deepEqual(desired, parentFields[k])) this.setField(layerId, d.id, k, desired);
        }
      }
    });
  }

  /**
   * Changes a library brick's values. Sheets using it follow, except unticked ones, whose
   * attachment keeps the old value as its own.
   */
  changeBrick(layerId: Id, brickId: Id, changes: Record<string, Value | undefined>, tickedSheets?: Set<Id>) {
    const rec = this.get(layerId, brickId);
    if (!rec) throw new EngineError("That doesn't exist.");
    this.transact(`Changed ${rec.name}`, () => {
      const old = clone(rec.fields);
      const users = this.usedBy(layerId, brickId).filter((s) => s.path[s.path.length - 1] === "brick" && s.path[0] === "attachments");
      this.edit(layerId, brickId, (r) => {
        for (const [k, v] of Object.entries(changes)) {
          if (v === undefined) delete r.fields[k];
          else r.fields[k] = clone(v);
        }
      });
      for (const s of users) {
        if (!tickedSheets || tickedSheets.has(s.node)) continue;
        const owner = s.path[s.path.length - 2];
        if (typeof owner !== "object") continue;
        this.editAttachment(s.layer, s.node, owner.aid, (a) => {
          for (const k of Object.keys(changes)) if (!(k in a.overrides) && old[k] !== undefined) a.overrides[k] = clone(old[k]!);
        });
      }
    });
  }

  private anyName(id: Id): string {
    for (const l of this.layers.values()) if (l.nodes[id]) return l.nodes[id]!.name;
    return this.binEntryFor(id)?.node.name ?? "it";
  }
}

// ---------- Helpers ----------

function applyChange(rec: NodeRecord, ch: NodeChange): NodeRecord {
  const out = { ...rec };
  for (const k of ["name", "category", "picture", "text", "favourite", "template", "parent", "changed"] as const) {
    if (k in ch) (out as Record<string, unknown>)[k] = clone(ch[k]);
  }
  if (ch.fields || ch.removedFields) {
    out.fields = { ...rec.fields };
    for (const k of ch.removedFields ?? []) delete out.fields[k];
    for (const [k, v] of Object.entries(ch.fields ?? {})) out.fields[k] = clone(v);
  }
  if (ch.attachments) out.attachments = clone(ch.attachments);
  return out;
}

export function findAttachment(list: Attachment[], aid: Id): Attachment | null {
  for (const a of list) {
    if (a.aid === aid) return a;
    const inner = findAttachment(a.children, aid);
    if (inner) return inner;
  }
  return null;
}

function removeAttachmentFrom(list: Attachment[], aid: Id): boolean {
  const i = list.findIndex((a) => a.aid === aid);
  if (i >= 0) {
    list.splice(i, 1);
    return true;
  }
  return list.some((a) => removeAttachmentFrom(a.children, aid));
}

function withNewAids(a: Attachment): Attachment {
  const c = clone(a);
  const fix = (x: Attachment) => {
    x.aid = newId();
    x.children.forEach(fix);
  };
  fix(c);
  return c;
}
