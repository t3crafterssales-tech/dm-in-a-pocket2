// Dice (version 2): reads a roll written the usual way ("2d6 + 3", "d20", "4d6 keep 3", "1d20+5")
// and rolls it. Used by the dice tray, the character builder's rolled scores, initiative and roll
// tables. Never throws on odd text: anything it can't read is reported, not rolled.

export interface DiceTerm {
  /** +1 or -1 */
  sign: number;
  /** Number of dice, or 0 for a plain number. */
  count: number;
  /** Sides of each die (2 for a coin). */
  sides: number;
  /** Keep only the highest (or lowest) this many; null keeps all. */
  keep: number | null;
  keepLowest: boolean;
  /** The plain number, for a bonus term. */
  value: number;
}

export interface DieRoll {
  sides: number;
  rolls: number[];
  /** Which rolls counted (false for dice dropped by "keep"). */
  kept: boolean[];
  sign: number;
}

export interface RollResult {
  formula: string;
  total: number;
  dice: DieRoll[];
  bonus: number;
  /** "d20 showed 10, + 4" */
  breakdown: string;
  /** For advantage and disadvantage: the other d20 total that was not used. */
  other: number | null;
  /** True when a single d20 showed 20 (or 1), for "natural 20" sparks later. */
  natural: number | null;
}

const TERM = /([+-]?)\s*(?:(\d*)\s*d\s*(\d+|%)(?:\s*(?:k|kh|keep)\s*(\d+)|\s*(?:kl|keep lowest)\s*(\d+))?|(\d+))/gi;

/** Reads "2d6 + 3"; returns null if nothing in it is a roll or a number. */
export function parseDice(text: string): DiceTerm[] | null {
  const clean = text.toLowerCase().replace(/\bcoin\b/g, "d2").trim();
  if (!clean) return null;
  const terms: DiceTerm[] = [];
  let used = 0;
  for (const m of clean.matchAll(TERM)) {
    const sign = m[1] === "-" ? -1 : 1;
    if (m[3]) {
      const count = m[2] ? Number(m[2]) : 1;
      const sides = m[3] === "%" ? 100 : Number(m[3]);
      if (count < 1 || count > 100 || sides < 2 || sides > 1000) return null;
      const keepHigh = m[4] ? Number(m[4]) : null;
      const keepLow = m[5] ? Number(m[5]) : null;
      terms.push({ sign, count, sides, keep: keepHigh ?? keepLow, keepLowest: keepLow !== null, value: 0 });
    } else if (m[6]) terms.push({ sign, count: 0, sides: 0, keep: null, keepLowest: false, value: Number(m[6]) });
    used += m[0].replace(/\s+/g, "").length;
  }
  // Everything except spaces and joining signs must have been read.
  if (!terms.length || used < clean.replace(/[\s]+/g, "").length) return null;
  return terms;
}

/** The roll written back neatly: "2d6 + 3". */
export function diceText(terms: DiceTerm[]): string {
  return terms
    .map((t, i) => {
      const body = t.count ? `${t.count}d${t.sides}${t.keep !== null ? `${t.keepLowest ? " keep lowest " : " keep "}${t.keep}` : ""}` : String(t.value);
      return i === 0 ? (t.sign < 0 ? `-${body}` : body) : `${t.sign < 0 ? "-" : "+"} ${body}`;
    })
    .join(" ");
}

function rollTerms(terms: DiceTerm[], random: () => number): { total: number; dice: DieRoll[]; bonus: number } {
  let total = 0;
  let bonus = 0;
  const dice: DieRoll[] = [];
  for (const t of terms) {
    if (!t.count) {
      bonus += t.sign * t.value;
      total += t.sign * t.value;
      continue;
    }
    const rolls = Array.from({ length: t.count }, () => 1 + Math.floor(random() * t.sides));
    const kept = rolls.map(() => true);
    if (t.keep !== null && t.keep < t.count) {
      const order = rolls.map((r, i) => ({ r, i })).sort((a, b) => (t.keepLowest ? a.r - b.r : b.r - a.r));
      order.forEach((x, n) => (kept[x.i] = n < t.keep!));
    }
    const sum = rolls.reduce((s, r, i) => s + (kept[i] ? r : 0), 0);
    total += t.sign * sum;
    dice.push({ sides: t.sides, rolls, kept, sign: t.sign });
  }
  return { total, dice, bonus };
}

function breakdownOf(dice: DieRoll[], bonus: number): string {
  const parts = dice.map((d) => {
    const shown = d.rolls.map((r, i) => (d.kept[i] ? String(r) : `(${r})`)).join(", ");
    const name = d.sides === 2 ? "coin" : `d${d.sides}`;
    return `${d.sign < 0 ? "minus " : ""}${d.rolls.length > 1 ? `${d.rolls.length}${name}` : name} showed ${d.sides === 2 && d.rolls.length === 1 ? (d.rolls[0] === 2 ? "heads" : "tails") : shown}`;
  });
  if (bonus) parts.push(`${bonus < 0 ? "-" : "+"} ${Math.abs(bonus)}`);
  return parts.join(", ");
}

/**
 * Rolls a formula. `mode` "advantage" or "disadvantage" rolls the whole thing twice and keeps the
 * higher or lower total. Throws a plain-words error for text it can't read.
 */
export function roll(formula: string, opts: { mode?: "normal" | "advantage" | "disadvantage"; random?: () => number } = {}): RollResult {
  const terms = parseDice(formula);
  if (!terms) throw new Error(`"${formula}" isn't a roll the app can read. Try something like 2d6 + 3.`);
  const random = opts.random ?? Math.random;
  const first = rollTerms(terms, random);
  let used = first;
  let other: number | null = null;
  if (opts.mode === "advantage" || opts.mode === "disadvantage") {
    const second = rollTerms(terms, random);
    const keepSecond = opts.mode === "advantage" ? second.total > first.total : second.total < first.total;
    used = keepSecond ? second : first;
    other = keepSecond ? first.total : second.total;
  }
  const single = used.dice.length === 1 && used.dice[0]!.rolls.length === 1 && used.dice[0]!.sides === 20 ? used.dice[0]!.rolls[0]! : null;
  return { formula: diceText(terms), total: used.total, dice: used.dice, bonus: used.bonus, breakdown: breakdownOf(used.dice, used.bonus), other, natural: single };
}

/** The average of a roll, for hit points ("2d6 + 3" is 10). Unknown text is 0. */
export function averageOf(formula: string): number {
  const terms = parseDice(formula);
  if (!terms) return 0;
  return terms.reduce((s, t) => s + t.sign * (t.count ? ((t.keep ?? t.count) * (t.sides + 1)) / 2 : t.value), 0);
}

/** The highest a roll can be ("d8" is 8). */
export function maximumOf(formula: string): number {
  const terms = parseDice(formula);
  if (!terms) return 0;
  return terms.reduce((s, t) => s + t.sign * (t.count ? (t.keep ?? t.count) * t.sides : t.value), 0);
}
