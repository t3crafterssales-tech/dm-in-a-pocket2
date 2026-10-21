// The DM's table (version 2): game nights, initiative, conditions, timers and the in-world clock.
// The table reads the system: initiative follows the core check, counters come from resources,
// 0 hit points follows the Hit points rule. Playing never changes the world: a monster's damage
// lives in the session; characters are the party's own, so their hit points change on them.
// Plain functions on the engine, inside the caller's step unless they say otherwise.

import { F, isLink, link, newId, roll } from "../engine/index.ts";
import type { Id, NodeRecord, Value, Workspace } from "../engine/index.ts";
import { isCoreCheck } from "../engine/rulestext.ts";
import { abilityBonus, characterView } from "./characters.ts";
import { encounterNumbers } from "./encounters.ts";
import { rollTable } from "./lore.ts";
import { scoresOf } from "./sheets.ts";

// ---------- Shapes ----------

export interface ConditionOn {
  id: Id;
  condition: Id;
  /** How much is left, in its unit; null for "until removed" or "until they save". */
  left: number | null;
  unit: "rounds" | "minutes" | "hours" | "save" | "removed";
  counter: number | null;
  source: string;
}

export interface Member {
  id: Id;
  name: string;
  hp: number | null;
  maxHp: number | null;
  ac: number | null;
  defeated: boolean;
  conditions: ConditionOn[];
}

export interface Combatant {
  id: Id;
  name: string;
  kind: "character" | "monster" | "event";
  /** The character or creature sheet it comes from. */
  ref: Id | null;
  init: number;
  /** The roll and its bonus, in words ("d20 showed 12, + 2"). */
  rolled: string;
  hidden: boolean;
  delayed: boolean;
  /** An event card's reminder ("the ceiling drips acid"). */
  note: string;
  members: Member[];
}

export interface Combat {
  active: boolean;
  round: number;
  /** Index into the order of whose turn it is. */
  turn: number;
  combatants: Combatant[];
}

export interface Timer {
  id: Id;
  name: string;
  kind: "rounds" | "world" | "repeat" | "real";
  /** Rounds or minutes left (rounds and world timers); minutes until the next go (repeating). */
  left: number;
  /** Repeating timers: every this many minutes. */
  every: number;
  /** A roll table rolled when it fires. */
  table: Id | null;
  /** Real time: when it ends (ms), or the time left while paused. */
  endsAt: number | null;
  paused: boolean;
  remaining: number | null;
  sound: boolean;
  dmOnly: boolean;
}

export interface LogLine {
  time: number;
  kind: "fight" | "drop" | "reward" | "condition" | "shown" | "roll" | "rest" | "clock" | "weather" | "note" | "join";
  text: string;
}

export interface SessionState {
  id: Id;
  number: number;
  title: string;
  started: number;
  ended: number | null;
  present: Id[];
  lastTime: string;
  encounter: Id | null;
  starred: Id[];
  clock: number;
  combat: Combat;
  timers: Timer[];
  log: LogLine[];
  defeated: { being: Id; count: number }[];
  made: Id[];
}

const num = (v: Value | undefined, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: Value | undefined, d = "") => (typeof v === "string" ? v : d);
const linkOf = (v: Value | undefined): Id | null => (isLink(v) ? v.link : null);
const links = (v: Value | undefined): Id[] => (Array.isArray(v) ? v.map(linkOf).filter((x): x is Id => !!x) : []);
const objects = (v: Value | undefined): Record<string, Value>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, Value> => !!x && typeof x === "object" && !Array.isArray(x) && !isLink(x)) : []) as Record<string, Value>[];
const asValue = (x: unknown): Value => JSON.parse(JSON.stringify(x)) as Value;

function conditionsOf(v: Value | undefined): ConditionOn[] {
  return objects(v).map((o) => ({
    id: str(o.id) || newId(),
    condition: linkOf(o.condition) ?? "",
    left: typeof o.left === "number" ? o.left : null,
    unit: (["rounds", "minutes", "hours", "save", "removed"] as const).find((u) => u === o.unit) ?? "removed",
    counter: typeof o.counter === "number" ? o.counter : null,
    source: str(o.source),
  }));
}
const conditionsValue = (list: ConditionOn[]): Value => list.map((c) => ({ ...c, condition: link(c.condition) }));

function combatOf(v: Value | undefined): Combat {
  const o = v && typeof v === "object" && !Array.isArray(v) && !isLink(v) ? (v as Record<string, Value>) : {};
  return {
    active: o.active === true,
    round: num(o.round, 1),
    turn: num(o.turn, 0),
    combatants: objects(o.combatants).map((c) => ({
      id: str(c.id) || newId(),
      name: str(c.name),
      kind: c.kind === "character" || c.kind === "event" ? c.kind : "monster",
      ref: linkOf(c.ref),
      init: num(c.init, 0),
      rolled: str(c.rolled),
      hidden: c.hidden === true,
      delayed: c.delayed === true,
      note: str(c.note),
      members: objects(c.members).map((m) => ({ id: str(m.id) || newId(), name: str(m.name), hp: typeof m.hp === "number" ? m.hp : null, maxHp: typeof m.maxHp === "number" ? m.maxHp : null, ac: typeof m.ac === "number" ? m.ac : null, defeated: m.defeated === true, conditions: conditionsOf(m.conditions) })),
    })),
  };
}
const combatValue = (c: Combat): Value => asValue({ ...c, combatants: c.combatants.map((x) => ({ ...x, ref: x.ref ? link(x.ref) : null, members: x.members.map((m) => ({ ...m, conditions: conditionsValue(m.conditions) })) })) });

function timersOf(v: Value | undefined): Timer[] {
  return objects(v).map((t) => ({
    id: str(t.id) || newId(),
    name: str(t.name, "Timer"),
    kind: (["rounds", "world", "repeat", "real"] as const).find((k) => k === t.kind) ?? "world",
    left: num(t.left, 0),
    every: num(t.every, 0),
    table: linkOf(t.table),
    endsAt: typeof t.endsAt === "number" ? t.endsAt : null,
    paused: t.paused === true,
    remaining: typeof t.remaining === "number" ? t.remaining : null,
    sound: t.sound !== false,
    dmOnly: t.dmOnly === true,
  }));
}
const timersValue = (list: Timer[]): Value => asValue(list.map((t) => ({ ...t, table: t.table ? link(t.table) : null })));

