// The promises from CLAUDE.md, Part 1, as tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import { link, redFlags } from "../src/engine/index.ts";
import { makeFixture } from "./fixtures.ts";

/** Builds a world where 214 things use Strength. */
function bigWorld() {
  const f = makeFixture();
  const ids: string[] = [];
  f.ws.transact("Made 213 skills", () => {
    for (let i = 0; i < 213; i++) ids.push(f.ws.create(f.world, "skill", `Skill ${i}`, { fields: { ability: link(f.str) } }));
  });
  return { ...f, skills: ids };
}

test("deleting Strength flags every link to it, grouped into one red flag", () => {
  const f = bigWorld();
  f.ws.delete(f.sys, f.str);
  const flags = redFlags(f.ws, f.world);
  assert.equal(flags.length, 1);
  assert.equal(flags[0]!.slots.length, 214);
  assert.equal(flags[0]!.title, "Strength removed: 214 things affected");
  assert.equal(flags[0]!.inBin, true);
});

test("nothing ever blocks you: a broken world still saves and keeps working", () => {
  const f = bigWorld();
  f.ws.delete(f.sys, f.str);
  const id = f.ws.create(f.world, "being", "Ogre");
  assert.ok(f.ws.exists(f.world, id));
  assert.doesNotThrow(() => JSON.stringify(f.ws.toFile()));
});

test("fixing 214 links is one undo step, and undo brings all 214 back", () => {
  const f = bigWorld();
  f.ws.delete(f.sys, f.str);
  const flag = redFlags(f.ws, f.world)[0]!;
  const steps = f.ws.history.length;
  f.ws.fixLinks(flag.slots, f.str, f.dex);
  assert.equal(f.ws.history.length, steps + 1);
  assert.equal(redFlags(f.ws, f.world).length, 0);
  assert.equal(f.ws.usedBy(f.world, f.dex).length, 214);
  f.ws.undo();
  assert.equal(redFlags(f.ws, f.world)[0]!.slots.length, 214);
  f.ws.redo();
  assert.equal(redFlags(f.ws, f.world).length, 0);
});

test("fixing from inside a world changes that world only", () => {
  const f = makeFixture();
  const other = f.ws.addLayer("world", "Pirate Seas", f.sys);
  f.ws.delete(f.sys, f.str);
  const flag = redFlags(f.ws, f.world)[0]!;
  f.ws.fixLinks(flag.slots, f.str, f.dex);
  assert.equal(redFlags(f.ws, f.world).length, 0);
  assert.equal(redFlags(f.ws, other).length, 1, "the other world is untouched");
});

test("removing a link from an attachment removes that brick, and undo puts it back", () => {
  const f = makeFixture();
  f.ws.delete(f.sys, f.weaponAttack);
  const flag = redFlags(f.ws, f.world)[0]!;
  f.ws.fixLinks(flag.slots, f.weaponAttack, null);
  assert.equal(f.ws.get(f.world, f.longsword)!.attachments.length, 0);
  f.ws.undo();
  assert.equal(f.ws.get(f.world, f.longsword)!.attachments.length, 1);
});

test("nothing is destroyed without a way back: restore brings it back and untouched links work again", () => {
  const f = bigWorld();
  const binId = f.ws.delete(f.sys, f.str);
  const toReconnect = f.ws.restore(binId);
  assert.equal(toReconnect.length, 0, "nothing was moved, so nothing needs reconnecting");
  assert.equal(redFlags(f.ws, f.world).length, 0);
  assert.equal(f.ws.usedBy(f.world, f.str).length, 214);
});

test("restore remembers what was moved, and offers to reconnect it (flagging what changed since)", () => {
  const f = bigWorld();
  const binId = f.ws.delete(f.sys, f.str);
  const flag = redFlags(f.ws, f.world)[0]!;
  f.ws.fixLinks(flag.slots, f.str, f.dex);
  // One skill is changed again afterwards.
  f.ws.setField(f.world, f.skills[0]!, "ability", link(f.con));
  const offers = f.ws.restore(binId);
  assert.equal(offers.length, 214);
  assert.equal(offers.filter((o) => o.changedSince).length, 1);
  f.ws.reconnect(offers.filter((o) => !o.changedSince).map((o) => o.slot), f.str);
  assert.equal(f.ws.usedBy(f.world, f.str).length, 213);
  assert.equal(f.ws.usedBy(f.world, f.con).length, 2, "the one changed since was left alone");
});

test("restoring a deleted parent can reconnect its promoted variants", () => {
  const f = makeFixture();
  const cave = f.ws.create(f.world, "being", "Cave Goblin", { parent: link(f.goblin), fields: { hp: 9 } });
  const binId = f.ws.delete(f.world, f.goblin);
  assert.equal(f.ws.get(f.world, cave)!.parent, null);
  const offers = f.ws.restore(binId);
  f.ws.reconnect(offers.map((o) => o.slot), f.goblin);
  const r = f.ws.resolve(f.world, cave)!;
  assert.equal(r.record.parent?.link, f.goblin);
  assert.deepEqual(r.ownFields.sort(), ["hp"], "copied values it no longer needs were dropped");
});

test("every change can be undone, including a delete", () => {
  const f = makeFixture();
  f.ws.delete(f.world, f.goblin);
  assert.equal(f.ws.exists(f.world, f.goblin), false);
  f.ws.undo();
  assert.equal(f.ws.exists(f.world, f.goblin), true);
  assert.equal(f.ws.bin.length, 0);
});

test("a step is all or nothing: if something fails halfway, nothing from it is kept", () => {
  const f = makeFixture();
  const before = JSON.stringify(f.ws.toFile().layers);
  assert.throws(() =>
    f.ws.transact("Half a job", () => {
      f.ws.setField(f.world, f.goblin, "hp", 99);
      f.ws.setField(f.world, f.goblin, "ac", 1);
      throw new Error("internet dropped");
    }),
  );
  assert.equal(JSON.stringify(f.ws.toFile().layers), before);
});

test("history labels say who made a change", () => {
  const f = makeFixture();
  f.ws.transact("AI: all swords use Dexterity", () => f.ws.setField(f.world, f.goblin, "hp", 8), "ai");
  const last = f.ws.history.at(-1)!;
  assert.equal(last.by, "ai");
  assert.equal(last.label, "AI: all swords use Dexterity");
});

test("emptying the bin is permanent: undo can't bring the item back afterwards", () => {
  const f = makeFixture();
  f.ws.delete(f.world, f.goblin);
  f.ws.emptyBin();
  f.ws.undo();
  assert.equal(f.ws.exists(f.world, f.goblin), false);
});

test("history has a size limit by age", () => {
  const f = makeFixture();
  let t = f.ws.now();
  f.ws.now = () => t;
  f.ws.setField(f.world, f.goblin, "hp", 8);
  const count = f.ws.history.length;
  t += 31 * 24 * 60 * 60 * 1000;
  f.ws.setField(f.world, f.goblin, "hp", 9);
  assert.equal(f.ws.history.length, 1, `old steps (${count}) dropped after 30 days`);
});
