import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Backend } from "../src/app/backend.ts";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "dmip-levels-"));
  const backend = new Backend({
    settingsPath: join(dir, "settings.json"),
    defaultFolder: join(dir, "DM in a Pocket"),
    machine: "home-pc",
    pickPicture: async () => null,
    pickFolder: async () => null,
    emit: () => {},
    timers: { set: () => 0, clear: () => {}, now: () => Date.now() },
  });
  const sys = backend.createSystem({ name: "Ashen Vigil", picture: null, start: "scratch" });
  backend.open({ type: "system", id: sys });
  const rogue = backend.addBeing({ name: "Rogue", kind: "class", variantOf: null });
  const sneak = backend.addBrick("trait", "Sneak Attack");
  backend.setField(sneak, "wording", "extra 1d6 damage when flanked, unaware or below half");
  const cunning = backend.addBrick("trait", "Cunning Action");
  const evasion = backend.addBrick("trait", "Evasion");
  return { backend, rogue, sneak, cunning, evasion };
}

test("a class has a level table: drop features on a row, move them, and the rulebook prints them in level order", () => {
  const { backend, rogue, sneak, cunning, evasion } = setup();
  const v = backend.node(rogue);
  assert.equal(v.levels!.max, 20);
  assert.equal(v.levels!.rows.length, 20);
  assert.equal(backend.attachAtLevel(rogue, [cunning], 2).label, "Added Cunning Action to Rogue at level 2");
  backend.attachAtLevel(rogue, [sneak], 1);
  backend.attach({ targets: [rogue], bricks: [evasion] });
  let t = backend.node(rogue).levels!;
  assert.deepEqual(t.rows[0]!.features.map((f) => f.name), ["Sneak Attack"]);
  assert.deepEqual(t.rows[1]!.features.map((f) => f.name), ["Cunning Action"]);
  assert.deepEqual(t.unplaced.map((f) => f.name), ["Evasion"], "dropped on the sheet, not on a row");
  const ev = t.unplaced[0]!.aid;
  assert.equal(backend.setFeatureLevel(rogue, ev, 7).label, "Moved Evasion to level 7");
  t = backend.node(rogue).levels!;
  assert.deepEqual(t.rows[6]!.features.map((f) => f.name), ["Evasion"]);
  assert.throws(() => backend.setFeatureLevel(rogue, ev, 21), /from 1 to 20/);
  // One step each, so Ctrl+Z works as usual.
  backend.undo();
  assert.deepEqual(backend.node(rogue).levels!.unplaced.map((f) => f.name), ["Evasion"]);
  backend.redo();
  // The rulebook: in level order.
  const cls = backend.book({ type: "players" }).book.chapters.find((c) => c.id === "classes")!.entries[0]!;
  assert.deepEqual(cls.paragraphs.filter((p) => p.startsWith("Level")).map((p) => p.split(":")[0]!.replace(/\.$/, "")), ["Level 1. Sneak Attack", "Level 2. Cunning Action", "Level 7. Evasion"]);
  // A shorter table.
  backend.setField(rogue, "maxLevel", 10);
  assert.equal(backend.node(rogue).levels!.rows.length, 10);
  // Removing a feature forgets its level.
  backend.removeAttachment(rogue, ev);
  assert.ok(!Object.keys(backend.node(rogue).fields).some((k) => k === `level_${ev}`));
  // Only classes have one.
  const goblin = backend.addBeing({ name: "Goblin", kind: "monster", variantOf: null });
  assert.equal(backend.node(goblin).levels, null);
  assert.throws(() => backend.attachAtLevel(goblin, [sneak], 1), /Only classes/);
});

test("a subclass inherits its parent's level table, adds its own features, and can move one for itself", () => {
  const { backend, rogue, sneak, evasion } = setup();
  backend.attachAtLevel(rogue, [sneak], 1);
  const assassin = backend.addBeing({ name: "Assassin", kind: "class", variantOf: rogue });
  const strike = backend.addBrick("trait", "Death Strike");
  backend.attachAtLevel(assassin, [strike], 3);
  let t = backend.node(assassin).levels!;
  assert.deepEqual(t.rows[0]!.features.map((f) => [f.name, f.from]), [["Sneak Attack", "Rogue"]]);
  assert.deepEqual(t.rows[2]!.features.map((f) => [f.name, f.from]), [["Death Strike", null]]);
  const inherited = t.rows[0]!.features[0]!.aid;
  backend.setFeatureLevel(assassin, inherited, 2);
  assert.deepEqual(backend.node(assassin).levels!.rows[1]!.features.map((f) => f.name), ["Sneak Attack"]);
  assert.deepEqual(backend.node(rogue).levels!.rows[0]!.features.map((f) => f.name), ["Sneak Attack"], "the parent is unchanged");
  // A change at the parent reaches the subclass's other features.
  backend.attachAtLevel(rogue, [evasion], 7);
  t = backend.node(assassin).levels!;
  assert.deepEqual(t.rows[6]!.features.map((f) => f.name), ["Evasion"]);
});
