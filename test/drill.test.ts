import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { link } from "../src/engine/index.ts";
import { Backend } from "../src/app/backend.ts";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "dmip-drill-"));
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
  const claw = backend.addBrick("attack", "Claw");
  backend.setField(claw, "ability", link(str));
  const goblin = backend.addBeing({ name: "Goblin", kind: "monster", variantOf: null });
  const boss = backend.addBeing({ name: "Goblin Boss", kind: "monster", variantOf: null });
  backend.attach({ targets: [goblin, boss], bricks: [claw] });
  return { backend, str, dex, claw, goblin, boss };
}

test("drilling in changes one sheet's copy only; the library original and other sheets are untouched", () => {
  const { backend, claw, goblin, boss, dex } = setup();
  const aid = backend.node(goblin).attachments[0]!.aid;
  backend.editAttachment(goblin, aid, { name: "Rusty Claw", overrides: { dice: "1d8", ability: link(dex) } });
  const d = backend.attachmentDetail(goblin, aid);
  assert.deepEqual(Object.keys(d.overrides).sort(), ["ability", "dice"]);
  assert.equal(d.sentence, "Rusty Claw: attack with d20 + Dexterity + proficiency, 1d8 slashing damage.");
  assert.match(backend.node(boss).attachments[0]!.sentence, /^Claw: attack with d20 \+ Strength \+ proficiency, 1d6/);
  assert.equal(backend.node(claw).fields.dice, "1d6", "the original is untouched");

  // Changing the original still reaches this sheet for values it didn't change.
  backend.setField(claw, "damageType", "piercing");
  assert.match(backend.attachmentDetail(goblin, aid).sentence, /1d8 piercing/);

  // Setting a value back to the original's removes the pencil mark.
  backend.editAttachment(goblin, aid, { overrides: { dice: "1d6", ability: null }, name: "" });
  assert.deepEqual(backend.attachmentDetail(goblin, aid).overrides, {});
  assert.equal(backend.attachmentDetail(goblin, aid).ownName, null);
  assert.equal(backend.undo()!.label, "Changed Rusty Claw on Goblin");
});

test("Big Shield: knocked prone on a natural 19 or 20 with a Strength save, and fire nested inside it", () => {
  const { backend, str } = setup();
  const prone = backend.addRule("conditions", "Prone");
  const knock = backend.addBrick("effect", "Knocked prone");
  backend.setField(knock, "condition", link(prone));
  const fire = backend.addBrick("damage", "Fire");
  const shield = backend.addItem({ name: "Big Shield", categoryId: null, variantOf: null });
  backend.attach({ targets: [shield], bricks: [knock] });
  const aid = backend.node(shield).attachments[0]!.aid;
  backend.editAttachment(shield, aid, { activation: { when: ["nat"], join: "any", natural: 19 }, save: { ability: link(str), dc: 13, onSuccess: "no effect" } });
  assert.equal(backend.attachmentDetail(shield, aid).sentence, "On a natural 19 or 20, the target must make a DC 13 Strength saving throw; on a failure, the target is Prone.");

  assert.equal(backend.attachInside(shield, aid, [fire]).label, "Added Fire inside Knocked prone");
  const d = backend.attachmentDetail(shield, aid);
  assert.equal(d.children.length, 1);
  assert.match(d.sentence, /When that happens, also: Deals 1d6 fire damage\.$/);
  // The nested piece can be drilled into and removed like any other.
  const inner = d.children[0]!.aid;
  backend.editAttachment(shield, inner, { overrides: { dice: "2d6" } });
  assert.match(backend.attachmentDetail(shield, aid).sentence, /Deals 2d6 fire damage/);
  backend.removeAttachment(shield, inner);
  assert.equal(backend.attachmentDetail(shield, aid).children.length, 0);
});

