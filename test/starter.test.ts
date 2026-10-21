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

test("Generic d20 starts with the core rules and the full SRD 5.2, and nothing to undo", () => {
  const { backend, sys } = setup();
  backend.open({ type: "system", id: sys });
  const tab = backend.rulesTab();
  const count = (k: string) => tab.find((s) => s.key === k)!.nodes.length;
  assert.equal(count("core"), 1);
  assert.deepEqual(tab.find((s) => s.key === "abilities")!.nodes.filter((n) => n.label).map((n) => n.label), ["STR", "DEX", "CON", "INT", "WIS", "CHA"]);
  assert.ok(tab.find((s) => s.key === "abilities")!.nodes.some((n) => n.name === "Making ability scores"), "the character builder's Method starts from this rule");
  assert.equal(count("skills"), 18);
  assert.equal(count("conditions"), 15);
  assert.ok(count("combat") >= 3);
  assert.equal(backend.beingsList("monster").length, 341, "every SRD 5.2 monster");
  assert.equal(backend.beingsList("race").filter((e) => e.depth === 0).length, 9, "the nine species");
  assert.equal(backend.beingsList("class").filter((e) => e.depth === 0).length, 12, "the twelve classes");
  assert.ok(backend.itemsList().length >= 400, "equipment and magic items");
  const spells = backend.library().find((s) => s.type === "spell")!.entries;
  assert.equal(spells.length, 339, "every spell");
  assert.equal(backend.history().done.length, 0, "the starter is the starting point, not something to undo");
  assert.ok(backend.templates().some((t) => t.name === "Armor (magic, any bonus)"), "it shows how templates work");
  const plusOne = backend.node(backend.itemsList().find((e) => e.name === "Armor +1")!.id);
  assert.equal(plusOne.parent?.name, "Armor (magic, any bonus)", "magic armour +1 to +3 are variants of the template");
  assert.ok(backend.beingsList("race").some((e) => e.name === "Elven Lineage: Wood Elf" && e.depth === 1));
});

test("the starter opens with no red flags and no yellow ones", () => {
  const { backend, sys } = setup();
  backend.open({ type: "system", id: sys });
  const flags = backend.flagPanel().blocks.filter((b) => b.color === "red" || b.color === "yellow");
  assert.deepEqual(flags.map((f) => f.title), []);
});

test("homemade monsters are measured against the SRD, and so is an SRD monster changed in a world", () => {
  const { backend, sys } = setup();
  const world = backend.createWorld({ name: "Greyhollow", picture: null, systemId: sys });
  backend.open({ type: "world", id: world });
  const ogre = backend.beingsList("monster").find((e) => e.name === "Ogre")!.id;
  const mine = backend.addBeing({ name: "Paper Ogre", kind: "monster", variantOf: ogre });
  backend.setField(mine, "hp", 3);
  const titles = () => backend.flagPanel().blocks.map((b) => b.title);
  assert.ok(titles().includes("Paper Ogre has very little hit points for its challenge rating"));
  backend.setField(ogre, "hp", 900);
  assert.ok(titles().includes("Ogre has a lot of hit points for its challenge rating"));
});

test("starter monsters read well on their sheets", () => {
  const { backend, sys } = setup();
  backend.open({ type: "system", id: sys });
  const goblin = backend.beingsList("monster").find((e) => e.name === "Goblin Warrior")!;
  const v = backend.node(goblin.id);
  assert.deepEqual([v.fields.cr, v.fields.hp, v.fields.ac, v.fields.speed], ["1/4", 10, 15, "30 ft."]);
  assert.deepEqual(v.attachments.map((a) => a.name), ["Scimitar", "Shortbow", "Nimble Escape (Bonus Action)"]);
  assert.equal(v.attachments[0]!.sentence, "Scimitar: attack with d20 + Dexterity + proficiency, 1d6 slashing damage (melee, reach 5 ft.) plus 2 (1d4) Slashing damage if the attack roll had Advantage.");
  assert.match(v.attachments[2]!.sentence, /takes the Disengage or Hide action/);
  assert.equal(v.scores.length, 6);
  // Monsters share library bricks by name, each keeping its own dice on its sheet.
  const dragon = backend.node(backend.beingsList("monster").find((e) => e.name === "Adult Red Dragon")!.id);
  assert.match(dragon.attachments.find((a) => a.name === "Rend")!.sentence, /1d10 slashing damage \(melee, reach 10 ft\.\) plus 5 \(2d4\) Fire damage/);
  assert.ok(dragon.attachments.some((a) => a.name === "Fire Breath (Recharge 5-6)"));
  // "Druid" is a class, so the stat block has its own name.
  assert.ok(backend.beingsList("monster").some((e) => e.name === "Druid (monster)"));
});

test("spells print in their own chapter with their numbers line", () => {
  const { backend, sys } = setup();
  backend.open({ type: "system", id: sys });
  const ch = backend.book({ type: "players" }).book.chapters.find((c) => c.id === "spells")!;
  const fireball = ch.entries.find((e) => e.title === "Fireball")!;
  assert.equal(fireball.stats, "Level 3 Evocation · Action · 150 feet · V, S, M (a ball of bat guano and sulfur) · Instantaneous");
  assert.match(fireball.paragraphs[0]!, /^A bright streak flashes/);
  assert.ok(fireball.paragraphs.includes("Classes: Sorcerer, Wizard."));
  assert.equal(ch.entries.length, 339);
});

test("its rulebook carries the SRD 5.2 credit automatically, and a world built on it gets everything", () => {
  const { backend, sys } = setup();
  const world = backend.createWorld({ name: "Greyhollow", picture: null, systemId: sys });
  backend.open({ type: "world", id: world });
  assert.equal(backend.beingsList("monster").length, 341);
  const { book } = backend.book({ type: "everything" });
  assert.ok(book.credits.includes(SRD_CREDIT));
  assert.ok(book.chapters.some((c) => c.id === "monsters"));
  assert.ok(!book.index.some((i) => i.term === "Armor (magic, any bonus)"), "templates don't print");
});
