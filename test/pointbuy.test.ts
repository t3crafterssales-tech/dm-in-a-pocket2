import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Backend } from "../src/app/backend.ts";
import { pointBuyFrom, pointsSpent, scoreCost } from "../src/engine/index.ts";

test("point buy costs: d20 table or flat, with deficits giving points back", () => {
  const d20 = pointBuyFrom("x", {});
  assert.deepEqual([d20.points, d20.start, d20.max, d20.min, d20.costs], [27, 8, 15, 8, "d20"]);
  assert.deepEqual([8, 9, 13, 14, 15].map((s) => scoreCost(d20, s)), [0, 1, 5, 7, 9], "the familiar table");
  const flat = pointBuyFrom("x", { costs: "flat", points: 10, scoreStart: 0, scoreMax: 3, scoreMin: -2 });
  assert.deepEqual([-2, -1, 0, 2, 3].map((s) => scoreCost(flat, s)), [-2, -1, 0, 2, 3]);
  const r = pointsSpent(flat, [{ name: "Might", score: 3 }, { name: "Wits", score: -2 }, { name: "Grace", score: 4 }]);
  assert.equal(r.spent, 5);
  assert.deepEqual(r.problems, ["Grace is above 3"]);
});

test("a point buy rule reads in plain words, prints in the rulebook, and characters show their total", () => {
  const dir = mkdtempSync(join(tmpdir(), "dmip-pb-"));
  const backend = new Backend({
    settingsPath: join(dir, "s.json"),
    defaultFolder: join(dir, "F"),
    machine: "m",
    pickPicture: async () => null,
    pickFolder: async () => null,
    emit: () => {},
    timers: { set: () => 0, clear: () => {}, now: () => Date.now() },
  });
  const sys = backend.createSystem({ name: "Ashen Vigil", picture: null, start: "scratch" });
  backend.open({ type: "system", id: sys });
  const str = backend.addRule("abilities", "Strength");
  const dex = backend.addRule("abilities", "Dexterity");
  const hero = backend.addBeing({ name: "Mara", kind: "character", variantOf: null });
  assert.equal(backend.node(hero).pointBuy, null, "no point buy rule yet");
  const rule = backend.addRule("advancement", "Ability scores");
  backend.setField(rule, "method", "pointBuy");
  backend.setField(rule, "points", 6);
  backend.setField(rule, "scoreStart", 0);
  backend.setField(rule, "scoreMax", 3);
  backend.setField(rule, "scoreMin", -2);
  backend.setField(rule, "costs", "flat");
  const text = "Point buy: 6 points. Every ability score starts at 0 and can be bought up to 3; each step up costs 1 point. A score can be lowered to -2 to gain a point for each step below 0.";
  assert.equal(backend.node(rule).summary, text);
  assert.ok(backend.book({ type: "players" }).book.chapters.find((c) => c.id === "rules")!.entries.some((e) => e.paragraphs.includes(text)));
  backend.setScore(hero, str, 3);
  backend.setScore(hero, dex, -2);
  assert.deepEqual(backend.node(hero).pointBuy, { spent: 1, points: 6, problems: [], rule: "Ability scores" });
  backend.setScore(hero, dex, 3);
  assert.equal(backend.node(hero).pointBuy!.spent, 6);
  // Monsters aren't built with point buy.
  const goblin = backend.addBeing({ name: "Goblin", kind: "monster", variantOf: null });
  assert.equal(backend.node(goblin).pointBuy, null);
});
