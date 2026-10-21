import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Backend } from "../src/app/backend.ts";
import { costInGold, parseAmount } from "../src/app/codex.ts";

function setup(start: "d20" | "scratch" = "d20") {
  const dir = mkdtempSync(join(tmpdir(), "dmip-codex-"));
  const backend = new Backend({
    settingsPath: join(dir, "settings.json"),
    defaultFolder: join(dir, "DM in a Pocket"),
    machine: "home-pc",
    pickPicture: async () => null,
    pickFolder: async () => null,
    emit: () => {},
    timers: { set: () => 0, clear: () => {}, now: () => Date.now() },
  });
  const sys = backend.createSystem({ name: "d20 Basic", picture: null, start });
  const world = backend.createWorld({ name: "Greyhollow", picture: null, systemId: sys });
  backend.open({ type: "world", id: world });
  return { backend, sys, world };
}

const find = (b: Backend, section: string, name: string) => b.codex().find((s) => s.key === section)!.entries.find((e) => e.name === name)!;

test("the Codex sorts the starter into sections, with a few words under each name", () => {
  const { backend } = setup();
  const sections = backend.codex();
  const titles = sections.map((s) => s.title);
  assert.deepEqual(titles.slice(0, 5), ["Weapons", "Armour", "Gear", "Magic items", "Monsters"]);
  const axe = find(backend, "weapons", "Battleaxe");
  assert.equal(axe.sub, "1d8 slashing · 10 gp");
  assert.equal(axe.source, "template");
  assert.equal(axe.cost, 10);
  assert.ok(find(backend, "armour", "Chain Mail").sub.startsWith("Armour +6"));
  assert.ok(find(backend, "gear", "Lantern, Hooded"));
  assert.equal(find(backend, "monsters", "Goblin Warrior").sub.split(" · ")[0], "CR 1/4");
  assert.ok(find(backend, "classes", "Fighter").sub.startsWith("Hit die"));
  assert.match(find(backend, "spells", "Fire Bolt").sub, /cantrip/);
  assert.equal(find(backend, "enchantments", "Flaming").sub, "Deals 1d6 fire damage");
  assert.ok(find(backend, "weapons", "Dagger"), "light weapons, filed four levels deep, are still weapons");
  // Things that never belong in the Codex aren't there (rules, categories).
  assert.ok(!sections.some((s) => s.entries.some((e) => e.name === "Strength")));
});

test("Make my own copy: an independent copy with the standard description, which goes back to it", () => {
  const { backend } = setup();
  const axe = find(backend, "weapons", "Battleaxe").id;
  const mine = backend.makeOwnCopy(axe);
  const v = backend.node(mine);
  assert.equal(v.name, "My Battleaxe");
  assert.equal(v.source, "mine");
  assert.equal(v.parent, null, "a copy goes its own way");
  assert.match(v.text, /broad, single-bladed axe/);
  const q = backend.quick(mine);
  assert.equal(q.pattern, "weapon");
  assert.equal(q.standardText, v.text);
  assert.equal(q.attack!.own, true, "its attack is its own, so the damage can be changed");
  assert.equal(q.attack!.dice, "1d8");
  assert.equal(v.fields.material, "Steel");
  assert.equal(v.fields.handling, "Versatile");
  assert.ok(!backend.flags().some((f) => f.title.startsWith("My Battleaxe")), "an unchanged copy is as normal as the starter it came from");
  // Changing the damage on the copy leaves the starter alone.
  backend.editAttachment(mine, q.attack!.aid, { overrides: { dice: "1d12" } });
  assert.equal(backend.quick(mine).attack!.dice, "1d12");
  assert.equal(backend.quick(axe).attack!.dice, "1d8");
  // Write my own, then back to the standard.
  backend.setText(mine, "My grandfather's axe.");
  assert.equal(backend.node(mine).text, "My grandfather's axe.");
  backend.setText(mine, backend.quick(mine).standardText!);
  assert.match(backend.node(mine).text, /broad, single-bladed axe/);
  // A second copy gets a name of its own, and one undo removes a copy.
  assert.equal(backend.node(backend.makeOwnCopy(axe)).name, "My Battleaxe 2");
  backend.undo();
  assert.equal(find(backend, "weapons", "My Battleaxe 2"), undefined);
});

