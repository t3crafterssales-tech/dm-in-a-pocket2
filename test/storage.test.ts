import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EngineError, FORMAT_VERSION, link, redFlags } from "../src/engine/index.ts";
import { Autosaver, Library, LibraryError, SAVING_SUFFIX, WorldLock, readZip, writeZip } from "../src/storage/index.ts";
import type { Timers } from "../src/storage/index.ts";

const DAY = 24 * 60 * 60 * 1000;

function setup(machine = "home-pc") {
  const root = mkdtempSync(join(tmpdir(), "dmip-lib-"));
  let t = Date.UTC(2026, 9, 20, 12);
  const clock = { now: () => t, advance: (ms: number) => (t += ms) };
  const lib = new Library(root, { machine, session: "s-" + machine }, clock.now);
  lib.init();
  const sys = lib.createSystem("d20 Basic");
  const world = lib.createWorld("Greyhollow", sys);
  return { root, lib, sys, world, clock };
}

test("a world file is a normal ZIP that reads back exactly, and damage is detected", () => {
  const zip = writeZip([{ name: "a.json", data: Buffer.from('{"x":1}') }, { name: "pictures/p.png", data: Buffer.alloc(500, 7) }]);
  const files = readZip(zip);
  assert.equal(files.get("a.json")!.toString(), '{"x":1}');
  assert.equal(files.get("pictures/p.png")!.length, 500);
  const bad = Buffer.from(zip);
  bad[40] = bad[40]! ^ 0xff;
  assert.throws(() => readZip(bad));
});

test("the main folder has Systems, Worlds, Imported, Backups and Snapshots, and the home screen lists them", () => {
  const s = setup();
  for (const d of ["Systems", "Worlds", "Imported", "Backups", "Snapshots"]) assert.ok(existsSync(join(s.root, d)));
  const worlds = s.lib.listWorlds();
  assert.equal(worlds.length, 1);
  assert.equal(worlds[0]!.name, "Greyhollow");
  assert.equal(worlds[0]!.systemName, "d20 Basic");
  assert.equal(s.lib.listSystems()[0]!.usedBy, 1);
});

test("save, close and reopen: everything is there, including undo history", () => {
  const s = setup();
  const open = s.lib.openWorld(s.world);
  const goblin = open.ws.create(open.worldId, "being", "Goblin", { fields: { hp: 7 } });
  s.lib.saveWorld(open);
  s.lib.close(open);
  const again = s.lib.openWorld(s.world);
  assert.equal(again.ws.get(s.world, goblin)!.fields.hp, 7);
  again.ws.undo();
  assert.equal(again.ws.exists(s.world, goblin), false, "tomorrow's undo reaches yesterday");
});

test("a system changed while inside one world is saved to the system, and other worlds see it", () => {
  const s = setup();
  const open = s.lib.openWorld(s.world);
  const str = open.ws.create(s.sys, "ability", "Strength", { fields: { max: 18 } });
  s.lib.saveWorld(open);
  s.lib.close(open);
  const other = s.lib.createWorld("Pirate Seas", s.sys);
  const o = s.lib.openWorld(other);
  assert.equal(o.ws.get(other, str)!.name, "Strength");
});

test("pictures are stored once, travel inside the world file, and come back if the store is lost", () => {
  const s = setup();
  const bytes = Buffer.alloc(2000, 3);
  const a = s.lib.addPicture(bytes, "goblin.png");
  const b = s.lib.addPicture(Buffer.from(bytes), "copy-of-goblin.PNG");
  assert.equal(a, b, "the same picture is only stored once");
  assert.equal(readdirSync(join(s.root, ".pictures")).length, 1);
  const open = s.lib.openWorld(s.world);
  open.ws.create(s.world, "being", "Goblin", { picture: a });
  s.lib.saveWorld(open);
  s.lib.close(open);
  assert.ok(readZip(readFileSync(open.path)).has(`pictures/${a}`));
  rmSync(join(s.root, ".pictures"), { recursive: true });
  s.lib.init();
  s.lib.openWorld(s.world);
  assert.deepEqual(s.lib.readPicture(a), bytes);
});

test("a world whose system file is missing (one someone sent you) brings its system with it", () => {
  const s = setup();
  const open = s.lib.openWorld(s.world);
  const str = open.ws.create(s.sys, "ability", "Strength");
  s.lib.saveWorld(open);
  s.lib.close(open);
  rmSync(s.lib.systemPath(s.sys));
  const again = s.lib.openWorld(s.world);
  assert.equal(again.ws.get(s.world, str)!.name, "Strength");
  assert.ok(existsSync(s.lib.systemPath(s.sys)), "the system is back on the shelf");
});

