import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Library } from "../src/storage/index.ts";

function setup(machine = "home-pc") {
  const root = mkdtempSync(join(tmpdir(), "dmip-mod-"));
  let t = Date.UTC(2026, 9, 21, 12);
  const clock = { now: () => t, advance: (ms: number) => (t += ms) };
  const lib = new Library(root, { machine, session: "s-" + machine }, clock.now);
  lib.init();
  const sys = lib.createSystem("d20 Basic");
  const world = lib.createWorld("Greyhollow", sys);
  return { root, lib, sys, world, clock };
}

test("modules have their own shelf and files, on a world or straight on a system", () => {
  const s = setup();
  assert.ok(existsSync(join(s.root, "Modules")));
  const mill = s.lib.createModule("The Mill on Ash Creek", s.world);
  const anywhere = s.lib.createModule("Bandits on the Road", s.sys);
  assert.ok(existsSync(s.lib.modulePath(mill)));
  const list = s.lib.listModules().sort((a, b) => a.name.localeCompare(b.name));
  assert.deepEqual(
    list.map((m) => [m.name, m.baseType, m.baseName, m.systemName]),
    [
      ["Bandits on the Road", "system", "d20 Basic", "d20 Basic"],
      ["The Mill on Ash Creek", "world", "Greyhollow", "d20 Basic"],
    ],
  );
  assert.throws(() => s.lib.createModule("Nowhere", "no-such-thing"), /needs a world or a system/);
});

test("a module's own changes stay in it; the world's changes flow in; Edit parent saves to the world", () => {
  const s = setup();
  // Something in the world.
  const w = s.lib.openWorld(s.world);
  const miller = w.ws.transact("x", () => w.ws.create(s.world, "being", "Miller Hob", { fields: { beingKind: "npc", hp: 9 } }));
  s.lib.saveWorld(w);
  s.lib.close(w);

  const modId = s.lib.createModule("The Mill on Ash Creek", s.world);
  let m = s.lib.openModule(modId);
  assert.equal(m.kind, "module");
  assert.equal(m.ws.resolve(modId, miller)!.fields.hp, 9, "the world's NPC is there in the module");
  // Changed in the module only.
  m.ws.transact("x", () => m.ws.setField(modId, miller, "hp", 20));
  s.lib.saveWorld(m);
  s.lib.close(m);
  const w2 = s.lib.openWorld(s.world);
  assert.equal(w2.ws.resolve(s.world, miller)!.fields.hp, 9, "the world never sees the module's change");
  // A fix in the world reaches the module next time it opens.
  w2.ws.transact("x", () => w2.ws.setField(s.world, miller, "speed", "30 ft."));
  s.lib.saveWorld(w2);
  s.lib.close(w2);
  m = s.lib.openModule(modId);
  assert.equal(m.ws.resolve(modId, miller)!.fields.speed, "30 ft.");
  assert.equal(m.ws.resolve(modId, miller)!.fields.hp, 20);
  // Changing the world itself from inside the module (Edit parent) is saved to the world's file.
  m.ws.transact("x", () => m.ws.setField(s.world, miller, "cr", "1"));
  s.lib.saveWorld(m);
  s.lib.close(m);
  const w3 = s.lib.openWorld(s.world);
  assert.equal(w3.ws.resolve(s.world, miller)!.fields.cr, "1");
  s.lib.close(w3);
});

test("a module carries its world and system, so it opens even when they are missing from the shelves", () => {
  const s = setup();
  const modId = s.lib.createModule("The Mill on Ash Creek", s.world);
  const elsewhere = setup("laptop");
  // Copy just the module file to another main folder.
  writeFileSync(elsewhere.lib.modulePath(modId), readFileSync(s.lib.modulePath(modId)));
  const m = elsewhere.lib.openModule(modId);
  assert.deepEqual(m.ws.chain(modId).map((l) => l.name), ["d20 Basic", "Greyhollow", "The Mill on Ash Creek"]);
  assert.ok(existsSync(elsewhere.lib.worldPath(s.world)), "its world is put back on the shelf");
  assert.ok(existsSync(elsewhere.lib.systemPath(s.sys)), "and its system");
  elsewhere.lib.close(m);
});

test("deleting a world takes its modules to the recycle bin, and restoring brings them back together", () => {
  const s = setup();
  const modId = s.lib.createModule("The Mill on Ash Creek", s.world);
  const free = s.lib.createModule("Bandits on the Road", s.sys);
  const entry = s.lib.deleteWorld(s.world);
  assert.deepEqual(s.lib.listModules().map((m) => m.name), ["Bandits on the Road"], "the setting-free module stays");
  const restored = s.lib.restoreFromBin(entry);
  assert.equal(restored[0]!.modules!.length, 1);
  assert.ok(s.lib.listModules().some((m) => m.id === modId));
  // Deleting the system takes everything built on it.
  const dep = s.lib.systemDependents(s.sys);
  assert.deepEqual(dep.modules.map((m) => m.id).sort(), [modId, free].sort());
  s.lib.deleteSystem(s.sys);
  assert.deepEqual(s.lib.listModules(), []);
  // A module restored on its own brings back the system it sits on.
  const bin = s.lib.listRecycleBin()[0]!;
  s.lib.restoreFromBin(bin.id);
  assert.equal(s.lib.listModules().length, 2);
  // Deleting just a module.
  const e2 = s.lib.deleteModule(modId);
  assert.equal(s.lib.listModules().length, 1);
  s.lib.restoreFromBin(e2);
  assert.equal(s.lib.listModules().length, 2);
});

test("one copy open at a time, backups and snapshots work for modules like worlds", () => {
  const s = setup();
  const modId = s.lib.createModule("The Mill on Ash Creek", s.world);
  const m = s.lib.openModule(modId);
  assert.equal(s.lib.listBackups(modId).length, 1, "today's backup was made on opening");
  const snap = s.lib.snapshot(m, "Before the cave");
  assert.ok(snap);
  const laptop = new Library(s.root, { machine: "laptop", session: "s-laptop" }, s.clock.now);
  const other = laptop.openModule(modId);
  assert.equal(other.readOnly, true);
  assert.match(other.readOnlyReason!, /home-pc/);
  s.lib.close(m);
});
