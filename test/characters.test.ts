import { test } from "node:test";
import assert from "node:assert/strict";
import { Workspace, link } from "../src/engine/index.ts";
import { buildD20Starter } from "../src/app/starters/d20.ts";
import { addExtra, addTracker, award, builderOptions, characterView, createCharacter, finalScores, hitPointsFor, levelUp, makeItForMe, rest, rollScores, roster, setAppearance, setTracker } from "../src/app/characters.ts";
import type { CharacterInput } from "../src/app/characters.ts";

function d20() {
  const ws = new Workspace();
  const sys = ws.addLayer("system", "d20 Basic");
  ws.transact("starter", () => buildD20Starter(ws, sys));
  const world = ws.addLayer("world", "Greyhollow", sys);
  return { ws, sys, world };
}

const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length]!;
};

test("the builder reads the game: races, classes with hit dice, backgrounds, abilities and the method rule", () => {
  const { ws, world } = d20();
  const o = builderOptions(ws, world);
  assert.deepEqual(o.abilities.map((a) => a.label), ["STR", "DEX", "CON", "INT", "WIS", "CHA"]);
  assert.ok(o.races.some((r) => r.name === "Elf" && !r.parent));
  assert.ok(o.races.some((r) => r.parent && o.races.find((p) => p.id === r.parent)?.name === "Elf"), "subraces sit under their race");
  const fighter = o.classes.find((c) => c.name === "Fighter")!;
  assert.equal(fighter.hitDie, "d10");
  assert.ok(fighter.primary.length >= 1, "Primary ability is read from the class's words");
  assert.ok(o.backgrounds.some((b) => b.name === "Acolyte"));
  assert.equal(o.defaultMethod, "standard", "the d20 starter's own rule: the standard set");
  assert.deepEqual(o.standardSet, [15, 14, 13, 12, 10, 8]);
  assert.deepEqual(o.awards.map((a) => a.name), ["Heroic Inspiration"]);
});

test("a game with no classes or races still makes characters, and asks only about what it has", () => {
  const ws = new Workspace();
  const sys = ws.addLayer("system", "Tiny game");
  const might = ws.transact("x", () => ws.create(sys, "ability", "Might", { fields: { label: "MGT", bonus: "score" } }));
  const o = builderOptions(ws, sys);
  assert.deepEqual([o.races.length, o.classes.length, o.backgrounds.length], [0, 0, 0]);
  const id = createCharacter(ws, sys, { name: "Pip", player: "Randy", picture: null, race: null, class: null, background: null, level: 1, method: "own", scores: { [might]: 3 }, raceBonuses: false, hp: 5, gold: "", gear: [], choices: {}, appearance: {}, approved: true });
  const v = characterView(ws, sys, id);
  assert.equal(v.scores[0]!.bonus, 3, "the ability's own bonus kind (the score itself)");
  assert.equal(v.hp, 5);
  assert.deepEqual(v.missing, []);
});

test("making a character: scores with race bonuses, hit points from the class, gear and the roster", () => {
  const { ws, world } = d20();
  const o = builderOptions(ws, world);
  const fighter = o.classes.find((c) => c.name === "Fighter")!;
  const human = o.races.find((r) => r.name === "Human")!;
  const [str, dex, con, int, wis, cha] = o.abilities.map((a) => a.id);
  const sword = ws.list(world, "item").find((n) => n.name === "Longsword")!.id;
  const input: CharacterInput = { name: "Mira", player: "Randy", picture: null, race: human.id, class: fighter.id, background: o.backgrounds[0]!.id, level: 1, method: "standard", scores: { [str!]: 15, [dex!]: 13, [con!]: 14, [int!]: 8, [wis!]: 12, [cha!]: 10 }, raceBonuses: true, hp: null, gold: "15 gp", gear: [sword], choices: {}, appearance: { hair: "red" }, approved: true };
  const id = createCharacter(ws, world, input);
  const v = characterView(ws, world, id);
  assert.equal(v.player, "Randy");
  assert.equal(v.class?.name, "Fighter");
  assert.equal(v.hp, 12, "d10 at its highest plus a Constitution bonus of 2");
  assert.equal(v.hpNow, 12);
  assert.equal(v.scores.find((s) => s.label === "STR")!.bonus, 2);
  assert.deepEqual(v.gear.map((g) => g.name), ["Longsword"]);
  assert.equal(v.appearance.find((a) => a.key === "hair")!.value, "red");
  assert.equal(v.trackers[0]!.name, "Heroic Inspiration", "the game's awards appear as trackers by themselves");
  assert.deepEqual(roster(ws, world).map((r) => [r.name, r.summary]), [["Mira", "Human · Fighter · level 1"]]);
  // One undo step, and the system never sees the character.
  ws.undo();
  assert.equal(roster(ws, world).length, 0);
});

