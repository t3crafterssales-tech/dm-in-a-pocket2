// Checks that run with no AI and cost nothing:
// - red flags for breaking the user's own world rules ("no metal")
// - yellow "looks off" checks: balance, economy, filing (incl. duplicate names, empty sheets)
// "Normal" is always measured against the system's own content.

import { F, SRD_LICENSE, attachmentValues, averageDice, categoryRole, challenge, costInGold, damagePerRound, hasAttack } from "./conventions.ts";
import { deepEqual, isLink } from "./links.ts";
import type { Id, NodeRecord, Value } from "./types.ts";
import type { Workspace } from "./workspace.ts";

// ---------- World rules (red) ----------

export interface RuleFlag {
  key: string;
  color: "red";
  rule: Id;
  title: string;
  /** Things that break the rule. */
  offenders: Id[];
}

/** One red flag per world rule, listing everything that breaks it (except deliberate exceptions). */
export function worldRuleFlags(ws: Workspace, layerId: Id): RuleFlag[] {
  const out: RuleFlag[] = [];
  for (const rule of ws.list(layerId, "rule")) {
    const forbid = rule.fields[F.forbid];
    if (!forbid || typeof forbid !== "object" || Array.isArray(forbid) || isLink(forbid)) continue;
    const field = (forbid as Record<string, Value>).field;
    const equals = (forbid as Record<string, Value>).equals;
    if (typeof field !== "string") continue;
    const ex = new Set(asLinks(rule.fields[F.exceptions]));
    const offenders: Id[] = [];
    for (const n of ws.list(layerId)) {
      // Library bricks are the pieces, not things in the world; the things using them are checked.
      if (n.id === rule.id || n.kind === "rule" || n.kind === "category" || n.kind === "brick" || n.template || ex.has(n.id)) continue;
      const r = ws.resolve(layerId, n.id)!;
      const bad = sameValue(r.fields[field], equals) || r.attachments.some(({ attachment }) => sameValue(attachmentValues(ws, layerId, attachment)[field], equals));
      if (bad) offenders.push(n.id);
    }
    if (offenders.length) {
      out.push({ key: `rule:${rule.id}`, color: "red", rule: rule.id, offenders, title: `${offenders.length} thing${offenders.length === 1 ? " breaks" : "s break"} "${rule.name}"` });
    }
  }
  return out;
}

function sameValue(a: Value | undefined, b: Value | undefined): boolean {
  if (typeof a === "string" && typeof b === "string") return a.trim().toLowerCase() === b.trim().toLowerCase();
  return a !== undefined && deepEqual(a, b);
}

function asLinks(v: Value | undefined): Id[] {
  return Array.isArray(v) ? v.filter(isLink).map((l) => l.link) : [];
}

// ---------- Yellow checks ----------

/** "lore" (Lore consistency) is found only by the AI's Check for errors. */
export type CheckCategory = "balance" | "economy" | "filing" | "lore";
export type Sensitivity = "relaxed" | "normal" | "strict";

export interface CheckSettings {
  balance: { on: boolean; level: Sensitivity };
  economy: { on: boolean; level: Sensitivity };
  filing: { on: boolean; level: Sensitivity };
  lore: { on: boolean; level: Sensitivity };
}

export const DEFAULT_CHECKS: CheckSettings = {
  balance: { on: true, level: "normal" },
  economy: { on: true, level: "normal" },
  filing: { on: true, level: "normal" },
  lore: { on: true, level: "normal" },
};

/** How far from normal something must be before it is flagged. */
const FACTOR: Record<Sensitivity, number> = { relaxed: 2.5, normal: 1.75, strict: 1.3 };
/** How much dearer the weaker item must be before it is flagged. */
const PRICE_FACTOR: Record<Sensitivity, number> = { relaxed: 2, normal: 1.2, strict: 1 };
/** Balance needs this many other monsters at the same challenge to know what "normal" is. */
export const MIN_PEERS = 3;

