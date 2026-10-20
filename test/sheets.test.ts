import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Backend } from "../src/app/backend.ts";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "dmip-sheets-"));
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
  return { backend, sys };
}

test("a monster is made with a name and what it is, filed as a Creature, and shown only under Monsters", () => {
  const { backend } = setup();
  const goblin = backend.addBeing({ name: "Goblin", kind: "monster", variantOf: null });
  assert.deepEqual(backend.beingsList("monster").map((e) => e.name), ["Goblin"]);
  assert.deepEqual(backend.beingsList("npc"), []);
  const v = backend.node(goblin);
  assert.equal(v.kind, "being");
  assert.equal(v.sheet!.header.map((f) => f.label).join(", "), "Hit points, Armour, Speed, Challenge");
  assert.deepEqual(v.sheet!.sections, ["Attacks and actions", "Traits and features", "Spells", "Gear"]);
  assert.equal(backend.categories().find((c) => c.id === v.categoryId)!.name, "Creature");
  backend.setField(goblin, "cr", "1/4");
  assert.equal(backend.beingsList("monster")[0]!.note, "CR 1/4");
});

test("each kind of being gets its own sheet", () => {
  const { backend } = setup();
  const elf = backend.addBeing({ name: "Elf", kind: "race", variantOf: null });
  const fighter = backend.addBeing({ name: "Fighter", kind: "class", variantOf: null });
  assert.equal(backend.node(elf).sheet!.scores, false);
  assert.deepEqual(backend.node(fighter).sheet!.header.map((f) => f.label), ["Hit die", "Levels"]);
  assert.deepEqual(backend.beingsList("race").map((e) => e.name), ["Elf"]);
  assert.deepEqual(backend.beingsList("class").map((e) => e.name), ["Fighter"]);
});

test("a variant starts with everything its parent has; a value it sets gets a pencil mark; the rest keeps flowing down", () => {
  const { backend } = setup();
  const goblin = backend.addBeing({ name: "Goblin", kind: "monster", variantOf: null });
  backend.setField(goblin, "hp", 7);
  backend.setField(goblin, "ac", 15);
  const cave = backend.addBeing({ name: "Cave Goblin", kind: "monster", variantOf: goblin });
  let v = backend.node(cave);
  assert.deepEqual(v.parent, { id: goblin, name: "Goblin" });
  assert.equal(v.fields.hp, 7);
  assert.equal(v.fields.beingKind, "monster", "its kind comes from its parent too");
  assert.deepEqual(v.own, []);

  backend.setField(cave, "hp", 9);
  backend.setField(goblin, "hp", 8);
  backend.setField(goblin, "ac", 13);
  v = backend.node(cave);
  assert.equal(v.fields.hp, 9, "set its own hit points, so the parent's change skips it");
  assert.equal(v.fields.ac, 13, "never touched armour, so the parent's change reaches it");
  assert.deepEqual(v.own, ["hp"]);
  assert.equal(backend.node(goblin).variants, 1);

  backend.useParentValue(cave, "hp");
  assert.equal(backend.node(cave).fields.hp, 8);
  assert.deepEqual(backend.node(cave).own, []);
});

test("variants of variants are listed under their parents, to any depth", () => {
  const { backend } = setup();
  const elf = backend.addBeing({ name: "Elf", kind: "race", variantOf: null });
  const wood = backend.addBeing({ name: "Wood Elf", kind: "race", variantOf: elf });
  backend.addBeing({ name: "Deep Wood Elf", kind: "race", variantOf: wood });
  backend.addBeing({ name: "Aardvark folk", kind: "race", variantOf: null });
  assert.deepEqual(
    backend.beingsList("race").map((e) => `${"  ".repeat(e.depth)}${e.name}`),
    ["Aardvark folk", "Elf", "  Wood Elf", "    Deep Wood Elf"],
  );
});

