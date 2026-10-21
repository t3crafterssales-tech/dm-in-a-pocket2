import { test } from "node:test";
import assert from "node:assert/strict";
import { averageOf, diceText, maximumOf, parseDice, roll } from "../src/engine/index.ts";

/** A pretend die that shows the numbers given, in order (as fractions of the die). */
const fixed = (...faces: [number, number][]) => {
  let i = 0;
  return () => {
    const [face, sides] = faces[i++ % faces.length]!;
    return (face - 1) / sides + 0.0001;
  };
};

test("dice read the usual ways of writing a roll", () => {
  assert.equal(diceText(parseDice("2d6+3")!), "2d6 + 3");
  assert.equal(diceText(parseDice(" d20 ")!), "1d20");
  assert.equal(diceText(parseDice("4d6 keep 3")!), "4d6 keep 3");
  assert.equal(diceText(parseDice("4d6kh3")!), "4d6 keep 3");
  assert.equal(diceText(parseDice("2d20 keep lowest 1")!), "2d20 keep lowest 1");
  assert.equal(diceText(parseDice("1d8 + 1d6 - 1")!), "1d8 + 1d6 - 1");
  assert.equal(diceText(parseDice("d%")!), "1d100");
  assert.equal(diceText(parseDice("coin")!), "1d2");
  assert.equal(parseDice("fireball"), null);
  assert.equal(parseDice("2d6 + banana"), null);
  assert.equal(parseDice(""), null);
  assert.throws(() => roll("lots"), /isn't a roll/);
});

test("rolling adds up, keeps the highest, and says what each die showed", () => {
  const r = roll("2d6 + 3", { random: fixed([4, 6], [5, 6]) });
  assert.equal(r.total, 12);
  assert.equal(r.breakdown, "2d6 showed 4, 5, + 3");
  const k = roll("4d6 keep 3", { random: fixed([1, 6], [6, 6], [3, 6], [5, 6]) });
  assert.equal(k.total, 14);
  assert.match(k.breakdown, /\(1\)/, "the dropped die is shown in brackets");
  const adv = roll("d20 + 4", { mode: "advantage", random: fixed([7, 20], [15, 20]) });
  assert.equal(adv.total, 19);
  assert.equal(adv.other, 11);
  assert.equal(adv.natural, 15);
  const dis = roll("d20", { mode: "disadvantage", random: fixed([7, 20], [15, 20]) });
  assert.equal(dis.total, 7);
  assert.equal(roll("coin", { random: fixed([2, 2]) }).breakdown, "coin showed heads");
  for (let i = 0; i < 200; i++) {
    const x = roll("3d6").total;
    assert.ok(x >= 3 && x <= 18);
  }
});

test("averages and maximums for hit points", () => {
  assert.equal(averageOf("2d6 + 3"), 10);
  assert.equal(averageOf("d8"), 4.5);
  assert.equal(maximumOf("d8"), 8);
  assert.equal(maximumOf("4d6 keep 3"), 18);
  assert.equal(averageOf("nonsense"), 0);
});
