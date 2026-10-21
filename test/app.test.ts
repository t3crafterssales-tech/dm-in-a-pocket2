import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { link } from "../src/engine/index.ts";
import { HEARTBEAT_MS, Library, LibraryError, WorldLock } from "../src/storage/index.ts";
import type { Timers } from "../src/storage/index.ts";
import { Backend, BACKEND_METHODS } from "../src/app/backend.ts";
import type { BackendEvent } from "../src/app/backend.ts";
import { SettingsFile } from "../src/app/settings.ts";
import { count, whenLabel } from "../src/app/words.ts";

const DAY = 24 * 60 * 60 * 1000;

/** A pretend clock and timers, so tests can jump ahead without waiting. */
function fakeTime() {
  let t = Date.UTC(2026, 9, 20, 12);
  let next = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  const timers: Timers = {
    set: (fn, ms) => {
      const id = next++;
      pending.set(id, { at: t + ms, fn });
      return id;
    },
    clear: (h) => void pending.delete(h as number),
    now: () => t,
  };
  const advance = (ms: number) => {
    const end = t + ms;
    for (;;) {
      const due = [...pending.entries()].filter(([, p]) => p.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      pending.delete(due[0]);
      t = due[1].at;
      due[1].fn();
    }
    t = end;
  };
  return { now: () => t, timers, advance };
}

function setup(opts: { machine?: string; root?: string; settingsDir?: string; time?: ReturnType<typeof fakeTime> } = {}) {
  const dir = opts.settingsDir ?? mkdtempSync(join(tmpdir(), "dmip-app-"));
  const root = opts.root ?? join(dir, "DM in a Pocket");
  const time = opts.time ?? fakeTime();
  const events: BackendEvent[] = [];
  let nextPicture: string | null = null;
  let nextFolder: string | null = null;
  const backend = new Backend({
    settingsPath: join(dir, "settings.json"),
    defaultFolder: root,
    machine: opts.machine ?? "home-pc",
    pickPicture: async () => nextPicture,
    pickFolder: async () => nextFolder,
    emit: (e) => events.push(e),
    now: time.now,
    timers: time.timers,
  });
  return {
    backend,
    dir,
    root,
    time,
    events,
    choosePicture: (p: string | null) => (nextPicture = p),
    chooseFolder: (p: string | null) => (nextFolder = p),
  };
}

test("the app opens straight to an empty home screen in Documents\\DM in a Pocket, no account needed", () => {
  const s = setup();
  const home = s.backend.home();
  assert.equal(home.folder, s.root);
  assert.deepEqual(home.systems, []);
  assert.deepEqual(home.worlds, []);
  for (const d of ["Systems", "Worlds", "Backups", "Recycle bin"]) assert.ok(existsSync(join(s.root, d)), `${d} folder made`);
});

test("New system: a name is required, and From scratch and Generic d20 both work", () => {
  const s = setup();
  assert.throws(() => s.backend.createSystem({ name: "   ", picture: null, start: "scratch" }), LibraryError);
  assert.throws(() => s.backend.createSystem({ name: "d20 Basic", picture: null, start: "nonsense" as never }), /starting point/);
  const id = s.backend.createSystem({ name: "  X ", picture: null, start: "scratch" });
  const home = s.backend.home();
  assert.equal(home.systems.length, 1);
  assert.equal(home.systems[0]!.id, id);
  assert.equal(home.systems[0]!.name, "X", "even a single letter is a name");
  assert.equal(home.systems[0]!.usedBy, 0);
});

test("New world needs a system, and the world card shows its system's name and flag counts", () => {
  const s = setup();
  assert.throws(() => s.backend.createWorld({ name: "Greyhollow", picture: null, systemId: "" }), /system/);
  const sys = s.backend.createSystem({ name: "My d20", picture: null, start: "scratch" });
  const world = s.backend.createWorld({ name: "Greyhollow", picture: null, systemId: sys });
  let home = s.backend.home();
  assert.equal(home.worlds[0]!.systemName, "My d20");
  assert.equal(home.systems[0]!.usedBy, 1, "Used by 1 world");
  assert.deepEqual([home.worlds[0]!.red, home.worlds[0]!.yellow], [0, 0]);

  // A broken link shows as a red count; two goblins with the same name as a yellow one.
  const open = s.backend.open({ type: "world", id: world });
  assert.equal(open.status, "open");
  const ws = s.backend.session!.ws;
  ws.transact("Add goblins", () => {
    const str = ws.create(world, "ability", "Strength");
    ws.create(world, "being", "Goblin", { fields: { beingKind: "monster", hp: 7, uses: link(str) } });
    ws.create(world, "being", "Goblin", { fields: { beingKind: "monster", hp: 7 } });
    ws.delete(world, str);
  });
  s.backend.goHome();
  home = s.backend.home();
  assert.equal(home.worlds[0]!.red, 1);
  assert.ok(home.worlds[0]!.yellow >= 1);
});

test("pictures: chosen once, stored once, and shown on the cards", () => {
  const s = setup();
  const file = join(s.dir, "dragon.png");
  writeFileSync(file, Buffer.alloc(1000, 9));
  s.choosePicture(file);
  return (async () => {
    const pic = await s.backend.pickPicture();
    assert.ok(pic);
    const sys = s.backend.createSystem({ name: "My d20", picture: pic, start: "scratch" });
    s.backend.createWorld({ name: "Greyhollow", picture: pic, systemId: sys });
    const home = s.backend.home();
    assert.equal(home.systems[0]!.picture, pic);
    assert.equal(home.worlds[0]!.picture, pic);
    assert.equal(s.backend.picture(pic!)!.length, 1000);
    // The system keeps its picture after it is opened and saved.
    s.backend.open({ type: "system", id: sys });
    s.backend.session!.ws.transact("Add Strength", () => s.backend.session!.ws.create(sys, "ability", "Strength"));
    s.backend.goHome();
    assert.equal(s.backend.home().systems[0]!.picture, pic);
    // Cancelling the chooser is fine; a file that isn't a picture is refused.
    s.choosePicture(null);
    assert.equal(await s.backend.pickPicture(), null);
    writeFileSync(join(s.dir, "notes.txt"), "hi");
    s.choosePicture(join(s.dir, "notes.txt"));
    await assert.rejects(s.backend.pickPicture(), /isn't a picture/);
    assert.equal(s.backend.picture("../../settings.json"), null, "pictures can't reach outside the store");
  })();
});

test("the shelves are in last-opened order", () => {
  const s = setup();
  const a = s.backend.createSystem({ name: "Alpha", picture: null, start: "scratch" });
  s.time.advance(1000);
  const b = s.backend.createSystem({ name: "Beta", picture: null, start: "scratch" });
  s.time.advance(1000);
  const w1 = s.backend.createWorld({ name: "One", picture: null, systemId: a });
  s.time.advance(1000);
  const w2 = s.backend.createWorld({ name: "Two", picture: null, systemId: b });
  assert.deepEqual(s.backend.home().worlds.map((w) => w.id), [w2, w1], "newest first");
  s.time.advance(1000);
  s.backend.open({ type: "world", id: w1 });
  s.backend.goHome();
  s.time.advance(1000);
  s.backend.open({ type: "system", id: a });
  s.backend.goHome();
  const home = s.backend.home();
  assert.deepEqual(home.worlds.map((w) => w.id), [w1, w2]);
  assert.deepEqual(home.systems.map((x) => x.id), [a, b]);
});

test("deleting a world sends it to the recycle bin, and restoring brings it back whole", () => {
  const s = setup();
  const sys = s.backend.createSystem({ name: "My d20", picture: null, start: "scratch" });
  const world = s.backend.createWorld({ name: "Greyhollow", picture: null, systemId: sys });
  s.backend.open({ type: "world", id: world });
  const ws = s.backend.session!.ws;
  const goblin = ws.transact("Add Goblin", () => ws.create(world, "being", "Goblin"));
  s.backend.goHome();

  const entry = s.backend.deleteWorld(world);
  assert.equal(entry.kind, "world");
  assert.equal(s.backend.home().worlds.length, 0);
  assert.equal(s.backend.home().binCount, 1);
  assert.equal(s.backend.home().systems[0]!.usedBy, 0);

  s.backend.restore(entry.id);
  assert.equal(s.backend.home().worlds.length, 1);
  assert.equal(s.backend.home().binCount, 0);
  s.backend.open({ type: "world", id: world });
  assert.equal(s.backend.session!.ws.get(world, goblin)!.name, "Goblin");
  s.backend.session!.ws.undo();
  assert.equal(s.backend.session!.ws.exists(world, goblin), false, "undo history came back too");
});

test("deleting a system warns about its worlds, takes them along, and restores them together", () => {
  const s = setup();
  const sys = s.backend.createSystem({ name: "My d20", picture: null, start: "scratch" });
  const other = s.backend.createSystem({ name: "Other", picture: null, start: "scratch" });
  s.backend.createWorld({ name: "Greyhollow", picture: null, systemId: sys });
  s.backend.createWorld({ name: "Pirate Seas", picture: null, systemId: sys });
  s.backend.createWorld({ name: "Elsewhere", picture: null, systemId: other });
  assert.deepEqual(s.backend.systemDependents(sys).worlds.sort(), ["Greyhollow", "Pirate Seas"]);

  const entry = s.backend.deleteSystem(sys);
  assert.equal(entry.worlds.length, 2);
  let home = s.backend.home();
  assert.deepEqual(home.systems.map((x) => x.name), ["Other"]);
  assert.deepEqual(home.worlds.map((w) => w.name), ["Elsewhere"]);

  s.backend.restore(entry.id);
  home = s.backend.home();
  assert.equal(home.systems.length, 2);
  assert.equal(home.worlds.length, 3);
  assert.equal(home.systems.find((x) => x.id === sys)!.usedBy, 2);
});

test("a system built on another goes into the bin with it", () => {
  const s = setup();
  const sys = s.backend.createSystem({ name: "d20 Basic", picture: null, start: "scratch" });
  const variant = s.backend.lib.createSystem("My d20", sys);
  s.backend.createWorld({ name: "Space", picture: null, systemId: variant });
  const dep = s.backend.systemDependents(sys);
  assert.deepEqual(dep, { systems: ["My d20"], worlds: ["Space"], modules: [] });
  assert.equal(s.backend.home().systems.find((x) => x.id === variant)!.variantOf, "d20 Basic");
  s.backend.deleteSystem(sys);
  assert.equal(s.backend.home().systems.length, 0);
  assert.equal(s.backend.home().worlds.length, 0);
});

test("restoring a world whose system was deleted later brings the system back too", () => {
  const s = setup();
  const sys = s.backend.createSystem({ name: "My d20", picture: null, start: "scratch" });
  const world = s.backend.createWorld({ name: "Greyhollow", picture: null, systemId: sys });
  const w = s.backend.deleteWorld(world);
  s.backend.deleteSystem(sys);
  assert.equal(s.backend.recycleBin().length, 2);
  s.backend.restore(w.id);
  const home = s.backend.home();
  assert.equal(home.worlds.length, 1);
  assert.equal(home.systems.length, 1);
  assert.equal(s.backend.recycleBin().length, 0);
});

test("emptying the recycle bin is permanent and removes the world's backups and snapshots too", () => {
  const s = setup();
  const sys = s.backend.createSystem({ name: "My d20", picture: null, start: "scratch" });
  const world = s.backend.createWorld({ name: "Greyhollow", picture: null, systemId: sys });
  s.backend.open({ type: "world", id: world });
  s.backend.lib.snapshot(s.backend.session!.world!, "before I removed Strength");
  s.backend.goHome();
  assert.equal(s.backend.lib.listBackups(world).length, 1);
  const e = s.backend.deleteWorld(world);
  assert.equal(s.backend.lib.listBackups(world).length, 1, "the bin keeps backups until emptied");
  s.backend.emptyBin([e.id]);
  assert.equal(s.backend.recycleBin().length, 0);
  assert.equal(s.backend.lib.listBackups(world).length, 0);
  assert.equal(s.backend.lib.listSnapshots(world).length, 0);
  assert.throws(() => s.backend.restore(e.id), /isn't in the recycle bin/);
});

test("constant saving inside a world: saved about a second after a change, and the logo is told", () => {
  const s = setup();
  const sys = s.backend.createSystem({ name: "My d20", picture: null, start: "scratch" });
  const world = s.backend.createWorld({ name: "Greyhollow", picture: null, systemId: sys });
  s.backend.open({ type: "world", id: world });
  const ws = s.backend.session!.ws;
  const goblin = ws.transact("Add Goblin", () => ws.create(world, "being", "Goblin"));
  assert.equal(s.events.length, 0);
  s.time.advance(1100);
  assert.deepEqual(s.events, [{ type: "saved" }]);
  // Straight from the file, without closing: the change is on disk.
  const fromDisk = new Library(s.root, { machine: "x", session: "y" }).peekWorld(world);
  assert.equal(fromDisk.get(world, goblin)!.name, "Goblin");
});

test("going home saves what is waiting and lets other computers open the world", () => {
  const s = setup();
  const sys = s.backend.createSystem({ name: "My d20", picture: null, start: "scratch" });
  const world = s.backend.createWorld({ name: "Greyhollow", picture: null, systemId: sys });
  s.backend.open({ type: "world", id: world });
  const ws = s.backend.session!.ws;
  const goblin = ws.transact("Add Goblin", () => ws.create(world, "being", "Goblin"));
  s.backend.goHome();
  const path = s.backend.lib.worldPath(world);
  assert.equal(new WorldLock(path, { machine: "x", session: "y" }).read(), null, "lock released");
  assert.equal(new Library(s.root).peekWorld(world).get(world, goblin)!.name, "Goblin");
});

test("the lock is refreshed every 15 seconds while a world is open", () => {
  const s = setup();
  const sys = s.backend.createSystem({ name: "My d20", picture: null, start: "scratch" });
  const world = s.backend.createWorld({ name: "Greyhollow", picture: null, systemId: sys });
  s.backend.open({ type: "world", id: world });
  const lock = new WorldLock(s.backend.lib.worldPath(world), { machine: "x", session: "y" });
  const first = lock.read()!.heartbeat;
  s.time.advance(HEARTBEAT_MS + 10);
  assert.ok(lock.read()!.heartbeat > first);
  const second = lock.read()!.heartbeat;
  s.time.advance(10 * 60 * 1000);
  assert.ok(lock.read()!.heartbeat >= second + 9 * 60 * 1000, "still being refreshed ten minutes later");
});

test("open on another computer: the user picks read-only or take over, and the first computer goes read-only", () => {
  const settingsDir = mkdtempSync(join(tmpdir(), "dmip-shared-"));
  const time = fakeTime();
  const home = setup({ machine: "home-pc", time, root: join(settingsDir, "Dropbox"), settingsDir: join(settingsDir, "home") });
  const laptop = setup({ machine: "laptop", time, root: join(settingsDir, "Dropbox"), settingsDir: join(settingsDir, "laptop") });
  const sys = home.backend.createSystem({ name: "My d20", picture: null, start: "scratch" });
  const world = home.backend.createWorld({ name: "Greyhollow", picture: null, systemId: sys });
  home.backend.open({ type: "world", id: world });

  assert.deepEqual(laptop.backend.open({ type: "world", id: world }), { status: "in-use", machine: "home-pc" });
  const ro = laptop.backend.open({ type: "world", id: world }, "read-only");
  assert.equal(ro.status === "open" && ro.view.readOnly, true);
  laptop.backend.goHome();

  const taken = laptop.backend.open({ type: "world", id: world }, "take-over");
  assert.equal(taken.status === "open" && taken.view.readOnly, false);
  time.advance(HEARTBEAT_MS + 10);
  assert.ok(home.events.some((e) => e.type === "readOnly"), "the home computer is told at its next heartbeat");
  assert.equal(home.backend.session!.readOnly, true);
  // Changes on the home computer are no longer saved over the laptop's.
  const ws = home.backend.session!.ws;
  ws.transact("Add Goblin", () => ws.create(world, "being", "Goblin"));
  time.advance(5000);
  assert.ok(!home.events.some((e) => e.type === "saved"));
});

test("after a crash the app reopens where the user was, with the blue recovered notice", () => {
  const settingsDir = mkdtempSync(join(tmpdir(), "dmip-crash-"));
  const time = fakeTime();
  const first = setup({ settingsDir, time });
  const sys = first.backend.createSystem({ name: "My d20", picture: null, start: "scratch" });
  const world = first.backend.createWorld({ name: "Greyhollow", picture: null, systemId: sys });
  first.backend.open({ type: "world", id: world });
  const ws = first.backend.session!.ws;
  const goblin = ws.transact("Add Goblin", () => ws.create(world, "being", "Goblin"));
  time.advance(1100); // saved within a second or two
  // The power goes out: no goHome, no shutdown.

  const second = setup({ settingsDir, time });
  const { resume } = second.backend.startup();
  assert.deepEqual(resume, { type: "world", id: world });
  const res = second.backend.open(resume!);
  assert.equal(res.status, "open");
  assert.equal(res.status === "open" && res.view.recovered, true);
  assert.equal(second.backend.session!.ws.get(world, goblin)!.name, "Goblin");

  // A normal close means a normal start next time.
  second.backend.shutdown();
  const third = setup({ settingsDir, time });
  assert.deepEqual(third.backend.startup(), { resume: null });
});

test("a system open on its own also comes back after a crash, and saves itself", () => {
  const settingsDir = mkdtempSync(join(tmpdir(), "dmip-crash-"));
  const time = fakeTime();
  const first = setup({ settingsDir, time });
  const sys = first.backend.createSystem({ name: "My d20", picture: null, start: "scratch" });
  first.backend.open({ type: "system", id: sys });
  const ws = first.backend.session!.ws;
  const str = ws.transact("Add Strength", () => ws.create(sys, "ability", "Strength"));
  time.advance(1100);
  assert.deepEqual(first.events, [{ type: "saved" }]);

  const second = setup({ settingsDir, time });
  const { resume } = second.backend.startup();
  const res = second.backend.open(resume!);
  assert.equal(res.status === "open" && res.view.recovered, true);
  assert.equal(second.backend.session!.ws.get(sys, str)!.name, "Strength");
});

test("World settings lists backups in plain words and restores one (with a snapshot first)", () => {
  const s = setup();
  const sys = s.backend.createSystem({ name: "My d20", picture: null, start: "scratch" });
  const world = s.backend.createWorld({ name: "Greyhollow", picture: null, systemId: sys });
  s.backend.open({ type: "world", id: world });
  const ws = s.backend.session!.ws;
  const goblin = ws.transact("Add Goblin", () => ws.create(world, "being", "Goblin"));
  s.backend.goHome();
  s.time.advance(DAY);
  s.backend.open({ type: "world", id: world }); // today's backup holds the goblin
  const ws2 = s.backend.session!.ws;
  ws2.transact("Remove Goblin", () => ws2.delete(world, goblin));
  s.time.advance(DAY);
  s.backend.goHome();
  s.backend.open({ type: "world", id: world });

  const backups = s.backend.backups();
  assert.deepEqual(backups.map((b) => b.label), ["Today", "Yesterday", "2 days ago"]);
  s.backend.restoreBackup(backups[1]!.file);
  assert.equal(s.backend.session!.ws.exists(world, goblin), true);
  assert.equal(s.backend.lib.listSnapshots(world)[0]!.name, "Before restoring a backup");
  assert.throws(() => s.backend.restoreBackup("/etc/passwd"), /gone/);
});

test("the main folder can be changed in settings, and a damaged settings file never stops the app", () => {
  const s = setup();
  s.backend.createSystem({ name: "Home system", picture: null, start: "scratch" });
  const dropbox = join(s.dir, "Dropbox", "DM in a Pocket");
  s.chooseFolder(dropbox);
  return (async () => {
    const view = await s.backend.chooseFolder();
    assert.equal(view.folder, dropbox);
    assert.equal(view.isDefault, false);
    assert.equal(s.backend.home().systems.length, 0, "the home screen shows whatever is in the folder");
    assert.ok(existsSync(join(dropbox, "Worlds")));
    s.backend.useDefaultFolder();
    assert.equal(s.backend.home().systems.length, 1);

    writeFileSync(join(s.dir, "settings.json"), "{ not json");
    assert.deepEqual(SettingsFile.read(join(s.dir, "settings.json")), { mainFolder: null, opened: {}, place: null, author: null, aiModel: "auto", aiThreshold: 0.5, aiSpend: { month: "", usd: 0 }, aiLive: false, aiTipShown: false, units: "lb" });
  })();
});

test("the window can only reach the listed back-end methods", () => {
  const s = setup();
  for (const m of BACKEND_METHODS) assert.equal(typeof (s.backend as unknown as Record<string, unknown>)[m], "function", m);
  assert.ok(!(BACKEND_METHODS as readonly string[]).includes("picture"));
  assert.ok(!(BACKEND_METHODS as readonly string[]).includes("shutdown"));
});

test("plain-words times and counts", () => {
  const now = new Date(2026, 9, 20, 9).getTime();
  assert.equal(whenLabel(now - 60_000, now), "Today");
  assert.equal(whenLabel(now - DAY, now), "Yesterday");
  assert.equal(whenLabel(now - 3 * DAY, now), "3 days ago");
  assert.equal(whenLabel(now - 8 * DAY, now), "Last week");
  assert.equal(whenLabel(now - 20 * DAY, now), "2 weeks ago");
  assert.equal(count(1, "world"), "1 world");
  assert.equal(count(3, "world"), "3 worlds");
});