export function sessionOf(ws: Workspace, layerId: Id, id: Id): SessionState {
  const r = ws.resolve(layerId, id);
  if (!r || r.record.kind !== "session") throw new Error("That game night isn't here any more.");
  const f = r.fields;
  return {
    id,
    number: num(f.number, 1),
    title: r.record.name,
    started: num(f.started, 0),
    ended: typeof f.ended === "number" ? f.ended : null,
    present: links(f.present),
    lastTime: str(f.lastTime),
    encounter: linkOf(f.encounter),
    starred: links(f.starred),
    clock: num(f.clock, 8 * 60),
    combat: combatOf(f.combat),
    timers: timersOf(f.timers),
    log: objects(f.log).map((l) => ({ time: num(l.time, 0), kind: (str(l.kind, "note") as LogLine["kind"]), text: str(l.text) })),
    defeated: objects(f.defeated).flatMap((d) => (linkOf(d.being) ? [{ being: linkOf(d.being)!, count: num(d.count, 1) }] : [])),
    made: links(f.made),
  };
}

/** Every game night here, newest first. */
export function sessions(ws: Workspace, layerId: Id): SessionState[] {
  return ws
    .list(layerId, "session")
    .filter((n) => ws.owner(layerId, n.id) === layerId)
    .map((n) => sessionOf(ws, layerId, n.id))
    .sort((a, b) => b.number - a.number);
}

/** The game night that can be resumed: the newest one not wrapped up. */
export function openSession(ws: Workspace, layerId: Id): SessionState | null {
  return sessions(ws, layerId).find((s) => s.ended === null) ?? null;
}

// ---------- Starting and ending a night ----------

export interface BeginInput {
  present: Id[];
  starred: Id[];
  encounter: Id | null;
  lastTime: string;
}

/**
 * Begin session: a new game night (Session 7), carrying on the in-world clock from last time, and
 * a fresh page in the journal for it. Returns the session's id.
 */
export function beginSession(ws: Workspace, layerId: Id, input: BeginInput, now: number): Id {
  const before = sessions(ws, layerId);
  const prev = before[0] ?? null;
  const number = (prev?.number ?? 0) + 1;
  const date = new Date(now).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
  const title = `Session ${number}, ${date}`;
  const names = input.present.map((id) => ws.get(layerId, id)?.name).filter(Boolean);
  const roster = ws.list(layerId, "being").filter((n) => ws.resolve(layerId, n.id)!.fields[F.beingKind] === "character" && !n.template);
  const away = roster.filter((c) => !input.present.includes(c.id)).map((c) => c.name);
  const log: LogLine[] = [{ time: now, kind: "join", text: `At the table: ${names.join(", ") || "nobody yet"}.` }];
  if (away.length) log.push({ time: now, kind: "join", text: `Sat out: ${away.join(", ")}.` });
  const id = ws.create(layerId, "session", title, {
    fields: {
      number,
      started: now,
      ended: null,
      present: input.present.map((x) => link(x)),
      lastTime: input.lastTime.trim(),
      encounter: input.encounter ? link(input.encounter) : (prev?.encounter ? link(prev.encounter) : null),
      starred: input.starred.map((x) => link(x)),
      clock: prev?.clock ?? 8 * 60,
      combat: combatValue({ active: false, round: 1, turn: 0, combatants: [] }),
      timers: [],
      log: asValue(log),
      defeated: [],
      made: [],
    },
  });
  ws.create(layerId, "journal", title, { fields: { category: "Session", priority: 1, blocks: [], session: link(id), owner: null, shared: [], revealed: false } });
  return id;
}

function save(ws: Workspace, layerId: Id, s: SessionState, keys: (keyof SessionState)[]) {
  for (const k of keys) {
    if (k === "combat") ws.setField(layerId, s.id, "combat", combatValue(s.combat));
    else if (k === "timers") ws.setField(layerId, s.id, "timers", timersValue(s.timers));
    else if (k === "log") ws.setField(layerId, s.id, "log", asValue(s.log.slice(-2000)));
    else if (k === "defeated") ws.setField(layerId, s.id, "defeated", asValue(s.defeated.map((d) => ({ being: link(d.being), count: d.count }))));
    else if (k === "present" || k === "starred" || k === "made") ws.setField(layerId, s.id, k, (s[k] as Id[]).map((x) => link(x)));
    else if (k === "encounter") ws.setField(layerId, s.id, "encounter", s.encounter ? link(s.encounter) : null);
    else ws.setField(layerId, s.id, k, s[k] as Value);
  }
}

export function addLog(ws: Workspace, layerId: Id, sessionId: Id, kind: LogLine["kind"], text: string, now: number) {
  const s = sessionOf(ws, layerId, sessionId);
  s.log.push({ time: now, kind, text });
  save(ws, layerId, s, ["log"]);
}

export function setSession(ws: Workspace, layerId: Id, sessionId: Id, change: { present?: Id[]; starred?: Id[]; encounter?: Id | null; lastTime?: string }) {
  const s = sessionOf(ws, layerId, sessionId);
  const keys: (keyof SessionState)[] = [];
  if (change.present) ((s.present = change.present), keys.push("present"));
  if (change.starred) ((s.starred = change.starred), keys.push("starred"));
  if (change.encounter !== undefined) ((s.encounter = change.encounter), keys.push("encounter"));
  if (change.lastTime !== undefined) ((s.lastTime = change.lastTime), keys.push("lastTime"));
  save(ws, layerId, s, keys);
}

/** Things made up during a night (the improvised innkeeper), for "keep this?" at the end. */
export function noteMade(ws: Workspace, layerId: Id, sessionId: Id, id: Id) {
  const s = sessionOf(ws, layerId, sessionId);
  if (!s.made.includes(id)) s.made.push(id);
  save(ws, layerId, s, ["made"]);
}

// ---------- Experience ----------

/** Experience for the standard d20 challenge ratings. */
const CR_XP: Record<string, number> = { "0": 10, "1/8": 25, "1/4": 50, "1/2": 100, "1": 200, "2": 450, "3": 700, "4": 1100, "5": 1800, "6": 2300, "7": 2900, "8": 3900, "9": 5000, "10": 5900, "11": 7200, "12": 8400, "13": 10000, "14": 11500, "15": 13000, "16": 15000, "17": 18000, "18": 20000, "19": 22000, "20": 25000, "21": 33000, "22": 41000, "23": 50000, "24": 62000, "25": 75000, "26": 90000, "27": 105000, "28": 120000, "29": 135000, "30": 155000 };

