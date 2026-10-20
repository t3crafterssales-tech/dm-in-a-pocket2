// Field names the checks, sentences and rulebook rely on. Users never see these names; sheets and
// templates fill them in. Kept in one place so every part of the app agrees.

import { isLink } from "./links.ts";
import type { Attachment, Id, NodeRecord, Value } from "./types.ts";
import type { Workspace } from "./workspace.ts";

export const F = {
  /** being: "monster", "npc", "character", "race" or "class" */
  beingKind: "beingKind",
  hp: "hp",
  ac: "ac",
  speed: "speed",
  /** challenge rating, such as "1/4" or "2" */
  cr: "cr",
  /** cost in the system's money, such as "15 gp" */
  cost: "cost",
  weight: "weight",
  /** brick: "attack", "damage", "trait", "spell", "effect", "armor", "prop", "immunity", "abilityBonus" */
  type: "type",
  dice: "dice",
  damageType: "damageType",
  ability: "ability",
  condition: "condition",
  /** brick: rulebook wording with {field} placeholders */
  wording: "wording",
  /** category: "weapon", "armour", "item", "creature" or "spell" for the top of the built-in tree */
  role: "role",
  /** category: link to the category above it */
  under: "under",
  /** rule: a world rule, { field, equals }, meaning nothing may have that value */
  forbid: "forbid",
  /** rule: links to things that may break the world rule on purpose ("I meant that") */
  exceptions: "exceptions",
  /** lore: true for a page that appears only in a book (foreword, How to play) */
  bookPage: "bookPage",
  /** lore book page: which book types it appears in */
  books: "books",
  /** lore book page: the chapter it comes before */
  before: "before",
  /** marks content from the SRD 5.2, which needs a credit line */
  license: "license",
} as const;

export const SRD_LICENSE = "SRD 5.2 (CC-BY-4.0)";

/** Average roll of dice text such as "2d6+3". Unknown text counts as 0. */
export function averageDice(text: Value | undefined): number {
  if (typeof text === "number") return text;
  if (typeof text !== "string") return 0;
  let total = 0;
  for (const part of text.replace(/\s/g, "").split(/(?=[+-])/)) {
    const m = part.match(/^([+-]?)(\d*)d(\d+)$/i);
    if (m) total += (m[1] === "-" ? -1 : 1) * Number(m[2] || 1) * (Number(m[3]) + 1) / 2;
    else if (/^[+-]?\d+$/.test(part)) total += Number(part);
  }
  return total;
}

/** "1/4" -> 0.25. Returns null when it isn't a number. */
export function challenge(v: Value | undefined): number | null {
  if (typeof v === "number") return v;
  if (typeof v !== "string" || !v.trim()) return null;
  const s = v.trim();
  if (s.includes("/")) {
    const [a, b] = s.split("/").map(Number);
    return a !== undefined && b ? a / b : null;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const COIN: Record<string, number> = { cp: 0.01, sp: 0.1, ep: 0.5, gp: 1, pp: 10 };

/** "15 gp" -> 15, "5 sp" -> 0.5. Returns null for unknown money. */
export function costInGold(v: Value | undefined): number | null {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^([\d.,]+)\s*([a-z]+)?$/i);
  if (!m) return null;
  const n = Number(m[1]!.replace(/,/g, ""));
  const rate = m[2] ? COIN[m[2].toLowerCase()] : 1;
  return rate === undefined || !Number.isFinite(n) ? null : n * rate;
}

/** The values a sheet's copy of a brick actually has: the original's, then this sheet's changes. */
export function attachmentValues(ws: Workspace, layerId: Id, a: Attachment): Record<string, Value> {
  const brick = a.brick ? ws.resolve(layerId, a.brick.link) : null;
  return { ...(brick?.fields ?? {}), ...a.overrides };
}

/** The top-level role of a node's category ("weapon", "creature", ...), or null. */
export function categoryRole(ws: Workspace, layerId: Id, node: NodeRecord): string | null {
  let cur = node.category?.link;
  const seen = new Set<Id>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const c = ws.get(layerId, cur);
    if (!c) return null;
    const role = c.fields[F.role];
    if (typeof role === "string") return role;
    const up = c.fields[F.under];
    cur = isLink(up) ? up.link : undefined;
  }
  return null;
}

/** Average damage a round from a node's attacks, including attacks on items it carries. */
export function damagePerRound(ws: Workspace, layerId: Id, nodeId: Id): number {
  const r = ws.resolve(layerId, nodeId);
  if (!r) return 0;
  let total = 0;
  for (const { attachment } of r.attachments) total += attachmentDamage(ws, layerId, attachment, new Set([nodeId]));
  return total;
}

function attachmentDamage(ws: Workspace, layerId: Id, a: Attachment, seen: Set<Id>): number {
  if (!a.brick) return 0;
  const target = ws.get(layerId, a.brick.link);
  if (!target) return 0;
  if (target.kind === "item") {
    if (seen.has(target.id)) return 0;
    seen.add(target.id);
    const item = ws.resolve(layerId, target.id)!;
    return item.attachments.reduce((s, x) => s + attachmentDamage(ws, layerId, x.attachment, seen), 0);
  }
  const v = attachmentValues(ws, layerId, a);
  // Nested pieces only happen sometimes, so they aren't counted as every-round damage.
  return v[F.type] === "attack" || v[F.type] === "damage" ? averageDice(v[F.dice]) : 0;
}

/** True if the node has an attack, directly or on an item it carries. */
export function hasAttack(ws: Workspace, layerId: Id, nodeId: Id, seen: Set<Id> = new Set()): boolean {
  if (seen.has(nodeId)) return false;
  seen.add(nodeId);
  const r = ws.resolve(layerId, nodeId);
  if (!r) return false;
  return r.attachments.some(({ attachment: a }) => {
    if (!a.brick) return false;
    const t = ws.get(layerId, a.brick.link);
    if (!t) return false;
    if (t.kind === "item") return hasAttack(ws, layerId, t.id, seen);
    return attachmentValues(ws, layerId, a)[F.type] === "attack";
  });
}