test("saving constantly: about a second after the last change, never more than a few seconds of waiting", () => {
  let t = 0;
  const queue: { at: number; fn: () => void; id: number }[] = [];
  let next = 1;
  const timers: Timers = {
    set: (fn, ms) => (queue.push({ at: t + ms, fn, id: next }), next++),
    clear: (h) => {
      const i = queue.findIndex((q) => q.id === h);
      if (i >= 0) queue.splice(i, 1);
    },
    now: () => t,
  };
  const run = (until: number) => {
    for (;;) {
      queue.sort((a, b) => a.at - b.at);
      const q = queue[0];
      if (!q || q.at > until) break;
      queue.shift();
      t = q.at;
      q.fn();
    }
    t = until;
  };
  let saves = 0;
  let pulses = 0;
  const auto = new Autosaver(() => saves++, { delayMs: 1000, maxWaitMs: 5000, onSaved: () => pulses++ }, timers);
  auto.changed();
  run(500);
  assert.equal(saves, 0);
  run(1100);
  assert.equal(saves, 1, "saved a second after the change");
  assert.equal(pulses, 1, "the logo pulses on each save");
  for (let i = 0; i < 20; i++) {
    auto.changed();
    run(t + 400);
  }
  assert.ok(saves >= 2, "keeps saving even while changes keep coming");
});

test("if a save fails, the change is kept and saved on the next try", () => {
  const timers: Timers = { set: () => 1, clear: () => {}, now: () => 0 };
  let fail = true;
  let saved = 0;
  const auto = new Autosaver(() => {
    if (fail) throw new Error("disk busy");
    saved++;
  }, { onError: () => {} }, timers);
  auto.changed();
  auto.flush();
  assert.equal(auto.pending, true);
  fail = false;
  auto.flush();
  assert.equal(saved, 1);
  assert.equal(auto.pending, false);
});

test("the engine announces every change, undo and redo, so saving can follow", () => {
  const s = setup();
  const open = s.lib.openWorld(s.world);
  const kinds: string[] = [];
  open.ws.onChange((_s, k) => kinds.push(k));
  open.ws.create(s.world, "lore", "Iron Hills");
  open.ws.undo();
  open.ws.redo();
  assert.deepEqual(kinds, ["do", "undo", "redo"]);
});

test("power cut mid-save: the last good save opens, and the app says it recovered", () => {
  const s = setup();
  const open = s.lib.openWorld(s.world);
  open.ws.create(s.world, "lore", "Iron Hills");
  s.lib.saveWorld(open);
  const good = readFileSync(open.path);
  open.ws.create(s.world, "lore", "Murkwood");
  assert.throws(() => s.lib.saveWorld(open, { beforeSwap: () => { throw new Error("power cut"); } }));
  assert.deepEqual(readFileSync(open.path), good);
  assert.ok(existsSync(open.path + SAVING_SUFFIX));
  // The app was never closed properly: next start on the same computer.
  const lib2 = new Library(s.root, { machine: "home-pc", session: "next-start" }, s.clock.now);
  const again = lib2.openWorld(s.world);
  assert.equal(again.recovered, true);
  assert.equal(again.readOnly, false);
  assert.equal(again.ws.list(s.world, "lore").length, 1);
  assert.equal(existsSync(open.path + SAVING_SUFFIX), false);
});

test("one copy open at a time: another computer gets read-only, or takes over", () => {
  const s = setup("home-pc");
  const home = s.lib.openWorld(s.world);
  const laptopLib = new Library(s.root, { machine: "laptop", session: "laptop-1" }, s.clock.now);
  const laptop = laptopLib.openWorld(s.world);
  assert.equal(laptop.readOnly, true);
  assert.deepEqual(laptop.inUseBy, { machine: "home-pc" });
  assert.throws(() => laptopLib.saveWorld(laptop), LibraryError, "a read-only copy never saves over the other");
  const takeover = laptopLib.openWorld(s.world, { takeOver: true });
  assert.equal(takeover.readOnly, false);
  home.ws.create(s.world, "lore", "Too late");
  assert.throws(() => s.lib.saveWorld(home), LibraryError);
  assert.equal(home.readOnly, true, "the other computer goes read-only");
});

test("a lock left by a computer that stopped long ago doesn't block anyone", () => {
  const s = setup("home-pc");
  s.lib.openWorld(s.world);
  s.clock.advance(10 * 60 * 1000);
  const laptopLib = new Library(s.root, { machine: "laptop", session: "laptop-1" }, s.clock.now);
  const laptop = laptopLib.openWorld(s.world);
  assert.equal(laptop.readOnly, false);
  assert.equal(laptop.recovered, true);
});

