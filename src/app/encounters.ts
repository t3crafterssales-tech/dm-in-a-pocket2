// Encounters (version 2): the parts of a module, in a tree like File Explorer. An encounter can sit
// inside another encounter, any depth ("inside" is belonging, not inheritance). Deleting one moves
// what was inside it up a level; moving one moves everything inside it. Plain functions on the
// engine, inside the caller's step unless they say otherwise.

import { isLink, link } from "../engine/index.ts";
import type { BinEntry, Id, NodeRecord, Value, Workspace } from "../engine/index.ts";

export const ENCOUNTER_FIELDS = ["readAloud", "inside", "order", "leadsTo", "creatures", "treasure", "handouts"] as const;

export interface EncounterNode {
  id: Id;
  name: string;
  /** "2.1.3": where it sits, counted from the top. */
  number: string;
  depth: number;
  inside: Id | null;
  children: EncounterNode[];
  /** How many creatures, for the tree's little note. */
  creatures: number;
}

const linkOf = (v: Value | undefined): Id | null => (isLink(v) ? v.link : null);
const numberOf = (v: Value | undefined): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Every encounter in the layer that belongs to its tree (templates live in the Codex instead). */
function treeEncounters(ws: Workspace, layerId: Id): { n: NodeRecord; f: Record<string, Value> }[] {
  return ws
    .list(layerId, "encounter")
    .filter((n) => !n.template)
    .map((n) => ({ n, f: ws.resolve(layerId, n.id)!.fields }));
}

/** The encounters directly inside `parent` (null for the top level), in order. */
export function encountersInside(ws: Workspace, layerId: Id, parent: Id | null): NodeRecord[] {
  const all = treeEncounters(ws, layerId);
  const ids = new Set(all.map((x) => x.n.id));
  return all
    .filter(({ f }) => {
      const p = linkOf(f.inside);
      // Something inside an encounter that is gone shows at the top level, never lost.
      return parent === null ? !p || !ids.has(p) : p === parent;
    })
    .sort((a, b) => numberOf(a.f.order) - numberOf(b.f.order) || a.n.name.localeCompare(b.n.name))
    .map((x) => x.n);
}

/** The whole tree, numbered 1, 1.1, 2... */
export function encounterTree(ws: Workspace, layerId: Id): EncounterNode[] {
  const build = (parent: Id | null, prefix: string, depth: number, seen: Set<Id>): EncounterNode[] =>
    encountersInside(ws, layerId, parent)
      .filter((n) => !seen.has(n.id))
      .map((n, i) => {
        seen.add(n.id);
        const f = ws.resolve(layerId, n.id)!.fields;
        const number = prefix ? `${prefix}.${i + 1}` : String(i + 1);
        const creatures = Array.isArray(f.creatures) ? f.creatures.reduce<number>((t, c) => t + (c && typeof c === "object" && !Array.isArray(c) ? numberOf((c as Record<string, Value>).count) || 1 : 0), 0) : 0;
        return { id: n.id, name: n.name, number, depth, inside: parent, children: build(n.id, number, depth + 1, seen), creatures };
      });
  return build(null, "", 0, new Set());
}

/** Every encounter in the tree, flattened in reading order. */
export function flatTree(tree: EncounterNode[]): EncounterNode[] {
  return tree.flatMap((e) => [e, ...flatTree(e.children)]);
}

/** The number each encounter shows ("2.1"), by id. */
export function encounterNumbers(ws: Workspace, layerId: Id): Map<Id, string> {
  return new Map(flatTree(encounterTree(ws, layerId)).map((e) => [e.id, e.number]));
}

/** Gives the encounters at one level the orders 1, 2, 3... in their current order (changes only what differs). */
function renumber(ws: Workspace, layerId: Id, parent: Id | null, ordered?: Id[]) {
  const ids = ordered ?? encountersInside(ws, layerId, parent).map((n) => n.id);
  ids.forEach((id, i) => {
    if (numberOf(ws.resolve(layerId, id)!.fields.order) !== i + 1) ws.setField(layerId, id, "order", i + 1);
  });
}

