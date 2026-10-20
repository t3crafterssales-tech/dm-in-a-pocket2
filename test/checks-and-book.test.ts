import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CHECKS, F, SRD_CREDIT, SRD_LICENSE, Workspace, buildBook, link, sentence, worldRuleFlags, yellowFlags } from "../src/engine/index.ts";
import type { Attachment } from "../src/engine/index.ts";

function world() {
  const ws = new Workspace();
  const sys = ws.addLayer("system", "d20 Basic", null, "T3 Crafters");
  const w = ws.addLayer("world", "Greyhollow", sys, "T3 Crafters");
  const str = ws.create(sys, "ability", "Strength", { fields: { label: "STR", min: 3, max: 18 } });
  const dex = ws.create(sys, "ability", "Dexterity", { fields: { label: "DEX", min: 3, max: 18 } });
  const prone = ws.create(sys, "condition", "Prone", { fields: { effects: "Can only crawl." } });
  const poisoned = ws.create(sys, "condition", "Poisoned", { fields: { effects: "Disadvantage on attacks." } });
  const attack = ws.create(sys, "brick", "Weapon Attack", { fields: { type: "attack", ability: link(str), dice: "1d6", damageType: "bludgeoning" } });
  const fire = ws.create(sys, "brick", "Fire damage", { fields: { type: "damage", dice: "1d6", damageType: "fire" } });
  const knock = ws.create(sys, "brick", "Knocked prone", { fields: { type: "effect", condition: link(prone), wording: "the target falls {condition}" } });
  const immune = ws.create(sys, "brick", "Immune to poison", { fields: { type: "immunity", condition: link(poisoned) } });
  const stone = ws.create(sys, "brick", "Stoneworking", { fields: { type: "trait", bonus: 2, wording: "+{bonus} to checks involving stonework" } });
  const weapons = ws.create(sys, "category", "Weapon", { fields: { role: "weapon" } });
  const melee = ws.create(sys, "category", "Melee", { fields: { under: link(weapons) } });
  const creatures = ws.create(sys, "category", "Creature", { fields: { role: "creature" } });
  const item = (name: string, dice: string, cost: string) => {
    const id = ws.create(w, "item", name, { category: link(melee), fields: { cost } });
    ws.attach(w, id, attack, { overrides: { dice } });
    return id;
  };
  const monster = (name: string, cr: string, hp: number, weapon: string, extra: Partial<Parameters<typeof ws.create>[3]> = {}) => {
    const id = ws.create(w, "being", name, { category: link(creatures), ...extra, fields: { beingKind: "monster", cr, hp, ac: 13, ...(extra?.fields ?? {}) } });
    ws.attach(w, id, weapon);
    return id;
  };
  return { ws, sys, w, str, dex, prone, poisoned, attack, fire, knock, immune, stone, weapons, melee, creatures, item, monster };
}

// ---------- Sentences ----------

test("the Big Shield reads as one plain sentence, with the nested fire", () => {
  const t = world();
  const shield = t.ws.create(t.w, "item", "Big Shield");
  const k = t.ws.attach(t.w, shield, t.knock, { activation: { when: ["nat"], join: "any", natural: 19 }, save: { ability: link(t.str), dc: 13, onSuccess: "no effect" } });
  t.ws.attach(t.w, shield, t.fire, { save: { ability: link(t.dex), dc: 13, onSuccess: "half" } }, k);
  const a = t.ws.get(t.w, shield)!.attachments[0]!;
  assert.equal(
    sentence(t.ws, t.w, a),
    "On a natural 19 or 20, the target must make a DC 13 Strength saving throw; on a failure, the target falls Prone. When that happens, also: The target must make a DC 13 Dexterity saving throw; on a failure, deals 1d6 fire damage (half on a success).",
  );
});

