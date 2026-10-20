import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { link } from "../src/engine/index.ts";
import { Backend } from "../src/app/backend.ts";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "dmip-library-"));
  const backend = new Backend({
    settingsPath: join(dir, "settings.json"),
    defaultFolder: join(dir, "DM in a Pocket"),
    machine: "home-pc",
    pickPicture: async () => null,
    pickFolder: async () => null,
    emit: () => {},
    timers: { set: () => 0, clear: () => {}, now: () => Date.now() },
  });
  const sys = backend.createSystem({ name: "My d20", picture: null, start: "scratch" });
  backend.open({ type: "system", id: sys });
  const str = backend.addRule("abilities", "Strength");
  const claw = backend.addBrick("attack", "Claw");
  backend.setField(claw, "ability", link(str));
  const goblin = backend.addBeing({ name: "Goblin", kind: "monster", variantOf: null });
  return { backend, sys, str, claw, goblin };
}

const lib = (b: Backend, type: string) => b.library().find((s) => s.type === type)!;

test("the library lists bricks by type, each with what it does in plain words", () => {
  const { backend } = setup();
  assert.deepEqual(
    backend.library().map((s) => s.title),
    ["Attacks", "Spells", "Traits", "Effects", "Damage", "Immunities", "Ability bonuses", "Armour", "Items", "Templates"],
  );
  assert.deepEqual(lib(backend, "attack").entries.map((e) => [e.name, e.note]), [["Claw", "Claw: attack with d20 + Strength + proficiency, 1d6 slashing damage"]]);
});

test("dragging Claw onto a goblin attaches it in Attacks and actions, and the 'no attacks' flag goes away", () => {
  const { backend, claw, goblin } = setup();
  assert.ok(backend.flags().some((f) => f.title === "Goblin has no hit points or attacks"));
  const r = backend.attach({ targets: [goblin], bricks: [claw] });
  assert.equal(r.label, "Added Claw to Goblin");
  const a = backend.node(goblin).attachments;
  assert.equal(a.length, 1);
  assert.equal(a[0]!.section, "Attacks and actions");
  assert.equal(a[0]!.sentence, "Claw: attack with d20 + Strength + proficiency, 1d6 slashing damage.");
  assert.ok(backend.flags().some((f) => f.title === "Goblin has no hit points"), "only the hit points are left to do");
  assert.deepEqual(backend.node(claw).usedBy.map((u) => u.name), ["Goblin"], "the library brick knows who uses it");
});

test("several bricks onto several sheets at once is one undo step", () => {
  const { backend, claw, goblin } = setup();
  const pack = backend.addBrick("trait", "Pack Tactics");
  const g2 = backend.addBeing({ name: "Goblin Boss", kind: "monster", variantOf: null });
  const g3 = backend.addBeing({ name: "Goblin Archer", kind: "monster", variantOf: null });
  const r = backend.attach({ targets: [goblin, g2, g3], bricks: [claw, pack] });
  assert.equal(r.label, "Added 2 bricks to 3 sheets");
  for (const id of [goblin, g2, g3]) {
    assert.deepEqual(backend.node(id).attachments.map((a) => [a.name, a.section]), [["Claw", "Attacks and actions"], ["Pack Tactics", "Traits and features"]]);
  }
  assert.equal(backend.undo()!.label, "Added 2 bricks to 3 sheets");
  for (const id of [goblin, g2, g3]) assert.equal(backend.node(id).attachments.length, 0);
});

test("changing the original in the library changes every sheet that uses it", () => {
  const { backend, claw, goblin } = setup();
  const boss = backend.addBeing({ name: "Goblin Boss", kind: "monster", variantOf: null });
  backend.attach({ targets: [goblin, boss], bricks: [claw] });
  backend.setField(claw, "dice", "1d8");
  for (const id of [goblin, boss]) assert.match(backend.node(id).attachments[0]!.sentence, /1d8 slashing/);
});