test("starting at a higher level: more hit points, and the level-up adds the average", () => {
  const { ws, world } = d20();
  const o = builderOptions(ws, world);
  const wizard = o.classes.find((c) => c.name === "Wizard")!;
  const con = o.abilities.find((a) => a.label === "CON")!.id;
  assert.equal(hitPointsFor(ws, world, wizard.id, 1, new Map([[con, 14]])), 8);
  assert.equal(hitPointsFor(ws, world, wizard.id, 3, new Map([[con, 14]])), 8 + 2 * 6);
  const id = createCharacter(ws, world, { name: "Joe's wizard", player: "Joe", picture: null, race: null, class: wizard.id, background: null, level: 3, method: "own", scores: { [con]: 14 }, raceBonuses: false, hp: null, gold: "", gear: [], choices: {}, appearance: {}, approved: true });
  assert.equal(characterView(ws, world, id).hp, 20);
  assert.equal(characterView(ws, world, id).nextLevelHp, 6);
  ws.transact("level", () => levelUp(ws, world, id, null));
  const v = characterView(ws, world, id);
  assert.equal(v.level, 4);
  assert.equal(v.hp, 26);
  assert.ok(v.missing.some((m) => /No Strength score/.test(m)), "missing scores are flagged, never blocked");
});

test("Make it for me picks sensible choices; rolled scores stay between 3 and 18", () => {
  const { ws, world } = d20();
  const o = builderOptions(ws, world);
  const input = makeItForMe(o, seq(0.1, 0.5, 0.9, 0.3, 0.7));
  assert.ok(input.class && input.race);
  const klass = o.classes.find((c) => c.id === input.class)!;
  const top = Math.max(...Object.values(input.scores));
  for (const p of klass.primary) assert.equal(input.scores[p], top, "the class's main ability gets the highest score");
  assert.deepEqual(Object.values(input.scores).sort((a, b) => b - a), [15, 14, 13, 12, 10, 8]);
  const id = createCharacter(ws, world, input);
  assert.equal(characterView(ws, world, id).class?.id, input.class);
  for (const r of rollScores("roll4d6", 6)) assert.ok(r.score >= 3 && r.score <= 18);
  assert.equal(rollScores("roll3d6", 6).length, 6);
  const scores = finalScores(o, { race: null, scores: input.scores, raceBonuses: true });
  assert.equal(scores.size, 6);
});

test("trackers: a player's own, the DM's award, and rests refill the right ones", () => {
  const { ws, world } = d20();
  const id = createCharacter(ws, world, { name: "Ken's thief", player: "Ken", picture: null, race: null, class: null, background: null, level: 1, method: "own", scores: {}, raceBonuses: false, hp: 9, gold: "", gear: [], choices: {}, appearance: {}, approved: true });
  const torch = ws.transact("x", () => addTracker(ws, world, id, { name: "Torches", max: 5, look: "number", refill: "never" }));
  const ki = ws.transact("x", () => addTracker(ws, world, id, { name: "Lucky breaks", max: 2, look: "boxes", refill: "short rest" }));
  ws.transact("x", () => setTracker(ws, world, id, torch, { value: 3 }));
  ws.transact("x", () => setTracker(ws, world, id, ki, { value: 0 }));
  ws.transact("x", () => ws.setField(world, id, "hpNow", 2));
  const insp = characterView(ws, world, id).trackers.find((t) => t.refill === "award")!;
  assert.equal(ws.transact("x", () => award(ws, world, id, insp.id)), true);
  assert.equal(ws.transact("x", () => award(ws, world, id, insp.id)), false, "only one at a time");
  ws.transact("rest", () => rest(ws, world, id, "long rest"));
  const v = characterView(ws, world, id);
  assert.equal(v.trackers.find((t) => t.name === "Torches")!.value, 3, "torches don't come back");
  assert.equal(v.trackers.find((t) => t.name === "Lucky breaks")!.value, 2, "a long rest also refills short-rest ones");
  assert.equal(v.trackers.find((t) => t.refill === "award")!.value, 1, "Inspiration stays until spent");
  assert.equal(v.hpNow, 9);
  ws.transact("x", () => addExtra(ws, world, id, "Appearance", "Scars"));
  ws.transact("x", () => setAppearance(ws, world, id, "eyes", "grey"));
  const after = characterView(ws, world, id);
  assert.deepEqual(after.extras.map((e) => e.label), ["Scars"]);
  assert.equal(after.appearance.find((a) => a.key === "eyes")!.value, "grey");
  void link;
});
