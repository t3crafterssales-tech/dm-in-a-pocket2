import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FORMAT_VERSION } from "../src/engine/index.ts";
import { Library, LibraryError, readZip, writeZip } from "../src/storage/index.ts";

/** Two people with their own main folders. */
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "dmip-share-"));
  const jeff = new Library(join(dir, "jeff"), { machine: "jeff-pc", session: "j" });
  const dave = new Library(join(dir, "dave"), { machine: "dave-pc", session: "d" });
  jeff.init();
  dave.init();
  const sys = jeff.createSystem("d20 Basic", null, "Jeff");
  const world = jeff.createWorld("Greyhollow", sys, "Jeff");
  const open = jeff.openWorld(world);
  const pic = jeff.addPicture(Buffer.alloc(300, 5), "goblin.png");
  const str = open.ws.create(sys, "ability", "Strength");
  const goblin = open.ws.create(world, "being", "Goblin", { picture: pic, fields: { beingKind: "monster", hp: 7 } });
  jeff.saveWorld(open);
  jeff.snapshot(open, "before the goblins moved in");
  jeff.close(open);
  return { dir, jeff, dave, sys, world, str, goblin, pic };
}

test("a shared world carries its system and pictures; undo history and snapshots only if ticked", () => {
  const s = setup();
  const file = join(s.dir, "Greyhollow.dmworld");
  s.jeff.exportWorld(s.world, file);
  const r = s.dave.importFile(file);
  assert.deepEqual([r.type, r.name, r.newSystems, r.sharedSystems], ["world", "Greyhollow", ["d20 Basic"], []]);
  const open = s.dave.openWorld(r.id);
  assert.equal(open.ws.get(r.id, s.goblin)!.fields.hp, 7);
  assert.equal(open.ws.get(r.id, s.str)!.name, "Strength", "its system came along");
  assert.equal(open.ws.history.length, 0, "no undo history unless ticked");
  assert.equal(s.dave.readPicture(s.pic)!.length, 300, "pictures travel inside the file");
  assert.equal(open.ws.get(r.id, s.goblin)!.source, "others", "marked as from others, keeping its maker's name");
  assert.equal(open.ws.get(r.id, s.goblin)!.author, "Jeff");
  assert.equal(s.dave.listSnapshots(r.id).length, 0);
  s.dave.close(open);

  const withAll = join(s.dir, "Greyhollow-all.dmworld");
  s.jeff.exportWorld(s.world, withAll, { history: true, snapshots: true });
  const dir2 = mkdtempSync(join(tmpdir(), "dmip-share2-"));
  const sam = new Library(dir2, { machine: "sam", session: "s" });
  sam.init();
  const r2 = sam.importFile(withAll);
  const o2 = sam.openWorld(r2.id);
  assert.ok(o2.ws.history.length > 0, "undo history travels when ticked");
  assert.deepEqual(sam.listSnapshots(r2.id).map((x) => x.name), ["before the goblins moved in"]);
});

test("importing never overwrites: the same world again arrives as a copy, and the identical system is shared", () => {
  const s = setup();
  const file = join(s.dir, "Greyhollow.dmworld");
  s.jeff.exportWorld(s.world, file);
  const r = s.jeff.importFile(file);
  assert.equal(r.name, "Greyhollow (copy)");
  assert.notEqual(r.id, s.world);
  assert.deepEqual(r.sharedSystems, ["d20 Basic"]);
  assert.equal(s.jeff.listSystems().length, 1, "no second copy of an identical system");
  assert.equal(s.jeff.listWorlds().length, 2);
  assert.equal(s.jeff.listWorlds().find((w) => w.id === r.id)!.systemId, s.sys);
});

test("a system that differs from the one on the shelf arrives as its own copy: d20 Basic (from Jeff)", () => {
  const s = setup();
  // Dave already has d20 Basic from Jeff, and has changed it since.
  const sysFile = join(s.dir, "d20.dmsys");
  s.jeff.exportSystem(s.sys, sysFile);
  assert.equal(s.dave.importFile(sysFile).name, "d20 Basic");
  const { ws } = s.dave.openSystem(s.sys);
  ws.create(s.sys, "ability", "Luck");
  s.dave.saveSystem(ws, s.sys);

  const file = join(s.dir, "Greyhollow.dmworld");
  s.jeff.exportWorld(s.world, file);
  const r = s.dave.importFile(file);
  assert.deepEqual(r.newSystems, ["d20 Basic (from Jeff)"]);
  const names = s.dave.listSystems().map((x) => x.name).sort();
  assert.deepEqual(names, ["d20 Basic", "d20 Basic (from Jeff)"]);
  const w = s.dave.listWorlds().find((x) => x.id === r.id)!;
  assert.equal(w.systemName, "d20 Basic (from Jeff)");
  const open = s.dave.openWorld(r.id);
  assert.equal(open.ws.get(r.id, s.goblin)!.name, "Goblin");
  assert.ok(!open.ws.list(r.id, "ability").some((n) => n.name === "Luck"), "Dave's own changes stay in Dave's system");
});