/** A creature's experience: its own "xp" value, its words ("XP 50"), or its challenge. */
export function experienceOf(ws: Workspace, layerId: Id, being: Id): number {
  const r = ws.resolve(layerId, being);
  if (!r) return 0;
  if (typeof r.fields.xp === "number") return r.fields.xp;
  const m = /\bXP\s*([\d,]+)/i.exec(r.record.text);
  if (m) return Number(m[1]!.replace(/,/g, ""));
  return CR_XP[String(r.fields[F.cr] ?? "")] ?? 0;
}

export function nightExperience(ws: Workspace, layerId: Id, s: SessionState): number {
  return s.defeated.reduce((t, d) => t + experienceOf(ws, layerId, d.being) * d.count, 0);
}

/**
 * Wrap up: experience shared among who was there (or everyone, if absent characters share),
 * the night marked as ended, and things made up tonight kept or removed.
 */
export function wrapUp(ws: Workspace, layerId: Id, sessionId: Id, input: { xpEach: number; to: Id[]; remove: Id[] }, now: number) {
  const s = sessionOf(ws, layerId, sessionId);
  for (const c of input.to) {
    const f = ws.resolve(layerId, c)?.fields;
    if (!f) continue;
    if (input.xpEach) ws.setField(layerId, c, "xp", num(f.xp, 0) + input.xpEach);
  }
  for (const id of input.remove) if (ws.get(layerId, id)) ws.delete(layerId, id);
  if (s.combat.active) endFight(ws, layerId, sessionId, now);
  const after = sessionOf(ws, layerId, sessionId);
  after.log.push({ time: now, kind: "reward", text: input.xpEach ? `Wrapped up: ${input.xpEach} experience each for ${input.to.map((c) => ws.get(layerId, c)?.name).filter(Boolean).join(", ")}.` : "Wrapped up." });
  after.ended = now;
  save(ws, layerId, after, ["log", "ended"]);
}

// ---------- Initiative ----------

/** How initiative is rolled in this game: the core check's dice plus the Dexterity bonus. */
export function initiativeRule(ws: Workspace, layerId: Id): { die: string; ability: Id | null; lowFirst: boolean } {
  const core = ws.list(layerId, "rule").find((n: NodeRecord) => isCoreCheck(ws, layerId, n));
  const f = core ? ws.resolve(layerId, core.id)!.fields : {};
  const die = /^\d*d\d+$/i.test(str(f[F.die]).trim()) ? str(f[F.die]).trim() : "d20";
  const dex = ws.list(layerId, "ability").find((a) => ws.resolve(layerId, a.id)!.fields[F.label] === "DEX" || /^(dexterity|agility|reflexes)$/i.test(a.name));
  return { die, ability: dex?.id ?? null, lowFirst: f[F.family] === "rollUnder" };
}

function initiativeBonus(ws: Workspace, layerId: Id, being: Id | null): number {
  const rule = initiativeRule(ws, layerId);
  if (!being || !rule.ability) return 0;
  const f = ws.resolve(layerId, being)?.fields;
  if (!f) return 0;
  const s = scoresOf(f).find((x) => x.ability === rule.ability);
  return s ? abilityBonus(ws, layerId, rule.ability, s.score) : 0;
}

export function rollInitiative(ws: Workspace, layerId: Id, being: Id | null, random: () => number = Math.random): { init: number; rolled: string } {
  const rule = initiativeRule(ws, layerId);
  const bonus = initiativeBonus(ws, layerId, being);
  const r = roll(`${rule.die}${bonus ? ` ${bonus < 0 ? "-" : "+"} ${Math.abs(bonus)}` : ""}`, { random });
  return { init: r.total, rolled: r.breakdown };
}

/** The order turns go in: highest first (lowest first for roll-under games); delayed cards wait at the end. */
export function turnOrder(ws: Workspace, layerId: Id, c: Combat): Combatant[] {
  const low = initiativeRule(ws, layerId).lowFirst;
  return [...c.combatants].sort((a, b) => Number(a.delayed) - Number(b.delayed) || (low ? a.init - b.init : b.init - a.init) || a.name.localeCompare(b.name));
}

function memberFor(ws: Workspace, layerId: Id, being: Id, name: string): Member {
  const f = ws.resolve(layerId, being)?.fields ?? {};
  const hp = typeof f[F.hp] === "number" ? (f[F.hp] as number) : null;
  return { id: newId(), name, hp, maxHp: hp, ac: typeof f[F.ac] === "number" ? (f[F.ac] as number) : null, defeated: false, conditions: [] };
}

/**
 * Drags a monster in: How many, Separately (Goblin 1, Goblin 2, each rolling) or As a group (one
 * card, one roll, each goblin's hit points inside). Returns the new cards' ids.
 */
export function addToFight(ws: Workspace, layerId: Id, sessionId: Id, being: Id, opts: { count: number; group: boolean; hidden: boolean }, random: () => number = Math.random): Id[] {
  const s = sessionOf(ws, layerId, sessionId);
  const node = ws.get(layerId, being);
  if (!node || node.kind !== "being") throw new Error("Only beings can join a fight.");
  const isChar = ws.resolve(layerId, being)!.fields[F.beingKind] === "character";
  const count = Math.max(1, Math.min(50, Math.round(opts.count) || 1));
  const same = s.combat.combatants.filter((c) => c.ref === being).reduce((n, c) => n + c.members.length, 0);
  const label = (i: number) => (count === 1 && same === 0 ? node.name : `${node.name} ${same + i + 1}`);
  const out: Id[] = [];
  if (isChar) {
    if (s.combat.combatants.some((c) => c.ref === being)) return [];
    const r = rollInitiative(ws, layerId, being, random);
    const id = newId();
    s.combat.combatants.push({ id, name: node.name, kind: "character", ref: being, init: r.init, rolled: r.rolled, hidden: false, delayed: false, note: "", members: [] });
    out.push(id);
  } else if (opts.group && count > 1) {
    const r = rollInitiative(ws, layerId, being, random);
    const id = newId();
    s.combat.combatants.push({ id, name: `${node.name} ×${count}`, kind: "monster", ref: being, init: r.init, rolled: r.rolled, hidden: opts.hidden, delayed: false, note: "", members: Array.from({ length: count }, (_, i) => memberFor(ws, layerId, being, label(i))) });
    out.push(id);
  } else {
    for (let i = 0; i < count; i++) {
      const r = rollInitiative(ws, layerId, being, random);
      const id = newId();
      s.combat.combatants.push({ id, name: label(i), kind: "monster", ref: being, init: r.init, rolled: r.rolled, hidden: opts.hidden, delayed: false, note: "", members: [memberFor(ws, layerId, being, label(i))] });
      out.push(id);
    }
  }
  save(ws, layerId, s, ["combat"]);
  return out;
}

