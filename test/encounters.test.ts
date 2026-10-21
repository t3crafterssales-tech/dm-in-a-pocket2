import { test } from "node:test";
import assert from "node:assert/strict";
import { Workspace, link } from "../src/engine/index.ts";
import { addToEncounter, createEncounter, deleteEncounter, encounterTree, flatTree, moveEncounters, placeEncounter, saveEncounterToCodex } from "../src/app/encounters.ts";

function setup() {
  const ws = new Workspace();
  const sys = ws.addLayer("system", "d20 Basic");
  const world = ws.addLayer("world", "Greyhollow", sys);
  const mod = ws.addLayer("module", "The Mill on Ash Creek", world);
  return { ws, sys, world, mod };
}
const numbers = (ws: Workspace, layer: string) => flatTree(encounterTree(ws, layer)).map((e) => `${e.number} ${e.name}`);

test("modules are a third layer: on a world or a system, and nothing is built on a module", () => {
  const { ws, sys, world, mod } = setup();
  assert.deepEqual(ws.chain(mod).map((l) => l.type), ["system", "world", "module"]);
  const settingFree = ws.addLayer("module", "Any campaign", sys);
  assert.deepEqual(ws.chain(settingFree).map((l) => l.type), ["system", "module"]);
  assert.throws(() => ws.addLayer("module", "Floating"), /needs a world or a system/);
  assert.throws(() => ws.addLayer("module", "On a module", mod), /Nothing can be built on a module/);
  assert.throws(() => ws.addLayer("world", "World on a world", world), /Only a module/);
  // Changes flow down into the module, and the module's own changes stay in it.
  const str = ws.transact("x", () => ws.create(sys, "ability", "Strength"));
  ws.transact("x", () => ws.setField(mod, str, "label", "MIGHT"));
  assert.equal(ws.resolve(mod, str)!.fields.label, "MIGHT");
  assert.equal(ws.resolve(world, str)!.fields.label, undefined);
});

test("encounters nest any depth and number themselves like an old module", () => {
  const { ws, mod } = setup();
  ws.transact("build", () => {
    const ambush = createEncounter(ws, mod, "Goblin ambush");
    createEncounter(ws, mod, "The well", ambush);
    const cave = createEncounter(ws, mod, "The cave");
    const r1 = createEncounter(ws, mod, "Room 1", cave);
    createEncounter(ws, mod, "Room 2", cave);
    createEncounter(ws, mod, "Secret room", r1);
  });
  assert.deepEqual(numbers(ws, mod), ["1 Goblin ambush", "1.1 The well", "2 The cave", "2.1 Room 1", "2.1.1 Secret room", "2.2 Room 2"]);
});

test("moving an encounter takes everything inside it, and the numbers update", () => {
  const { ws, mod } = setup();
  const ids: Record<string, string> = {};
  ws.transact("build", () => {
    ids.a = createEncounter(ws, mod, "Gate");
    ids.b = createEncounter(ws, mod, "Cave");
    for (const r of ["Room 1", "Room 2", "Room 3", "Room 4"]) createEncounter(ws, mod, r, ids.b!);
    ids.c = createEncounter(ws, mod, "Tower");
  });
  // Drag encounter 2 (with its four rooms) into encounter 3.
  ws.transact("move", () => moveEncounters(ws, mod, [ids.b!], ids.c!));
  assert.deepEqual(numbers(ws, mod), ["1 Gate", "2 Tower", "2.1 Cave", "2.1.1 Room 1", "2.1.2 Room 2", "2.1.3 Room 3", "2.1.4 Room 4"]);
  // The first encounter can become the last.
  ws.transact("move", () => moveEncounters(ws, mod, [ids.a!], null));
  assert.deepEqual(numbers(ws, mod).filter((n) => !n.includes(".")), ["1 Tower", "2 Gate"]);
  ws.transact("move", () => moveEncounters(ws, mod, [ids.a!], null, ids.c!));
  assert.deepEqual(numbers(ws, mod).filter((n) => !n.includes(".")), ["1 Gate", "2 Tower"]);
  assert.throws(() => ws.transact("loop", () => moveEncounters(ws, mod, [ids.c!], ids.b!)), /inside itself/);
  ws.undo();
  assert.deepEqual(numbers(ws, mod).filter((n) => !n.includes(".")), ["1 Tower", "2 Gate"], "one move is one undo step");
});

