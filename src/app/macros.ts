// Macros (version 2): rolls that follow whoever they're for. A macro is a short recipe of blocks,
// never code: dice, a stat from the sheet, a number, and a number to beat. "Constitution save
// against DC 13" rolls d20 + that character's Constitution bonus, for whoever's turn it is, for
// everyone at once, or for who you pick. Rolling never changes anything, so it isn't an undo step.

import { isLink, link, roll } from "../engine/index.ts";
import type { Id, RollResult, Value, Workspace } from "../engine/index.ts";
import { abilityBonus } from "./characters.ts";
import { scoresOf } from "./sheets.ts";

export interface MacroBlock {
  type: "dice" | "stat" | "number";
  op: "+" | "-";
  dice?: string;
  ability?: Id | null;
  use?: "bonus" | "score";
  value?: number;
}

export interface Macro {
  id: Id;
  name: string;
  blocks: MacroBlock[];
  against: number | null;
  who: "me" | "turn" | "everyone" | "pick";
  see: "public" | "private" | "dm" | "blind";
}

const str = (v: Value | undefined, d = "") => (typeof v === "string" ? v : d);

export function macroOf(ws: Workspace, layerId: Id, id: Id): Macro {
  const r = ws.resolve(layerId, id);
  if (!r || r.record.kind !== "macro") throw new Error("That macro isn't here any more.");
  const f = r.fields;
  const blocks: MacroBlock[] = (Array.isArray(f.blocks) ? f.blocks : []).flatMap((b) => {
    if (!b || typeof b !== "object" || Array.isArray(b) || isLink(b)) return [];
    const o = b as Record<string, Value>;
    const type = o.type === "stat" || o.type === "number" ? o.type : "dice";
    return [{ type, op: o.op === "-" ? "-" : "+", dice: str(o.dice, "1d20"), ability: isLink(o.ability) ? o.ability.link : null, use: o.use === "score" ? "score" : "bonus", value: typeof o.value === "number" ? o.value : 0 } as MacroBlock];
  });
  return {
    id,
    name: r.record.name,
    blocks,
    against: typeof f.against === "number" ? f.against : null,
    who: (["me", "turn", "everyone", "pick"] as const).find((w) => w === f.who) ?? "me",
    see: (["public", "private", "dm", "blind"] as const).find((w) => w === f.see) ?? "public",
  };
}

/** "d20 + Constitution bonus against 13" */
export function macroWords(ws: Workspace, layerId: Id, m: Pick<Macro, "blocks" | "against">): string {
  const parts = m.blocks.map((b, i) => {
    const word = b.type === "dice" ? (b.dice ?? "1d20") : b.type === "number" ? String(b.value ?? 0) : `${b.ability ? (ws.get(layerId, b.ability)?.name ?? "a removed ability") : "an ability"} ${b.use === "score" ? "score" : "bonus"}`;
    return i === 0 ? (b.op === "-" ? `-${word}` : word) : `${b.op} ${word}`;
  });
  return `${parts.join(" ") || "nothing yet"}${m.against !== null ? ` against ${m.against}` : ""}`;
}

export function blocksValue(blocks: MacroBlock[]): Value {
  return blocks.map((b) => ({ type: b.type, op: b.op, dice: b.dice ?? null, ability: b.ability ? link(b.ability) : null, use: b.use ?? "bonus", value: b.value ?? 0 }));
}

/** The dice formula a macro makes for one character ("1d20 + 2"). */
export function formulaFor(ws: Workspace, layerId: Id, m: Pick<Macro, "blocks">, character: Id | null): string {
  const scores = new Map(character ? scoresOf(ws.resolve(layerId, character)?.fields ?? {}).map((s) => [s.ability, s.score]) : []);
  let text = "";
  let flat = 0;
  for (const b of m.blocks) {
    const sign = b.op === "-" ? -1 : 1;
    if (b.type === "dice") text += `${text ? ` ${b.op} ` : b.op === "-" ? "-" : ""}${b.dice || "1d20"}`;
    else if (b.type === "number") flat += sign * (b.value ?? 0);
    else if (b.ability) {
      const score = scores.get(b.ability) ?? 10;
      flat += sign * (b.use === "score" ? score : abilityBonus(ws, layerId, b.ability, score));
    }
  }
  if (!text) text = "0";
  if (flat) text += ` ${flat < 0 ? "-" : "+"} ${Math.abs(flat)}`;
  return text;
}

export interface MacroResult {
  who: string;
  character: Id | null;
  formula: string;
  result: RollResult;
  pass: boolean | null;
}

/** Rolls a macro for each character given (or once, for nobody in particular). */
export function runMacro(ws: Workspace, layerId: Id, m: Pick<Macro, "blocks" | "against">, characters: Id[], opts: { mode?: "normal" | "advantage" | "disadvantage"; random?: () => number } = {}): MacroResult[] {
  const targets = characters.length ? characters : [null];
  return targets.map((c) => {
    const formula = formulaFor(ws, layerId, m, c);
    const result = roll(formula, opts);
    return { who: c ? (ws.get(layerId, c)?.name ?? "Someone") : "", character: c, formula: result.formula, result, pass: m.against === null ? null : result.total >= m.against };
  });
}

/** The ready-made macros the d20 starter comes with. Inside the caller's step. */
export function starterMacros(ws: Workspace, sys: Id, abilities: Record<string, Id>) {
  const make = (name: string, blocks: MacroBlock[], against: number | null, who: Macro["who"]) =>
    ws.create(sys, "macro", name, { source: "template", fields: { blocks: blocksValue(blocks), against, who, see: "public", summary: "" } });
  const save = (label: string) => [{ type: "dice", op: "+", dice: "1d20" }, { type: "stat", op: "+", ability: abilities[label], use: "bonus" }] as MacroBlock[];
  make("Constitution save (DC 13)", save("CON"), 13, "turn");
  make("Dexterity save for everyone (DC 15)", save("DEX"), 15, "everyone");
  make("Wisdom check (Perception)", save("WIS"), null, "pick");
  make("Strength check", save("STR"), null, "pick");
}
