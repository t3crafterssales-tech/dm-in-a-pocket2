import { test } from "node:test";
import assert from "node:assert/strict";
import { Workspace, link } from "../src/engine/index.ts";
import { buildD20Starter } from "../src/app/starters/d20.ts";
import { builderOptions, characterView, createCharacter } from "../src/app/characters.ts";
import { createEncounter, addToEncounter } from "../src/app/encounters.ts";
import { addCondition, addEvent, addTimer, addToFight, advanceClock, beginSession, changeCondition, clearDefeated, damage, dateOf, endFight, experienceOf, moveInOrder, nextTurn, openSession, rollChain, sessionOf, setTimer, startFight, tableView, turnOrder, wrapUp } from "../src/app/table.ts";
import type { Calendar } from "../src/app/table.ts";

const T = Date.UTC(2026, 9, 24, 19);
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length]!;
};

function setup() {
  const ws = new Workspace();
  const sys = ws.addLayer("system", "d20 Basic");
  ws.transact("starter", () => buildD20Starter(ws, sys));
  const world = ws.addLayer("world", "Greyhollow", sys);
  const mod = ws.addLayer("module", "The Mill", world);
  const o = builderOptions(ws, world);
  const dex = o.abilities.find((a) => a.label === "DEX")!.id;
  const con = o.abilities.find((a) => a.label === "CON")!.id;
  const make = (name: string, player: string) => createCharacter(ws, world, { name, player, picture: null, race: null, class: o.classes.find((c) => c.name === "Fighter")!.id, background: null, level: 1, method: "own", scores: { [dex]: 14, [con]: 12 }, raceBonuses: false, hp: null, gold: "", gear: [], choices: {}, appearance: {}, approved: true });
  const mira = make("Mira", "Randy");
  const joe = make("Pell", "Joe");
  const wolf = ws.list(sys, "being").find((n) => n.name === "Wolf")!.id;
  const road = ws.transact("x", () => {
    const e = createEncounter(ws, mod, "On the road");
    addToEncounter(ws, mod, e, [wolf], 3);
    return e;
  });
  return { ws, sys, world, mod, mira, joe, wolf, road };
}

test("a game night: begins with who is at the table, a journal page, and the clock from last time", () => {
  const s = setup();
  const id = s.ws.transact("begin", () => beginSession(s.ws, s.mod, { present: [s.mira], starred: [s.road], encounter: s.road, lastTime: "The wolves were circling." }, T));
  const night = sessionOf(s.ws, s.mod, id);
  assert.equal(night.title, "Session 1, 24 October");
  assert.deepEqual(night.present, [s.mira]);
  assert.match(night.log.map((l) => l.text).join(" "), /Sat out: Pell/, "absent characters sit out, and the log says so");
  assert.ok(s.ws.list(s.mod, "journal").some((j) => j.name === night.title), "a journal page for the night");
  s.ws.transact("clock", () => advanceClock(s.ws, s.mod, id, 90, T));
  s.ws.transact("wrap", () => wrapUp(s.ws, s.mod, id, { xpEach: 0, to: [], remove: [] }, T));
  assert.equal(openSession(s.ws, s.mod), null);
  const next = s.ws.transact("begin", () => beginSession(s.ws, s.mod, { present: [s.mira, s.joe], starred: [], encounter: null, lastTime: "" }, T + 7 * 864e5));
  assert.equal(sessionOf(s.ws, s.mod, next).clock, 8 * 60 + 90, "the clock carries on");
  assert.equal(sessionOf(s.ws, s.mod, next).encounter, s.road, "the module remembers where the group got to");
  assert.equal(sessionOf(s.ws, s.mod, next).number, 2);
});

