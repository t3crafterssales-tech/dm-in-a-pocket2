import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILT_IN_PRESETS, DEFAULT_SIDE, SIDE_MAX, SIDE_MIN, cleanLayout, cleanPresetName, defaultLayout } from "../src/app/layout.ts";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Backend } from "../src/app/backend.ts";

function makeBackend() {
  const dir = mkdtempSync(join(tmpdir(), "dmip-layout-"));
  return new Backend({ settingsPath: join(dir, "settings.json"), defaultFolder: join(dir, "DM in a Pocket"), machine: "home-pc", pickPicture: async () => null, pickFolder: async () => null, emit: () => {}, timers: { set: () => 0, clear: () => {}, now: () => Date.now() } });
}

test("a damaged layout falls back to safe values", () => {
  assert.deepEqual(cleanLayout(null), defaultLayout());
  assert.equal(cleanLayout({ sideWidth: 5 }).sideWidth, SIDE_MIN);
  assert.equal(cleanLayout({ sideWidth: 99999 }).sideWidth, SIDE_MAX);
  assert.equal(cleanLayout({ sideWidth: "wide" }).sideWidth, DEFAULT_SIDE);
  assert.deepEqual(cleanLayout({ floating: { flags: { x: 10, y: 20, w: 1, h: 1 }, bogus: { x: 1 } } }).floating, { flags: { x: 10, y: 20, w: 220, h: 120 } });
});

test("the four built-in layouts are there and already clean", () => {
  assert.deepEqual(BUILT_IN_PRESETS.map((p) => p.name), ["Builder", "Game night", "Writer", "Dual monitor"]);
  for (const p of BUILT_IN_PRESETS) assert.deepEqual(cleanLayout(p.layout), p.layout);
  assert.equal(cleanPresetName("  My   desk "), "My desk");
  assert.equal(cleanPresetName("   "), null);
});

test("layouts and own presets are kept, applied and removed", async () => {
  const backend = makeBackend();
  assert.deepEqual(backend.layoutState().layout, defaultLayout());
  backend.setLayout({ ...defaultLayout(), sideWidth: 450, aiFolded: true });
  const saved = backend.saveLayoutPreset("Wide and quiet");
  assert.ok(saved.presets.some((p) => p.name === "Wide and quiet" && p.own));
  backend.applyLayoutPreset("Writer");
  assert.equal(backend.layoutState().layout.sideFolded, true);
  assert.equal(backend.applyLayoutPreset("Wide and quiet").sideWidth, 450);
  assert.throws(() => backend.saveLayoutPreset("builder"), /built-in/);
  assert.throws(() => backend.applyLayoutPreset("Nope"), /isn't there/);
  assert.ok(!backend.deleteLayoutPreset("Wide and quiet").some((p) => p.name === "Wide and quiet"));
});

test("the Codex follows your work unless switched off in settings", () => {
  const backend = makeBackend();
  assert.equal(backend.settings().autoCodex, true);
  assert.equal(backend.setAutoCodex(false).autoCodex, false);
  assert.equal(backend.setAutoCodex(true).autoCodex, true);
  assert.equal(backend.settings().letterKeys, true);
  assert.equal(backend.setLetterKeys(false).letterKeys, false);
  assert.equal(backend.setLetterKeys(true).letterKeys, true);
});

test("Recent keeps ten things with no repeats, and each place remembers where you left it", () => {
  const backend = makeBackend();
  for (let i = 0; i < 12; i++) backend.noteRecent({ placeType: "world", placeId: "w", placeName: "W", nodeId: `n${i}`, name: `N${i}`, tab: "Beings" });
  backend.noteRecent({ placeType: "world", placeId: "w", placeName: "W", nodeId: "n5", name: "N5", tab: "Beings" });
  const r = backend.recentThings();
  assert.equal(r.length, 10);
  assert.equal(r[0]!.nodeId, "n5");
  assert.equal(r.filter((x) => x.nodeId === "n5").length, 1);
  assert.equal(backend.whereWas("w"), null);
  backend.rememberWhere("w", { tab: "Items", node: "abc" });
  assert.deepEqual(backend.whereWas("w"), { tab: "Items", node: "abc" });
});
