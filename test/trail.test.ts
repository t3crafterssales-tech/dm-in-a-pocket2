import { test } from "node:test";
import assert from "node:assert/strict";
import { TRAIL_MAX, Trail } from "../src/app/trail.ts";

const S = (tab: string, sel: string | null = null) => ({ tab, sel });

test("back and forward walk the places in order", () => {
  const t = new Trail();
  t.record(S("Rules"));
  t.record(S("Beings"));
  t.record(S("Beings", "goblin"));
  assert.deepEqual(t.back(), S("Beings"));
  assert.deepEqual(t.back(), S("Rules"));
  assert.equal(t.back(), null);
  assert.deepEqual(t.forward(), S("Beings"));
  assert.deepEqual(t.forward(), S("Beings", "goblin"));
  assert.equal(t.forward(), null);
});

test("the same spot twice adds nothing, and a new spot drops the forward steps", () => {
  const t = new Trail();
  t.record(S("Rules"));
  t.record(S("Rules"));
  assert.equal(t.canBack, false);
  t.record(S("Beings"));
  t.back();
  t.record(S("Items"));
  assert.equal(t.canForward, false);
  assert.deepEqual(t.back(), S("Rules"));
});

test("the trail keeps about fifty steps and can be reset", () => {
  const t = new Trail();
  for (let i = 0; i < TRAIL_MAX + 20; i++) t.record(S("Beings", `n${i}`));
  let steps = 0;
  while (t.back()) steps++;
  assert.equal(steps, TRAIL_MAX - 1);
  t.reset();
  assert.equal(t.canBack, false);
  assert.equal(t.forward(), null);
});

test("a deleted sheet is forgotten so Back never lands on nothing", () => {
  const t = new Trail();
  t.record(S("Beings"));
  t.record(S("Beings", "goblin"));
  t.record(S("Beings"));
  t.drop("goblin");
  assert.equal(t.canBack, false);
  t.record(S("Items"));
  assert.deepEqual(t.back(), S("Beings"));
});