test("initiative follows the core check, monsters join hidden, groups share one roll", () => {
  const s = setup();
  const id = s.ws.transact("begin", () => beginSession(s.ws, s.mod, { present: [s.mira, s.joe], starred: [], encounter: s.road, lastTime: "" }, T));
  s.ws.transact("fight", () => startFight(s.ws, s.mod, id, { encounter: s.road, hidden: true, groupFrom: 99 }, T, seq(0.5)));
  let night = sessionOf(s.ws, s.mod, id);
  assert.equal(night.combat.combatants.length, 5, "two characters and three wolves");
  assert.deepEqual(night.combat.combatants.filter((c) => c.kind === "monster").map((c) => c.name), ["Wolf 1", "Wolf 2", "Wolf 3"]);
  assert.ok(night.combat.combatants.filter((c) => c.kind === "monster").every((c) => c.hidden));
  assert.match(night.combat.combatants[0]!.rolled, /d20 showed 11, \+ 2/, "d20 plus the Dexterity bonus");
  s.ws.transact("group", () => addToFight(s.ws, s.mod, id, s.wolf, { count: 4, group: true, hidden: false }, seq(0.9)));
  night = sessionOf(s.ws, s.mod, id);
  const pack = night.combat.combatants.find((c) => c.members.length === 4)!;
  assert.equal(pack.name, "Wolf ×4");
  assert.deepEqual(pack.members.map((m) => m.name), ["Wolf 4", "Wolf 5", "Wolf 6", "Wolf 7"]);
  assert.equal(pack.members[0]!.hp, 11);
  const order = turnOrder(s.ws, s.mod, night.combat);
  assert.equal(order[0]!.id, pack.id, "the highest roll goes first");
});

test("turns, rounds, delay, dragging to a new place and event cards", () => {
  const s = setup();
  const id = s.ws.transact("begin", () => beginSession(s.ws, s.mod, { present: [s.mira, s.joe], starred: [], encounter: null, lastTime: "" }, T));
  s.ws.transact("fight", () => startFight(s.ws, s.mod, id, { encounter: null, hidden: false, groupFrom: 99 }, T, seq(0.2, 0.8)));
  const ev = s.ws.transact("event", () => addEvent(s.ws, s.mod, id, "Lair action", 20, "The ceiling drips acid."));
  let night = sessionOf(s.ws, s.mod, id);
  assert.equal(turnOrder(s.ws, s.mod, night.combat)[0]!.id, ev, "an event sits at its spot in the order");
  const pell = night.combat.combatants.find((c) => c.name === "Pell")!.id;
  s.ws.transact("move", () => moveInOrder(s.ws, s.mod, id, pell, ev));
  night = sessionOf(s.ws, s.mod, id);
  assert.equal(turnOrder(s.ws, s.mod, night.combat)[0]!.name, "Pell");
  const t = s.ws.transact("timer", () => addTimer(s.ws, s.mod, id, { name: "The ritual", kind: "rounds", left: 1, every: 0, table: null, endsAt: null, paused: false, remaining: null, sound: true, dmOnly: false }, T));
  void t;
  s.ws.transact("next", () => nextTurn(s.ws, s.mod, id, { rerollEachRound: false }, T));
  s.ws.transact("next", () => nextTurn(s.ws, s.mod, id, { rerollEachRound: false }, T));
  const r = s.ws.transact("next", () => nextTurn(s.ws, s.mod, id, { rerollEachRound: false }, T));
  assert.equal(r.round, 2);
  assert.deepEqual(r.fired, ["The ritual"], "round timers tick with initiative");
  assert.equal(sessionOf(s.ws, s.mod, id).timers.length, 0);
  s.ws.undo();
  assert.equal(sessionOf(s.ws, s.mod, id).combat.round, 1, "every table step undoes");
});

