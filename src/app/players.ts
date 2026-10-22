// Players join (version 2.5): who may see and change what, the PINs, and what each player's own
// screen shows. Pure logic, tested without a network: the server in lan.ts only carries it.
//
// Levels are ready-made rows of the permissions grid (New player, Player, Trusted player,
// Assistant GM); a person's own exceptions sit on top. The DM is whoever runs the app and always
// has everything. Players see monsters' health as words unless the grid says numbers.

import type { Id } from "../engine/index.ts";
import { newId } from "../engine/index.ts";
import type { CharacterView } from "./characters.ts";
import type { CardView, TableView } from "./table.ts";
import type { Access, ChatLine, Level, Part, Person, PermissionTemplate, Shown, TableMeta } from "./tablemeta.ts";
import { LEVELS, PARTS } from "./players-lists.ts";

export { LEVELS, LEVEL_ORDER, PARTS } from "./players-lists.ts";

const RANK: Record<Access, number> = { hidden: 0, see: 1, change: 2 };
export const PERSON_COLOURS = ["#2f6fb0", "#3c8a4a", "#7b3fa0", "#b8860b", "#a0522d", "#2a8a8a", "#b0306f", "#555"];

/** What a person may do with a part of the game. Table rules can open a part to everyone. */
export function access(p: Person, part: Part, rules: { selfAdvance?: boolean } = {}): Access {
  const a = p.grid[part] ?? LEVELS[p.level]?.grid[part] ?? "hidden";
  if (part === "initiative" && rules.selfAdvance && RANK[a] >= RANK.see) return "change";
  return a;
}
export const can = (p: Person, part: Part, rules: { selfAdvance?: boolean } = {}) => access(p, part, rules) !== "hidden";
export const canChange = (p: Person, part: Part, rules: { selfAdvance?: boolean } = {}) => access(p, part, rules) === "change";

/** A random five-digit PIN no one else at the table has. */
export function newPin(taken: string[], random: () => number = Math.random): string {
  for (;;) {
    const pin = String(10000 + Math.floor(random() * 90000));
    if (!taken.includes(pin)) return pin;
  }
}

export function makePerson(meta: TableMeta, name: string, character: Id | null, random: () => number = Math.random): Person {
  return {
    id: newId(),
    name: name.trim() || "Player",
    pin: newPin(meta.people.map((p) => p.pin), random),
    character,
    level: "player",
    grid: {},
    color: PERSON_COLOURS[meta.people.length % PERSON_COLOURS.length]!,
    notes: "",
  };
}

/** Finds who a PIN belongs to (revoked PINs are empty and match nobody). */
export function personByPin(meta: TableMeta, pin: string): Person | null {
  const p = String(pin ?? "").trim();
  return p.length === 5 ? (meta.people.find((x) => x.pin === p) ?? null) : null;
}

/** Applies a person template to one person, or a table template to everyone it names. */
export function applyTemplate(people: Person[], t: PermissionTemplate, personId?: Id): Person[] {
  if (t.kind === "person") return people.map((p) => (p.id === personId ? { ...p, level: t.level ?? p.level, grid: { ...(t.grid ?? {}) } } : p));
  return people.map((p) => {
    const x = t.people?.find((y) => y.name.toLowerCase() === p.name.toLowerCase());
    return x ? { ...p, level: x.level, grid: { ...x.grid } } : p;
  });
}

/** "unhurt", "hurt", "bloodied", "nearly down", "down": monster health for players. */
export function healthWords(hp: number | null, max: number | null): string {
  if (hp === null || !max) return "";
  if (hp <= 0) return "down";
  const f = hp / max;
  return f >= 1 ? "unhurt" : f > 0.5 ? "hurt" : f > 0.25 ? "bloodied" : "nearly down";
}

// ---------- The chat, as one person sees it ----------

/**
 * One chat line as this person sees it, or null if it isn't for them. Whispers reach the sender
 * and the people named (and anyone allowed to read others' whispers). DM-only rolls reach the
 * sender; blind rolls reach the sender without the result.
 */
