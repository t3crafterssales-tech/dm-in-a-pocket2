// The character builder (version 2). It builds itself from the system and world: it only asks
// about what the game has (no classes in the game, no class step). Characters live in a world's
// party roster; modules borrow them. Plain functions on the engine, tested without the window.

import { F, averageOf, isFormula, isLink, levelKey, link, maximumOf, newId, pointBuyOf, pointsSpent, roll } from "../engine/index.ts";
import type { FormulaTerm, Id, NodeRecord, Value, Workspace } from "../engine/index.ts";
import type { PointBuy } from "../engine/pointbuy.ts";
import { sentence } from "../engine/text.ts";
import { ensureCategories, scoreKey, scoresOf, scoreValue } from "./sheets.ts";

export type Method = "pointBuy" | "standard" | "roll4d6" | "roll3d6" | "own";

export const METHOD_LABELS: Record<Method, string> = {
  pointBuy: "Point buy",
  standard: "Standard set of numbers",
  roll4d6: "Roll 4d6, keep the highest three (arrange as you like)",
  roll3d6: "Roll 3d6 in order",
  own: "Enter my own",
};

export const APPEARANCE: { key: string; label: string }[] = [
  { key: "height", label: "Height" },
  { key: "weight", label: "Weight" },
  { key: "age", label: "Age" },
  { key: "hair", label: "Hair" },
  { key: "eyes", label: "Eyes" },
  { key: "skin", label: "Skin" },
  { key: "marks", label: "Distinguishing marks" },
  { key: "voice", label: "Voice and mannerisms" },
];

const DEFAULT_SET = [15, 14, 13, 12, 10, 8];

export interface OptionAbility {
  id: Id;
  name: string;
  label: string;
}

export interface OptionChoice {
  aid: Id;
  label: string;
  pick: number;
  options: { id: Id; name: string }[];
}

export interface OptionFeature {
  level: number | null;
  name: string;
  sentence: string;
}

export interface OptionRace {
  id: Id;
  name: string;
  text: string;
  picture: Id | null;
  parent: Id | null;
  speed: string | null;
  size: string | null;
  bonuses: { ability: Id; amount: number }[];
  features: OptionFeature[];
  choices: OptionChoice[];
}

export interface OptionClass {
  id: Id;
  name: string;
  text: string;
  picture: Id | null;
  parent: Id | null;
  hitDie: string | null;
  /** Abilities the class leans on most ("Primary ability: Strength"), for Make it for me. */
  primary: Id[];
  features: OptionFeature[];
  choices: OptionChoice[];
  /** The class's starting equipment in its own words, if its text says. */
  startingGear: string | null;
}

export interface BuilderOptions {
  abilities: OptionAbility[];
  races: OptionRace[];
  classes: OptionClass[];
  backgrounds: { id: Id; name: string; text: string }[];
  methods: { id: Method; label: string }[];
  defaultMethod: Method;
  /** The rule that sets the default, in words, if the game has one. */
  methodRule: string | null;
  standardSet: number[];
  pointBuy: PointBuy | null;
  /** Fields the system adds for everyone ("Scars", "Sanity"), with the section they sit in. */
  systemFields: { section: string; label: string }[];
  /** Resources that come back only when the DM awards them (Inspiration). */
  awards: { id: Id; name: string }[];
  /** "Hit points: d10 + Constitution bonus at level 1..." in words. */
  hpRule: string;
}

