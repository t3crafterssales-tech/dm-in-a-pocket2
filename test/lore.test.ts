import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { link } from "../src/engine/index.ts";
import { Backend } from "../src/app/backend.ts";
import { dieMax, rollTable } from "../src/app/lore.ts";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "dmip-lore-"));
  const backend = new Backend({
    settingsPath: join(dir, "settings.json"),
    defaultFolder: join(dir, "DM in a Pocket"),
    machine: "home-pc",
    pickPicture: async () => null,
    pickFolder: async () => null,
    emit: () => {},
    timers: { set: () => 0, clear: () => {}, now: () => Date.now() },
  });
  const sys = backend.createSystem({ name: "d20", picture: null, start: "scratch" });
  const world = backend.createWorld({ name: "Greyhollow", picture: null, systemId: sys });
  backend.open({ type: "world", id: world });
  return { backend };
}

const section = (b: Backend, kind: string) => b.loreList().find((s) => s.kind === kind)!;

test("lore pages, places and factions start from templates with headings, and print in the world chapter", () => {
  const { backend } = setup();
  const thieves = backend.addLore("The Grey Hands", "faction");
  assert.deepEqual(Object.keys(backend.node(thieves).fields.sections as object), ["History", "Structure", "Territory", "Allies and enemies", "What it means to players"]);
  backend.setField(thieves, "sections", { History: "Founded by a disgraced tax collector.", Structure: "", Territory: "", "Allies and enemies": "", "What it means to players": "" });
  backend.addLore("Mirkwood", "place");
  backend.addLore("Why the moon is red", "blank");
  assert.deepEqual(section(backend, "faction").entries.map((e) => e.name), ["The Grey Hands"]);
  assert.deepEqual(section(backend, "place").entries.map((e) => e.name), ["Mirkwood"]);
  assert.deepEqual(section(backend, "page").entries.map((e) => e.name), ["Why the moon is red"]);
  const lore = backend.book({ type: "world" }).book.chapters.find((c) => c.id === "lore")!;
  const gh = lore.entries.find((e) => e.title === "The Grey Hands")!;
  assert.ok(gh.paragraphs.includes("History. Founded by a disgraced tax collector."), "empty headings aren't printed");
  assert.throws(() => backend.addLore("x", "nonsense"), /kind of lore/);
});

test("book pages only appear in the books they are ticked for, before the chapter chosen", () => {
  const { backend } = setup();
  const how = backend.addLore("How to play", "howToPlay");
  backend.setText(how, "Roll a d20 and add your bonus.");
  backend.addRule("abilities", "Strength");
  const players = backend.book({ type: "players" }).book;
  assert.deepEqual(players.chapters.slice(0, 2).map((c) => c.title), ["How to play", "Abilities"]);
  assert.equal(backend.book({ type: "monsters" }).book.chapters.some((c) => c.title === "How to play"), false);
  assert.deepEqual(section(backend, "bookPage").entries.map((e) => e.name), ["How to play"]);
});

test("roll tables: rows with ranges, results that link to things, and a Roll button", () => {
  const { backend } = setup();
  const ogre = backend.addBeing({ name: "Ogre", kind: "monster", variantOf: null });
  const t = backend.addLore("Forest encounters", "table");
  backend.setField(t, "rows", [
    { from: 1, to: 3, text: "Nothing but birdsong", result: null },
    { from: 4, to: 5, text: "Wolves", result: null },
    { from: 6, to: 6, text: "An ogre", result: link(ogre) },
  ]);
  for (let i = 0; i < 20; i++) {
    const r = backend.rollTable(t);
    assert.ok(r.roll >= 1 && r.roll <= 6);
    if (r.roll === 6) assert.deepEqual(r.result, { id: ogre, name: "Ogre" });
  }
  assert.equal(backend.history().done[0]!.label.startsWith("Changed"), true, "rolling isn't an undo step");
  // A fixed roll shows which row it lands on.
  const ws = backend.session!.ws;
  assert.equal(rollTable(ws, backend.session!.id, t, () => 0.5).row!.text, "Wolves");
  // Deleting the Ogre flags the table, like any other link.
  backend.deleteNode(ogre);
  assert.ok(backend.flagPanel().blocks.some((b) => b.color === "red" && b.title === "Ogre removed: 1 thing affected"));
  const lore = backend.book({ type: "gm" }).book.chapters.find((c) => c.id === "lore")!;
  assert.deepEqual(lore.entries.find((e) => e.title === "Forest encounters")!.paragraphs.slice(0, 2), ["Roll d6.", "1-3. Nothing but birdsong"]);
  assert.deepEqual([dieMax("2d6"), dieMax("d100"), dieMax("lots")], [{ count: 2, sides: 6 }, { count: 1, sides: 100 }, null]);
});
