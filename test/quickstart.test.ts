import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Backend } from "../src/app/backend.ts";
import { QUICK_QUESTIONS } from "../src/app/quickstart.ts";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "dmip-quick-"));
  const backend = new Backend({
    settingsPath: join(dir, "settings.json"),
    defaultFolder: join(dir, "DM in a Pocket"),
    machine: "home-pc",
    pickPicture: async () => null,
    pickFolder: async () => null,
    emit: () => {},
    timers: { set: () => 0, clear: () => {}, now: () => Date.now() },
  });
  const sys = backend.createSystem({ name: "Deep Blue", picture: null, start: "scratch" });
  backend.open({ type: "system", id: sys });
  return { backend };
}

test("Quick start: an underwater d100 game, gritty, theatre of the mind, with mana, in one step", () => {
  const { backend } = setup();
  assert.equal(QUICK_QUESTIONS.length, 6, "the five or six big questions");
  const made = backend.quickStart({ check: "percentile", abilities: "four", health: "wounds", tone: "gritty", map: "theatre", magic: "mana" });
  assert.ok(made.includes("The core check") && made.includes("Mana") && made.includes("Wounds"));
  const tab = backend.rulesTab();
  const names = (k: string) => tab.find((s) => s.key === k)!.nodes.map((n) => n.name);
  assert.deepEqual(names("abilities"), ["Body", "Agility", "Mind", "Spirit"]);
  const core = tab.find((s) => s.key === "core")!.nodes[0]!;
  assert.equal(backend.node(core.id).summary, "Roll d100; roll equal to or under your skill to succeed.");
  const body = tab.find((s) => s.key === "abilities")!.nodes[0]!;
  assert.match(backend.node(body.id).summary, /scores from 1 to 100; it gives no bonus/);
  assert.deepEqual(names("combat"), ["Lasting injuries", "Movement and range"]);
  assert.equal(backend.flags().length, 0, "it starts clean");
  assert.equal(backend.undo()!.label, "Quick start", "one undo step takes it all back");
  assert.equal(backend.rulesTab().reduce((n, s) => n + s.nodes.length, 0), 0);
});

test("Quick start: a classic d20 game with hit points from Constitution", () => {
  const { backend } = setup();
  backend.quickStart({ check: "rollOver", abilities: "classic", health: "hp", tone: "heroic", map: "grid", magic: "slots" });
  const hp = backend.rulesTab().find((s) => s.key === "resources")!.nodes.find((n) => n.name === "Hit points")!;
  assert.equal(backend.node(hp.id).summary, "Hit points (HP): maximum 10 + Constitution bonus; starts full; recovers each long rest; at 0 you are Unconscious.");
  assert.throws(() => backend.quickStart({ check: "rollOver", abilities: "classic", health: "hp", tone: "silly" as never, map: "grid", magic: "slots" }), /Heroic or gritty/);
});

test("Quick start on top of the d20 starter, or twice, never makes a second Strength (backlog 2)", () => {
  const dir = mkdtempSync(join(tmpdir(), "dmip-qs2-"));
  const backend = new Backend({ settingsPath: join(dir, "s.json"), defaultFolder: join(dir, "D"), machine: "pc", pickPicture: async () => null, pickFolder: async () => null, emit: () => {}, timers: { set: () => 0, clear: () => {}, now: () => Date.now() } });
  const sys = backend.createSystem({ name: "d20 Basic", picture: null, start: "d20" });
  backend.open({ type: "system", id: sys });
  const answers = { check: "rollOver", abilities: "classic", health: "hp", tone: "heroic", map: "grid", magic: "slots" } as const;
  backend.quickStart(answers);
  backend.quickStart(answers);
  const tab = backend.rulesTab();
  const names = (k: string) => tab.find((s) => s.key === k)!.nodes.map((n) => n.name);
  assert.equal(names("abilities").filter((n) => n === "Strength").length, 1);
  assert.equal(names("core").length, 1, "one core check");
  assert.ok(!backend.flags().some((f) => /are called/.test(f.title)), "no duplicate-name flags");
});
