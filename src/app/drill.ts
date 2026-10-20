// Drilling into a brick on a sheet (changing it for that sheet only), nesting bricks inside
// bricks, and Edit parent: changing a parent and choosing, on a checklist of its whole family,
// which children get the change.

import { F, attachmentValues, findAttachment, sentence } from "../engine/index.ts";
import type { Activation, Attachment, Id, Save, Uses, Value, Workspace } from "../engine/index.ts";

export interface AttachmentDetail {
  aid: Id;
  /** The sheet it is on, and where it came from if inherited. */
  nodeId: Id;
  inheritedFrom: { id: Id; name: string } | null;
  brickId: Id | null;
  /** The library original's name, and the name used on this sheet only (or null). */
  originalName: string;
  ownName: string | null;
  type: string;
  /** The original's values; `overrides` are this sheet's own (pencil marks). */
  original: Record<string, Value>;
  overrides: Record<string, Value>;
  activation: Activation;
  uses: Uses | null;
  save: Save | null;
  sentence: string;
  /** Bricks nested inside: they happen only when this one does. */
  children: { aid: Id; name: string; sentence: string }[];
  /** The original is gone. */
  missing: boolean;
}

/** Finds an attachment on a sheet, own or inherited, and the node that stores it. */
function locate(ws: Workspace, layerId: Id, nodeId: Id, aid: Id): { a: Attachment; owner: Id; top: Attachment } | null {
  const r = ws.resolve(layerId, nodeId);
  if (!r) return null;
  for (const { attachment, from } of r.attachments) {
    const a = attachment.aid === aid ? attachment : findAttachment(attachment.children, aid);
    if (a) return { a, owner: from ?? nodeId, top: attachment };
  }
  return null;
}

export function attachmentDetail(ws: Workspace, layerId: Id, nodeId: Id, aid: Id): AttachmentDetail {
  const found = locate(ws, layerId, nodeId, aid);
  if (!found) throw new Error("That isn't on this sheet any more.");
  const { a, owner } = found;
  const target = a.brick ? ws.get(layerId, a.brick.link) : null;
  const original = target ? ws.resolve(layerId, target.id)!.fields : {};
  const nameOf = (x: Attachment) => x.name || (x.brick ? (ws.get(layerId, x.brick.link)?.name ?? ws.binEntryFor(x.brick.link)?.node.name ?? "Something removed") : "Choice");
  const ownerNode = owner !== nodeId ? ws.get(layerId, owner) : null;
  return {
    aid,
    nodeId,
    inheritedFrom: ownerNode ? { id: ownerNode.id, name: ownerNode.name } : null,
    brickId: a.brick?.link ?? null,
    originalName: target?.name ?? (a.brick ? (ws.binEntryFor(a.brick.link)?.node.name ?? "Something removed") : "Choice"),
    ownName: a.name,
    type: target?.kind === "item" ? "item" : String(attachmentValues(ws, layerId, a)[F.type] ?? "trait"),
    original,
    overrides: a.overrides,
    activation: a.activation,
    uses: a.uses,
    save: a.save,
    sentence: sentence(ws, layerId, a),
    children: a.children.map((c) => ({ aid: c.aid, name: nameOf(c), sentence: sentence(ws, layerId, c) })),
    missing: !!a.brick && !target,
  };
}

export interface AttachmentPatch {
  /** A name for this sheet only; "" or null goes back to the original's name. */
  name?: string | null;
  /** Values for this sheet only. Null removes this sheet's value, so it follows the original again. */
  overrides?: Record<string, Value | null>;
  activation?: Activation;
  uses?: Uses | null;
  save?: Save | null;
}

const TRIGGER_IDS = new Set(["always", "hit", "crit", "whenHit", "bloodied", "zero", "flanked", "unaware", "belowHalf", "action", "bonus", "reaction", "nat", "custom"]);

