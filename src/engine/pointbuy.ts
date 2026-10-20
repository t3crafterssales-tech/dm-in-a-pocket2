// Point buy for ability scores: a rule node whose method is "pointBuy". Every score starts at the
// same number; raising one costs points, and lowering one below the start (a deficit) gives points
// back, down to the lowest score allowed. Written out, never run: sheets only show the total.

import { F } from "./conventions.ts";
import type { Id, Value } from "./types.ts";
import type { Workspace } from "./workspace.ts";

export interface PointBuy {
  id: Id;
  /** Points to spend. */
  points: number;
  /** Every score starts here. */
  start: number;
  /** The highest a score can be bought to. */
  max: number;
  /** The lowest a score can go; below the start is a deficit that gives points back. */
  min: number;
  /** "flat": each step costs 1. "d20": 1 each up to 13, then 2 each (the familiar d20 table). */
  costs: "flat" | "d20";
}

const num = (v: Value | undefined, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** A point buy rule's settings, from its values. */
export function pointBuyFrom(id: Id, f: Record<string, Value>): PointBuy {
  const start = num(f.scoreStart, 8);
  return { id, points: num(f.points, 27), start, max: num(f.scoreMax, 15), min: Math.min(num(f.scoreMin, start), start), costs: f.costs === "flat" ? "flat" : "d20" };
}

/** The system's point buy rule, if it has one. */
export function pointBuyOf(ws: Workspace, layerId: Id): PointBuy | null {
  for (const n of ws.list(layerId, "rule")) {
    const f = ws.resolve(layerId, n.id)!.fields;
    if (f[F.method] === "pointBuy") return pointBuyFrom(n.id, f);
  }
  return null;
}

/** What one score costs; negative for a deficit (points gained). */
export function scoreCost(p: PointBuy, score: number): number {
  if (score <= p.start) return score - p.start;
  if (p.costs === "flat") return score - p.start;
  let cost = 0;
  for (let s = p.start + 1; s <= score; s++) cost += s <= 13 ? 1 : 2;
  return cost;
}

export interface Spent {
  spent: number;
  points: number;
  /** Scores outside what point buy allows, in words. */
  problems: string[];
}

export function pointsSpent(p: PointBuy, scores: { name: string; score: number }[]): Spent {
  const problems: string[] = [];
  let spent = 0;
  for (const s of scores) {
    if (s.score > p.max) problems.push(`${s.name} is above ${p.max}`);
    if (s.score < p.min) problems.push(`${s.name} is below ${p.min}`);
    spent += scoreCost(p, s.score);
  }
  return { spent, points: p.points, problems };
}

/** The rule in words, for the Rules tab and the rulebook. */
export function pointBuyText(p: PointBuy): string {
  const deficit = p.min < p.start ? ` A score can be lowered to ${p.min} to gain a point for each step below ${p.start}.` : "";
  const costs = p.costs === "flat" ? "each step up costs 1 point" : "each step up costs 1 point to 13, then 2 points";
  return `Point buy: ${p.points} points. Every ability score starts at ${p.start} and can be bought up to ${p.max}; ${costs}.${deficit}`;
}
