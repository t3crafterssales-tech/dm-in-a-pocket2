import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Backend } from "../src/app/backend.ts";
import { summarize } from "../src/app/changelog.ts";
import { formatElapsed, sessionElapsed } from "../src/app/sessiontime.ts";

function setup(clock: { now: number }) {
  const dir = mkdtempSync(join(tmpdir(), "dmip-tools-"));
  const backend = new Backend({
    settingsPath: join(dir, "settings.json"),
    defaultFolder: join(dir, "DM in a Pocket"),
    machine: "home-pc",
    pickPicture: async () => null,
    pickFolder: async () => null,
    emit: () => {},
    timers: { set: () => 0, clear: () => {}, now: () => clock.now },
  });
  return { backend };
}

test("the session timer runs from the start, stops while paused, and stops for good when the night ends", () => {
  const s = { started: 1000, ended: null as number | null, pausedAt: null as number | null, pausedMs: 0 };
  assert.equal(sessionElapsed(s, 6000), 5000);
  assert.equal(sessionElapsed({ ...s, pausedAt: 4000 }, 9000), 3000, "time since pausing doesn't count");
  assert.equal(sessionElapsed({ ...s, pausedMs: 2000 }, 6000), 3000, "time paused before doesn't count");
  assert.equal(sessionElapsed({ ...s, ended: 5000 }, 99999), 4000, "ended: the clock stops");
  assert.equal(sessionElapsed({ ...s, started: 8000 }, 1000), 0, "never negative");
});

test("pausing and resuming the timer on a real session, each one undoable", () => {
  const clock = { now: 1_700_000_000_000 };
  const { backend } = setup(clock);
  const sys = backend.createSystem({ name: "Pocket d20", picture: null, start: "scratch" });
  const world = backend.createWorld({ name: "Greyhollow", picture: null, systemId: sys });
  backend.open({ type: "world", id: world });
  backend.beginSession({ present: [], lastTime: "", encounter: null, starred: [] });
  const night = () => backend.tableView().session!;
  assert.equal(night().pausedAt, null);
  const t0 = night().started;
  backend.setTimerPaused(true);
  assert.notEqual(night().pausedAt, null);
  backend.setTimerPaused(true);
  assert.equal(backend.history().done.filter((h) => h.label === "Paused the session timer").length, 1, "pausing again changes nothing, so it adds no step");
  backend.setTimerPaused(false);
  assert.equal(night().pausedAt, null);
  assert.ok(night().pausedMs >= 0);
  assert.equal(night().started, t0);
  backend.undo();
  assert.notEqual(night().pausedAt, null, "undo puts the pause back");
});

test("the changelog folds repeats into plain lines, newest first, and says nothing when nothing changed", () => {
  const steps = [
    { label: "Changed Goblin", time: 10 },
    { label: "Changed Goblin", time: 20 },
    { label: "Wrote the mill encounter", time: 30 },
    { label: "Changed Goblin", time: 40 },
    { label: "Old step", time: 1 },
  ];
  const c = summarize(steps, 5)!;
  assert.deepEqual(c.lines, ["Changed Goblin ×3", "Wrote the mill encounter"]);
  assert.equal(c.total, 4);
  assert.equal(summarize(steps, 100), null);
  assert.equal(summarize(steps, null), null, "the first time a place is opened there is nothing to compare with");
  const many = Array.from({ length: 12 }, (_, i) => ({ label: `Step ${i}`, time: 10 + i }));
  const m = summarize(many, 0)!;
  assert.equal(m.lines.length, 8);
  assert.equal(m.more, 4);
  assert.equal(m.lines[0], "Step 11", "newest first");
});

test("opening a world again shows what changed since last time, and Dismiss hides it", () => {
  const clock = { now: 1_700_000_000_000 };
  const { backend } = setup(clock);
  const sys = backend.createSystem({ name: "Pocket d20", picture: null, start: "scratch" });
  const world = backend.createWorld({ name: "Greyhollow", picture: null, systemId: sys });
  backend.open({ type: "world", id: world });
  assert.equal(backend.changelog(), null, "nothing to compare with the first time");
  clock.now += 60_000;
  backend.addBeing({ name: "Goblin", kind: "monster", variantOf: null });
  clock.now += 60_000;
  backend.goHome();
  clock.now += 3_600_000;
  backend.open({ type: "world", id: world });
  const c = backend.changelog();
  assert.ok(c && c.total >= 1, "the Goblin was made since last time");
  backend.dismissChangelog();
  assert.equal(backend.changelog(), null);
});

test("the timer reads naturally", () => {
  assert.equal(formatElapsed(0), "0:00");
  assert.equal(formatElapsed(270_000), "4:30");
  assert.equal(formatElapsed(3_909_000), "1:05:09");
});