test("backups: one a day, kept for a week, then one a week for a month, never piling up", () => {
  const s = setup();
  for (let d = 0; d < 60; d++) {
    const open = s.lib.openWorld(s.world);
    open.ws.create(s.world, "lore", `Day ${d}`);
    s.lib.saveWorld(open);
    s.lib.close(open);
    s.clock.advance(DAY);
  }
  const backups = s.lib.listBackups(s.world);
  assert.ok(backups.length <= 12, `kept ${backups.length}`);
  assert.ok(backups.length >= 9);
  const newest = backups[0]!.time;
  assert.ok(backups.every((b) => newest - b.time < 32 * DAY));
});

test("backups don't copy pictures, so history never bloats", () => {
  const s = setup();
  const pic = s.lib.addPicture(Buffer.alloc(50_000, 1), "map.png");
  const open = s.lib.openWorld(s.world);
  open.ws.create(s.world, "lore", "Map", { picture: pic });
  s.lib.saveWorld(open);
  s.lib.close(open);
  s.clock.advance(DAY);
  s.lib.close(s.lib.openWorld(s.world));
  assert.ok(s.lib.historyBytes(s.world) < 20_000);
});

test("restoring a backup takes a snapshot first, so even a restore can be undone", () => {
  const s = setup();
  let open = s.lib.openWorld(s.world);
  open.ws.create(s.world, "lore", "Iron Hills");
  s.lib.saveWorld(open);
  s.lib.close(open);
  s.clock.advance(DAY);
  open = s.lib.openWorld(s.world); // makes today's backup, with Iron Hills
  open.ws.create(s.world, "lore", "Murkwood");
  s.lib.saveWorld(open);
  const backup = s.lib.listBackups(s.world)[0]!;
  s.lib.restoreBackup(open, backup.file);
  assert.deepEqual(open.ws.list(s.world, "lore").map((n) => n.name), ["Iron Hills"]);
  const snaps = s.lib.listSnapshots(s.world);
  assert.equal(snaps[0]!.name, "Before restoring a backup");
  s.lib.restoreSnapshot(open, snaps[0]!.id);
  assert.deepEqual(open.ws.list(s.world, "lore").map((n) => n.name).sort(), ["Iron Hills", "Murkwood"]);
});

test("named snapshots: save points the user keeps until deleting them", () => {
  const s = setup();
  const open = s.lib.openWorld(s.world);
  const str = open.ws.create(s.sys, "ability", "Strength");
  open.ws.create(s.world, "skill", "Athletics", { fields: { ability: link(str) } });
  const snap = s.lib.snapshot(open, "Before I removed Strength");
  open.ws.delete(s.sys, str);
  s.lib.saveWorld(open);
  assert.equal(redFlags(open.ws, s.world).length, 1);
  s.lib.restoreSnapshot(open, snap);
  assert.equal(redFlags(open.ws, s.world).length, 0, "the snapshot held the system too");
  assert.ok(s.lib.historyBytes(s.world) > 0);
  s.lib.deleteSnapshot(s.world, snap);
  assert.equal(s.lib.listSnapshots(s.world).some((x) => x.id === snap), false);
});

test("undo never overwrites a change made elsewhere since", () => {
  const s = setup();
  const a = s.lib.openWorld(s.world);
  const str = a.ws.create(s.sys, "ability", "Strength", { fields: { max: 18 } });
  a.ws.setField(s.sys, str, "max", 20);
  s.lib.saveWorld(a);
  // Later, from another world, the system's Strength changes again.
  const other = s.lib.createWorld("Pirate Seas", s.sys);
  const b = s.lib.openWorld(other);
  b.ws.setField(s.sys, str, "max", 25);
  s.lib.saveWorld(b);
  s.lib.close(b);
  s.lib.close(a);
  const a2 = s.lib.openWorld(s.world);
  assert.throws(() => a2.ws.undo(), EngineError);
  assert.equal(a2.ws.get(s.world, str)!.fields.max, 25);
});

test("a world made by a newer version opens read-only and is never saved over", () => {
  const s = setup();
  const path = s.lib.worldPath(s.world);
  const files = readZip(readFileSync(path));
  const data = JSON.parse(files.get("world.json")!.toString());
  data.format = FORMAT_VERSION + 1;
  writeFileSync(path, writeZip([{ name: "world.json", data: Buffer.from(JSON.stringify(data)) }]));
  const open = s.lib.openWorld(s.world);
  assert.equal(open.readOnly, true);
  assert.match(open.readOnlyReason!, /newer version/);
  assert.throws(() => s.lib.saveWorld(open), LibraryError);
});

test("a damaged world file gives a clear message", () => {
  const s = setup();
  writeFileSync(s.lib.worldPath(s.world), "not a zip");
  assert.throws(() => s.lib.openWorld(s.world), /damaged/);
});

test("ids can't be used to reach files outside the main folder", () => {
  const s = setup();
  assert.throws(() => s.lib.worldPath("../../etc"), LibraryError);
  void WorldLock;
});