test("several triggers joined by or, uses as a formula, and odd triggers are refused", () => {
  const { backend, goblin } = setup();
  const aid = backend.node(goblin).attachments[0]!.aid;
  backend.editAttachment(goblin, aid, { activation: { when: ["flanked", "unaware"], join: "any" }, uses: { count: "INT", per: "long rest" } });
  assert.equal(backend.attachmentDetail(goblin, aid).sentence, "When the target is flanked or when the target is unaware, Claw: attack with d20 + Strength + proficiency, 1d6 slashing damage (INT times per long rest, at least once).");
  assert.throws(() => backend.editAttachment(goblin, aid, { activation: { when: ["whenever"], join: "any" } }), /trigger/);
});

test("a variant's inherited brick can be looked at but not changed from the variant", () => {
  const { backend, goblin } = setup();
  const cave = backend.addBeing({ name: "Cave Goblin", kind: "monster", variantOf: goblin });
  const aid = backend.node(cave).attachments[0]!.aid;
  assert.equal(backend.attachmentDetail(cave, aid).inheritedFrom!.name, "Goblin");
  assert.throws(() => backend.editAttachment(cave, aid, { overrides: { dice: "1d4" } }), /comes from its parent/);
});

test("Edit parent: the checklist shows the whole family, with who set their own value and who follows whom", () => {
  const { backend } = setup();
  const sword = backend.addItem({ name: "Sword", categoryId: null, variantOf: null });
  backend.setField(sword, "cost", "10 gp");
  backend.setField(sword, "weight", "3 lb.");
  const long = backend.addItem({ name: "Longsword", categoryId: null, variantOf: sword });
  const axe = backend.addItem({ name: "Axe", categoryId: null, variantOf: sword });
  backend.setField(axe, "cost", "12 gp");
  const dbl = backend.addItem({ name: "Double Axe", categoryId: null, variantOf: axe });

  const rows = backend.familyChecklist(sword, ["cost"], { cost: "Cost" });
  assert.deepEqual(
    rows.map((r) => [`${"  ".repeat(r.depth)}${r.name}`, r.note, r.canGet]),
    [
      ["Axe", "set its own Cost", false],
      ["  Double Axe", "follows Axe", false],
      ["Longsword", null, true],
    ],
  );

  // Everyone ticked: the Axe and its Double Axe keep the Axe's cost; the Longsword gets the change.
  backend.changeParent(sword, { cost: "15 gp", weight: "4 lb." }, null);
  assert.equal(backend.node(long).fields.cost, "15 gp");
  assert.equal(backend.node(axe).fields.cost, "12 gp");
  assert.equal(backend.node(dbl).fields.cost, "12 gp");
  assert.equal(backend.node(dbl).fields.weight, "4 lb.", "a value the Axe never touched flows all the way down");

  // Unticked: the Longsword keeps the old weight as its own (a pencil mark); the others get it.
  backend.changeParent(sword, { weight: "5 lb." }, [axe, dbl]);
  assert.equal(backend.node(long).fields.weight, "4 lb.");
  assert.deepEqual(backend.node(long).own, ["weight"]);
  assert.equal(backend.node(dbl).fields.weight, "5 lb.");
  assert.equal(backend.undo()!.label, "Changed Sword", "the whole change is one undo step");
  assert.equal(backend.node(long).fields.weight, "4 lb.");
  assert.deepEqual(backend.node(long).own, []);
});

test("Edit parent works for ability scores too, so 14 subraces can follow a change to the race", () => {
  const { backend, str } = setup();
  const elf = backend.addBeing({ name: "Elf", kind: "monster", variantOf: null });
  backend.setScore(elf, str, 10);
  const wood = backend.addBeing({ name: "Wood Elf", kind: "monster", variantOf: elf });
  const high = backend.addBeing({ name: "High Elf", kind: "monster", variantOf: elf });
  const key = `score_${str}`;
  backend.changeParent(elf, { [key]: { ability: link(str), score: 12 } }, [wood]);
  const score = (id: string) => backend.node(id).scores.find((s) => s.ability === str)!.score;
  assert.equal(score(wood), 12);
  assert.equal(score(high), 10, "unticked: keeps the old score as its own");
  assert.throws(() => backend.changeParent(elf, { "bad key": 1 }, null), /isn't a value/);
});