export interface YellowFlag {
  key: string;
  color: "yellow";
  category: CheckCategory;
  kind: "damage-high" | "damage-low" | "hp-high" | "hp-low" | "price" | "weapon-no-attack" | "filed-oddly" | "duplicate-name" | "empty-sheet";
  title: string;
  detail: string;
  nodes: Id[];
}

export function yellowFlags(ws: Workspace, layerId: Id, settings: CheckSettings = DEFAULT_CHECKS): YellowFlag[] {
  const out: YellowFlag[] = [];
  const all = ws.list(layerId).filter((n) => !n.template);
  if (settings.balance.on) out.push(...balance(ws, layerId, all, FACTOR[settings.balance.level]));
  if (settings.economy.on) out.push(...economy(ws, layerId, all, PRICE_FACTOR[settings.economy.level]));
  if (settings.filing.on) out.push(...filing(ws, layerId, all));
  return out;
}

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * Content from a starter (the SRD 5.2) is the yardstick, not a suspect: the free checks measure
 * homemade things against it, but don't flag it, unless this world changed it.
 */
function judged(ws: Workspace, layerId: Id, n: NodeRecord): boolean {
  if (n.source !== "template" || ws.resolve(layerId, n.id)!.fields[F.license] !== SRD_LICENSE) return true;
  const layer = ws.layer(layerId);
  return !!layer.base && !!layer.changes[n.id];
}

const isMonster = (ws: Workspace, layerId: Id, n: NodeRecord) => n.kind === "being" && ws.resolve(layerId, n.id)!.fields[F.beingKind] === "monster";
/** Top categories a being may be filed under without a "filed oddly" warning. */
const BEING_ROLES = new Set(["creature", "race", "class", "character"]);
const round = (n: number) => Math.round(n * 10) / 10;

function balance(ws: Workspace, layerId: Id, all: NodeRecord[], factor: number): YellowFlag[] {
  const monsters = all
    .filter((n) => isMonster(ws, layerId, n))
    .map((n) => {
      const f = ws.resolve(layerId, n.id)!.fields;
      return { n, cr: challenge(f[F.cr]), hp: typeof f[F.hp] === "number" ? (f[F.hp] as number) : averageDice(f[F.hp]), dmg: damagePerRound(ws, layerId, n.id), crText: String(f[F.cr] ?? "") };
    })
    .filter((m) => m.cr !== null);
  const out: YellowFlag[] = [];
  for (const m of monsters) {
    if (!judged(ws, layerId, m.n)) continue;
    const peers = monsters.filter((o) => o.n.id !== m.n.id && o.cr === m.cr);
    if (peers.length < MIN_PEERS) continue;
    for (const what of ["dmg", "hp"] as const) {
      const vals = peers.map((p) => p[what]).filter((v) => v > 0);
      if (vals.length < MIN_PEERS || m[what] <= 0) continue;
      // The middle value, so one odd monster doesn't make all the normal ones look odd.
      const avg = median(vals);
      const label = what === "dmg" ? "damage" : "hit points";
      if (m[what] > avg * factor) {
        out.push({ key: `balance:${what}-high:${m.n.id}`, color: "yellow", category: "balance", kind: what === "dmg" ? "damage-high" : "hp-high", nodes: [m.n.id], title: `${m.n.name} has a lot of ${label} for its challenge rating`, detail: `About ${round(m[what])} ${label}${what === "dmg" ? " a round" : ""}; other challenge ${m.crText} monsters usually have ${round(avg)}.` });
      } else if (m[what] < avg / factor) {
        out.push({ key: `balance:${what}-low:${m.n.id}`, color: "yellow", category: "balance", kind: what === "dmg" ? "damage-low" : "hp-low", nodes: [m.n.id], title: `${m.n.name} has very little ${label} for its challenge rating`, detail: `About ${round(m[what])} ${label}${what === "dmg" ? " a round" : ""}; other challenge ${m.crText} monsters usually have ${round(avg)}.` });
      }
    }
  }
  return out;
}