const str = (v: Value | undefined): string => (typeof v === "string" ? v : "");
const num = (v: Value | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const linkOf = (v: Value | undefined): Id | null => (isLink(v) ? v.link : null);

function abilityList(ws: Workspace, layerId: Id): OptionAbility[] {
  return ws
    .list(layerId, "ability")
    .filter((n) => !n.template)
    .sort((a, b) => a.created - b.created)
    .map((n) => {
      const f = ws.resolve(layerId, n.id)!.fields;
      return { id: n.id, name: n.name, label: str(f[F.label]) || n.name.slice(0, 3).toUpperCase() };
    });
}

function featuresOf(ws: Workspace, layerId: Id, id: Id): { features: OptionFeature[]; choices: OptionChoice[] } {
  const r = ws.resolve(layerId, id)!;
  const features: OptionFeature[] = [];
  const choices: OptionChoice[] = [];
  for (const { attachment: a } of r.attachments) {
    if (a.choice) {
      choices.push({ aid: a.aid, label: a.choice.label || "option", pick: a.choice.pick || 1, options: a.choice.options.map((o) => ({ id: o.link, name: ws.get(layerId, o.link)?.name ?? "something removed" })) });
      continue;
    }
    const brick = a.brick ? ws.get(layerId, a.brick.link) : null;
    if (brick && (brick.kind === "item" || (brick.kind === "brick" && ws.resolve(layerId, brick.id)!.fields[F.type] === "abilityBonus"))) continue;
    const level = num(r.fields[levelKey(a.aid)]);
    features.push({ level, name: a.name ?? brick?.name ?? "Feature", sentence: sentence(ws, layerId, a) });
  }
  features.sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
  return { features, choices };
}

function bonusesOf(ws: Workspace, layerId: Id, id: Id): { ability: Id; amount: number }[] {
  const r = ws.resolve(layerId, id)!;
  return r.attachments.flatMap(({ attachment: a }) => {
    const brick = a.brick ? ws.resolve(layerId, a.brick.link) : null;
    if (!brick) return [];
    const v = { ...brick.fields, ...a.overrides };
    if (v[F.type] !== "abilityBonus") return [];
    const ability = linkOf(v[F.ability]);
    return ability ? [{ ability, amount: num(v.amount) ?? 1 }] : [];
  });
}

/** "Primary ability: Strength or Dexterity" in a class's words picks those abilities. */
function primaryOf(text: string, abilities: OptionAbility[]): Id[] {
  const m = /primary abilit(?:y|ies):\s*([^.\n]+)/i.exec(text);
  if (!m) return [];
  const words = m[1]!.toLowerCase();
  return abilities.filter((a) => words.includes(a.name.toLowerCase()) || new RegExp(`\\b${a.label.toLowerCase()}\\b`).test(words)).map((a) => a.id);
}

function startingGearOf(text: string): string | null {
  const m = /starting equipment:\s*([^\n]+)/i.exec(text);
  return m ? m[1]!.trim() : null;
}

/** The game's rule for making ability scores, if it has one. */
function methodRuleOf(ws: Workspace, layerId: Id): { method: Method; node: NodeRecord; fields: Record<string, Value> } | null {
  for (const n of ws.list(layerId, "rule")) {
    const f = ws.resolve(layerId, n.id)!.fields;
    const m = f[F.method];
    if (m === "pointBuy" || m === "standard" || m === "roll4d6" || m === "roll3d6") return { method: m, node: n, fields: f };
  }
  return null;
}

export function parseSet(text: Value | undefined): number[] {
  const nums = str(text)
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map(Number)
    .filter((x) => Number.isFinite(x));
  return nums.length ? nums : DEFAULT_SET;
}

/** What the builder offers, read from the system and world. */
export function builderOptions(ws: Workspace, layerId: Id): BuilderOptions {
  const abilities = abilityList(ws, layerId);
  const beings = ws
    .list(layerId, "being")
    .filter((n) => !n.template)
    .map((n) => ({ n, f: ws.resolve(layerId, n.id)!.fields }));
  const ofKind = (k: string) => beings.filter((b) => b.f[F.beingKind] === k).sort((a, b) => a.n.name.localeCompare(b.n.name));
  const races: OptionRace[] = ofKind("race").map(({ n, f }) => ({ id: n.id, name: n.name, text: n.text, picture: n.picture, parent: n.parent && ws.get(layerId, n.parent.link) ? n.parent.link : null, speed: str(f[F.speed]) || null, size: str(f.size) || null, bonuses: bonusesOf(ws, layerId, n.id), ...featuresOf(ws, layerId, n.id) }));
  const classes: OptionClass[] = ofKind("class").map(({ n, f }) => ({ id: n.id, name: n.name, text: n.text, picture: n.picture, parent: n.parent && ws.get(layerId, n.parent.link) ? n.parent.link : null, hitDie: str(f.hitDie) || null, primary: primaryOf(n.text, abilities), startingGear: startingGearOf(n.text), ...featuresOf(ws, layerId, n.id) }));
  // Backgrounds: rules named "Background: ..." (the d20 starter files them that way).
  const backgrounds = ws
    .list(layerId, "rule")
    .filter((n) => /^background:\s*/i.test(n.name))
    .map((n) => ({ id: n.id, name: n.name.replace(/^background:\s*/i, ""), text: n.text }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const rule = methodRuleOf(ws, layerId);
  const pb = pointBuyOf(ws, layerId);
  const methods: { id: Method; label: string }[] = (["pointBuy", "standard", "roll4d6", "roll3d6", "own"] as Method[]).map((id) => ({ id, label: METHOD_LABELS[id] }));
  const systemFields: { section: string; label: string }[] = [];
  for (const n of ws.list(layerId, "rule")) {
    const list = ws.resolve(layerId, n.id)!.fields.characterFields;
    if (Array.isArray(list))
      for (const x of list)
        if (x && typeof x === "object" && !Array.isArray(x) && !isLink(x)) {
          const o = x as Record<string, Value>;
          if (str(o.label)) systemFields.push({ section: str(o.section) || "Notes", label: str(o.label) });
        }
  }
  const awards = ws
    .list(layerId, "resource")
    .filter((n) => ws.resolve(layerId, n.id)!.fields[F.recovery] === "award")
    .map((n) => ({ id: n.id, name: n.name }));
  return {
    abilities,
    races,
    classes,
    backgrounds,
    methods,
    defaultMethod: rule?.method ?? (pb ? "pointBuy" : "standard"),
    methodRule: rule ? rule.node.name : pb ? (ws.get(layerId, pb.id)?.name ?? null) : null,
    standardSet: rule?.method === "standard" ? parseSet(rule.fields.standardSet) : DEFAULT_SET,
    pointBuy: pb,
    systemFields,
    awards,
    hpRule: classes.some((c) => c.hitDie) ? "Hit points: the class's hit die at its highest at level 1, then its average for each level after, plus the Constitution bonus each level." : "Hit points from the game's Hit points rule.",
  };
}

// ---------- Scores ----------

/** An ability's bonus for a score, the way the ability says ("d20" is (score - 10) / 2). */
export function abilityBonus(ws: Workspace, layerId: Id, ability: Id, score: number): number {
  const kind = ws.resolve(layerId, ability)?.fields[F.bonus];
  if (kind === "score") return score;
  if (kind === "none") return 0;
  return Math.floor((score - 10) / 2);
}

/** Rolls scores for a method: 4d6 keep 3 (one per ability, to arrange), or 3d6 in order. */
export function rollScores(method: "roll4d6" | "roll3d6", count: number, random: () => number = Math.random): { score: number; breakdown: string }[] {
  return Array.from({ length: count }, () => {
    const r = roll(method === "roll4d6" ? "4d6 keep 3" : "3d6", { random });
    return { score: r.total, breakdown: r.breakdown };
  });
}

/** Evaluates a resource's maximum (a number or a formula) for a sheet's scores. */
export function evaluate(ws: Workspace, layerId: Id, v: Value | undefined, scores: Map<Id, number>): number | null {
  if (typeof v === "number") return v;
  if (!isFormula(v)) return null;
  let total = 0;
  for (const t of v.formula as unknown as FormulaTerm[]) {
    let x = 0;
    if (t.ability) {
      const s = scores.get(t.ability.link) ?? 10;
      x = t.use === "bonus" ? abilityBonus(ws, layerId, t.ability.link, s) : s;
    } else x = t.number ?? 0;
    total += t.op === "-" ? -x : x;
  }
  return total;
}

function constitution(abilities: OptionAbility[]): Id | null {
  return abilities.find((a) => a.label.toUpperCase() === "CON" || /^constitution$/i.test(a.name))?.id ?? null;
}

/** Hit points for a class at a level: the hit die at its highest at level 1, then its average each level. */
export function hitPointsFor(ws: Workspace, layerId: Id, classId: Id | null, level: number, scores: Map<Id, number>): number | null {
  const abilities = abilityList(ws, layerId);
  const con = constitution(abilities);
  const conBonus = con ? abilityBonus(ws, layerId, con, scores.get(con) ?? 10) : 0;
  const die = classId ? str(ws.resolve(layerId, classId)?.fields.hitDie) : "";
  if (die && maximumOf(die) > 0) {
    const first = maximumOf(die) + conBonus;
    const each = Math.floor(averageOf(die)) + 1 + conBonus;
    return Math.max(1, first + Math.max(0, level - 1) * Math.max(1, each));
  }
  // No hit die: the game's Hit points resource, if it has a maximum.
  const hpRes = ws.list(layerId, "resource").find((n) => /hit points|^hp$/i.test(n.name) || ws.resolve(layerId, n.id)!.fields[F.label] === "HP");
  if (!hpRes) return null;
  return evaluate(ws, layerId, ws.resolve(layerId, hpRes.id)!.fields[F.maximum], scores);
}

// ---------- Making a character ----------

export interface CharacterInput {
  name: string;
  player: string;
  picture: Id | null;
  race: Id | null;
  class: Id | null;
  background: Id | null;
  level: number;
  method: Method;
  /** Scores before race bonuses, by ability id. */
  scores: Record<Id, number>;
  /** Add the race's ability bonuses on top. */
  raceBonuses: boolean;
  /** Typed hit points; null works them out. */
  hp: number | null;
  gold: string;
  gear: Id[];
  choices: Record<Id, Id[]>;
  appearance: Record<string, string>;
  /** False when a player made it and it waits for the DM. */
  approved: boolean;
}

/** The scores the sheet keeps: base scores plus the race's bonuses, if ticked. */
export function finalScores(opts: BuilderOptions, input: Pick<CharacterInput, "race" | "scores" | "raceBonuses">): Map<Id, number> {
  const out = new Map<Id, number>();
  for (const a of opts.abilities) {
    const base = input.scores[a.id];
    if (typeof base === "number") out.set(a.id, base);
  }
  if (input.raceBonuses && input.race) {
    // A subrace has its own bonuses and its parent's.
    let r = opts.races.find((x) => x.id === input.race);
    const seen = new Set<Id>();
    while (r && !seen.has(r.id)) {
      seen.add(r.id);
      for (const b of r.bonuses) if (out.has(b.ability)) out.set(b.ability, out.get(b.ability)! + b.amount);
      r = r.parent ? opts.races.find((x) => x.id === r!.parent) : undefined;
    }
  }
  return out;
}

/** Makes the character in the roster as one undo step. Returns its id. */
export function createCharacter(ws: Workspace, layerId: Id, input: CharacterInput): Id {
  const name = input.name.trim() || "New character";
  const opts = builderOptions(ws, layerId);
  const scores = finalScores(opts, input);
  const level = Math.max(1, Math.min(20, Math.round(input.level) || 1));
  const hp = input.hp ?? hitPointsFor(ws, layerId, input.class, level, scores);
  return ws.transact(`Made the character ${name}`, () => {
    const cats = ensureCategories(ws, layerId);
    const fields: Record<string, Value> = {
      [F.beingKind]: "character",
      player: input.player.trim(),
      level,
      method: input.method,
      race: input.race ? link(input.race) : null,
      class: input.class ? link(input.class) : null,
      background: input.background ? link(input.background) : null,
      xp: 0,
      gold: input.gold.trim(),
      appearance: Object.fromEntries(APPEARANCE.map((a) => [a.key, (input.appearance[a.key] ?? "").trim()])),
      extras: opts.systemFields.map((x) => ({ section: x.section, label: x.label, value: "" })),
      trackers: opts.awards.map((a) => ({ id: newId(), name: a.name, resource: link(a.id), max: 1, value: 0, look: "boxes", refill: "award" })),
      choices: Object.fromEntries(Object.entries(input.choices).map(([aid, ids]) => [aid, ids.map((x) => link(x))])),
      gearPictures: true,
      approved: input.approved,
    };
    const race = input.race ? opts.races.find((r) => r.id === input.race) : null;
    if (race?.speed) fields[F.speed] = race.speed;
    else {
      const parent = race?.parent ? opts.races.find((r) => r.id === race.parent) : null;
      if (parent?.speed) fields[F.speed] = parent.speed;
    }
    if (hp !== null) {
      fields[F.hp] = hp;
      fields.hpNow = hp;
    }
    for (const [ability, score] of scores) fields[scoreKey(ability)] = scoreValue(ability, score);
    const id = ws.create(layerId, "being", name, { category: link(cats.get("creature")!), picture: input.picture, fields });
    for (const item of input.gear) if (ws.get(layerId, item)) ws.attach(layerId, id, item);
    return id;
  });
}

/** "Make it for me": sensible choices in one click. */
export function makeItForMe(opts: BuilderOptions, random: () => number = Math.random): CharacterInput {
  const pick = <T>(list: T[]): T | null => (list.length ? list[Math.floor(random() * list.length)]! : null);
  const topRaces = opts.races.filter((r) => !r.parent);
  const race = pick(topRaces);
  const sub = race ? pick(opts.races.filter((r) => r.parent === race.id)) : null;
  const klass = pick(opts.classes.filter((c) => !c.parent));
  const background = pick(opts.backgrounds);
  const method: Method = opts.defaultMethod === "roll3d6" || opts.defaultMethod === "roll4d6" ? "standard" : opts.defaultMethod === "own" ? "standard" : opts.defaultMethod;
  // Highest scores to the class's main abilities, then Constitution, then Dexterity, then the rest.
  const con = constitution(opts.abilities);
  const dex = opts.abilities.find((a) => a.label.toUpperCase() === "DEX" || /^dexterity$/i.test(a.name))?.id ?? null;
  const order = [...new Set([...(klass?.primary ?? []), ...(con ? [con] : []), ...(dex ? [dex] : []), ...opts.abilities.map((a) => a.id).sort(() => random() - 0.5)])];
  let values: number[];
  if (method === "pointBuy" && opts.pointBuy) values = pointBuySpread(opts.pointBuy, opts.abilities.length);
  else values = [...opts.standardSet].sort((a, b) => b - a);
  const scores: Record<Id, number> = {};
  order.forEach((id, i) => (scores[id] = values[i] ?? values[values.length - 1] ?? 10));
  const choices: Record<Id, Id[]> = {};
  for (const c of [...(klass?.choices ?? []), ...(race?.choices ?? [])]) {
    const shuffled = [...c.options].sort(() => random() - 0.5);
    choices[c.aid] = shuffled.slice(0, c.pick).map((o) => o.id);
  }
  const gold = /(\d+)\s*gp\b(?![^(]*\))/i.exec(klass?.startingGear?.split(/\(b\)|; or/i).pop() ?? "");
  return {
    name: pick(NAMES) ?? "Hero",
    player: "",
    picture: null,
    race: sub?.id ?? race?.id ?? null,
    class: klass?.id ?? null,
    background: background?.id ?? null,
    level: 1,
    method,
    scores,
    raceBonuses: true,
    hp: null,
    gold: gold ? `${gold[1]} gp` : "",
    gear: [],
    choices,
    appearance: {},
    approved: true,
  };
}

/** Point buy for Make it for me: the standard set if the points allow it, otherwise top scores first. */
function pointBuySpread(p: PointBuy, count: number): number[] {
  const set = [...DEFAULT_SET, ...Array.from({ length: Math.max(0, count - DEFAULT_SET.length) }, () => p.start)].slice(0, count);
  const spent = pointsSpent(p, set.map((score, i) => ({ name: String(i), score })));
  if (spent.spent <= p.points && !spent.problems.length) return set;
  const scores = Array.from({ length: count }, () => p.start);
  let budget = p.points;
  const cost = (from: number) => (p.costs === "flat" || from + 1 <= 13 ? 1 : 2);
  for (let i = 0; i < count; i++)
    while (scores[i]! < p.max && cost(scores[i]!) <= budget) {
      budget -= cost(scores[i]!);
      scores[i]!++;
    }
  return scores;
}

const NAMES = ["Aldric", "Brenna", "Corwin", "Daria", "Edric", "Fenna", "Garrick", "Hilde", "Ivo", "Jessamy", "Kael", "Liora", "Marek", "Nessa", "Orrin", "Perrin", "Quilla", "Roderic", "Sable", "Tamsin", "Ulric", "Vesna", "Wren", "Yara", "Zed"];

// ---------- The sheet ----------

export interface TrackerView {
  id: Id;
  name: string;
  max: number;
  value: number;
  look: "boxes" | "number" | "bar";
  refill: string;
  /** True for a tracker that comes from the game's own resources. */
  fromSystem: boolean;
}

export interface CharacterView {
  id: Id;
  name: string;
  player: string;
  picture: Id | null;
  level: number;
  race: { id: Id; name: string } | null;
  class: { id: Id; name: string } | null;
  background: { id: Id; name: string } | null;
  method: Method | null;
  scores: { ability: Id; name: string; label: string; score: number | null; bonus: number | null }[];
  hp: number | null;
  hpNow: number | null;
  ac: number | null;
  speed: string;
  xp: number;
  gold: string;
  appearance: { key: string; label: string; value: string }[];
  extras: { index: number; section: string; label: string; value: string }[];
  trackers: TrackerView[];
  features: { level: number | null; name: string; sentence: string; from: string }[];
  /** Choices boxes and what was picked. */
  choices: { aid: Id; label: string; pick: number; from: string; options: { id: Id; name: string }[]; picked: Id[] }[];
  gear: { aid: Id; id: Id | null; name: string; picture: Id | null }[];
  gearPictures: boolean;
  approved: boolean;
  /** Things the game needs that are missing, flagged but never blocking ("No Wisdom score"). */
  missing: string[];
  /** For level-ups: hit points the next level would add. */
  nextLevelHp: number | null;
}

export function characterView(ws: Workspace, layerId: Id, id: Id): CharacterView {
  const r = ws.resolve(layerId, id);
  if (!r || r.record.kind !== "being") throw new Error("That character isn't here any more.");
  const f = r.fields;
  const named = (v: Value | undefined) => {
    const l = linkOf(v);
    const n = l ? ws.get(layerId, l) : null;
    return n ? { id: n.id, name: n.name.replace(/^background:\s*/i, "") } : null;
  };
  const abilities = abilityList(ws, layerId);
  const own = new Map(scoresOf(f).map((s) => [s.ability, s.score]));
  const scores = abilities.map((a) => {
    const s = own.get(a.id);
    return { ability: a.id, name: a.name, label: a.label, score: s ?? null, bonus: s === undefined ? null : abilityBonus(ws, layerId, a.id, s) };
  });
  const app = f.appearance && typeof f.appearance === "object" && !Array.isArray(f.appearance) && !isLink(f.appearance) ? (f.appearance as Record<string, Value>) : {};
  const extras = (Array.isArray(f.extras) ? f.extras : []).flatMap((x, index) => {
    if (!x || typeof x !== "object" || Array.isArray(x) || isLink(x)) return [];
    const o = x as Record<string, Value>;
    return [{ index, section: str(o.section) || "Notes", label: str(o.label), value: str(o.value) }];
  });
  const trackers: TrackerView[] = (Array.isArray(f.trackers) ? f.trackers : []).flatMap((x) => {
    if (!x || typeof x !== "object" || Array.isArray(x) || isLink(x)) return [];
    const o = x as Record<string, Value>;
    const look = o.look === "number" || o.look === "bar" ? o.look : "boxes";
    return [{ id: str(o.id) || newId(), name: str(o.name) || "Tracker", max: Math.max(0, num(o.max) ?? 1), value: Math.max(0, num(o.value) ?? 0), look, refill: str(o.refill) || "never", fromSystem: isLink(o.resource) }];
  });
  const level = num(f.level) ?? 1;
  // Features: the race's (and its parent's), then the class's up to this level, then the sheet's own.
  const features: CharacterView["features"] = [];
  const choices: CharacterView["choices"] = [];
  const pickedMap = f.choices && typeof f.choices === "object" && !Array.isArray(f.choices) && !isLink(f.choices) ? (f.choices as Record<string, Value>) : {};
  const fromNode = (nodeId: Id | null, upTo: number | null) => {
    if (!nodeId) return;
    const src = ws.get(layerId, nodeId);
    if (!src) return;
    const { features: fs, choices: cs } = featuresOf(ws, layerId, nodeId);
    for (const x of fs) if (upTo === null || x.level === null || x.level <= upTo) features.push({ ...x, from: src.name });
    for (const c of cs) {
      const picked = Array.isArray(pickedMap[c.aid]) ? (pickedMap[c.aid] as Value[]).map(linkOf).filter((x): x is Id => !!x) : [];
      choices.push({ ...c, from: src.name, picked });
    }
  };
  const race = named(f.race);
  const klass = named(f.class);
  if (race) {
    const parent = ws.get(layerId, race.id)?.parent?.link ?? null;
    if (parent) fromNode(parent, null);
    fromNode(race.id, null);
  }
  if (klass) {
    const parent = ws.get(layerId, klass.id)?.parent?.link ?? null;
    if (parent) fromNode(parent, level);
    fromNode(klass.id, level);
  }
  const gear: CharacterView["gear"] = [];
  for (const { attachment: a } of r.attachments) {
    const target = a.brick ? ws.get(layerId, a.brick.link) : null;
    if (target?.kind === "item") gear.push({ aid: a.aid, id: target.id, name: a.name ?? target.name, picture: target.picture });
    else if (!a.choice) features.push({ level: null, name: a.name ?? target?.name ?? "Feature", sentence: sentence(ws, layerId, a), from: r.record.name });
  }
  const missing = scores.filter((s) => s.score === null).map((s) => `No ${s.name} score`);
  for (const c of choices) if (c.picked.length < c.pick) missing.push(`${c.from}: choose ${c.pick === 1 ? "one" : c.pick} ${c.label}`);
  const scoreMap = new Map(scores.filter((s) => s.score !== null).map((s) => [s.ability, s.score!]));
  const now = hitPointsFor(ws, layerId, klass?.id ?? null, level, scoreMap);
  const next = hitPointsFor(ws, layerId, klass?.id ?? null, level + 1, scoreMap);
  return {
    id,
    name: r.record.name,
    player: str(f.player),
    picture: r.record.picture,
    level,
    race,
    class: klass,
    background: named(f.background),
    method: (["pointBuy", "standard", "roll4d6", "roll3d6", "own"] as const).find((m) => m === f.method) ?? null,
    scores,
    hp: num(f[F.hp]),
    hpNow: num(f.hpNow) ?? num(f[F.hp]),
    ac: num(f[F.ac]),
    speed: str(f[F.speed]),
    xp: num(f.xp) ?? 0,
    gold: str(f.gold),
    appearance: APPEARANCE.map((a) => ({ ...a, value: str(app[a.key]) })),
    extras,
    trackers,
    features,
    choices,
    gear,
    gearPictures: f.gearPictures !== false,
    approved: f.approved !== false,
    missing,
    nextLevelHp: now !== null && next !== null ? next - now : null,
  };
}

/** The roster: every character in the place (a world's party; a module borrows its world's). */
export function roster(ws: Workspace, layerId: Id): { id: Id; name: string; player: string; picture: Id | null; level: number; summary: string; approved: boolean }[] {
  return ws
    .list(layerId, "being")
    .filter((n) => !n.template && ws.resolve(layerId, n.id)!.fields[F.beingKind] === "character")
    .map((n) => {
      const f = ws.resolve(layerId, n.id)!.fields;
      const nm = (v: Value | undefined) => {
        const l = linkOf(v);
        return l ? (ws.get(layerId, l)?.name ?? "") : "";
      };
      const level = num(f.level) ?? 1;
      return { id: n.id, name: n.name, player: str(f.player), picture: n.picture, level, summary: [nm(f.race), nm(f.class), `level ${level}`].filter(Boolean).join(" · "), approved: f.approved !== false };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------- Changing a character (each one undo step, inside the caller's step) ----------

function listField(ws: Workspace, layerId: Id, id: Id, key: string): Record<string, Value>[] {
  const v = ws.resolve(layerId, id)!.fields[key];
  return (Array.isArray(v) ? structuredClone(v) : []).filter((x): x is Record<string, Value> => !!x && typeof x === "object" && !Array.isArray(x) && !isLink(x)) as Record<string, Value>[];
}

export function setAppearance(ws: Workspace, layerId: Id, id: Id, key: string, value: string) {
  const cur = ws.resolve(layerId, id)!.fields.appearance;
  const next = cur && typeof cur === "object" && !Array.isArray(cur) && !isLink(cur) ? { ...(structuredClone(cur) as Record<string, Value>) } : {};
  next[key] = value.trim();
  ws.setField(layerId, id, "appearance", next);
}

/** "+ Add" a field in a section of the sheet ("Scars"). */
export function addExtra(ws: Workspace, layerId: Id, id: Id, section: string, label: string) {
  const list = listField(ws, layerId, id, "extras");
  list.push({ section: section || "Notes", label: label.trim() || "New field", value: "" });
  ws.setField(layerId, id, "extras", list);
}

export function setExtra(ws: Workspace, layerId: Id, id: Id, index: number, change: { label?: string; value?: string } | null) {
  const list = listField(ws, layerId, id, "extras");
  if (!list[index]) throw new Error("That field isn't there any more.");
  if (change === null) list.splice(index, 1);
  else Object.assign(list[index]!, Object.fromEntries(Object.entries(change).filter(([, v]) => v !== undefined)));
  ws.setField(layerId, id, "extras", list);
}

/** A player's own tracker: torches, arrows, rations, favours owed. */
export function addTracker(ws: Workspace, layerId: Id, id: Id, t: { name: string; max: number; look: string; refill: string }): Id {
  const list = listField(ws, layerId, id, "trackers");
  const tid = newId();
  list.push({ id: tid, name: t.name.trim() || "Tracker", max: Math.max(1, Math.round(t.max) || 1), value: Math.max(1, Math.round(t.max) || 1), look: ["boxes", "number", "bar"].includes(t.look) ? t.look : "boxes", refill: ["short rest", "long rest", "award", "never"].includes(t.refill) ? t.refill : "never" });
  ws.setField(layerId, id, "trackers", list);
  return tid;
}

export function setTracker(ws: Workspace, layerId: Id, id: Id, trackerId: Id, change: { value?: number; max?: number; name?: string } | null) {
  const list = listField(ws, layerId, id, "trackers");
  const i = list.findIndex((t) => t.id === trackerId);
  if (i < 0) throw new Error("That tracker isn't there any more.");
  if (change === null) list.splice(i, 1);
  else {
    const t = list[i]!;
    if (change.max !== undefined) t.max = Math.max(0, Math.round(change.max));
    if (change.name !== undefined) t.name = change.name.trim() || String(t.name);
    if (change.value !== undefined) t.value = Math.max(0, Math.min(num(t.max) ?? 0, Math.round(change.value)));
  }
  ws.setField(layerId, id, "trackers", list);
}

/** The DM's Award button: one point of Inspiration (or any award), up to its maximum. */
export function award(ws: Workspace, layerId: Id, id: Id, trackerId: Id): boolean {
  const t = listField(ws, layerId, id, "trackers").find((x) => x.id === trackerId);
  if (!t) throw new Error("That tracker isn't there any more.");
  const value = num(t.value) ?? 0;
  if (value >= (num(t.max) ?? 1)) return false;
  setTracker(ws, layerId, id, trackerId, { value: value + 1 });
  return true;
}

/** Short or long rest: refills the trackers that come back then (a long rest also refills short-rest ones). */
export function rest(ws: Workspace, layerId: Id, id: Id, kind: "short rest" | "long rest") {
  const list = listField(ws, layerId, id, "trackers");
  for (const t of list) if (t.refill === kind || (kind === "long rest" && t.refill === "short rest")) t.value = num(t.max) ?? 0;
  ws.setField(layerId, id, "trackers", list);
  if (kind === "long rest") {
    const hp = num(ws.resolve(layerId, id)!.fields[F.hp]);
    if (hp !== null) ws.setField(layerId, id, "hpNow", hp);
  }
}

/** What a level-up brings: the new level's features and choices, and the hit points it adds. */
export function levelUpPreview(ws: Workspace, layerId: Id, id: Id): { level: number; features: OptionFeature[]; choices: OptionChoice[]; hp: number | null } {
  const v = characterView(ws, layerId, id);
  const level = v.level + 1;
  const out = { level, features: [] as OptionFeature[], choices: [] as OptionChoice[], hp: v.nextLevelHp };
  for (const c of [v.class?.id ? ws.get(layerId, v.class.id)?.parent?.link : null, v.class?.id ?? null]) {
    if (!c) continue;
    const { features } = featuresOf(ws, layerId, c);
    out.features.push(...features.filter((x) => x.level === level));
    const r = ws.resolve(layerId, c)!;
    for (const { attachment: a } of r.attachments) if (a.choice && num(r.fields[levelKey(a.aid)]) === level) out.choices.push(...featuresOf(ws, layerId, c).choices.filter((x) => x.aid === a.aid));
  }
  return out;
}

/** Goes up a level: more hit points (current ones too), and any choices made for the new level. */
export function levelUp(ws: Workspace, layerId: Id, id: Id, hpGain: number | null, picks: Record<Id, Id[]> = {}) {
  const r = ws.resolve(layerId, id)!;
  const p = levelUpPreview(ws, layerId, id);
  if (p.level > 20) throw new Error("Level 20 is as high as it goes.");
  ws.setField(layerId, id, "level", p.level);
  const gain = hpGain ?? p.hp;
  const hp = num(r.fields[F.hp]);
  if (gain !== null && hp !== null) {
    ws.setField(layerId, id, F.hp, hp + gain);
    ws.setField(layerId, id, "hpNow", (num(r.fields.hpNow) ?? hp) + gain);
  }
  if (Object.keys(picks).length) {
    const cur = r.fields.choices && typeof r.fields.choices === "object" && !Array.isArray(r.fields.choices) && !isLink(r.fields.choices) ? (structuredClone(r.fields.choices) as Record<string, Value>) : {};
    for (const [aid, ids] of Object.entries(picks)) cur[aid] = ids.map((x) => link(x));
    ws.setField(layerId, id, "choices", cur);
  }
}

export function setChoice(ws: Workspace, layerId: Id, id: Id, aid: Id, picked: Id[]) {
  const r = ws.resolve(layerId, id)!;
  const cur = r.fields.choices && typeof r.fields.choices === "object" && !Array.isArray(r.fields.choices) && !isLink(r.fields.choices) ? (structuredClone(r.fields.choices) as Record<string, Value>) : {};
  cur[aid] = picked.map((x) => link(x));
  ws.setField(layerId, id, "choices", cur);
}

/** Point buy check for the builder: points spent and anything out of range. */
export function pointBuyCheck(opts: BuilderOptions, scores: Record<Id, number>) {
  if (!opts.pointBuy) return null;
  return pointsSpent(
    opts.pointBuy,
    opts.abilities.map((a) => ({ name: a.name, score: scores[a.id] ?? opts.pointBuy!.start })),
  );
}
