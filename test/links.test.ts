import { test } from "node:test";
import assert from "node:assert/strict";
import { findLinks, getAt, link } from "../src/engine/index.ts";
import { makeFixture } from "./fixtures.ts";

test("every link is found, including inside nested attachments", () => {
  const value = {
    fields: { a: link("x"), list: [link("y"), 3] },
    attachments: [{ aid: "a1", brick: link("z"), children: [{ aid: "a2", brick: link("w"), children: [] }] }],
  };
  const found = findLinks(value).map((f) => f.to).sort();
  assert.deepEqual(found, ["w", "x", "y", "z"]);
  const deep = findLinks(value).find((f) => f.to === "w")!;
  assert.deepEqual(deep.path, ["attachments", { aid: "a1" }, "children", { aid: "a2" }, "brick"]);
  assert.deepEqual(getAt(value, deep.path), link("w"));
});

test("renaming never breaks links, because links use the permanent id", () => {
  const f = makeFixture();
  f.ws.edit(f.sys, f.str, (r) => (r.name = "Might"));
  assert.equal(f.ws.usedBy(f.world, f.str).length, 1);
  assert.equal(f.ws.get(f.world, f.str)!.name, "Might");
});

test("Used by is worked out from links: the attack and the hit points don't use the same ability", () => {
  const f = makeFixture();
  assert.deepEqual(f.ws.usedBy(f.world, f.con).map((s) => s.node), [f.hp]);
  const strUsers = f.ws.usedBy(f.world, f.str).map((s) => s.node);
  assert.deepEqual(strUsers, [f.weaponAttack]);
});