test("ability scores: one value per ability, so a variant's Dexterity doesn't freeze its Strength", () => {
  const { backend } = setup();
  const str = backend.addRule("abilities", "Strength");
  const dex = backend.addRule("abilities", "Dexterity");
  assert.deepEqual(backend.choices().abilities.map((a) => a.name), ["Strength", "Dexterity"], "in the order they were made, not alphabetical");
  const goblin = backend.addBeing({ name: "Goblin", kind: "monster", variantOf: null });
  backend.setScore(goblin, str, 8);
  backend.setScore(goblin, dex, 14);
  const cave = backend.addBeing({ name: "Cave Goblin", kind: "monster", variantOf: goblin });
  backend.setScore(cave, dex, 16);
  backend.setScore(goblin, str, 10);
  const scores = Object.fromEntries(backend.node(cave).scores.map((s) => [s.ability, s.score]));
  assert.deepEqual(scores, { [str]: 10, [dex]: 16 });

  // Deleting Dexterity flags both goblins.
  backend.deleteNode(dex);
  const flag = backend.flags().find((f) => f.color === "red")!;
  assert.equal(flag.title, "Dexterity removed: 2 things affected");
  assert.deepEqual([...flag.nodes].sort(), [goblin, cave].sort());
  backend.undo();
  assert.equal(backend.flags().filter((f) => f.color === "red").length, 0);
});

test("Detach makes a variant a fully independent copy that looks exactly the same", () => {
  const { backend } = setup();
  const goblin = backend.addBeing({ name: "Goblin", kind: "monster", variantOf: null });
  backend.setField(goblin, "hp", 7);
  const cave = backend.addBeing({ name: "Cave Goblin", kind: "monster", variantOf: goblin });
  backend.detach(cave);
  let v = backend.node(cave);
  assert.equal(v.parent, null);
  assert.equal(v.fields.hp, 7);
  assert.equal(v.fields.beingKind, "monster");
  backend.setField(goblin, "hp", 99);
  v = backend.node(cave);
  assert.equal(v.fields.hp, 7, "no longer follows the Goblin");
  assert.equal(backend.beingsList("monster").find((e) => e.id === cave)!.depth, 0);
  assert.equal(backend.undo()!.label, "Changed Goblin");
  assert.equal(backend.undo()!.label, "Detached Cave Goblin");
  assert.equal(backend.node(cave).parent!.name, "Goblin");
});

test("items: filed by category, with + New category up to three levels deep", () => {
  const { backend } = setup();
  const sword = backend.addItem({ name: "Longsword", categoryId: null, variantOf: null });
  const roots = backend.categories();
  assert.deepEqual(roots.map((c) => c.name), ["Armour", "Creature", "Item", "Spell", "Weapon"], "the small starting set from the design");
  const weapon = roots.find((c) => c.name === "Weapon")!.id;
  const melee = backend.addCategory("Melee", weapon);
  const metal = backend.addCategory("Metal", melee);
  assert.throws(() => backend.addCategory("Too deep", metal), /three levels/);
  backend.setCategory(sword, metal);
  assert.equal(backend.itemsList()[0]!.categoryPath, "Weapon → Melee → Metal");
  assert.equal(backend.categories().find((c) => c.id === metal)!.role, "weapon", "it is a weapon because of its category");
  backend.setField(sword, "cost", "15 gp");
  assert.equal(backend.itemsList()[0]!.note, "15 gp");
  backend.rename(weapon, "Weapons");
  assert.equal(backend.itemsList()[0]!.categoryPath, "Weapons → Melee → Metal", "renaming a category breaks nothing");
});

test("an item variant can be filed somewhere else and still gets its parent's changes", () => {
  const { backend } = setup();
  const sword = backend.addItem({ name: "Longsword", categoryId: null, variantOf: null });
  backend.setField(sword, "weight", "3 lb.");
  const key = backend.addCategory("Keys", null);
  const swordKey = backend.addItem({ name: "Sword Key", categoryId: key, variantOf: sword });
  backend.setField(sword, "weight", "4 lb.");
  const v = backend.node(swordKey);
  assert.equal(v.categoryId, key);
  assert.equal(v.fields.weight, "4 lb.");
});

test("pictures and favourites on a sheet are undoable steps too", () => {
  const { backend } = setup();
  const goblin = backend.addBeing({ name: "Goblin", kind: "monster", variantOf: null });
  backend.setPicture(goblin, "abc.png");
  backend.toggleFavourite(goblin);
  assert.equal(backend.node(goblin).picture, "abc.png");
  assert.equal(backend.beingsList("monster")[0]!.favourite, true);
  assert.equal(backend.undo()!.label, "Starred Goblin");
  assert.equal(backend.undo()!.label, "Changed the picture of Goblin");
  assert.equal(backend.node(goblin).picture, null);
});