test("damage: monsters fall in the session only; a character at 0 gets the game's own condition", () => {
  const s = setup();
  const id = s.ws.transact("begin", () => beginSession(s.ws, s.mod, { present: [s.mira], starred: [], encounter: null, lastTime: "" }, T));
  s.ws.transact("fight", () => startFight(s.ws, s.mod, id, { encounter: s.road, hidden: false, groupFrom: 99 }, T, seq(0.5)));
  let night = sessionOf(s.ws, s.mod, id);
  const wolf1 = night.combat.combatants.find((c) => c.name === "Wolf 1")!;
  s.ws.transact("hit", () => damage(s.ws, s.mod, id, wolf1.id, null, 20, T));
  night = sessionOf(s.ws, s.mod, id);
  assert.equal(night.combat.combatants.find((c) => c.id === wolf1.id)!.members[0]!.defeated, true);
  assert.equal(s.ws.resolve(s.mod, s.wolf)!.fields.hp, 11, "the Wolf sheet never changes");
  assert.deepEqual(night.defeated, [{ being: s.wolf, count: 1 }]);
  const mira = night.combat.combatants.find((c) => c.name === "Mira")!;
  s.ws.transact("ouch", () => damage(s.ws, s.mod, id, mira.id, null, 99, T));
  const v = characterView(s.ws, s.mod, s.mira);
  assert.equal(v.hpNow, 0);
  const tv = tableView(s.ws, s.mod);
  assert.equal(tv.zeroRule, "Unconscious");
  assert.deepEqual(tv.order.find((c) => c.name === "Mira")!.charConditions.map((c) => s.ws.get(s.mod, c.condition)!.name), ["Unconscious"]);
  assert.match(sessionOf(s.ws, s.mod, id).log.map((l) => l.text).join(" "), /Mira dropped to 0 hit points/);
  s.ws.transact("clear", () => clearDefeated(s.ws, s.mod, id));
  assert.ok(!sessionOf(s.ws, s.mod, id).combat.combatants.some((c) => c.name === "Wolf 1"));
  s.ws.transact("end", () => endFight(s.ws, s.mod, id, T));
  assert.equal(sessionOf(s.ws, s.mod, id).combat.active, false);
  assert.equal(experienceOf(s.ws, s.mod, s.wolf), 50, "experience from the creature's own words");
  s.ws.transact("wrap", () => wrapUp(s.ws, s.mod, id, { xpEach: 50, to: [s.mira], remove: [] }, T));
  assert.equal(characterView(s.ws, s.mod, s.mira).xp, 50);
});

test("conditions count down by rounds and by the clock, and come off by themselves", () => {
  const s = setup();
  const id = s.ws.transact("begin", () => beginSession(s.ws, s.mod, { present: [s.mira], starred: [], encounter: null, lastTime: "" }, T));
  s.ws.transact("fight", () => startFight(s.ws, s.mod, id, { encounter: s.road, hidden: false, groupFrom: 99 }, T, seq(0.5)));
  const poisoned = s.ws.list(s.mod, "condition").find((c) => c.name === "Poisoned")!.id;
  const night = sessionOf(s.ws, s.mod, id);
  const targets = night.combat.combatants.map((c) => ({ combatant: c.id, member: null }));
  s.ws.transact("cond", () => addCondition(s.ws, s.mod, id, targets, { condition: poisoned, left: 1, unit: "rounds", counter: 3, source: "the wolf's bite" }, T));
  assert.equal(characterView(s.ws, s.mod, s.mira).hpNow !== null, true);
  let tv = tableView(s.ws, s.mod);
  assert.equal(tv.order.find((c) => c.name === "Mira")!.charConditions[0]!.counter, 3);
  assert.equal(tv.order.find((c) => c.name === "Wolf 1")!.members[0]!.conditions.length, 1);
  for (let i = 0; i < 4; i++) s.ws.transact("next", () => nextTurn(s.ws, s.mod, id, { rerollEachRound: false }, T));
  tv = tableView(s.ws, s.mod);
  assert.equal(tv.order.find((c) => c.name === "Wolf 1")!.members[0]!.conditions.length, 0, "one round, then gone");
  assert.equal(tv.order.find((c) => c.name === "Mira")!.charConditions.length, 0);
  const frightened = s.ws.list(s.mod, "condition").find((c) => c.name === "Frightened")!.id;
  s.ws.transact("cond", () => addCondition(s.ws, s.mod, id, [{ combatant: tv.order.find((c) => c.name === "Mira")!.id, member: null }], { condition: frightened, left: 1, unit: "hours", counter: null, source: "" }, T));
  s.ws.transact("clock", () => advanceClock(s.ws, s.mod, id, 30, T));
  assert.equal(characterView(s.ws, s.mod, s.mira).hpNow !== null && tableView(s.ws, s.mod).order.find((c) => c.name === "Mira")!.charConditions.length, 1);
  s.ws.transact("clock", () => advanceClock(s.ws, s.mod, id, 30, T));
  assert.equal(tableView(s.ws, s.mod).order.find((c) => c.name === "Mira")!.charConditions.length, 0, "an hour on the clock ends it");
  const c2 = s.ws.transact("cond", () => addCondition(s.ws, s.mod, id, [{ combatant: tv.order.find((c) => c.name === "Mira")!.id, member: null }], { condition: frightened, left: null, unit: "removed", counter: null, source: "" }, T));
  void c2;
  const on = tableView(s.ws, s.mod).order.find((c) => c.name === "Mira")!.charConditions[0]!;
  s.ws.transact("off", () => changeCondition(s.ws, s.mod, id, { character: s.mira }, on.id, null, T));
  assert.equal(tableView(s.ws, s.mod).order.find((c) => c.name === "Mira")!.charConditions.length, 0);
});