/** Event cards: a lair action or a timed event at a set spot in the order. */
export function addEvent(ws: Workspace, layerId: Id, sessionId: Id, name: string, init: number, note: string): Id {
  const s = sessionOf(ws, layerId, sessionId);
  const id = newId();
  s.combat.combatants.push({ id, name: name.trim() || "Event", kind: "event", ref: null, init, rolled: "", hidden: false, delayed: false, note: note.trim(), members: [] });
  save(ws, layerId, s, ["combat"]);
  return id;
}

/**
 * Start fight: the party at the table joins, and the encounter's creatures drop in hidden until
 * revealed (separately, or as groups for bigger numbers).
 */
export function startFight(ws: Workspace, layerId: Id, sessionId: Id, opts: { encounter: Id | null; hidden: boolean; groupFrom: number }, now: number, random: () => number = Math.random) {
  let s = sessionOf(ws, layerId, sessionId);
  if (!s.combat.active) {
    s.combat = { active: true, round: 1, turn: 0, combatants: s.combat.combatants };
    save(ws, layerId, s, ["combat"]);
  }
  for (const c of s.present) addToFight(ws, layerId, sessionId, c, { count: 1, group: false, hidden: false }, random);
  if (opts.encounter) {
    const f = ws.resolve(layerId, opts.encounter)?.fields ?? {};
    for (const o of objects(f.creatures)) {
      const b = linkOf(o.being);
      if (b && ws.get(layerId, b)) {
        const count = num(o.count, 1);
        addToFight(ws, layerId, sessionId, b, { count, group: count >= opts.groupFrom, hidden: opts.hidden }, random);
      }
    }
  }
  s = sessionOf(ws, layerId, sessionId);
  const where = opts.encounter ? ws.get(layerId, opts.encounter)?.name : null;
  s.log.push({ time: now, kind: "fight", text: `A fight started${where ? ` in ${where}` : ""}.` });
  s.combat.turn = 0;
  save(ws, layerId, s, ["combat", "log"]);
}

/** Next turn. A new round re-rolls (if the table re-rolls every round), ticks round timers and conditions. */
export function nextTurn(ws: Workspace, layerId: Id, sessionId: Id, opts: { rerollEachRound: boolean }, now: number, random: () => number = Math.random): { round: number; fired: string[] } {
  const s = sessionOf(ws, layerId, sessionId);
  const order = turnOrder(ws, layerId, s.combat).filter((c) => !c.delayed);
  const fired: string[] = [];
  if (!order.length) return { round: s.combat.round, fired };
  let next = s.combat.turn + 1;
  if (next >= order.length) {
    next = 0;
    s.combat.round += 1;
    if (opts.rerollEachRound) for (const c of s.combat.combatants) if (c.kind !== "event") Object.assign(c, rollInitiative(ws, layerId, c.ref, random));
    // Round timers and round-long conditions count down; 1 round is 6 seconds on the clock.
    for (const t of s.timers.filter((t) => t.kind === "rounds")) {
      t.left -= 1;
      if (t.left <= 0) fired.push(t.name);
    }
    s.timers = s.timers.filter((t) => !(t.kind === "rounds" && t.left <= 0));
    for (const c of s.combat.combatants)
      for (const m of c.members) {
        for (const x of m.conditions) if (x.unit === "rounds" && x.left !== null) x.left -= 1;
        const ended = m.conditions.filter((x) => x.unit === "rounds" && x.left !== null && x.left <= 0);
        for (const x of ended) s.log.push({ time: now, kind: "condition", text: `${m.name}: ${ws.get(layerId, x.condition)?.name ?? "a condition"} ended.` });
        m.conditions = m.conditions.filter((x) => !ended.includes(x));
      }
    s.clock += 0.1;
    for (const f of fired) s.log.push({ time: now, kind: "note", text: `Timer: ${f} ran out.` });
    // Characters' round conditions live on their sheets.
    tickCharacterConditions(ws, layerId, s, "rounds", 1, now);
  }
  s.combat.turn = next;
  save(ws, layerId, s, ["combat", "timers", "log", "clock"]);
  return { round: s.combat.round, fired };
}

/** Drag a card to where it acts: its initiative becomes just before the card it was dropped on. */
export function moveInOrder(ws: Workspace, layerId: Id, sessionId: Id, id: Id, before: Id | null) {
  const s = sessionOf(ws, layerId, sessionId);
  const order = turnOrder(ws, layerId, s.combat).filter((c) => c.id !== id);
  const me = s.combat.combatants.find((c) => c.id === id);
  if (!me) throw new Error("That card isn't in the fight any more.");
  const low = initiativeRule(ws, layerId).lowFirst;
  const at = before ? order.findIndex((c) => c.id === before) : order.length;
  const prev = order[at - 1];
  const next = order[at];
  const step = low ? -1 : 1;
  if (prev && next) me.init = (prev.init + next.init) / 2;
  else if (next) me.init = next.init + step;
  else if (prev) me.init = prev.init - step;
  me.init = Math.round(me.init * 100) / 100;
  me.delayed = false;
  save(ws, layerId, s, ["combat"]);
}

export function setCombatant(ws: Workspace, layerId: Id, sessionId: Id, id: Id, change: { delayed?: boolean; hidden?: boolean; init?: number; name?: string; note?: string } | null) {
  const s = sessionOf(ws, layerId, sessionId);
  if (change === null) s.combat.combatants = s.combat.combatants.filter((c) => c.id !== id);
  else {
    const c = s.combat.combatants.find((x) => x.id === id);
    if (!c) throw new Error("That card isn't in the fight any more.");
    Object.assign(c, Object.fromEntries(Object.entries(change).filter(([, v]) => v !== undefined)));
  }
  save(ws, layerId, s, ["combat"]);
}

export function revealAll(ws: Workspace, layerId: Id, sessionId: Id) {
  const s = sessionOf(ws, layerId, sessionId);
  for (const c of s.combat.combatants) c.hidden = false;
  save(ws, layerId, s, ["combat"]);
}

/** Removes the defeated monsters in one click. */
export function clearDefeated(ws: Workspace, layerId: Id, sessionId: Id) {
  const s = sessionOf(ws, layerId, sessionId);
  s.combat.combatants = s.combat.combatants.filter((c) => c.kind !== "monster" || c.members.some((m) => !m.defeated));
  for (const c of s.combat.combatants) if (c.members.length > 1) c.members = c.members.filter((m) => !m.defeated);
  save(ws, layerId, s, ["combat"]);
}