test("a variant inherits its parent's bricks, marked with where they came from, and can't remove them itself", () => {
  const { backend, claw, goblin } = setup();
  backend.attach({ targets: [goblin], bricks: [claw] });
  const cave = backend.addBeing({ name: "Cave Goblin", kind: "monster", variantOf: goblin });
  const a = backend.node(cave).attachments;
  assert.deepEqual(a.map((x) => [x.name, x.from?.name]), [["Claw", "Goblin"]]);
  assert.throws(() => backend.removeAttachment(cave, a[0]!.aid), /comes from its parent/);
  // A brick added to the parent later reaches the variant too.
  const bite = backend.addBrick("attack", "Bite");
  backend.attach({ targets: [goblin], bricks: [bite] });
  assert.equal(backend.node(cave).attachments.length, 2);
});

test("removing a brick from a sheet is undoable", () => {
  const { backend, claw, goblin } = setup();
  backend.attach({ targets: [goblin], bricks: [claw] });
  const aid = backend.node(goblin).attachments[0]!.aid;
  assert.equal(backend.removeAttachment(goblin, aid).label, "Removed Claw from Goblin");
  assert.equal(backend.node(goblin).attachments.length, 0);
  backend.undo();
  assert.equal(backend.node(goblin).attachments.length, 1);
});

test("items are carried as gear, and an item's own attack counts as the goblin's", () => {
  const { backend, claw, goblin } = setup();
  const scimitar = backend.addItem({ name: "Scimitar", categoryId: null, variantOf: null });
  backend.attach({ targets: [scimitar], bricks: [claw] });
  backend.attach({ targets: [goblin], bricks: [scimitar] });
  const a = backend.node(goblin).attachments;
  assert.deepEqual(a.map((x) => [x.name, x.section]), [["Scimitar", "Gear"]]);
  assert.match(a[0]!.sentence, /^Scimitar: attack with d20 \+ Strength/);
  assert.ok(!backend.flags().some((f) => /^Goblin has no .*attacks/.test(f.title)));
});

test("a spell dropped on an item asks when and how often, and the answers go into the sentence", () => {
  const { backend, goblin } = setup();
  const missile = backend.addBrick("spell", "Magic Missile");
  const shield = backend.addItem({ name: "Shield", categoryId: null, variantOf: null });
  assert.equal(backend.dropNeedsAnswers([shield], [missile]), true);
  assert.equal(backend.dropNeedsAnswers([goblin], [missile]), false, "a spell on a monster just drops in");
  backend.attach({ targets: [shield], bricks: [missile], activation: { when: ["action"], join: "any" }, uses: { count: 1, per: "long rest" } });
  const a = backend.node(shield).attachments[0]!;
  assert.equal(a.section, "Enchantments");
  assert.equal(a.sentence, "As an action, casts Magic Missile (once per long rest).");
});

test("deleting a library brick flags every sheet that used it, and its card shows as missing", () => {
  const { backend, claw, goblin } = setup();
  const boss = backend.addBeing({ name: "Goblin Boss", kind: "monster", variantOf: null });
  backend.attach({ targets: [goblin, boss], bricks: [claw] });
  backend.deleteNode(claw);
  assert.ok(backend.flags().some((f) => f.color === "red" && f.title === "Claw removed: 2 things affected"));
  const a = backend.node(goblin).attachments[0]!;
  assert.equal(a.missing, true);
  assert.equal(a.name, "Claw");
});

test("only bricks and items can be added, and nothing can be added to itself", () => {
  const { backend, str, goblin } = setup();
  assert.throws(() => backend.attach({ targets: [goblin], bricks: [str] }), /Only bricks and items/);
  const sword = backend.addItem({ name: "Sword", categoryId: null, variantOf: null });
  assert.throws(() => backend.attach({ targets: [sword], bricks: [sword] }), /itself/);
});
