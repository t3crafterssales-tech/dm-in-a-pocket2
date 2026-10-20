import { test } from "node:test";
import assert from "node:assert/strict";
import { EngineError, link } from "../src/engine/index.ts";
import { makeFixture } from "./fixtures.ts";

function weapons() {
  const f = makeFixture();
  const { ws, world } = f;
  const sword = ws.create(world, "item", "Basic Melee Weapon", { template: true, fields: { dice: "1d8", material: "Metal" } });
  const long = ws.create(world, "item", "Longsword II", { parent: link(sword) });
  const axe = ws.create(world, "item", "Axe", { parent: link(sword), fields: { dice: "1d12" } });
  const double = ws.create(world, "item", "Double Axe", { parent: link(axe) });
  const throwing = ws.create(world, "item", "Throwing Axe", { parent: link(axe) });
  return { ...f, sword, long, axe, double, throwing };
}

test("a variant inherits everything it didn't change, through every generation", () => {
  const w = weapons();
  const d = w.ws.resolve(w.world, w.double)!;
  assert.equal(d.fields.dice, "1d12", "follows the Axe");
  assert.equal(d.fields.material, "Metal", "follows the template");
  assert.deepEqual(d.ownFields, []);
});

test("a parent's change reaches every generation until something set that value itself", () => {
  const w = weapons();
  w.ws.changeDown(w.world, w.sword, { dice: "1d10", fire: "1d4" });
  assert.equal(w.ws.resolve(w.world, w.long)!.fields.dice, "1d10");
  assert.equal(w.ws.resolve(w.world, w.axe)!.fields.dice, "1d12", "the Axe set its own damage");
  assert.equal(w.ws.resolve(w.world, w.double)!.fields.dice, "1d12", "the Double Axe follows the Axe");
  assert.equal(w.ws.resolve(w.world, w.double)!.fields.fire, "1d4", "untouched values flow all the way down");
});

test("the checklist: unticked variants keep the old value, and unticking protects the whole branch", () => {
  const w = weapons();
  w.ws.changeDown(w.world, w.sword, { material: "Bronze" }, new Set([w.long]));
  assert.equal(w.ws.resolve(w.world, w.long)!.fields.material, "Bronze");
  assert.equal(w.ws.resolve(w.world, w.axe)!.fields.material, "Metal");
  assert.ok(w.ws.resolve(w.world, w.axe)!.ownFields.includes("material"), "kept as its own value (pencil mark)");
  assert.equal(w.ws.resolve(w.world, w.double)!.fields.material, "Metal", "protected with its branch");
});

test("the checklist: a grandchild ticked on its own gets the change even if its parent didn't", () => {
  const w = weapons();
  w.ws.changeDown(w.world, w.sword, { material: "Bronze" }, new Set([w.long, w.double]));
  assert.equal(w.ws.resolve(w.world, w.axe)!.fields.material, "Metal");
  assert.equal(w.ws.resolve(w.world, w.double)!.fields.material, "Bronze");
  assert.equal(w.ws.resolve(w.world, w.throwing)!.fields.material, "Metal");
});

test("the family tree shows who set the field themselves", () => {
  const w = weapons();
  const tree = w.ws.family(w.world, w.sword, "dice");
  const axe = tree.children.find((c) => c.id === w.axe)!;
  assert.equal(axe.ownsField, true);
  assert.equal(axe.children.length, 2);
  assert.equal(tree.children.find((c) => c.id === w.long)!.ownsField, false);
});

test("a variant can't become its own ancestor", () => {
  const w = weapons();
  assert.throws(() => w.ws.setParent(w.world, w.sword, w.double), EngineError);
  assert.throws(() => w.ws.setParent(w.world, w.axe, w.axe), EngineError);
});

test("variants show their parent's bricks as inherited", () => {
  const f = makeFixture();
  const cave = f.ws.create(f.world, "being", "Cave Goblin", { parent: link(f.goblin) });
  f.ws.attach(f.world, cave, f.fire);
  const r = f.ws.resolve(f.world, cave)!;
  assert.equal(r.attachments.length, 2);
  assert.equal(r.attachments[0]!.from, null, "its own brick");
  assert.equal(r.attachments[1]!.from, f.goblin, "from the Goblin");
});

test("deleting a parent promotes its variants, and they keep working exactly as before", () => {
  const w = weapons();
  const before = w.ws.resolve(w.world, w.double)!.fields;
  w.ws.delete(w.world, w.axe);
  const after = w.ws.resolve(w.world, w.double)!;
  assert.deepEqual(after.fields, before);
  assert.equal(after.record.parent, null);
  // The template change no longer reaches it, because it stands alone now.
  w.ws.changeDown(w.world, w.sword, { material: "Bronze" });
  assert.equal(w.ws.resolve(w.world, w.double)!.fields.material, "Metal");
});

test("brick originals: sheets follow changes to the original, unless unticked", () => {
  const f = makeFixture();
  const shortsword = f.ws.create(f.world, "item", "Shortsword");
  const aid = f.ws.attach(f.world, shortsword, f.weaponAttack);
  f.ws.changeBrick(f.sys, f.weaponAttack, { damageType: "piercing" });
  const att = f.ws.get(f.world, shortsword)!.attachments.find((a) => a.aid === aid)!;
  assert.equal(att.overrides.damageType, undefined, "follows the original");
  f.ws.changeBrick(f.world, f.weaponAttack, { dice: "1d4" }, new Set());
  const att2 = f.ws.get(f.world, shortsword)!.attachments.find((a) => a.aid === aid)!;
  assert.equal(att2.overrides.dice, "1d6", "unticked: keeps the old value");
});