/** The condition the game's Hit points rule gives at 0 (Unconscious), if it has one. */
function zeroCondition(ws: Workspace, layerId: Id): Id | null {
  for (const n of ws.list(layerId, "resource")) {
    const f = ws.resolve(layerId, n.id)!.fields;
    if (!(/hit points|^hp$/i.test(n.name) || f[F.label] === "HP")) continue;
    for (const t of objects(f[F.thresholds])) if (num(t.at, -1) === 0 && linkOf(t.condition)) return linkOf(t.condition);
  }
  return null;
}

/**
 * Damage (or healing, negative) on a card. Monsters keep their hit points in the session; a
 * character's go on their sheet. At 0, the game's own rule: a character gets the condition the
 * Hit points rule names (Unconscious); a monster is defeated and greys out.
 */
export function damage(ws: Workspace, layerId: Id, sessionId: Id, combatantId: Id, memberId: Id | null, amount: number, now: number): string {
  const s = sessionOf(ws, layerId, sessionId);
  const c = s.combat.combatants.find((x) => x.id === combatantId);
  if (!c) throw new Error("That card isn't in the fight any more.");
  const amt = Math.round(amount);
  if (c.kind === "character" && c.ref) {
    const f = ws.resolve(layerId, c.ref)!.fields;
    const max = typeof f[F.hp] === "number" ? (f[F.hp] as number) : null;
    const before = num(f.hpNow, max ?? 0);
    const after = Math.max(amt > 0 ? 0 : -999, Math.min(max ?? Infinity, before - amt));
    ws.setField(layerId, c.ref, "hpNow", after);
    if (before > 0 && after <= 0) {
      s.log.push({ time: now, kind: "drop", text: `Round ${s.combat.round}: ${c.name} dropped to 0 hit points.` });
      const zero = zeroCondition(ws, layerId);
      if (zero) addConditionToCharacter(ws, layerId, c.ref, { condition: zero, left: null, unit: "removed", counter: null, source: "0 hit points" });
      save(ws, layerId, s, ["log"]);
    }
    return amt >= 0 ? `${c.name} took ${amt} (now ${after}).` : `${c.name} healed ${-amt} (now ${after}).`;
  }
  const m = memberId ? c.members.find((x) => x.id === memberId) : c.members.find((x) => !x.defeated) ?? c.members[0];
  if (!m) throw new Error("There's nobody on that card to hurt.");
  const before = m.hp ?? 0;
  m.hp = Math.max(0, Math.min(m.maxHp ?? Infinity, before - amt));
  const wasDown = m.defeated;
  m.defeated = m.hp <= 0;
  if (m.defeated && !wasDown) {
    s.log.push({ time: now, kind: "drop", text: `Round ${s.combat.round}: ${m.name} was defeated.` });
    if (c.ref) {
      const d = s.defeated.find((x) => x.being === c.ref);
      if (d) d.count += 1;
      else s.defeated.push({ being: c.ref, count: 1 });
    }
  } else if (!m.defeated && wasDown && c.ref) {
    const d = s.defeated.find((x) => x.being === c.ref);
    if (d) d.count = Math.max(0, d.count - 1);
    s.defeated = s.defeated.filter((x) => x.count > 0);
  }
  save(ws, layerId, s, ["combat", "log", "defeated"]);
  return amt >= 0 ? `${m.name} took ${amt} (now ${m.hp}).` : `${m.name} healed ${-amt} (now ${m.hp}).`;
}

/** End fight: the result goes in the log; defeated monsters count toward the night's experience. */
export function endFight(ws: Workspace, layerId: Id, sessionId: Id, now: number) {
  const s = sessionOf(ws, layerId, sessionId);
  const down = s.combat.combatants.flatMap((c) => (c.kind === "monster" ? c.members.filter((m) => m.defeated).map((m) => m.name) : []));
  s.log.push({ time: now, kind: "fight", text: `The fight ended after ${s.combat.round} round${s.combat.round === 1 ? "" : "s"}${down.length ? `: ${down.length} defeated (${down.join(", ")})` : ""}.` });
  s.combat = { active: false, round: 1, turn: 0, combatants: [] };
  save(ws, layerId, s, ["combat", "log"]);
}

// ---------- Conditions ----------

export function addConditionToCharacter(ws: Workspace, layerId: Id, character: Id, c: Omit<ConditionOn, "id">): Id {
  const list = conditionsOf(ws.resolve(layerId, character)!.fields.conditions);
  const id = newId();
  list.push({ ...c, id });
  ws.setField(layerId, character, "conditions", conditionsValue(list));
  return id;
}

/**
 * Puts a condition on cards (several at once: the dragon's fear hits the whole party). Characters
 * carry it on their sheet; monsters in the session.
 */
export function addCondition(ws: Workspace, layerId: Id, sessionId: Id, targets: { combatant: Id; member: Id | null }[], c: Omit<ConditionOn, "id">, now: number) {
  if (!ws.get(layerId, c.condition) || ws.get(layerId, c.condition)!.kind !== "condition") throw new Error("Pick a condition from the game's Conditions.");
  const s = sessionOf(ws, layerId, sessionId);
  const names: string[] = [];
  for (const t of targets) {
    const card = s.combat.combatants.find((x) => x.id === t.combatant);
    if (!card) continue;
    if (card.kind === "character" && card.ref) {
      addConditionToCharacter(ws, layerId, card.ref, c);
      names.push(card.name);
    } else
      for (const m of t.member ? card.members.filter((x) => x.id === t.member) : card.members) {
        m.conditions.push({ ...c, id: newId() });
        names.push(m.name);
      }
  }
  const cname = ws.get(layerId, c.condition)!.name;
  s.log.push({ time: now, kind: "condition", text: `${names.join(", ")}: ${cname}${c.left !== null && c.unit !== "removed" && c.unit !== "save" ? ` for ${c.left} ${c.unit}` : c.unit === "save" ? " until they save" : ""}.` });
  save(ws, layerId, s, ["combat", "log"]);
}

