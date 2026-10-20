import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chapterOf, link } from "../src/engine/index.ts";
import { Backend } from "../src/app/backend.ts";
import { RULE_SECTIONS } from "../src/app/rules.ts";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "dmip-rules-"));
  const backend = new Backend({
    settingsPath: join(dir, "settings.json"),
    defaultFolder: join(dir, "DM in a Pocket"),
    machine: "home-pc",
    pickPicture: async () => null,
    pickFolder: async () => null,
    emit: () => {},
    // Timers that never fire: saving and the lock heartbeat are tested in app.test.ts.
    timers: { set: () => 0, clear: () => {}, now: () => Date.now() },
  });
  const sys = backend.createSystem({ name: "My d20", picture: null, start: "scratch" });
  backend.open({ type: "system", id: sys });
  return { backend, sys, dir };
}

const section = (b: Backend, key: string) => b.rulesTab().find((s) => s.key === key)!;

test("a new system's Rules tab shows every section from the design, empty", () => {
  const { backend } = setup();
  const tab = backend.rulesTab();
  assert.deepEqual(
    tab.map((s) => s.title),
    ["Core check", "Abilities", "Resources", "Skills", "Conditions", "Combat", "Magic and powers", "Advancement", "Time and rest", "Currency and economy", "World rules"],
  );
  assert.ok(tab.every((s) => s.nodes.length === 0));
});

test("adding an ability files it under Abilities with sensible defaults, and its summary reads well", () => {
  const { backend } = setup();
  const str = backend.addRule("abilities", "Strength");
  backend.setField(str, "label", "STR");
  assert.deepEqual(section(backend, "abilities").nodes.map((n) => [n.name, n.label]), [["Strength", "STR"]]);
  const v = backend.node(str);
  assert.equal(v.kind, "ability");
  assert.equal(v.fields.rangeMin, 3);
  assert.equal(v.summary, "Strength (STR): scores from 3 to 18; its bonus is (score - 10) / 2, rounded down.");
});

test("adding the first rule and the sections it needs is one undo step", () => {
  const { backend } = setup();
  backend.addRule("combat", "Initiative");
  assert.equal(section(backend, "combat").nodes.length, 1);
  assert.equal(backend.undo()!.label, "Added Initiative");
  assert.equal(section(backend, "combat").nodes.length, 0);
  assert.equal(section(backend, "combat").categoryId, null, "the section categories went with it");
  backend.redo();
  assert.equal(section(backend, "combat").nodes[0]!.name, "Initiative");
});

test("hit points as a formula linked to Constitution: deleting Constitution flags it red, undo puts it back", () => {
  const { backend } = setup();
  const con = backend.addRule("abilities", "Constitution");
  const hp = backend.addRule("resources", "Hit points");
  backend.setField(hp, "label", "HP");
  backend.setField(hp, "maximum", { formula: [{ op: "+", ability: link(con), use: "score" }, { op: "+", number: 10 }] });
  assert.equal(backend.node(hp).summary, "Hit points (HP): maximum Constitution score + 10; starts full; recovers each long rest.");
  assert.deepEqual(backend.node(con).usedBy, [{ id: hp, name: "Hit points" }], "Used by is worked out from links");
  assert.equal(backend.flags().length, 0);

  backend.deleteNode(con);
  const flags = backend.flags();
  assert.equal(flags.length, 1);
  assert.equal(flags[0]!.color, "red");
  assert.equal(flags[0]!.title, "Constitution removed: 1 thing affected");
  assert.deepEqual(flags[0]!.nodes, [hp]);
  assert.match(backend.node(hp).summary, /\[missing: Constitution\] score \+ 10/);
  assert.equal(backend.node(hp).names[con], null);
  assert.equal(backend.node(hp).missing[con], "Constitution", "the drop-down can say [missing: Constitution]");

  backend.undo();
  assert.equal(backend.flags().length, 0);
  assert.equal(section(backend, "abilities").nodes[0]!.name, "Constitution");
});

test("thresholds link to conditions: Hunger 5 makes you Hungry", () => {
  const { backend } = setup();
  const hungry = backend.addRule("conditions", "Hungry");
  const hunger = backend.addRule("resources", "Hunger");
  backend.setField(hunger, "start", "empty");
  backend.setField(hunger, "recovery", "never");
  backend.setField(hunger, "thresholds", [{ at: 5, condition: link(hungry) }]);
  assert.equal(backend.node(hunger).summary, "Hunger: maximum 10; starts empty; never recovers; at 5 you are Hungry.");
});

test("skills, conditions and the core check each explain themselves", () => {
  const { backend } = setup();
  const dex = backend.addRule("abilities", "Dexterity");
  const con = backend.addRule("abilities", "Constitution");
  const stealth = backend.addRule("skills", "Stealth");
  assert.equal(backend.node(stealth).summary, "Stealth doesn't use an ability.");
  backend.setField(stealth, "ability", link(dex));
  assert.equal(backend.node(stealth).summary, "Stealth uses Dexterity.");

  const poisoned = backend.addRule("conditions", "Poisoned");
  backend.setField(poisoned, "duration", "1 hour");
  backend.setField(poisoned, "save", { ability: link(con), dc: 12 });
  assert.equal(backend.node(poisoned).summary, "Poisoned: lasts 1 hour; a DC 12 Constitution saving throw resists or ends it.");

  const core = backend.addRule("core", "The core check");
  assert.equal(backend.node(core).summary, "Roll d20 + bonus; meet or beat the difficulty to succeed.");
  backend.setField(core, "family", "bands");
  assert.match(backend.node(core).summary, /^Roll 2d6 \+ bonus: 10 or more is a full success/);
});