test("deleting an encounter moves what was inside it up a level, and undo puts it back", () => {
  const { ws, mod } = setup();
  const ids: Record<string, string> = {};
  ws.transact("build", () => {
    ids.gate = createEncounter(ws, mod, "Gate");
    ids.cave = createEncounter(ws, mod, "The cave");
    for (const r of ["Room 1", "Room 2", "Room 3"]) createEncounter(ws, mod, r, ids.cave!);
    ids.tower = createEncounter(ws, mod, "Tower");
  });
  const bin = ws.transact("delete", () => deleteEncounter(ws, mod, ids.cave!));
  assert.deepEqual(numbers(ws, mod), ["1 Gate", "2 Room 1", "3 Room 2", "4 Room 3", "5 Tower"]);
  assert.equal(ws.bin.find((b) => b.id === bin)!.moved.length, 3, "the bin remembers who was inside");
  ws.undo();
  assert.deepEqual(numbers(ws, mod), ["1 Gate", "2 The cave", "2.1 Room 1", "2.2 Room 2", "2.3 Room 3", "3 Tower"]);
});

test("dropping things from the Codex onto an encounter: creatures counted, treasure, handouts, leads to", () => {
  const { ws, sys, mod } = setup();
  const goblin = ws.transact("x", () => ws.create(sys, "being", "Goblin", { fields: { beingKind: "monster" } }));
  const sword = ws.transact("x", () => ws.create(sys, "item", "Sword of Kings"));
  const letter = ws.transact("x", () => ws.create(mod, "lore", "The miller's letter"));
  const [ambush, cave] = ws.transact("x", () => [createEncounter(ws, mod, "Ambush"), createEncounter(ws, mod, "Cave")]);
  ws.transact("drop", () => addToEncounter(ws, mod, ambush!, [goblin, sword, letter, cave!], 3));
  ws.transact("drop", () => addToEncounter(ws, mod, ambush!, [goblin], 1));
  const f = ws.resolve(mod, ambush!)!.fields;
  assert.deepEqual(f.creatures, [{ being: link(goblin), count: 4 }]);
  assert.deepEqual(f.treasure, [link(sword)]);
  assert.deepEqual(f.handouts, [link(letter)]);
  assert.deepEqual(f.leadsTo, [link(cave!)]);
  assert.equal(encounterTree(ws, mod)[0]!.creatures, 4);
  // Deleting the goblin flags the encounter red, like any link.
  ws.delete(sys, goblin);
  assert.ok(ws.binEntryFor(goblin)!.pointedHere.some((s) => s.node === ambush));
});

test("ready-made encounters live in the Codex and a module gets its own copy, insides included", () => {
  const { ws, world, mod } = setup();
  const brawl = ws.transact("x", () => {
    const b = createEncounter(ws, world, "Tavern brawl");
    createEncounter(ws, world, "The bouncer", b);
    ws.setField(world, b, "readAloud", "A chair flies past your head.");
    return b;
  });
  assert.equal(ws.get(world, brawl)!.template, true, "in a world it's a ready-made one for the Codex");
  assert.deepEqual(numbers(ws, mod), [], "ready-made ones stay out of the module's tree");
  const placed = ws.transact("place", () => placeEncounter(ws, mod, brawl, null));
  assert.deepEqual(numbers(ws, mod), ["1 Tavern brawl", "1.1 The bouncer"]);
  assert.equal(ws.resolve(mod, placed)!.fields.readAloud, "A chair flies past your head.");
  ws.transact("x", () => ws.setField(mod, placed, "readAloud", "Changed in the module."));
  assert.equal(ws.resolve(world, brawl)!.fields.readAloud, "A chair flies past your head.", "the original is untouched");
  const saved = ws.transact("save", () => saveEncounterToCodex(ws, mod, placed));
  assert.equal(ws.get(mod, saved)!.template, true);
  assert.equal(ws.list(mod, "encounter").filter((n) => n.template && n.name === "The bouncer").length, 2, "its insides are copied too");
});