export function chatFor(line: ChatLine, p: Person): ChatLine | null {
  const mine = line.from === p.id;
  if (line.kind === "whisper") return mine || line.to.some((n) => n.toLowerCase() === p.name.toLowerCase()) || can(p, "whispers") ? line : null;
  if (line.see === "public") return line;
  if (!mine) return null;
  if (line.see === "blind" && line.roll) return { ...line, text: line.text.replace(/\d+\s*$/, "?"), roll: { ...line.roll, total: NaN, breakdown: "Only the DM sees this roll.", natural: null } };
  return line;
}

// ---------- A player's screen ----------

export interface PlayerCard {
  id: Id;
  name: string;
  kind: CardView["kind"];
  now: boolean;
  mine: boolean;
  /** Numbers for characters (and monsters if allowed), otherwise words. */
  health: string;
  conditions: { name: string; color: string; symbol: string }[];
  picture: Id | null;
  note: string;
}

export interface ShownView {
  id: Id;
  node: Id;
  time: number;
  title: string;
  kind: string;
  stats: string | null;
  paragraphs: string[];
  picture: Id | null;
}

export interface PlayerState {
  me: { id: Id; name: string; level: string; color: string; notes: string };
  place: string;
  /** Things this person may see and do, part by part. */
  can: Record<Part, Access>;
  character: CharacterView | null;
  others: { id: Id; name: string; player: string; picture: Id | null; health: string; level: number; className: string }[];
  session: { title: string; lastTime: string; clock: string } | null;
  initiative: { active: boolean; round: number; order: PlayerCard[]; myTurn: boolean; canAdvance: boolean; canEndTurn: boolean; popSheet: boolean } | null;
  chat: ChatLine[];
  shown: ShownView[];
  map: { id: Id; marks: unknown[] } | null;
  tables: { id: Id; name: string }[];
  /** For whispers: everyone else at the table, and the DM. */
  people: { id: Id; name: string; online: boolean }[];
}

export interface PlayerSources {
  table: TableView;
  meta: TableMeta;
  place: string;
  character: (id: Id) => CharacterView | null;
  content: (id: Id) => Omit<ShownView, "id" | "node" | "time"> | null;
  tables: () => { id: Id; name: string }[];
  online: Set<Id>;
}

const condLook = (table: TableView, id: Id) => {
  const c = table.conditions.find((x) => x.id === id);
  return c ? { name: c.name, color: c.color, symbol: c.symbol } : null;
};