/** Changes or removes a condition on a card or a character (counter +1, -1; remove). */
export function changeCondition(ws: Workspace, layerId: Id, sessionId: Id | null, where: { character?: Id; combatant?: Id; member?: Id }, conditionId: Id, change: { counter?: number; left?: number } | null, now: number) {
  const apply = (list: ConditionOn[]): ConditionOn[] => {
    const i = list.findIndex((x) => x.id === conditionId);
    if (i < 0) return list;
    if (change === null) return list.filter((_, j) => j !== i);
    if (change.counter !== undefined) list[i]!.counter = Math.max(0, change.counter);
    if (change.left !== undefined) list[i]!.left = Math.max(0, change.left);
    return list;
  };
  if (where.character) {
    const list = conditionsOf(ws.resolve(layerId, where.character)!.fields.conditions);
    const gone = change === null ? list.find((x) => x.id === conditionId) : null;
    ws.setField(layerId, where.character, "conditions", conditionsValue(apply(list)));
    if (gone && sessionId) addLog(ws, layerId, sessionId, "condition", `${ws.get(layerId, where.character)?.name}: ${ws.get(layerId, gone.condition)?.name ?? "a condition"} removed.`, now);
    return;
  }
  if (!sessionId) return;
  const s = sessionOf(ws, layerId, sessionId);
  const card = s.combat.combatants.find((x) => x.id === where.combatant);
  for (const m of card?.members ?? []) if (!where.member || m.id === where.member) m.conditions = apply(m.conditions);
  save(ws, layerId, s, ["combat"]);
}

function tickCharacterConditions(ws: Workspace, layerId: Id, s: SessionState, unit: "rounds" | "minutes", amount: number, now: number) {
  for (const c of s.present) {
    const f = ws.resolve(layerId, c)?.fields;
    if (!f) continue;
    const list = conditionsOf(f.conditions);
    if (!list.some((x) => x.unit === unit || (unit === "minutes" && x.unit === "hours"))) continue;
    for (const x of list) {
      if (x.left === null) continue;
      if (x.unit === unit) x.left -= amount;
      else if (unit === "minutes" && x.unit === "hours") x.left -= amount / 60;
    }
    const ended = list.filter((x) => x.left !== null && x.left <= 0 && (x.unit === unit || (unit === "minutes" && x.unit === "hours")));
    for (const x of ended) s.log.push({ time: now, kind: "condition", text: `${ws.get(layerId, c)?.name}: ${ws.get(layerId, x.condition)?.name ?? "a condition"} ended.` });
    ws.setField(layerId, c, "conditions", conditionsValue(list.filter((x) => !ended.includes(x)).map((x) => ({ ...x, left: x.left === null ? null : Math.round(x.left * 100) / 100 }))));
  }
}

// ---------- Timers and the clock ----------

export function addTimer(ws: Workspace, layerId: Id, sessionId: Id, t: Omit<Timer, "id">, now: number): Id {
  const s = sessionOf(ws, layerId, sessionId);
  const id = newId();
  const timer: Timer = { ...t, id };
  if (timer.kind === "real" && timer.endsAt === null) timer.endsAt = now + timer.left * 60_000;
  if (timer.kind === "repeat" && !timer.every) timer.every = timer.left || 10;
  s.timers.push(timer);
  save(ws, layerId, s, ["timers"]);
  return id;
}

export function setTimer(ws: Workspace, layerId: Id, sessionId: Id, id: Id, change: { paused?: boolean; left?: number; name?: string } | null, now: number) {
  const s = sessionOf(ws, layerId, sessionId);
  if (change === null) s.timers = s.timers.filter((t) => t.id !== id);
  else {
    const t = s.timers.find((x) => x.id === id);
    if (!t) throw new Error("That timer isn't there any more.");
    if (change.name !== undefined) t.name = change.name;
    if (change.left !== undefined) {
      t.left = change.left;
      if (t.kind === "real") t.endsAt = now + change.left * 60_000;
    }
    if (change.paused !== undefined && t.kind === "real") {
      if (change.paused && !t.paused) ((t.remaining = Math.max(0, (t.endsAt ?? now) - now)), (t.paused = true));
      else if (!change.paused && t.paused) ((t.endsAt = now + (t.remaining ?? 0)), (t.paused = false), (t.remaining = null));
    }
  }
  save(ws, layerId, s, ["timers"]);
}

export interface ClockStep {
  fired: { name: string; roll: string | null }[];
  newDay: boolean;
}

/**
 * Moves the in-world clock on: torches burn down, conditions run out, repeating timers fire and
 * roll their tables, and a new day rolls the weather.
 */
export function advanceClock(ws: Workspace, layerId: Id, sessionId: Id, minutes: number, now: number, random: () => number = Math.random): ClockStep {
  const s = sessionOf(ws, layerId, sessionId);
  const before = s.clock;
  s.clock = Math.max(0, s.clock + minutes);
  const fired: ClockStep["fired"] = [];
  const keep: Timer[] = [];
  for (const t of s.timers) {
    if (t.kind === "world") {
      t.left -= minutes;
      if (t.left <= 0) {
        fired.push({ name: t.name, roll: null });
        continue;
      }
    } else if (t.kind === "repeat") {
      t.left -= minutes;
      while (t.left <= 0 && t.every > 0) {
        let text: string | null = null;
        if (t.table && ws.get(layerId, t.table)) text = rollChain(ws, layerId, t.table, random).text;
        fired.push({ name: t.name, roll: text });
        t.left += t.every;
      }
    }
    keep.push(t);
  }
  s.timers = keep;
  for (const f of fired) s.log.push({ time: now, kind: f.roll ? "roll" : "note", text: f.roll ? `${f.name}: ${f.roll}` : `Timer: ${f.name} ran out.` });
  const cal = calendarOf(ws, layerId);
  const newDay = Math.floor(before / 1440) !== Math.floor(s.clock / 1440);
  if (newDay && minutes > 0) {
    const d = dateOf(cal, s.clock);
    const weather = d.seasonWeather && ws.get(layerId, d.seasonWeather) ? rollChain(ws, layerId, d.seasonWeather, random).text : null;
    s.log.push({ time: now, kind: "weather", text: `${d.text}${weather ? `. Weather: ${weather}` : ""}.` });
  }
  if (minutes >= 1) s.log.push({ time: now, kind: "clock", text: `${minutesWords(minutes)} passed: ${dateOf(cal, s.clock).time}.` });
  save(ws, layerId, s, ["timers", "log", "clock"]);
  tickCharacterConditions(ws, layerId, sessionOf(ws, layerId, sessionId), "minutes", minutes, now);
  return { fired, newDay };
}

function minutesWords(m: number): string {
  if (m % 1440 === 0) return `${m / 1440} day${m === 1440 ? "" : "s"}`;
  if (m % 60 === 0) return `${m / 60} hour${m === 60 ? "" : "s"}`;
  return `${m} minute${m === 1 ? "" : "s"}`;
}