function economy(ws: Workspace, layerId: Id, all: NodeRecord[], factor: number): YellowFlag[] {
  const items = all
    .filter((n) => n.kind === "item")
    .map((n) => ({ n, cost: costInGold(ws.resolve(layerId, n.id)!.fields[F.cost]), dmg: damagePerRound(ws, layerId, n.id), cat: n.category?.link ?? null }))
    .filter((i) => i.cost !== null && i.cost > 0 && i.dmg > 0 && i.cat);
  const out: YellowFlag[] = [];
  for (const a of items) {
    if (!judged(ws, layerId, a.n)) continue;
    // The system's own content is what normal is: a copy priced like a starter item with the same
    // damage (a copied Battleaxe) is normal, even where the starter itself is uneven.
    if (items.some((b) => b.n.id !== a.n.id && !judged(ws, layerId, b.n) && b.cat === a.cat && b.cost === a.cost && b.dmg === a.dmg)) continue;
    const cheaperStronger = items.find((b) => b.n.id !== a.n.id && b.cat === a.cat && b.dmg > a.dmg && a.cost! > b.cost! * factor);
    if (cheaperStronger) {
      out.push({ key: `economy:price:${a.n.id}`, color: "yellow", category: "economy", kind: "price", nodes: [a.n.id, cheaperStronger.n.id], title: `${a.n.name} costs more than ${cheaperStronger.n.name}`, detail: `${cheaperStronger.n.name} hits harder but costs less.` });
    }
  }
  return out;
}

function filing(ws: Workspace, layerId: Id, all: NodeRecord[]): YellowFlag[] {
  const out: YellowFlag[] = [];
  for (const n of all) {
    const role = categoryRole(ws, layerId, n);
    if (n.kind === "item" && role === "weapon" && !hasAttack(ws, layerId, n.id)) {
      out.push({ key: `filing:weapon-no-attack:${n.id}`, color: "yellow", category: "filing", kind: "weapon-no-attack", nodes: [n.id], title: `${n.name} is filed as a weapon but has no attack`, detail: "Add an attack, or file it somewhere else." });
    }
    if ((n.kind === "being" && role && !BEING_ROLES.has(role)) || (n.kind === "item" && role && BEING_ROLES.has(role))) {
      out.push({ key: `filing:filed-oddly:${n.id}`, color: "yellow", category: "filing", kind: "filed-oddly", nodes: [n.id], title: `${n.name} is a ${n.kind === "being" ? "creature" : "item"} filed under ${role === "creature" ? "creatures" : role}. Intended?`, detail: "It's allowed. Choose I meant that if it's on purpose." });
    }
    if (n.kind === "being") {
      const r = ws.resolve(layerId, n.id)!;
      const bk = r.fields[F.beingKind];
      if ((bk === "monster" || bk === "npc") && judged(ws, layerId, n) && (r.fields[F.hp] === undefined || !hasAttack(ws, layerId, n.id))) {
        const missing = [r.fields[F.hp] === undefined ? "hit points" : null, !hasAttack(ws, layerId, n.id) ? "attacks" : null].filter(Boolean).join(" or ");
        out.push({ key: `filing:empty-sheet:${n.id}`, color: "yellow", category: "filing", kind: "empty-sheet", nodes: [n.id], title: `${n.name} has no ${missing}`, detail: "Probably not finished yet." });
      }
    }
  }
  const byName = new Map<string, NodeRecord[]>();
  for (const n of all) {
    if (n.kind === "category") continue;
    const k = `${n.kind}|${n.name.trim().toLowerCase()}`;
    byName.set(k, [...(byName.get(k) ?? []), n]);
  }
  for (const [k, list] of byName) {
    if (list.length < 2) continue;
    out.push({ key: `filing:duplicate-name:${k}`, color: "yellow", category: "filing", kind: "duplicate-name", nodes: list.map((n) => n.id), title: `${list.length} things are called ${list[0]!.name}`, detail: "Usually one was copied by accident." });
  }
  return out;
}
