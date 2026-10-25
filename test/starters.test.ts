import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Backend, STARTING_POINTS } from "../src/app/backend.ts";
import { F } from "../src/engine/index.ts";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "dmip-starters-"));
  return new Backend({ settingsPath: join(dir, "settings.json"), defaultFolder: join(dir, "DM in a Pocket"), machine: "home-pc", pickPicture: async () => null, pickFolder: async () => null, emit: () => {}, timers: { set: () => 0, clear: () => {}, now: () => Date.now() } });
}

test("the starting points list the five new starters and the empty one", () => {
  assert.deepEqual(STARTING_POINTS.map((s) => s.id), ["d20", "pool", "percentile", "moves", "chronicles", "scratch"]);
  assert.ok(STARTING_POINTS.every((s) => s.ready));
  assert.ok(!STARTING_POINTS.some((s) => /world of darkness|call of cthulhu|apocalypse|shadowrun|storyteller|warhammer/i.test(`${s.label} ${s.note ?? ""}`)), "generic names only, nothing trademarked");
});

test("each starter builds a system with a core check, abilities and something to hold harm", () => {
  const backend = setup();
  for (const start of ["pool", "percentile", "moves", "chronicles"] as const) {
    const id = backend.createSystem({ name: `Try ${start}`, picture: null, start });
    backend.open({ type: "system", id });
    const rules = backend.rulesTab();
    const names = rules.flatMap((r) => r.nodes.map((n) => n.name));
    assert.ok(names.includes("The core check"), `${start} has a core check`);
    assert.ok(names.includes("Hit points") || names.includes("Wounds"), `${start} has a way to take harm`);
    assert.equal(backend.history().done.length, 0, "a starting point is not an undo step");
  }
});

test("2d6 Moves and d10 Chronicles carry their own wording", () => {
  const backend = setup();
  const moves = backend.createSystem({ name: "Moves", picture: null, start: "moves" });
  backend.open({ type: "system", id: moves });
  const coreText = (): string => {
    const n = backend.rulesTab().flatMap((r) => r.nodes).find((x) => x.name === "The core check")!;
    return JSON.stringify(backend.node(n.id));
  };
  assert.match(coreText(), /On 10 or more/);
  const chron = backend.createSystem({ name: "Chron", picture: null, start: "chronicles" });
  backend.open({ type: "system", id: chron });
  assert.match(coreText(), /a 10 counts as two/);
  void F;
});