test("sentences cover several triggers, uses with formulas, choices and upgrade tiers", () => {
  const t = world();
  const thief = t.ws.create(t.w, "being", "Thief", { fields: { beingKind: "class" } });
  const sneak = t.ws.create(t.sys, "brick", "Sneak Attack", { fields: { type: "damage", dice: "2d6", damageType: "piercing" } });
  t.ws.attach(t.w, thief, sneak, { activation: { when: ["flanked", "unaware", "belowHalf"], join: "any" }, uses: { count: "DEX", per: "rest" }, tiers: [{ name: "Evolved", requirement: "Level 7", change: "3d8" }] });
  t.ws.attach(t.w, thief, null, { choice: { label: "technique", pick: 1, again: false, restrict: "", options: [link(t.stone), link(t.immune)] } });
  const [s1, s2] = t.ws.get(t.w, thief)!.attachments.map((a: Attachment) => sentence(t.ws, t.w, a));
  assert.equal(s1, "When the target is flanked, when the target is unaware or when the target is below half health, deals 2d6 piercing damage (DEX times per rest, at least once). Upgrades: Evolved (Level 7): 3d8.");
  assert.equal(s2, "Choose one technique: Stoneworking or Immune to poison.");
});

test("a sentence says plainly when something it uses was removed", () => {
  const t = world();
  const club = t.item("Club", "1d4", "1 sp");
  t.ws.delete(t.sys, t.str);
  assert.match(sentence(t.ws, t.w, t.ws.get(t.w, club)!.attachments[0]!), /\[missing: Strength\]/);
});

// ---------- World rules ----------

test('breaking your own world rule ("no metal") is a red flag listing everything that breaks it', () => {
  const t = world();
  const mat = t.ws.create(t.sys, "brick", "Material", { fields: { type: "prop", material: "Metal", wording: "made of {material}" } });
  const helm = t.ws.create(t.w, "item", "Iron Helm");
  t.ws.attach(t.w, helm, mat);
  const staff = t.ws.create(t.w, "item", "Oak Staff");
  t.ws.attach(t.w, staff, mat, { overrides: { material: "Wood" } });
  const sword = t.ws.create(t.w, "item", "Old Blade", { fields: { material: "metal" } });
  const rule = t.ws.create(t.w, "rule", "No metal in this world", { fields: { forbid: { field: "material", equals: "Metal" } } });
  const flags = worldRuleFlags(t.ws, t.w);
  assert.equal(flags.length, 1);
  assert.deepEqual(flags[0]!.offenders.sort(), [helm, sword].sort());
  assert.equal(flags[0]!.title, '2 things break "No metal in this world"');
  // "I meant that": the smuggled helm is allowed on purpose.
  t.ws.setField(t.w, rule, "exceptions", [link(helm)]);
  assert.deepEqual(worldRuleFlags(t.ws, t.w)[0]!.offenders, [sword]);
});

// ---------- Yellow checks ----------

test("balance: a monster far off its challenge rating is flagged, measured against your own monsters", () => {
  const t = world();
  const claws = t.item("Claws", "1d6", "0 gp");
  const axe = t.item("Huge Axe", "6d12", "30 gp");
  for (const n of ["Goblin", "Kobold", "Rat King", "Imp"]) t.monster(n, "1/4", 7, claws);
  const chief = t.monster("Goblin Warchief", "1/4", 7, axe);
  const flags = yellowFlags(t.ws, t.w).filter((f) => f.category === "balance");
  assert.equal(flags.length, 1);
  assert.equal(flags[0]!.nodes[0], chief);
  assert.equal(flags[0]!.kind, "damage-high");
  assert.match(flags[0]!.detail, /About 39 damage a round; other challenge 1\/4 monsters usually have 3.5/);
});

