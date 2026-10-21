import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Backend } from "../src/app/backend.ts";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "dmip-modapp-"));
  const backend = new Backend({
    settingsPath: join(dir, "settings.json"),
    defaultFolder: join(dir, "DM in a Pocket"),
    machine: "home-pc",
    pickPicture: async () => null,
    pickFolder: async () => null,
    emit: () => {},
    timers: { set: () => 0, clear: () => {}, now: () => Date.now() },
  });
  const sys = backend.createSystem({ name: "d20 Basic", picture: null, start: "d20" });
  const world = backend.createWorld({ name: "Greyhollow", picture: null, systemId: sys });
  return { backend, sys, world };
}

test("the home screen has a Modules shelf; a module opens straight into its world and system", () => {
  const { backend, sys, world } = setup();
  const mill = backend.createModule({ name: "The Mill on Ash Creek", picture: null, baseId: world });
  backend.createModule({ name: "Bandits on the Road", picture: null, baseId: sys });
  const shelf = backend.home().modules;
  assert.deepEqual(shelf.map((m) => m.builtOn).sort(), ["Any world · d20 Basic", "Greyhollow · d20 Basic"]);
  const r = backend.open({ type: "module", id: mill });
  assert.equal(r.status, "open");
  if (r.status !== "open") return;
  assert.equal(r.view.type, "module");
  assert.equal(r.view.worldName, "Greyhollow");
  assert.equal(r.view.systemName, "d20 Basic");
  // Every module starts with a front page, kept out of the Lore tab, and nothing to undo.
  const page = backend.modulePage()!;
  assert.equal(backend.node(page).fields.partySize, 4);
  assert.ok(!backend.loreList().some((s) => s.entries.some((e) => e.id === page)));
  assert.equal(backend.undo(), null);
  // The world deletes with its modules, after a warning that names them.
  backend.goHome();
  assert.deepEqual(backend.worldModules(world), ["The Mill on Ash Creek"]);
});

test("building a module: the encounter tree, ready-made encounters from the Codex, and dropping monsters in", () => {
  const { backend, world } = setup();
  const mill = backend.createModule({ name: "The Mill on Ash Creek", picture: null, baseId: world });
  backend.open({ type: "module", id: mill });
  const ready = backend.codex().find((s) => s.key === "encounters")!;
  assert.deepEqual(ready.entries.map((e) => e.name).sort(), ["Bandit ambush", "Tavern brawl", "The rat cellar", "Wolves at dusk"]);
  assert.match(ready.entries.find((e) => e.name === "Bandit ambush")!.sub, /^5 creatures/);
  const gate = backend.addEncounter("Outside the gates");
  const ambush = backend.placeEncounter(ready.entries.find((e) => e.name === "Bandit ambush")!.id, gate);
  const well = backend.addEncounter("The well", gate);
  const tree = backend.encounterTree();
  assert.deepEqual(tree.map((e) => e.name), ["Outside the gates"]);
  assert.deepEqual(tree[0]!.children.map((e) => `${e.number} ${e.name}`), ["1.1 Bandit ambush", "1.2 The well"]);
  const wolf = backend.codex().find((s) => s.key === "monsters")!.entries.find((e) => e.name === "Wolf")!.id;
  const r = backend.addToEncounter(well, [wolf], 3);
  assert.equal(r.label, "Added a creature to The well");
  assert.equal(backend.encounterTree()[0]!.children[1]!.creatures, 3);
  backend.moveEncounters([well], gate, ambush);
  assert.deepEqual(backend.encounterTree()[0]!.children.map((e) => e.name), ["The well", "Bandit ambush"]);
  backend.deleteEncounter(gate);
  assert.deepEqual(backend.encounterTree().map((e) => `${e.number} ${e.name}`), ["1 The well", "2 Bandit ambush"]);
  backend.undo();
  assert.equal(backend.encounterTree().length, 1);
});