test("damaged files and files from a newer app are refused with a plain message", () => {
  const s = setup();
  const bad = join(s.dir, "bad.dmworld");
  writeFileSync(bad, "not a zip");
  assert.throws(() => s.dave.importFile(bad), /damaged/);
  const file = join(s.dir, "Greyhollow.dmworld");
  s.jeff.exportWorld(s.world, file);
  const files = readZip(readFileSync(file));
  const data = JSON.parse(files.get("world.json")!.toString());
  data.format = FORMAT_VERSION + 1;
  const newer = join(s.dir, "newer.dmworld");
  writeFileSync(newer, writeZip([{ name: "world.json", data: Buffer.from(JSON.stringify(data)) }]));
  assert.throws(() => s.dave.importFile(newer), (e: unknown) => e instanceof LibraryError && /newer version/.test(e.message));
  assert.equal(s.dave.listWorlds().length, 0, "nothing half-imported");
});

// ---------- Through the app ----------

import { Backend } from "../src/app/backend.ts";

function app(dir: string, folder: string) {
  return new Backend({
    settingsPath: join(dir, `${folder}.json`),
    defaultFolder: join(dir, folder),
    machine: folder,
    pickPicture: async () => null,
    pickFolder: async () => null,
    emit: () => {},
    timers: { set: () => 0, clear: () => {}, now: () => Date.now() },
  });
}

test("Share from World settings, Import on the home screen, and the author name goes on everything", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dmip-share-app-"));
  const jeff = app(dir, "jeff");
  assert.equal(jeff.setAuthor("  Jeff  ").author, "Jeff");
  const sys = jeff.createSystem({ name: "d20 Basic", picture: null, start: "d20" });
  const world = jeff.createWorld({ name: "Greyhollow", picture: null, systemId: sys });
  jeff.open({ type: "world", id: world });
  const ogre = jeff.addBeing({ name: "Swamp Ogre", kind: "monster", variantOf: null });
  const file = join(dir, "Greyhollow.dmworld");
  assert.equal(await jeff.share({}, file), file);
  assert.equal(jeff.book({ type: "monsters" }).book.credits[0], "Created by Jeff.", "the rulebook's Created by line uses it");
  jeff.goHome();

  const dave = app(dir, "dave");
  const own = dave.createSystem({ name: "Dave's rules", picture: null, start: "scratch" });
  dave.open({ type: "system", id: own });
  await assert.rejects(dave.importFile(file), /home screen/);
  dave.goHome();
  const r = (await dave.importFile(file))!;
  assert.equal(r.name, "Greyhollow");
  assert.equal(dave.home().worlds[0]!.name, "Greyhollow");
  assert.ok(dave.home().systems.some((x) => x.name === "d20 Basic"), "its system came along");
  dave.open({ type: "world", id: r.id });
  const v = dave.node(ogre);
  assert.equal(v.source, "others");
  assert.equal(v.author, "Jeff");
  assert.deepEqual(dave.beingsList("monster", "name", "others").map((e) => e.name), ["Swamp Ogre"], "the From others filter");
  assert.ok(dave.beingsList("monster", "name", "template").length >= 18, "the starter's monsters count as from a template");
  assert.equal(dave.beingsList("monster", "name", "mine").length, 0);
});

test("snapshots: take one, change things, restore it (which snapshots first), delete, and Clean up", () => {
  const dir = mkdtempSync(join(tmpdir(), "dmip-snap-app-"));
  const b = app(dir, "jeff");
  const sys = b.createSystem({ name: "d20 Basic", picture: null, start: "scratch" });
  const world = b.createWorld({ name: "Greyhollow", picture: null, systemId: sys });
  b.open({ type: "world", id: world });
  const str = b.addRule("abilities", "Strength");
  assert.throws(() => b.takeSnapshot("  "), /name/);
  const snap = b.takeSnapshot("before I removed Strength");
  b.deleteNode(str);
  assert.equal(b.snapshots().list[0]!.name, "before I removed Strength");
  assert.ok(b.snapshots().bytes > 0, "World settings shows how much space history uses");
  b.restoreSnapshot(snap);
  assert.equal(b.node(str).name, "Strength", "Strength is back");
  const list = b.snapshots().list;
  assert.deepEqual(list.map((x) => [x.name, x.auto]), [['Before restoring "before I removed Strength"', true], ["before I removed Strength", false]]);
  assert.equal(b.cleanUpSnapshots(), 1, "Clean up removes only the ones the app took by itself");
  assert.deepEqual(b.snapshots().list.map((x) => x.name), ["before I removed Strength"]);
  b.deleteSnapshot(snap);
  assert.equal(b.snapshots().list.length, 0);
});

test("a file with your own name on it (from your laptop) stays yours when imported", () => {
  const s = setup();
  const file = join(s.dir, "Greyhollow.dmworld");
  s.jeff.exportWorld(s.world, file);
  const r = s.dave.importFile(file, "Jeff");
  const open = s.dave.openWorld(r.id);
  assert.equal(open.ws.get(r.id, s.goblin)!.source, "mine");
});