test("balance stays quiet until there are enough monsters to know what normal is", () => {
  const t = world();
  const claws = t.item("Claws", "1d6", "0 gp");
  const axe = t.item("Huge Axe", "6d12", "30 gp");
  t.monster("Goblin", "1/4", 7, claws);
  t.monster("Goblin Warchief", "1/4", 7, axe);
  assert.equal(yellowFlags(t.ws, t.w).filter((f) => f.category === "balance").length, 0);
});

test("sensitivity: relaxed lets more through than strict", () => {
  const t = world();
  const claws = t.item("Claws", "1d6", "0 gp");
  const bigger = t.item("Spiked Club", "2d6", "1 gp");
  for (const n of ["A", "B", "C", "D"]) t.monster(n, "1", 20, claws);
  t.monster("Brute", "1", 20, bigger);
  const at = (level: "relaxed" | "strict") => yellowFlags(t.ws, t.w, { ...DEFAULT_CHECKS, balance: { on: true, level } }).filter((f) => f.category === "balance").length;
  assert.equal(at("relaxed"), 0);
  assert.equal(at("strict"), 1);
});

test("economy: a weaker weapon that costs more is flagged", () => {
  const t = world();
  t.item("Longsword", "1d8", "15 gp");
  const short = t.item("Shortsword", "1d6", "20 gp");
  const flags = yellowFlags(t.ws, t.w).filter((f) => f.category === "economy");
  assert.equal(flags.length, 1);
  assert.equal(flags[0]!.nodes[0], short);
  assert.equal(flags[0]!.title, "Shortsword costs more than Longsword");
});

test("filing: a weapon with no attack, a creature filed as a weapon, duplicate names and empty sheets", () => {
  const t = world();
  const key = t.ws.create(t.w, "item", "Sword Key", { category: link(t.melee) });
  const thrown = t.ws.create(t.w, "being", "Throwing Goblin", { category: link(t.melee), fields: { beingKind: "monster", hp: 5 } });
  t.ws.create(t.w, "lore", "Iron Hills");
  t.ws.create(t.w, "lore", "iron hills ");
  const kinds = yellowFlags(t.ws, t.w).filter((f) => f.category === "filing").map((f) => `${f.kind}:${f.nodes.length}`).sort();
  assert.deepEqual(kinds, ["duplicate-name:2", "empty-sheet:1", "filed-oddly:1", "weapon-no-attack:1"]);
  const filed = yellowFlags(t.ws, t.w).find((f) => f.kind === "filed-oddly")!;
  assert.equal(filed.nodes[0], thrown);
  assert.match(filed.title, /Intended\?/);
  assert.equal(yellowFlags(t.ws, t.w).find((f) => f.kind === "weapon-no-attack")!.nodes[0], key);
});

test("check categories can be switched off one by one", () => {
  const t = world();
  t.item("Longsword", "1d8", "15 gp");
  t.item("Shortsword", "1d6", "20 gp");
  t.ws.create(t.w, "item", "Sword Key", { category: link(t.melee) });
  const off = yellowFlags(t.ws, t.w, { ...DEFAULT_CHECKS, economy: { on: false, level: "normal" } });
  assert.equal(off.some((f) => f.category === "economy"), false);
  assert.equal(off.some((f) => f.category === "filing"), true);
});

test("templates never trigger checks and never appear in the book", () => {
  const t = world();
  t.ws.create(t.w, "item", "Basic Melee Weapon", { template: true, category: link(t.melee) });
  assert.equal(yellowFlags(t.ws, t.w).length, 0);
  const book = buildBook(t.ws, t.w, { type: "everything" });
  assert.equal(book.index.some((i) => i.term === "Basic Melee Weapon"), false);
});

// ---------- The rulebook ----------