/**
 * A new encounter, at the end of `inside` (or the top level). In a world or system it is a
 * ready-made encounter for the Codex (a template), since encounters belong to modules.
 */
export function createEncounter(ws: Workspace, layerId: Id, name: string, inside: Id | null = null): Id {
  const isModule = ws.layer(layerId).type === "module";
  if (inside) {
    const p = ws.get(layerId, inside);
    if (!p || p.kind !== "encounter") throw new Error("That encounter isn't here any more.");
  }
  const order = isModule ? encountersInside(ws, layerId, inside).length + 1 : 0;
  return ws.create(layerId, "encounter", name, {
    template: !isModule,
    fields: { readAloud: "", inside: inside ? link(inside) : null, order, leadsTo: [], creatures: [], treasure: [], handouts: [] },
  });
}

/** True if `maybeInside` is `id` or sits somewhere inside it. */
function within(ws: Workspace, layerId: Id, maybeInside: Id, id: Id): boolean {
  const seen = new Set<Id>();
  let cur: Id | null = maybeInside;
  while (cur && !seen.has(cur)) {
    if (cur === id) return true;
    seen.add(cur);
    cur = linkOf(ws.resolve(layerId, cur)?.fields.inside);
  }
  return false;
}

/**
 * Moves encounters (each with everything inside it) to a new place: inside `inside` (null for the
 * top level), before `before` (null for the end). The numbers update by themselves.
 */
export function moveEncounters(ws: Workspace, layerId: Id, ids: Id[], inside: Id | null, before: Id | null = null) {
  for (const id of ids) {
    if (ws.get(layerId, id)?.kind !== "encounter") throw new Error("Only encounters can be moved in the tree.");
    if (inside && within(ws, layerId, inside, id)) throw new Error("An encounter can't go inside itself.");
  }
  // Drop the moved ones from the levels they leave, then place them.
  const oldParents = new Set(ids.map((id) => linkOf(ws.resolve(layerId, id)!.fields.inside)));
  for (const id of ids) ws.setField(layerId, id, "inside", inside ? link(inside) : null);
  for (const p of oldParents) if (p !== inside) renumber(ws, layerId, p);
  const others = encountersInside(ws, layerId, inside).map((n) => n.id).filter((id) => !ids.includes(id));
  const at = before && others.includes(before) ? others.indexOf(before) : others.length;
  renumber(ws, layerId, inside, [...others.slice(0, at), ...ids, ...others.slice(at)]);
}

/**
 * Deletes an encounter. What was inside it moves up one level into its place, in the same order,
 * and is renumbered. The bin remembers, so Restore (or Ctrl+Z) can put them back inside.
 */
export function deleteEncounter(ws: Workspace, layerId: Id, id: Id): Id {
  const rec = ws.get(layerId, id);
  if (!rec || rec.kind !== "encounter") throw new Error("That encounter isn't here any more.");
  const parent = linkOf(ws.resolve(layerId, id)!.fields.inside);
  const kids = encountersInside(ws, layerId, id).map((n) => n.id);
  const siblings = encountersInside(ws, layerId, parent).map((n) => n.id);
  const at = siblings.indexOf(id);
  for (const k of kids) ws.setField(layerId, k, "inside", parent ? link(parent) : null);
  const binId = ws.delete(layerId, id);
  renumber(ws, layerId, parent, [...siblings.slice(0, at), ...kids, ...siblings.slice(at + 1)]);
  // Remember who was inside, so restoring offers to put them back.
  const entry = ws.bin.find((b) => b.id === binId) as BinEntry | undefined;
  if (entry) for (const k of kids) entry.moved.push({ slot: { layer: layerId, node: k, path: ["fields", "inside"] }, to: parent });
  return binId;
}

/**
 * Drops things from the Codex onto an encounter: creatures (counted), items as treasure, lore
 * pages as handouts, other encounters as "Leads to". Returns what went where.
 */
