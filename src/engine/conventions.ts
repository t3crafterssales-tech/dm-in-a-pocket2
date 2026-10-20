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
  /** category: which Rules tab section it is ("core", "abilities", ...); a user's own section has none */
  section: "section",
  /** ability, resource: the short label, such as "STR" or "HP" */
  label: "label",
  /** ability: the lowest and highest score */
  rangeMin: "rangeMin",
  rangeMax: "rangeMax",
  /** ability: how a score becomes a bonus: "d20" ((score - 10) / 2), "score", "table" or "none" */
  bonus: "bonus",
  /** resource: the maximum, a number or a formula (see Formula) */
  maximum: "maximum",
  /** resource: "full", "empty" or "set" (then startValue) */
  start: "start",
  startValue: "startValue",
  /** resource: "short rest", "long rest", "day", "spend" or "never" */
  recovery: "recovery",
  /** resource: "number", "bar", "boxes" or "countdown" */
  display: "display",
  /** resource: [{ at: number, condition: link }] */
  thresholds: "thresholds",
  /** core check: the family ("rollOver", "rollUnder", "pool", "bands", "percentile", "step", "none", "other") */
  family: "family",
  /** core check: the dice rolled, such as "d20" or "3d6" */
  die: "die",
  /** core check: the number to beat or the success threshold, depending on the family */
  target: "target",
  /** condition: how many stages it has (fatigue 1 to 6) */
  stages: "stages",
  /** condition, spell: how long it lasts or what ends it, in the user's words */
  duration: "duration",
  /** spell brick: its level, 0 for a cantrip */
  spellLevel: "spellLevel",
  /** spell brick: its school of magic, such as "Evocation" */
  school: "school",
  /** spell brick: casting time, range and components, in words ("Action", "150 feet", "V, S, M (a pinch of sulfur)") */
  castingTime: "castingTime",
  range: "range",
  components: "components",
  /** spell brick: true if it can be cast as a ritual */
  ritual: "ritual",
  /** spell brick: the classes that can learn it, in words ("Sorcerer, Wizard") */
  spellClasses: "spellClasses",
  /** class: how many levels its level table has (20 if not set) */
  maxLevel: "maxLevel",
  /** rule: "pointBuy" for point buy (with points, scoreStart, scoreMax, scoreMin and costs); otherwise written out */
  method: "method",
  /** condition: a saving throw to resist or end it, { ability: link, dc } */
  save: "save",
} as const;

/** class: the level a feature (an attachment, by its id) is gained at, one value per feature. */
export function levelKey(aid: string): string {
  return `level_${aid}`;
}

/**
 * A formula built from blocks, never typed: [Constitution] [score] [+] [10].
 * Stored as { formula: [{ op: "+", ability: link, use: "score" }, { op: "+", number: 10 }] }.
 */
export interface FormulaTerm {
  op: "+" | "-";
  ability?: { link: Id };
  use?: "score" | "bonus";
  number?: number;
}

export function isFormula(v: Value | undefined): v is { formula: Value[] } {
  return !!v && typeof v === "object" && !Array.isArray(v) && Array.isArray((v as Record<string, Value>).formula);
}

/** "Constitution score + 10". Numbers stay numbers; anything else reads as "not set". */
export function formulaText(ws: Workspace, layerId: Id, v: Value | undefined): string {
  if (typeof v === "number") return String(v);
  if (!isFormula(v)) return "not set";
  const parts = (v.formula as unknown as FormulaTerm[]).map((t, i) => {
    let word: string;
    if (t.ability) {
      const n = ws.get(layerId, t.ability.link)?.name ?? `[missing: ${ws.binEntryFor(t.ability.link)?.node.name ?? "removed"}]`;
      word = `${n} ${t.use === "bonus" ? "bonus" : "score"}`;
    } else word = String(t.number ?? 0);
    return i === 0 ? (t.op === "-" ? `-${word}` : word) : `${t.op} ${word}`;
  });
  return parts.join(" ") || "not set";
}

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

/**
 * Average damage a round from a node's attacks. Natural attacks (a bear's bite and claws) all
 * happen in a round; carried weapons are used one at a time, so only the best one counts.
 */
export function damagePerRound(ws: Workspace, layerId: Id, nodeId: Id): number {
  const r = ws.resolve(layerId, nodeId);
  if (!r) return 0;
  let natural = 0;
  let bestItem = 0;
  for (const { attachment } of r.attachments) {
    const d = attachmentDamage(ws, layerId, attachment, new Set([nodeId]));
    const target = attachment.brick ? ws.get(layerId, attachment.brick.link) : null;
    if (target?.kind === "item") bestItem = Math.max(bestItem, d);
    else natural += d;
  }
  return natural + bestItem;
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
