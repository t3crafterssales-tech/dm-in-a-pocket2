import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SRD_CREDIT } from "../src/engine/index.ts";
import { Backend } from "../src/app/backend.ts";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "dmip-starter-"));
  const backend = new Backend({
    settingsPath: join(dir, "settings.json"),
    defaultFolder: join(dir, "DM in a Pocket"),
    machine: "home-pc",
    pickPicture: async () => null,
    pickFolder: async () => null,
    emit: () => {},
    timers: { set: () => 0, clear: () => {}, now: () => Date.now() },
  });
  const sys = backend.createSystem({ name: "d20 Basic", picture: null, start: "d20" });
  return { backend, sys };
}

test("Generic d20 starts with the core rules, a couple of dozen monsters and items, and nothing to undo", () => {
  const { backend, sys } = setup();
  backend.open({ type: "system", id: sys });
  const tab = backend.rulesTab();
  const count = (k: string) => tab.find((s) => s.key === k)!.nodes.length;
  assert.equal(count("core"), 1);
  assert.deepEqual(tab.find((s) => s.key === "abilities")!.nodes.map((n) => n.label), ["STR", "DEX", "CON", "INT", "WIS", "CHA"]);
  assert.equal(count("skills"), 18);
  assert.equal(count("conditions"), 15);
  assert.ok(count("combat") >= 3);
  assert.ok(backend.beingsList("monster").length >= 18, "a couple of dozen monsters");
  assert.ok(backend.itemsList().length >= 18, "and items");
  assert.equal(backend.history().done.length, 0, "the starter is the starting point, not something to undo");
  assert.ok(backend.templates().some((t) => t.name === "Basic Melee Weapon"), "it shows how templates work");
  assert.ok(backend.beingsList("monster").some((e) => e.name === "Goblin Boss" && e.depth === 1), "and variants");
});

test("the starter opens with no red flags and no yellow ones", () => {
  const { backend, sys } = setup();
  backend.open({ type: "system", id: sys });
  const flags = backend.flagPanel().blocks.filter((b) => b.color === "red" || b.color === "yellow");
  assert.deepEqual(flags.map((f) => f.title), []);
});

test("starter monsters read well on their sheets", () => {
  const { backend, sys } = setup();
  backend.open({ type: "system", id: sys });
  const goblin = backend.beingsList("monster").find((e) => e.name === "Goblin")!;
  const v = backend.node(goblin.id);
  assert.equal(v.fields.cr, "1/4");
  assert.deepEqual(v.attachments.map((a) => [a.name, a.section]), [["Scimitar", "Gear"], ["Shortbow", "Gear"], ["Nimble Escape", "Traits and features"], ["Darkvision", "Traits and features"]]);
  assert.match(v.attachments[0]!.sentence, /^Scimitar: attack with d20 \+ Dexterity \+ proficiency, 1d6 slashing damage/);
  assert.equal(v.scores.length, 6);
});

test("its rulebook carries the SRD 5.2 credit automatically, and a world built on it gets everything", () => {
  const { backend, sys } = setup();
  const world = backend.createWorld({ name: "Greyhollow", picture: null, systemId: sys });
  backend.open({ type: "world", id: world });
  assert.ok(backend.beingsList("monster").length >= 18);
  const { book } = backend.book({ type: "everything" });
  assert.ok(book.credits.includes(SRD_CREDIT));
  assert.ok(book.chapters.some((c) => c.id === "monsters"));
  assert.ok(!book.index.some((i) => i.term === "Basic Melee Weapon"), "templates don't print");
});
