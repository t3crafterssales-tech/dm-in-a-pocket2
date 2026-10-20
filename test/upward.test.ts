import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Backend } from "../src/app/backend.ts";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "dmip-upward-"));
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
  backend.goHome();
  const a = backend.createWorld({ name: "Greyhollow", picture: null, systemId: sys });
  const b = backend.createWorld({ name: "Pirate Seas", picture: null, systemId: sys });
  const c = backend.createWorld({ name: "Ashfall", picture: null, systemId: sys });
  // Pirate Seas already set its own top score.
  backend.open({ type: "world", id: b });
  backend.setField(str, "rangeMax", 16);
  backend.goHome();
  return { backend, sys, str, a, b, c };
}

const top = (backend: Backend, place: { type: "world" | "system"; id: string }, str: string) => {
  backend.open(place);
  const v = backend.node(str);
  backend.goHome();
  return { max: v.fields.rangeMax, pencil: v.changedHere.includes("rangeMax") };
};

test("from inside a world, the system's version shows beside this world's", () => {
  const { backend, str, a, b } = setup();
  backend.open({ type: "world", id: b });
  const v = backend.upwardView(str);
  assert.equal(v.systemName, "My d20");
  const row = v.rows.find((r) => r.key === "rangeMax")!;
  assert.deepEqual([row.label, row.system, row.world, row.differs, row.editable], ["Highest score", "18", "16", true, true]);
  assert.deepEqual(v.worlds.map((w) => [w.name, w.current]), [["Pirate Seas", true], ["Ashfall", false], ["Greyhollow", false]]);
  void a;
});

test("changing the system from a world: ticked worlds get it, unticked ones keep the old value with a pencil, and own values are never touched", () => {
  const { backend, sys, str, a, b, c } = setup();
  backend.open({ type: "world", id: a });
  const r = backend.changeInSystem(str, { rangeMax: 20 }, [a]);
  assert.equal(r.label, "Changed Strength in My d20");
  assert.deepEqual(r.kept.sort(), ["Ashfall", "Pirate Seas"]);
  assert.equal(backend.node(str).fields.rangeMax, 20);
  backend.goHome();

  assert.deepEqual(top(backend, { type: "system", id: sys }, str), { max: 20, pencil: false });
  assert.deepEqual(top(backend, { type: "world", id: a }, str), { max: 20, pencil: false });
  assert.deepEqual(top(backend, { type: "world", id: b }, str), { max: 16, pencil: true }, "Pirate Seas kept its own value");
  assert.deepEqual(top(backend, { type: "world", id: c }, str), { max: 18, pencil: true }, "Ashfall was unticked, so it kept the old one");
  const d = backend.createWorld({ name: "New Land", picture: null, systemId: sys });
  assert.deepEqual(top(backend, { type: "world", id: d }, str), { max: 20, pencil: false }, "new worlds get the new value");
});

test("unticking this world changes the system for the others but keeps this world as it was", () => {
  const { backend, str, a, c } = setup();
  backend.open({ type: "world", id: a });
  backend.changeInSystem(str, { rangeMax: 20, label: "STR" }, [c]);
  const v = backend.node(str);
  assert.equal(v.fields.rangeMax, 18);
  assert.deepEqual(v.changedHere.sort(), ["label", "rangeMax"]);
  backend.goHome();
  assert.deepEqual(top(backend, { type: "world", id: c }, str), { max: 20, pencil: false });
});

test("a world open on another computer can't be protected, so it is listed and gets the change", () => {
  const { backend, str, a, c } = setup();
  const path = backend.lib.worldPath(c);
  writeFileSync(path + ".lock", JSON.stringify({ machine: "laptop", session: "other", heartbeat: Date.now() }));
  backend.open({ type: "world", id: a });
  const w = backend.upwardView(str).worlds.find((x) => x.id === c)!;
  assert.equal(w.available, false);
  assert.match(w.note!, /Open on laptop/);
  const r = backend.changeInSystem(str, { rangeMax: 20 }, [a]);
  assert.deepEqual(r.couldNot, ["Ashfall"]);
});

test("the change made from the world is one undo step there, and the system itself can't use it", () => {
  const { backend, sys, str, a } = setup();
  backend.open({ type: "world", id: a });
  backend.changeInSystem(str, { rangeMax: 20 }, [a]);
  assert.equal(backend.undo()!.label, "Changed Strength in My d20");
  assert.equal(backend.node(str).fields.rangeMax, 18);
  backend.goHome();
  backend.open({ type: "system", id: sys });
  assert.throws(() => backend.upwardView(str), /system itself/);
});
