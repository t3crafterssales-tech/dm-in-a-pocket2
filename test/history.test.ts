import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { link } from "../src/engine/index.ts";
import { Backend } from "../src/app/backend.ts";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "dmip-history-"));
  const make = () =>
    new Backend({
      settingsPath: join(dir, "settings.json"),
      defaultFolder: join(dir, "DM in a Pocket"),
      machine: "home-pc",
      pickPicture: async () => null,
      pickFolder: async () => null,
      emit: () => {},
      timers: { set: () => 0, clear: () => {}, now: () => Date.now() },
    });
  const backend = make();
  const sys = backend.createSystem({ name: "My d20", picture: null, start: "scratch" });
  backend.open({ type: "system", id: sys });
  return { backend, sys, make };
}

test("History lists every step in plain words, newest first, with what it touched", () => {
  const { backend } = setup();
  const str = backend.addRule("abilities", "Strength");
  const goblins = ["Goblin", "Goblin Boss", "Goblin Archer"].map((name) => backend.addBeing({ name, kind: "monster", variantOf: null }));
  for (const g of goblins) backend.setScore(g, str, 8);
  const claw = backend.addBrick("attack", "Claw");
  backend.setField(claw, "ability", link(str));
  backend.attach({ targets: goblins, bricks: [claw] });
  backend.deleteNode(str);

  const h = backend.history();
  assert.equal(h.done[0]!.label, "Removed Strength");
  assert.equal(h.done[0]!.affected, 4, "Removed Strength, 4 things affected: three goblins and the Claw");
  assert.equal(h.done[1]!.label, "Added Claw to 3 sheets");
  assert.deepEqual(h.done[1]!.things.map((t) => t.name).sort(), ["Goblin", "Goblin Archer", "Goblin Boss"], "a bulk change is one step");
  assert.equal(h.done.at(-1)!.label, "Added Strength");
  assert.equal(h.undone.length, 0);
  assert.equal(h.done[0]!.by, "user");
});

test("clicking a line rolls back to it, and everything rolled back can be redone", () => {
  const { backend } = setup();
  const a = backend.addRule("abilities", "Strength");
  backend.setField(a, "label", "STR");
  backend.rename(a, "Might");
  backend.setField(a, "rangeMax", 20);
  const steps = backend.history().done;
  const target = steps.find((s) => s.label === "Changed Strength")!; // the label change
  assert.equal(backend.rollBackTo(target.id).label, 'Rolled back 2 steps to "Changed Strength"');
  let v = backend.node(a);
  assert.equal(v.name, "Strength");
  assert.equal(v.fields.label, "STR");
  assert.equal(v.fields.rangeMax, 18);
  assert.deepEqual(backend.history().undone.map((s) => s.label), ["Renamed Strength to Might", "Changed Might"]);

  assert.equal(backend.redoTo(backend.history().undone.find((s) => s.label === "Renamed Strength to Might")!.id).label, "Redid 1 step");
  assert.equal(backend.node(a).name, "Might");
  assert.equal(backend.node(a).fields.rangeMax, 18);
  backend.redo();
  assert.equal(backend.node(a).fields.rangeMax, 20);

  assert.equal(backend.rollBackAll().label, "Rolled back all 4 steps");
  assert.throws(() => backend.node(a), /isn't here/);
});

test("AI steps are labelled in History, and undo exactly like your own", () => {
  const { backend } = setup();
  const ws = backend.session!.ws;
  const layer = backend.session!.id;
  ws.transact("AI: all swords use Dexterity", () => ws.create(layer, "ability", "Dexterity"), "ai");
  const step = backend.history().done[0]!;
  assert.equal(step.by, "ai");
  assert.equal(step.label, "AI: all swords use Dexterity");
  backend.rollBackTo(backend.history().done[1]?.id ?? step.id);
  backend.undo();
  assert.equal(backend.history().done.length, 0);
});

test("History survives closing the app: tomorrow's History reaches yesterday", () => {
  const { backend, sys, make } = setup();
  backend.addRule("abilities", "Strength");
  backend.goHome();
  const again = make();
  again.open({ type: "system", id: sys });
  assert.deepEqual(again.history().done.map((s) => s.label), ["Added Strength"]);
  again.rollBackAll();
  assert.equal(again.rulesTab().find((s) => s.key === "abilities")!.nodes.length, 0);
});