export function playerState(src: PlayerSources, p: Person): PlayerState {
  const { table, meta } = src;
  const rules = { selfAdvance: meta.settings.initiative?.selfAdvance === true };
  const grid = Object.fromEntries(PARTS.map((x) => [x.key, access(p, x.key, rules)])) as Record<Part, Access>;
  const s = table.session;
  const character = p.character ? src.character(p.character) : null;

  const others =
    grid.characters === "hidden"
      ? []
      : table.roster
          .filter((r) => r.id !== p.character)
          .flatMap((r) => {
            const v = src.character(r.id);
            return v ? [{ id: r.id, name: v.name, player: v.player, picture: v.picture, health: v.hp ? `${v.hpNow ?? v.hp}/${v.hp}` : "", level: v.level, className: v.class?.name ?? "" }] : [];
          });

  let initiative: PlayerState["initiative"] = null;
  if (s && grid.initiative !== "hidden" && s.combat.active) {
    const live = table.order.filter((c) => !c.delayed);
    const current = live[s.combat.turn] ?? null;
    const alwaysHidden = meta.settings.initiative?.alwaysHidden === true;
    const showHidden = grid.hidden !== "hidden";
    const order: PlayerCard[] = table.order
      .filter((c) => !c.hidden || showHidden || (c === current && !alwaysHidden))
      .filter((c) => !(alwaysHidden && c.kind === "monster" && !showHidden))
      .map((c) => {
        const conds = [...c.charConditions, ...c.members.flatMap((m) => m.conditions)].map((x) => condLook(table, x.condition)).filter((x): x is NonNullable<typeof x> => !!x);
        let health = "";
        if (c.kind === "character") health = c.hpMax ? `${c.hpNow ?? c.hpMax}/${c.hpMax}` : "";
        else if (c.kind === "monster") {
          const alive = c.members.filter((m) => !m.defeated);
          if (grid.monsters !== "hidden") health = c.members.map((m) => (m.hp === null ? "" : `${m.hp}/${m.maxHp ?? "?"}`)).filter(Boolean).join(", ");
          else health = c.members.length > 1 ? `${alive.length} of ${c.members.length} standing` : healthWords(c.members[0]?.hp ?? null, c.members[0]?.maxHp ?? null);
        }
        return { id: c.id, name: c.name, kind: c.kind, now: c === current, mine: c.kind === "character" && !!p.character && c.ref === p.character, health, conditions: conds, picture: c.picture, note: c.kind === "event" ? c.note : "" };
      });
    const myTurn = !!current && current.kind === "character" && !!p.character && current.ref === p.character;
    const keeper = canChange(p, "initiative");
    initiative = { active: true, round: s.combat.round, order, myTurn, canAdvance: keeper, canEndTurn: myTurn && (keeper || rules.selfAdvance), popSheet: meta.settings.initiative?.popSheet === true };
  }

  const chat = meta.chat
    .slice(-300)
    .map((l) => chatFor(l, p))
    .filter((l): l is ChatLine => !!l);

  const shown = meta.shown
    .filter((x) => !x.to.length || x.to.includes(p.id))
    .flatMap((x: Shown) => {
      const c = src.content(x.node);
      return c ? [{ ...c, id: x.id, node: x.node, time: x.time }] : [];
    });

  const live = meta.live;
  const map = live.map && (!live.to.length || live.to.includes(p.id)) ? { id: live.map, marks: live.marks } : null;

  return {
    me: { id: p.id, name: p.name, level: LEVELS[p.level]?.label ?? "Player", color: p.color, notes: p.notes },
    place: src.place,
    can: grid,
    character,
    others,
    session: s ? { title: s.title, lastTime: s.lastTime, clock: `${table.date.time}, ${table.date.text}` } : null,
    initiative,
    chat,
    shown,
    map,
    tables: grid.tables !== "hidden" ? src.tables() : [],
    people: [{ id: "dm", name: "DM", online: true }, ...meta.people.filter((x) => x.id !== p.id && x.pin).map((x) => ({ id: x.id, name: x.name, online: src.online.has(x.id) }))],
  };
}

// ---------- What a player may do ----------

export type PlayerAction =
  | { type: "chat"; text: string; ic?: boolean; to?: string[] }
  | { type: "roll"; formula: string; mode?: "normal" | "advantage" | "disadvantage"; see?: "public" | "dm" | "blind" | "private"; label?: string }
  | { type: "endTurn" }
  | { type: "hp"; value: number }
  | { type: "tracker"; tracker: Id; value: number }
  | { type: "notes"; text: string }
  | { type: "point"; x: number; y: number }
  | { type: "rollTable"; table: Id }
  | { type: "show"; node: Id; to: Id[] }
  | { type: "lookup"; query: string };

/** Checks an action against the person's permissions; returns why not, or null if it's fine. */
export function refuse(meta: TableMeta, p: Person, a: PlayerAction, ctx: { myTurn: boolean; isShownToMe: (node: Id) => boolean }): string | null {
  const rules = { selfAdvance: meta.settings.initiative?.selfAdvance === true };
  switch (a.type) {
    case "chat":
      return typeof a.text === "string" && a.text.trim() ? null : "Type something first.";
    case "roll":
      return typeof a.formula === "string" && a.formula.trim() ? null : "Say what to roll, like 1d20+3.";
    case "endTurn":
      // An initiative keeper moves it on any time; with the table rule, each player on their turn.
      if (canChange(p, "initiative")) return null;
      if (rules.selfAdvance && ctx.myTurn) return null;
      return rules.selfAdvance ? "It isn't your turn." : "The DM moves the turns on at this table.";
    case "hp":
    case "tracker":
      return p.character ? null : "You don't have a character yet.";
    case "notes":
      return null;
    case "point":
      return canChange(p, "pointer") ? null : "The DM hasn't given you the pointer.";
    case "rollTable":
      return can(p, "tables") ? null : "Roll tables are the DM's at this table.";
    case "lookup":
      return can(p, "codex") ? null : "The rules reference is the DM's at this table.";
    case "show":
      return canChange(p, "share") && ctx.isShownToMe(a.node) ? null : "Ask the DM to show that.";
    default:
      return "The app doesn't know that.";
  }
}