test("the clock: repeating timers roll their tables, real-time timers pause, and the calendar reads the date", () => {
  const s = setup();
  const table = s.ws.transact("t", () => s.ws.create(s.mod, "table", "Wandering monsters", { fields: { die: "d6", rows: [{ from: 1, to: 6, text: "Rats!", result: null }] } }));
  const id = s.ws.transact("begin", () => beginSession(s.ws, s.mod, { present: [], starred: [], encounter: null, lastTime: "" }, T));
  s.ws.transact("timer", () => addTimer(s.ws, s.mod, id, { name: "Underground", kind: "repeat", left: 10, every: 10, table, endsAt: null, paused: false, remaining: null, sound: false, dmOnly: true }, T));
  s.ws.transact("timer", () => addTimer(s.ws, s.mod, id, { name: "Torch", kind: "world", left: 60, every: 0, table: null, endsAt: null, paused: false, remaining: null, sound: false, dmOnly: false }, T));
  const step = s.ws.transact("clock", () => advanceClock(s.ws, s.mod, id, 60, T, seq(0.1)));
  assert.equal(step.fired.filter((f) => f.name === "Underground").length, 6, "every 10 minutes for an hour");
  assert.equal(step.fired.find((f) => f.name === "Underground")!.roll, "Rats!");
  assert.ok(step.fired.some((f) => f.name === "Torch"), "the torch burned out");
  const real = s.ws.transact("timer", () => addTimer(s.ws, s.mod, id, { name: "Bridge collapses", kind: "real", left: 2, every: 0, table: null, endsAt: null, paused: false, remaining: null, sound: true, dmOnly: false }, T));
  s.ws.transact("pause", () => setTimer(s.ws, s.mod, id, real, { paused: true }, T + 30_000));
  assert.equal(sessionOf(s.ws, s.mod, id).timers.find((t) => t.id === real)!.remaining, 90_000);
  const cal: Calendar = { months: [{ name: "Thaw", days: 30 }, { name: "Bloom", days: 31 }], weekdays: ["Moonday", "Sunday"], holidays: [{ month: 2, day: 1, name: "Blossom Day" }], moons: [{ name: "Silver", cycle: 8, offset: 0 }], seasons: [{ name: "Spring", month: 1, day: 1, weather: null }], year: 312 };
  const d = dateOf(cal, (30 * 1440) + 9 * 60 + 15);
  assert.equal(d.text, "Moonday, day 1 of Bloom, year 312");
  assert.equal(d.time, "9:15 in the morning");
  assert.equal(d.holiday, "Blossom Day");
  assert.equal(d.moons[0]!.phase.length > 0, true);
  assert.equal(dateOf(cal, 61 * 1440).year, 313, "the year turns over");
  const chained = s.ws.transact("t", () => s.ws.create(s.mod, "table", "Treasure", { fields: { die: "d4", rows: [{ from: 1, to: 4, text: "Roll on", result: link(table) }] } }));
  assert.equal(rollChain(s.ws, s.mod, chained, seq(0.1)).text, "Roll on → Rats!", "a row can roll on another table");
});