test("the core check goes into the rulebook's core rules chapter, other rules into rules of play", () => {
  const { backend } = setup();
  const core = backend.addRule("core", "The core check");
  const init = backend.addRule("combat", "Initiative");
  const ws = backend.session!.ws;
  const layer = backend.session!.id;
  assert.equal(chapterOf(ws, layer, ws.get(layer, core)!), "core");
  assert.equal(chapterOf(ws, layer, ws.get(layer, init)!), "rules");
});

test("a section of your own: rules move into it, and renaming it breaks nothing", () => {
  const { backend } = setup();
  const sanity = backend.addSection("Sanity");
  const fear = backend.addRule("combat", "Fear checks");
  backend.moveToSection(fear, sanity);
  assert.deepEqual(section(backend, sanity).nodes.map((n) => n.name), ["Fear checks"]);
  backend.rename(sanity, "Madness");
  assert.equal(section(backend, sanity).title, "Madness");
  assert.equal(section(backend, sanity).nodes[0]!.name, "Fear checks");
  assert.ok(!backend.sections().some((s) => s.key === "abilities"), "abilities stay in their own section");
  assert.equal(backend.undo()!.label, "Renamed Sanity to Madness");
});

test("inside a world, a system rule changed there gets a pencil mark and stays in that world", () => {
  const { backend, sys } = setup();
  const str = backend.addRule("abilities", "Strength");
  backend.goHome();
  const world = backend.createWorld({ name: "Greyhollow", picture: null, systemId: sys });
  const other = backend.createWorld({ name: "Pirate Seas", picture: null, systemId: sys });
  backend.open({ type: "world", id: world });
  assert.equal(backend.node(str).fromBelow, true);
  backend.setField(str, "rangeMax", 20);
  assert.deepEqual(backend.node(str).changedHere, ["rangeMax"]);
  backend.goHome();

  backend.open({ type: "world", id: other });
  assert.equal(backend.node(str).fields.rangeMax, 18, "the other world is untouched");
  backend.goHome();
  backend.open({ type: "system", id: sys });
  assert.equal(backend.node(str).fields.rangeMax, 18, "the system is untouched: changes never travel up");
  backend.goHome();

  backend.open({ type: "world", id: world });
  assert.equal(backend.node(str).fields.rangeMax, 20, "and it was saved in the world");
  backend.useSystemValue(str, "rangeMax");
  assert.deepEqual(backend.node(str).changedHere, []);
  assert.equal(backend.node(str).fields.rangeMax, 18);
});

test("names are required, odd value names are refused, and a read-only world can't be changed", () => {
  const { backend, sys } = setup();
  assert.throws(() => backend.addRule("abilities", "  "), /name/);
  const str = backend.addRule("abilities", "Strength");
  assert.throws(() => backend.setField(str, "__proto__", 1), /isn't a value/);
  backend.goHome();
  const world = backend.createWorld({ name: "Greyhollow", picture: null, systemId: sys });
  backend.open({ type: "world", id: world }, "read-only");
  assert.throws(() => backend.setField(str, "rangeMax", 20), /read-only/i);
  assert.throws(() => backend.addRule("abilities", "Luck"), /read-only/i);
});

test("every built-in section has a kind that the add button creates", () => {
  const { backend } = setup();
  for (const s of RULE_SECTIONS) {
    const id = backend.addRule(s.key, `New ${s.noun}`);
    assert.equal(backend.node(id).kind, s.kind);
    assert.equal(backend.node(id).sectionKey, s.key);
  }
});

test("a world rule in the World rules section flags everything that breaks it, including things added later", () => {
  const { backend } = setup();
  const rule = backend.addRule("world", "No metal");
  assert.equal(backend.node(rule).sectionKey, "world");
  assert.match(backend.node(rule).summary, /^World rule: choose what nothing may be/);
  backend.setField(rule, "forbid", { field: "material", equals: "Metal" });
  assert.equal(backend.node(rule).summary, "World rule: nothing may have the material Metal. Anything added later is checked too.");
  const helm = backend.addItem({ name: "Iron Helm", categoryId: null, variantOf: null });
  assert.ok(backend.node(helm).sheet!.header.some((f) => f.key === "material"), "items have a Material box");
  backend.setField(helm, "material", "Metal");
  assert.ok(backend.flagPanel().blocks.some((b) => b.color === "red" && b.title === '1 thing breaks "No metal"'));
  const bridle = backend.addItem({ name: "Bridle", categoryId: null, variantOf: null });
  backend.setField(bridle, "material", "metal");
  assert.ok(backend.flagPanel().blocks.some((b) => b.title === '2 things break "No metal"'), "a bridle added next year is flagged too");
  backend.meantThat(backend.flagPanel().blocks.find((b) => b.kind === "rule")!.key, [helm]);
  assert.match(backend.node(rule).summary, /except 1 deliberate exception/);
  assert.equal(section(backend, "world").nodes[0]!.name, "No metal");
});
