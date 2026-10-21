import { test } from "node:test";
import assert from "node:assert/strict";
import { SRD_CREDIT, SRD_LICENSE, Workspace } from "../src/engine/index.ts";
import { buildAdventureBook } from "../src/app/adventure-book.ts";
import { addToEncounter, createEncounter, moveEncounters } from "../src/app/encounters.ts";

function setup() {
  const ws = new Workspace();
  const sys = ws.addLayer("system", "d20 Basic");
  const world = ws.addLayer("world", "Greyhollow", sys);
  const mod = ws.addLayer("module", "The Mill on Ash Creek", world);
  const ids = ws.transact("build", () => {
    const wolf = ws.create(sys, "being", "Wolf", { fields: { beingKind: "monster", hp: 11, license: SRD_LICENSE } });
    const hob = ws.create(world, "being", "Miller Hob", { fields: { beingKind: "npc", hp: 9 } });
    const key = ws.create(world, "item", "Rusty key");
    const letter = ws.create(mod, "lore", "The miller's letter", { text: "Help us. The wolves come at night." });
    ws.create(mod, "lore", "Front page", { text: "Wolves are taking the miller's sheep.", fields: { modulePage: true, levels: "1-3", partySize: 4, sessions: 2 } });
    const road = createEncounter(ws, mod, "On the road");
    const mill = createEncounter(ws, mod, "The mill");
    const cellar = createEncounter(ws, mod, "The cellar", mill);
    ws.setField(mod, road, "readAloud", "Rain hammers the road.\nA howl rises in the trees.");
    ws.edit(mod, road, (c) => (c.text = "The wolves are hungry, not evil. Fire scares them off."));
    addToEncounter(ws, mod, road, [wolf], 3);
    addToEncounter(ws, mod, road, [mill], 1);
    addToEncounter(ws, mod, mill, [hob, letter], 1);
    addToEncounter(ws, mod, cellar, [key], 1);
    return { wolf, hob, key, letter, road, mill, cellar };
  });
  return { ws, sys, world, mod, ids };
}

test("the adventure booklet: front page, encounters in tree order, read-aloud in a box, appendices at the back", () => {
  const { ws, mod, ids } = setup();
  const { book, names } = buildAdventureBook(ws, mod, { author: "Jeff" });
  assert.equal(book.title, "The Mill on Ash Creek");
  assert.equal(book.subtitle, "Adventure");
  assert.deepEqual(book.chapters.map((c) => c.title), ["Introduction", "The adventure", "Appendix: Creatures", "Appendix: Treasure", "Appendix: Handouts"]);
  assert.match(book.chapters[0]!.text!, /An adventure for 4 characters of levels 1-3, about 2 sessions of play\. Set in Greyhollow\./);
  assert.match(book.chapters[0]!.text!, /taking the miller's sheep/);

  const [road, mill] = book.chapters[1]!.entries;
  assert.equal(road!.title, "1 On the road");
  assert.equal(road!.readAloud, "Rain hammers the road.\nA howl rises in the trees.");
  assert.deepEqual(road!.paragraphs, ["The wolves are hungry, not evil. Fire scares them off.", "Creatures: Wolf ×3.", "Leads to: 2 The mill."]);
  assert.ok(road!.mentions.includes(ids.wolf) && road!.mentions.includes(ids.mill), "page references to the wolf's stat block and the mill");
  assert.equal(names[ids.mill], "2 The mill", "page references to encounters read with their number");
  assert.equal(mill!.variants[0]!.title, "2.1 The cellar", "an encounter inside another prints under it");
  assert.deepEqual(mill!.paragraphs, ["Creatures: Miller Hob.", "Handouts: The miller's letter."]);
  assert.equal(names[ids.key], "Rusty key", "inner encounters get page references too");

  assert.deepEqual(book.chapters[2]!.entries.map((e) => e.title), ["Miller Hob", "Wolf"], "each creature once, in the appendix");
  assert.match(book.chapters[2]!.entries[1]!.stats!, /HP 11/);
  assert.deepEqual(book.chapters[3]!.entries.map((e) => e.title), ["Rusty key"]);
  assert.deepEqual(book.chapters[4]!.entries[0]!.paragraphs, ["Help us. The wolves come at night."]);
  assert.deepEqual(book.credits, ["Created by Jeff.", SRD_CREDIT], "the SRD credit, because the wolf is from it");
});

test("encounter numbers can print in full, top level only, or not at all; moving renumbers the book", () => {
  const { ws, mod, ids } = setup();
  const titles = (numbering: "full" | "top" | "off") => {
    const b = buildAdventureBook(ws, mod, { numbering }).book.chapters[1]!.entries;
    return b.flatMap((e) => [e.title, ...e.variants.map((v) => v.title)]);
  };
  assert.deepEqual(titles("full"), ["1 On the road", "2 The mill", "2.1 The cellar"]);
  assert.deepEqual(titles("top"), ["1 On the road", "2 The mill", "The cellar"]);
  assert.deepEqual(titles("off"), ["On the road", "The mill", "The cellar"]);
  const off = buildAdventureBook(ws, mod, { numbering: "off" }).book.chapters[1]!.entries[0]!;
  assert.ok(off.paragraphs.includes("Leads to: The mill."), "with numbers off, links read by name (and page)");
  ws.transact("move", () => moveEncounters(ws, mod, [ids.mill], null, ids.road));
  assert.deepEqual(titles("full"), ["1 The mill", "1.1 The cellar", "2 On the road"]);
});

test("a module with nothing in it prints only what it has", () => {
  const ws = new Workspace();
  const sys = ws.addLayer("system", "d20 Basic");
  const mod = ws.addLayer("module", "Bandits on the Road", sys);
  const { book } = buildAdventureBook(ws, mod, {});
  assert.deepEqual(book.chapters, []);
  assert.deepEqual(book.credits, []);
  ws.transact("x", () => ws.create(mod, "lore", "Front page", { fields: { modulePage: true, levels: "", partySize: 4, sessions: 1 } }));
  const again = buildAdventureBook(ws, mod, {}).book;
  assert.equal(again.chapters[0]!.text, "An adventure for 4 characters, about 1 session of play.", "a setting-free module names no world");
});
