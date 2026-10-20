import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildBook, link } from "../src/engine/index.ts";
import { Backend } from "../src/app/backend.ts";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "dmip-templates-"));
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
  return { backend };
}

test("a template parent stays out of the lists, the checks and the rulebook, and lives in the library's Templates group", () => {
  const { backend } = setup();
  const weapon = backend.categories().find((c) => c.name === "Weapon")!.id;
  const basic = backend.addItem({ name: "Basic Melee Weapon", categoryId: weapon, variantOf: null, template: true });
  backend.setField(basic, "weight", "3 lb.");
  const sword = backend.addItem({ name: "Longsword", categoryId: null, variantOf: basic });
  assert.deepEqual(backend.itemsList().map((e) => [e.name, e.depth]), [["Longsword", 0]], "only the real item is listed");
  assert.equal(backend.node(sword).fields.weight, "3 lb.", "it inherits the template's shared parts");
  assert.equal(backend.node(sword).categoryId, weapon, "and starts in the template's category");
  assert.deepEqual(backend.templates().map((t) => [t.name, t.kind, t.categoryId]), [["Basic Melee Weapon", "item", weapon]]);
  assert.deepEqual(backend.library().find((s) => s.type === "template")!.entries.map((e) => e.name), ["Basic Melee Weapon"]);
  assert.ok(!backend.flags().some((f) => f.title.startsWith("Basic Melee Weapon")), "no 'weapon with no attack' flag for a template");
  const ws = backend.session!.ws;
  const book = buildBook(ws, backend.session!.id, { type: "everything" });
  assert.ok(!JSON.stringify(book).includes("Basic Melee Weapon"));
  assert.equal(backend.node(basic).template, true);
});

test("any sheet can be turned into a template and back, as an undoable step", () => {
  const { backend } = setup();
  const goblin = backend.addBeing({ name: "Goblin", kind: "monster", variantOf: null });
  backend.setTemplate(goblin, true);
  assert.deepEqual(backend.beingsList("monster"), []);
  assert.equal(backend.templates()[0]!.beingKind, "monster");
  assert.equal(backend.undo()!.label, "Made Goblin a template");
  assert.equal(backend.beingsList("monster").length, 1);
});

test("start by copying: a new monster begins as a copy of another, with all its bricks", () => {
  const { backend } = setup();
  const str = backend.addRule("abilities", "Strength");
  const claw = backend.addBrick("attack", "Claw");
  backend.setField(claw, "ability", link(str));
  const goblin = backend.addBeing({ name: "Goblin", kind: "monster", variantOf: null });
  backend.setField(goblin, "hp", 7);
  backend.setScore(goblin, str, 8);
  backend.attach({ targets: [goblin], bricks: [claw] });
  const hob = backend.copyNode(goblin, "Hobgoblin");
  const v = backend.node(hob);
  assert.equal(v.fields.hp, 7);
  assert.equal(v.scores[0]!.score, 8);
  assert.deepEqual(v.attachments.map((a) => a.name), ["Claw"]);
  assert.notEqual(v.attachments[0]!.aid, backend.node(goblin).attachments[0]!.aid, "its own copy of each brick");
  assert.equal(v.parent, null, "a copy, not a variant");
  backend.setField(goblin, "hp", 99);
  assert.equal(backend.node(hob).fields.hp, 7, "changing the Goblin later doesn't change the copy");
  assert.equal(backend.undo()!.label, "Changed Goblin");
  assert.equal(backend.undo()!.label, "Added Hobgoblin as a copy of Goblin");
});

test("a copy of a variant stays in the family and still gets its parent's changes", () => {
  const { backend } = setup();
  const goblin = backend.addBeing({ name: "Goblin", kind: "monster", variantOf: null });
  const cave = backend.addBeing({ name: "Cave Goblin", kind: "monster", variantOf: goblin });
  backend.setField(cave, "hp", 9);
  const copy = backend.copyNode(cave, "Deep Cave Goblin");
  backend.setField(goblin, "ac", 14);
  const v = backend.node(copy);
  assert.equal(v.parent!.name, "Goblin");
  assert.equal(v.fields.hp, 9);
  assert.equal(v.fields.ac, 14);
});

test("monsters can be sorted by challenge, lowest first, with no challenge last", () => {
  const { backend } = setup();
  for (const [name, cr] of [["Dragon", "17"], ["Goblin", "1/4"], ["Ogre", "2"], ["Mystery", ""], ["Bugbear", "1"]] as const) {
    const id = backend.addBeing({ name, kind: "monster", variantOf: null });
    if (cr) backend.setField(id, "cr", cr);
  }
  assert.deepEqual(backend.beingsList("monster", "challenge").map((e) => e.name), ["Goblin", "Bugbear", "Ogre", "Dragon", "Mystery"]);
  assert.deepEqual(backend.beingsList("monster").map((e) => e.name), ["Bugbear", "Dragon", "Goblin", "Mystery", "Ogre"]);
});