test("each book type gets its own chapters", () => {
  const t = world();
  const claws = t.item("Claws", "1d6", "0 gp");
  t.monster("Goblin", "1/4", 7, claws);
  t.ws.create(t.w, "being", "Dwarf", { fields: { beingKind: "race" } });
  const players = buildBook(t.ws, t.w, { type: "players" });
  assert.equal(players.subtitle, "Player's Handbook");
  assert.deepEqual(players.chapters.map((c) => c.title), ["Abilities", "Conditions", "Races", "Equipment"]);
  const monsters = buildBook(t.ws, t.w, { type: "monsters" });
  assert.deepEqual(monsters.chapters.map((c) => c.title), ["Monsters"]);
  assert.equal(monsters.chapters[0]!.entries[0]!.stats, "HP 7 · AC 13 · Challenge 1/4");
});

test("variants print as differences under their parent, or in full when ticked", () => {
  const t = world();
  const elf = t.ws.create(t.w, "being", "Elf", { fields: { beingKind: "race", height: "5-6 ft" } });
  t.ws.attach(t.w, elf, t.stone);
  const wood = t.ws.create(t.w, "being", "Wood Elf", { parent: link(elf), fields: { speed: "35 ft" } });
  t.ws.attach(t.w, wood, t.immune);
  const book = buildBook(t.ws, t.w, { type: "players" });
  const races = book.chapters.find((c) => c.id === "races")!;
  assert.equal(races.entries.length, 1, "Wood Elf sits under Elf");
  const w = races.entries[0]!.variants[0]!;
  assert.equal(w.title, "Wood Elf");
  assert.deepEqual(w.paragraphs, ["As Elf (Speed 35 ft), plus:", "Immune to the Poisoned condition."]);
  const full = buildBook(t.ws, t.w, { type: "players", variants: "full" });
  const fullWood = full.chapters.find((c) => c.id === "races")!.entries.find((e) => e.node === wood)!;
  assert.ok(fullWood.paragraphs.includes("Stoneworking: +2 to checks involving stonework."), "the inherited trait is printed too");
});

test("book pages appear where they were placed, and only in their books", () => {
  const t = world();
  t.ws.create(t.w, "lore", "How to play", { text: "Roll a d20 and add your ability.", fields: { bookPage: true, books: ["players"], before: "abilities" } });
  const players = buildBook(t.ws, t.w, { type: "players" });
  assert.equal(players.chapters[0]!.title, "How to play");
  assert.equal(players.chapters[1]!.title, "Abilities");
  assert.equal(buildBook(t.ws, t.w, { type: "monsters" }).chapters.some((c) => c.title === "How to play"), false);
});

test("the book lists what each entry links to (for page references), has an index and credits", () => {
  const t = world();
  const dwarf = t.ws.create(t.w, "being", "Dwarf", { fields: { beingKind: "race" } });
  t.ws.attach(t.w, dwarf, t.immune);
  t.ws.create(t.sys, "condition", "Grappled", { fields: { effects: "Speed becomes 0.", [F.license]: SRD_LICENSE } });
  const book = buildBook(t.ws, t.w, { type: "everything" });
  const entry = book.chapters.find((c) => c.id === "races")!.entries[0]!;
  assert.ok(entry.mentions.includes(t.immune));
  const terms = book.index.map((i) => i.term);
  assert.deepEqual(terms, [...terms].sort((a, b) => a.localeCompare(b)), "the index is alphabetical");
  assert.ok(terms.includes("Dwarf") && terms.includes("Grappled"));
  assert.ok(book.credits.includes("Created by T3 Crafters."));
  assert.ok(book.credits.includes(SRD_CREDIT), "SRD content brings its required credit automatically");
});

test("monsters can be sorted by challenge rating", () => {
  const t = world();
  const claws = t.item("Claws", "1d6", "0 gp");
  t.monster("Ogre", "2", 59, claws);
  t.monster("Goblin", "1/4", 7, claws);
  t.monster("Bugbear", "1", 27, claws);
  const book = buildBook(t.ws, t.w, { type: "monsters", monstersByChallenge: true });
  assert.deepEqual(book.chapters[0]!.entries.map((e) => e.title), ["Goblin", "Bugbear", "Ogre"]);
});