test("How it prints is exactly the rulebook's entry, with material and how it's held", () => {
  const { backend } = setup();
  const mine = backend.makeOwnCopy(find(backend, "weapons", "Battleaxe").id, "Dwarven Axe");
  backend.setField(mine, "material", "Mithral");
  const p = backend.printPreview(mine);
  assert.equal(p.title, "Dwarven Axe");
  assert.match(p.stats!, /Cost 10 gp · Weight 4 lb\. · Material Mithral · Held Versatile/);
  assert.ok(p.paragraphs.some((x) => /1d8 slashing/.test(x)));
  assert.ok(!p.paragraphs.some((x) => /versatile/i.test(x)), "how it's held prints once, in the stats");
});

test("pickers draw their lists from the game itself, so a new material or coin joins every list", () => {
  const { backend } = setup();
  const mine = backend.makeOwnCopy(find(backend, "gear", "Lantern, Hooded").id);
  assert.equal(backend.quick(mine).pattern, "gear");
  assert.deepEqual(backend.quick(mine).coins, ["cp", "sp", "gp", "pp"], "the usual coins, smallest first");
  assert.ok(!backend.quick(mine).materials.includes("Vorpal stone"));
  backend.setField(mine, "material", "Vorpal stone");
  backend.setField(mine, "cost", "3 crowns");
  const other = find(backend, "weapons", "Dagger").id;
  assert.ok(backend.quick(other).materials.includes("Vorpal stone"));
  assert.ok(backend.quick(other).coins.includes("crowns"));
  assert.deepEqual(parseAmount("4 lb."), { amount: 4, unit: "lb" });
  assert.deepEqual(parseAmount("1.5 kg"), { amount: 1.5, unit: "kg" });
  assert.equal(costInGold("5 sp"), 0.5);
  assert.equal(parseAmount("lots"), null);
});

test("armour: its type is where it is filed, and the Armour picker changes its own copy", () => {
  const { backend } = setup();
  const mine = backend.makeOwnCopy(find(backend, "armour", "Chain Mail").id);
  const q = backend.quick(mine);
  assert.equal(q.pattern, "armour");
  assert.deepEqual(q.armourTypes.map((t) => t.name).sort(), ["Heavy", "Light", "Medium", "Shields"]);
  assert.equal(q.armour!.bonus, 6);
  backend.editAttachment(mine, q.armour!.aid, { overrides: { bonus: 7 } });
  assert.equal(backend.quick(mine).armour!.bonus, 7);
});

test("Ctrl+D makes a variant that follows the original; its inherited attack is changed at the parent", () => {
  const { backend } = setup();
  const mine = backend.makeOwnCopy(find(backend, "weapons", "Longsword").id, "Knight's Sword");
  const child = backend.makeVariant(mine);
  const v = backend.node(child);
  assert.equal(v.name, "Knight's Sword (variant)");
  assert.equal(v.parent!.name, "Knight's Sword");
  const q = backend.quick(child);
  assert.equal(q.attack!.own, false);
  assert.equal(q.attack!.from, "Knight's Sword");
  assert.equal(q.standardText, backend.node(mine).text, "a variant's standard description is its parent's");
  assert.throws(() => backend.editAttachment(child, q.attack!.aid, { overrides: { dice: "1d4" } }), /parent/);
});

test("refiling: drag between sections. An item changes where it is filed, a being changes what it is", () => {
  const { backend } = setup();
  const lantern = backend.makeOwnCopy(find(backend, "gear", "Lantern, Hooded").id);
  backend.refile([lantern], "weapons");
  assert.ok(find(backend, "weapons", "My Lantern, Hooded"));
  assert.ok(backend.flags().some((f) => /filed as a weapon but has no attack/.test(f.title)), "allowed, but flagged");
  const goblin = backend.makeOwnCopy(find(backend, "monsters", "Goblin Warrior").id, "Snik");
  backend.refile([goblin], "npcs");
  assert.equal(backend.node(goblin).fields.beingKind, "npc");
  backend.refile([goblin], "classes");
  assert.equal(backend.categories().find((c) => c.id === backend.node(goblin).categoryId)!.name, "Class");
  backend.undo();
  assert.equal(backend.node(goblin).fields.beingKind, "npc", "one move is one undo step");
  assert.throws(() => backend.refile([find(backend, "spells", "Fire Bolt").id], "weapons"), /can't be moved/);
});

test("new classes and races are filed under Class and Race, never among the creatures (backlog 7)", () => {
  const { backend } = setup("scratch");
  const cleric = backend.addBeing({ name: "Cleric", kind: "class", variantOf: null });
  const elf = backend.addBeing({ name: "Elf", kind: "race", variantOf: null });
  const cat = (id: string) => backend.categories().find((c) => c.id === backend.node(id).categoryId)!.name;
  assert.equal(cat(cleric), "Class");
  assert.equal(cat(elf), "Race");
  assert.ok(!backend.flags().some((f) => /filed under/.test(f.title)));
});
