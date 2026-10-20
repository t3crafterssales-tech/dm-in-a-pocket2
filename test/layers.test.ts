import { test } from "node:test";
import assert from "node:assert/strict";
import { EngineError } from "../src/engine/index.ts";
import { makeFixture } from "./fixtures.ts";

test("a world needs a system (the only fixed order)", () => {
  const f = makeFixture();
  assert.throws(() => f.ws.addLayer("world", "Nowhere"), EngineError);
  assert.throws(() => f.ws.addLayer("world", "On a world", f.world), EngineError);
});

test("a change made inside a world stays in that world", () => {
  const f = makeFixture();
  const other = f.ws.addLayer("world", "Pirate Seas", f.sys);
  f.ws.setField(f.world, f.str, "max", 20);
  assert.equal(f.ws.get(f.world, f.str)!.fields.max, 20);
  assert.equal(f.ws.get(other, f.str)!.fields.max, 18);
  assert.equal(f.ws.get(f.sys, f.str)!.fields.max, 18);
  assert.equal(f.ws.layer(f.sys).nodes[f.str]!.fields.max, 18, "the system itself is untouched");
});

test("a change to the system flows down to every world that didn't change it", () => {
  const f = makeFixture();
  const other = f.ws.addLayer("world", "Pirate Seas", f.sys);
  f.ws.setField(f.world, f.str, "max", 20);
  f.ws.setField(f.sys, f.str, "max", 19);
  f.ws.setField(f.sys, f.str, "min", 1);
  assert.equal(f.ws.get(other, f.str)!.fields.max, 19);
  assert.equal(f.ws.get(f.world, f.str)!.fields.max, 20, "the world set its own value");
  assert.equal(f.ws.get(f.world, f.str)!.fields.min, 1, "values the world never touched still flow down");
});

test("a world can go back to following its system", () => {
  const f = makeFixture();
  f.ws.setField(f.world, f.str, "max", 20);
  f.ws.edit(f.world, f.str, (r) => (r.fields.max = 18));
  assert.equal(f.ws.layer(f.world).changes[f.str], undefined, "no leftover change once it matches again");
});

test("system variants: My d20 Space inherits from My d20, which inherits from d20 Basic", () => {
  const f = makeFixture();
  const mine = f.ws.addLayer("system", "My d20", f.sys);
  const space = f.ws.addLayer("system", "My d20 Space", mine);
  const duneWorld = f.ws.addLayer("world", "Dune", space);
  f.ws.setField(mine, f.dex, "max", 20);
  f.ws.setField(f.sys, f.dex, "label", "AGI");
  const seen = f.ws.get(duneWorld, f.dex)!;
  assert.equal(seen.fields.max, 20);
  assert.equal(seen.fields.label, "AGI");
  assert.equal(f.ws.get(f.sys, f.dex)!.fields.max, 18, "changes never travel up");
});

test("deleting a system rule from inside one world hides it in that world only", () => {
  const f = makeFixture();
  const other = f.ws.addLayer("world", "Pirate Seas", f.sys);
  f.ws.delete(f.world, f.prone);
  assert.equal(f.ws.exists(f.world, f.prone), false);
  assert.equal(f.ws.exists(other, f.prone), true);
  assert.equal(f.ws.exists(f.sys, f.prone), true);
});