export function addToEncounter(ws: Workspace, layerId: Id, encounterId: Id, ids: Id[], count = 1): { creatures: number; treasure: number; handouts: number; leadsTo: number } {
  const enc = ws.resolve(layerId, encounterId);
  if (!enc || enc.record.kind !== "encounter") throw new Error("That encounter isn't here any more.");
  const f = enc.fields;
  const creatures = (Array.isArray(f.creatures) ? structuredClone(f.creatures) : []) as Record<string, Value>[];
  const treasure = (Array.isArray(f.treasure) ? structuredClone(f.treasure) : []) as Value[];
  const handouts = (Array.isArray(f.handouts) ? structuredClone(f.handouts) : []) as Value[];
  const leadsTo = (Array.isArray(f.leadsTo) ? structuredClone(f.leadsTo) : []) as Value[];
  const has = (list: Value[], id: Id) => list.some((v) => linkOf(v) === id);
  const out = { creatures: 0, treasure: 0, handouts: 0, leadsTo: 0 };
  for (const id of ids) {
    const n = ws.get(layerId, id);
    if (!n || id === encounterId) continue;
    if (n.kind === "being") {
      const c = creatures.find((x) => linkOf(x.being) === id);
      if (c) c.count = numberOf(c.count) + count;
      else creatures.push({ being: link(id), count });
      out.creatures++;
    } else if (n.kind === "item" && !has(treasure, id)) (treasure.push(link(id)), out.treasure++);
    else if ((n.kind === "lore" || n.kind === "table") && !has(handouts, id)) (handouts.push(link(id)), out.handouts++);
    else if (n.kind === "encounter" && !n.template && !has(leadsTo, id)) (leadsTo.push(link(id)), out.leadsTo++);
  }
  ws.setField(layerId, encounterId, "creatures", creatures);
  ws.setField(layerId, encounterId, "treasure", treasure);
  ws.setField(layerId, encounterId, "handouts", handouts);
  ws.setField(layerId, encounterId, "leadsTo", leadsTo);
  return out;
}

/**
 * A ready-made encounter from the Codex placed into a module: the module gets its own copy, with
 * everything that was inside it, to change freely.
 */
export function placeEncounter(ws: Workspace, layerId: Id, sourceId: Id, inside: Id | null): Id {
  const copy = (src: Id, into: Id | null): Id => {
    const r = ws.resolve(layerId, src);
    if (!r || r.record.kind !== "encounter") throw new Error("That encounter isn't here any more.");
    const id = createEncounter(ws, layerId, r.record.name, into);
    const fields = structuredClone(r.fields);
    for (const k of ["readAloud", "creatures", "treasure", "handouts"]) if (fields[k] !== undefined) ws.setField(layerId, id, k, fields[k]!);
    ws.edit(layerId, id, (c) => {
      c.text = r.record.text;
      c.picture = r.record.picture;
    });
    // What was inside the ready-made one comes along (templates keep their own inner encounters).
    const inner = ws
      .list(layerId, "encounter")
      .filter((n) => linkOf(ws.resolve(layerId, n.id)!.fields.inside) === src)
      .sort((a, b) => numberOf(ws.resolve(layerId, a.id)!.fields.order) - numberOf(ws.resolve(layerId, b.id)!.fields.order));
    for (const k of inner) copy(k.id, id);
    return id;
  };
  return copy(sourceId, inside);
}

/** "Save to the Codex": a ready-made copy (a template) of an encounter, with what's inside it. */
export function saveEncounterToCodex(ws: Workspace, layerId: Id, id: Id): Id {
  const copy = (src: Id, into: Id | null): Id => {
    const r = ws.resolve(layerId, src)!;
    const newIdValue = ws.create(layerId, "encounter", r.record.name, { template: true, text: r.record.text, picture: r.record.picture, fields: { ...structuredClone(r.fields), inside: into ? link(into) : null, leadsTo: [] } });
    encountersInside(ws, layerId, src).forEach((k) => copy(k.id, newIdValue));
    return newIdValue;
  };
  return copy(id, null);
}

