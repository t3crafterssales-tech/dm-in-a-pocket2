import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { link } from "../src/engine/index.ts";
import { Backend } from "../src/app/backend.ts";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "dmip-bin-"));
  const backend = new Backend({
    settingsPath: join(dir, "settings.json"),
    defaultFolder: join(dir, "DM in a Pocket"),
    machine: "home-pc",
    pickPicture: async () => null,
    pickFolder: async () => null,
    emit: () => {},
    timers: { set: () => 0, clear: () => {}, now: () => Date.now() },
  });
  const sys = backend.createSystem({ name: "My d20", picture: null, start: "scratch" });
  backend.open({ type: "system", id: sys });
  const str = backend.addRule("abilities", "Strength");
  const dex = backend.addRule("abilities", "Dexterity");
  const hp = backend.addRule("resources", "Hit points");
  backend.setField(hp, "maximum", { formula: [{ op: "+", ability: link(str), use: "score" }] });
  const claw = backend.addBrick("attack", "Claw");
  backend.setField(claw, "ability", link(str));
  const athletics = backend.addRule("skills", "Athletics");
  backend.setField(athletics, "ability", link(str));
  return { backend, str, dex, hp, claw, athletics };
}

const red = (b: Backend) => b.flagPanel().blocks.filter((x) => x.color === "red");

test("delete Strength, fix some, restore it: the rest reconnect by themselves, the moved ones are offered back", () => {
  const { backend, str, dex, hp, claw, athletics } = setup();
  backend.deleteNode(str);
  const binned = backend.bin();
  assert.deepEqual(binned.map((b) => [b.name, b.usedBy]), [["Strength", 3]]);

  // Fix two of the three by pointing them at Dexterity.
  const key = red(backend)[0]!.key;
  const moved = backend.missingDetail(key).slots.filter((s) => s.nodeId !== athletics).map((s) => s.slot);
  backend.fixMissing(key, moved, dex);

  const r = backend.restoreNode(binned[0]!.binId);
  assert.equal(r.label, "Restored Strength");
  assert.equal(red(backend).length, 0, "Athletics still pointed at Strength, so it works again by itself");
  assert.deepEqual(backend.node(athletics).summary, "Athletics uses Strength.");
  assert.deepEqual(r.reconnect.map((x) => [x.nodeName, x.nowUses, x.changedSince]).sort(), [["Claw", "Dexterity", false], ["Hit points", "Dexterity", false]]);

  backend.reconnect(r.nodeId, r.reconnect.map((x) => x.slot));
  assert.match(backend.node(claw).summary, /Strength/);
  assert.match(backend.node(hp).summary, /Strength score/);
  assert.equal(backend.bin().length, 0);
  assert.ok(backend.flagPanel().blocks.some((b) => b.color === "green" && b.title === "2 reconnected to Strength"));
});

test("things changed again since the fix are marked, so they can be checked before reconnecting", () => {
  const { backend, str, dex, claw } = setup();
  const con = backend.addRule("abilities", "Constitution");
  backend.deleteNode(str);
  const key = red(backend)[0]!.key;
  backend.fixMissing(key, backend.missingDetail(key).slots.map((s) => s.slot), dex);
  backend.setField(claw, "ability", link(con)); // changed again afterwards
  const r = backend.restoreNode(backend.bin()[0]!.binId);
  const clawRow = r.reconnect.find((x) => x.nodeName === "Claw")!;
  assert.equal(clawRow.changedSince, true);
  assert.equal(r.reconnect.find((x) => x.nodeName === "Hit points")!.changedSince, false);
});

test("making something with the name of a deleted thing offers it back first", () => {
  const { backend, str } = setup();
  backend.deleteNode(str);
  assert.equal(backend.binnedNamed("  strength ", "ability")!.name, "Strength");
  assert.equal(backend.binnedNamed("Strength", "skill"), null, "only the same kind of thing");
  assert.equal(backend.binnedNamed("Luck"), null);
});

test("emptying the bin is permanent: nothing can restore or undo it back", () => {
  const { backend, str } = setup();
  backend.deleteNode(str);
  const id = backend.bin()[0]!.binId;
  backend.emptyNodeBin([id]);
  assert.equal(backend.bin().length, 0);
  assert.throws(() => backend.restoreNode(id), /isn't in the recycle bin/);
  while (backend.undo()) {
    // undo everything that is left
  }
  assert.ok(!backend.rulesTab().find((s) => s.key === "abilities")!.nodes.some((n) => n.name === "Strength"));
  assert.ok(red(backend).length >= 1, "what used it stays flagged, so nothing breaks quietly");
});