/** Rolls a table, and any table a row leads to ("roll on Treasure"), up to 5 deep. */
export function rollChain(ws: Workspace, layerId: Id, table: Id, random: () => number = Math.random, depth = 0): { text: string; rolls: { table: string; roll: number; text: string; result: { id: Id; name: string; kind: string } | null }[] } {
  const r = rollTable(ws, layerId, table, random);
  const name = ws.get(layerId, table)?.name ?? "Table";
  const target = r.row?.result ? ws.get(layerId, r.row.result.link) : null;
  const here = { table: name, roll: r.roll, text: r.row?.text ?? "Nothing on that number.", result: target ? { id: target.id, name: target.name, kind: target.kind } : null };
  if (target?.kind === "table" && depth < 5) {
    const deeper = rollChain(ws, layerId, target.id, random, depth + 1);
    return { text: [here.text, deeper.text].filter(Boolean).join(" → "), rolls: [here, ...deeper.rolls] };
  }
  return { text: [here.text, here.result?.name].filter(Boolean).join(": "), rolls: [here] };
}

// ---------- The calendar ----------

export interface Calendar {
  months: { name: string; days: number }[];
  weekdays: string[];
  holidays: { month: number; day: number; name: string }[];
  moons: { name: string; cycle: number; offset: number }[];
  seasons: { name: string; month: number; day: number; weather: Id | null }[];
  year: number;
}

export const PLAIN_CALENDAR: Calendar = {
  months: Array.from({ length: 12 }, (_, i) => ({ name: `Month ${i + 1}`, days: 30 })),
  weekdays: Array.from({ length: 7 }, (_, i) => `Day ${i + 1}`),
  holidays: [],
  moons: [],
  seasons: [],
  year: 1,
};

/** The game's calendar rule, or a plain numbered calendar. */
export function calendarOf(ws: Workspace, layerId: Id): Calendar {
  for (const n of ws.list(layerId, "rule")) {
    const c = ws.resolve(layerId, n.id)!.fields.calendar;
    if (!c || typeof c !== "object" || Array.isArray(c) || isLink(c)) continue;
    const o = c as Record<string, Value>;
    const months = objects(o.months).map((m) => ({ name: str(m.name, "Month"), days: Math.max(1, num(m.days, 30)) }));
    return {
      months: months.length ? months : PLAIN_CALENDAR.months,
      weekdays: Array.isArray(o.weekdays) && o.weekdays.length ? o.weekdays.map((w) => str(w, "Day")) : PLAIN_CALENDAR.weekdays,
      holidays: objects(o.holidays).map((x) => ({ month: num(x.month, 1), day: num(x.day, 1), name: str(x.name) })),
      moons: objects(o.moons).map((x) => ({ name: str(x.name, "Moon"), cycle: Math.max(1, num(x.cycle, 28)), offset: num(x.offset, 0) })),
      seasons: objects(o.seasons).map((x) => ({ name: str(x.name), month: num(x.month, 1), day: num(x.day, 1), weather: linkOf(x.weather) })),
      year: num(o.year, 1),
    };
  }
  return PLAIN_CALENDAR;
}

const MOON_PHASES = ["new moon", "waxing crescent", "first quarter", "waxing gibbous", "full moon", "waning gibbous", "last quarter", "waning crescent"];

export interface WorldDate {
  year: number;
  month: number;
  monthName: string;
  day: number;
  weekday: string;
  hour: number;
  minute: number;
  /** "8:30 in the morning" */
  time: string;
  /** "Day 3 of Month 2, year 1" */
  text: string;
  daylight: boolean;
  holiday: string | null;
  season: string | null;
  seasonWeather: Id | null;
  moons: { name: string; phase: string }[];
}

export function dateOf(cal: Calendar, minutes: number): WorldDate {
  const yearDays = cal.months.reduce((t, m) => t + m.days, 0) || 360;
  const dayIndex = Math.floor(minutes / 1440);
  const year = cal.year + Math.floor(dayIndex / yearDays);
  let rest = dayIndex % yearDays;
  let month = 0;
  while (month < cal.months.length - 1 && rest >= cal.months[month]!.days) rest -= cal.months[month++]!.days;
  const day = rest + 1;
  const inDay = ((minutes % 1440) + 1440) % 1440;
  const hour = Math.floor(inDay / 60);
  const minute = Math.floor(inDay % 60);
  const part = hour < 5 ? "at night" : hour < 12 ? "in the morning" : hour < 17 ? "in the afternoon" : hour < 21 ? "in the evening" : "at night";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const time = `${h12}:${String(minute).padStart(2, "0")} ${part}`;
  const monthName = cal.months[month]?.name ?? `Month ${month + 1}`;
  const weekday = cal.weekdays[dayIndex % cal.weekdays.length] ?? "";
  const holiday = cal.holidays.find((x) => x.month === month + 1 && x.day === day)?.name ?? null;
  // The season is the last one that has started by today (wrapping round from the year before).
  const dayOfYear = dayIndex % yearDays;
  const startOf = (s: { month: number; day: number }) => cal.months.slice(0, Math.max(0, s.month - 1)).reduce((t, m) => t + m.days, 0) + s.day - 1;
  const sorted = [...cal.seasons].sort((a, b) => startOf(a) - startOf(b));
  const season = sorted.filter((s) => startOf(s) <= dayOfYear).pop() ?? sorted[sorted.length - 1] ?? null;
  const moons = cal.moons.map((m) => ({ name: m.name, phase: MOON_PHASES[Math.floor((((dayIndex + m.offset) % m.cycle) / m.cycle) * 8 + 0.5) % 8]! }));
  return { year, month: month + 1, monthName, day, weekday, hour, minute, time, text: `${weekday ? `${weekday}, ` : ""}day ${day} of ${monthName}, year ${year}`, daylight: hour >= 6 && hour < 20, holiday, season: season?.name ?? null, seasonWeather: season?.weather ?? null, moons };
}

// ---------- What the table shows ----------

export interface CardView extends Combatant {
  /** For characters: their sheet's numbers and conditions. */
  hpNow: number | null;
  hpMax: number | null;
  ac: number | null;
  charConditions: ConditionOn[];
  player: string;
  picture: Id | null;
  /** Glance info: chosen numbers from the sheet ("DEX save +2"). */
  glance: Record<string, string>;
  attacks: { name: string; toHit: string; damage: string }[];
}

export interface TableView {
  session: SessionState | null;
  past: { id: Id; title: string; ended: number | null }[];
  order: CardView[];
  date: WorldDate;
  calendar: Calendar;
  conditions: { id: Id; name: string; color: string; symbol: string; text: string }[];
  roster: { id: Id; name: string; player: string; picture: Id | null }[];
  encounters: { id: Id; name: string; number: string }[];
  nightXp: number;
  zeroRule: string | null;
  initiative: { die: string; lowFirst: boolean };
}