/** Changes one copy of a brick on one sheet. The library original is untouched. One undo step. */
export function editAttachment(ws: Workspace, layerId: Id, nodeId: Id, aid: Id, patch: AttachmentPatch) {
  const node = ws.get(layerId, nodeId);
  if (!node) throw new Error("That isn't here any more.");
  if (!findAttachment(node.attachments, aid)) {
    throw new Error(locate(ws, layerId, nodeId, aid) ? "That comes from its parent. Change it there, or Detach this one first." : "That isn't on this sheet any more.");
  }
  if (patch.activation) {
    const act = patch.activation;
    if (!Array.isArray(act.when) || !act.when.length || act.when.some((w) => !TRIGGER_IDS.has(w))) throw new Error("That isn't a trigger the app knows.");
    if (act.join !== "any" && act.join !== "all") throw new Error("Triggers are joined by any or all.");
  }
  const d = attachmentDetail(ws, layerId, nodeId, aid);
  ws.transact(`Changed ${d.ownName || d.originalName} on ${node.name}`, () =>
    ws.editAttachment(layerId, nodeId, aid, (a) => {
      if (patch.name !== undefined) a.name = patch.name?.trim() ? patch.name.trim() : null;
      for (const [k, v] of Object.entries(patch.overrides ?? {})) {
        if (!/^[A-Za-z][A-Za-z0-9]*$/.test(k)) throw new Error("That isn't a value this app knows.");
        // Setting the same value as the original is the same as following it.
        if (v === null || JSON.stringify(v) === JSON.stringify(d.original[k])) delete a.overrides[k];
        else a.overrides[k] = structuredClone(v);
      }
      if (patch.activation) a.activation = structuredClone(patch.activation);
      if (patch.uses !== undefined) a.uses = patch.uses ? structuredClone(patch.uses) : null;
      if (patch.save !== undefined) a.save = patch.save ? structuredClone(patch.save) : null;
    }),
  );
}

/** Drops bricks inside a brick on a sheet: Knocked prone inside Big Shield happens only when it does. */
export function attachInside(ws: Workspace, layerId: Id, nodeId: Id, aid: Id, bricks: Id[]) {
  const node = ws.get(layerId, nodeId);
  if (!node) throw new Error("That isn't here any more.");
  const outer = findAttachment(node.attachments, aid);
  if (!outer) throw new Error(locate(ws, layerId, nodeId, aid) ? "That comes from its parent. Change it there, or Detach this one first." : "That isn't on this sheet any more.");
  const b = bricks.map((id) => ws.get(layerId, id)).filter((n) => !!n && (n.kind === "brick" || n.kind === "item"));
  if (!b.length) throw new Error("Only bricks and items can be added.");
  const outerName = outer.name || (outer.brick ? ws.get(layerId, outer.brick.link)?.name : null) || "it";
  ws.transact(b.length === 1 ? `Added ${b[0]!.name} inside ${outerName}` : `Added ${b.length} bricks inside ${outerName}`, () => {
    for (const brick of b) ws.attach(layerId, nodeId, brick!.id, {}, aid);
  });
}

// ---------- Edit parent: the checklist of the whole family ----------

export interface FamilyRow {
  id: Id;
  name: string;
  depth: number;
  /** "set its own Hit points" or "follows Axe": it won't get the change whatever is ticked. */
  note: string | null;
  /** False when it set every changed value itself, so ticking makes no difference. */
  canGet: boolean;
}

/**
 * Every descendant of a node, indented, with notes on who keeps their own value. `fields` are the
 * values being changed; `labels` gives them plain names for the notes.
 */
export function familyChecklist(ws: Workspace, layerId: Id, parentId: Id, fields: string[], labels: Record<string, string> = {}): FamilyRow[] {
  const rows: FamilyRow[] = [];
  const walk = (id: Id, depth: number) => {
    for (const c of ws.childrenOf(layerId, id).sort((a, b) => (ws.get(layerId, a)?.name ?? "").localeCompare(ws.get(layerId, b)?.name ?? ""))) {
      const notes: string[] = [];
      let blocked = 0;
      for (const k of fields) {
        let cur: Id | undefined = c;
        while (cur && cur !== parentId) {
          const r = ws.get(layerId, cur);
          if (!r) break;
          if (k in r.fields) {
            notes.push(cur === c ? `set its own ${labels[k] ?? k}` : `follows ${r.name}`);
            blocked++;
            break;
          }
          cur = r.parent?.link;
        }
      }
      rows.push({ id: c, name: ws.get(layerId, c)!.name, depth, note: notes.length ? [...new Set(notes)].join("; ") : null, canGet: blocked < fields.length });
      walk(c, depth + 1);
    }
  };
  walk(parentId, 0);
  return rows;
}

/** Changes a parent's values; ticked children get the change, unticked ones keep the old value. */
export function changeParent(ws: Workspace, layerId: Id, parentId: Id, changes: Record<string, Value | null>, ticked: Id[] | null) {
  const p = ws.get(layerId, parentId);
  if (!p) throw new Error("That parent isn't here any more.");
  const clean: Record<string, Value | undefined> = {};
  for (const [k, v] of Object.entries(changes)) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(k)) throw new Error("That isn't a value this app knows.");
    clean[k] = v === null ? undefined : v;
  }
  if (!Object.keys(clean).length) return;
  ws.transact(`Changed ${p.name}`, () => ws.changeDown(layerId, parentId, clean, ticked ? new Set(ticked) : undefined));
}