const CONDITION_LOOKS: Record<string, [string, string]> = {
  blinded: ["#555", "🙈"], charmed: ["#7b3fa0", "💜"], deafened: ["#777", "🔇"], exhaustion: ["#8a6d3b", "😩"], frightened: ["#b8860b", "😱"], grappled: ["#8a4b2a", "🤼"], incapacitated: ["#666", "💫"], invisible: ["#5aa", "👻"], paralyzed: ["#2f6fb0", "⚡"], petrified: ["#888", "🗿"], poisoned: ["#3c8a4a", "🧪"], prone: ["#a0522d", "⬇"], restrained: ["#8a4b2a", "⛓"], stunned: ["#d4a017", "✨"], unconscious: ["#333", "💤"], frozen: ["#5ab4e6", "❄"],
};

export function conditionLook(ws: Workspace, layerId: Id, id: Id): { color: string; symbol: string } {
  const f = ws.resolve(layerId, id)?.fields ?? {};
  const look = f.look && typeof f.look === "object" && !Array.isArray(f.look) && !isLink(f.look) ? (f.look as Record<string, Value>) : {};
  const fallback = CONDITION_LOOKS[(ws.get(layerId, id)?.name ?? "").toLowerCase()] ?? ["#8a4b2a", "●"];
  return { color: str(look.color) || fallback[0], symbol: str(look.symbol) || fallback[1] };
}

function attacksOf(ws: Workspace, layerId: Id, being: Id): CardView["attacks"] {
  const r = ws.resolve(layerId, being);
  if (!r) return [];
  const scores = new Map(scoresOf(r.fields).map((s) => [s.ability, s.score]));
  const out: CardView["attacks"] = [];
  const walk = (a: { brick: { link: Id } | null; overrides: Record<string, Value>; name: string | null }) => {
    const b = a.brick ? ws.resolve(layerId, a.brick.link) : null;
    if (!b) return;
    if (b.record.kind === "item") {
      for (const { attachment: x } of b.attachments) walk({ ...x, name: x.name ?? b.record.name });
      return;
    }
    const v = { ...b.fields, ...a.overrides };
    if (v[F.type] !== "attack") return;
    const ab = linkOf(v[F.ability]);
    const bonus = ab && scores.has(ab) ? abilityBonus(ws, layerId, ab, scores.get(ab)!) : 0;
    const dice = str(v[F.dice]);
    out.push({ name: a.name ?? b.record.name, toHit: `1d20 ${bonus >= 0 ? "+" : "-"} ${Math.abs(bonus)}`, damage: dice ? `${dice}${bonus ? ` ${bonus >= 0 ? "+" : "-"} ${Math.abs(bonus)}` : ""}` : "" });
  };
  for (const { attachment } of r.attachments) walk(attachment);
  return out.slice(0, 8);
}

export function tableView(ws: Workspace, layerId: Id, glance: string[] = ["hp", "ac"]): TableView {
  const s = openSession(ws, layerId);
  const all = sessions(ws, layerId);
  const cal = calendarOf(ws, layerId);
  const conds = ws.list(layerId, "condition").map((n) => ({ id: n.id, name: n.name, ...conditionLook(ws, layerId, n.id), text: n.text })).sort((a, b) => a.name.localeCompare(b.name));
  const nums = ws.layer(layerId).type === "module" ? encounterNumbers(ws, layerId) : new Map<Id, string>();
  const encounters = ws
    .list(layerId, "encounter")
    .filter((n) => !n.template && nums.has(n.id))
    .map((n) => ({ id: n.id, name: n.name, number: nums.get(n.id)! }))
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  const rosterList = ws
    .list(layerId, "being")
    .filter((n) => !n.template && ws.resolve(layerId, n.id)!.fields[F.beingKind] === "character")
    .map((n) => ({ id: n.id, name: n.name, player: str(ws.resolve(layerId, n.id)!.fields.player), picture: n.picture }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const order: CardView[] = s
    ? turnOrder(ws, layerId, s.combat).map((c) => {
        const ref = c.ref ? ws.resolve(layerId, c.ref) : null;
        const f = ref?.fields ?? {};
        const glanceOut: Record<string, string> = {};
        const scores = new Map(scoresOf(f).map((x) => [x.ability, x.score]));
        for (const g of glance) {
          if (g === "hp") continue;
          if (g === "ac") {
            const ac = c.kind === "character" ? num(f[F.ac], NaN) : (c.members[0]?.ac ?? NaN);
            if (Number.isFinite(ac)) glanceOut.AC = String(ac);
            continue;
          }
          const ab = ws.get(layerId, g);
          if (ab?.kind === "ability" && scores.has(g)) {
            const b = abilityBonus(ws, layerId, g, scores.get(g)!);
            glanceOut[`${str(ws.resolve(layerId, g)!.fields[F.label]) || ab.name} save`] = `${b >= 0 ? "+" : ""}${b}`;
          }
        }
        let player = "";
        let charConditions: ConditionOn[] = [];
        let hpNow: number | null = null;
        let hpMax: number | null = null;
        if (c.kind === "character" && c.ref && ref) {
          try {
            const v = characterView(ws, layerId, c.ref);
            player = v.player;
            hpNow = v.hpNow;
            hpMax = v.hp;
          } catch {
            // A character deleted mid-fight keeps its card until removed.
          }
          charConditions = conditionsOf(f.conditions);
        }
        return { ...c, hpNow, hpMax, ac: typeof f[F.ac] === "number" ? (f[F.ac] as number) : null, charConditions, player, picture: ref?.record.picture ?? null, glance: glanceOut, attacks: c.ref ? attacksOf(ws, layerId, c.ref) : [] };
      })
    : [];
  const zero = zeroCondition(ws, layerId);
  const rule = initiativeRule(ws, layerId);
  return {
    session: s,
    past: all.map((x) => ({ id: x.id, title: x.title, ended: x.ended })),
    order,
    date: dateOf(cal, s?.clock ?? all[0]?.clock ?? 8 * 60),
    calendar: cal,
    conditions: conds,
    roster: rosterList,
    encounters,
    nightXp: s ? nightExperience(ws, layerId, s) : 0,
    zeroRule: zero ? (ws.get(layerId, zero)?.name ?? null) : null,
    initiative: { die: rule.die, lowFirst: rule.lowFirst },
  };
}
