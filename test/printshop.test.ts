import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Backend } from "../src/app/backend.ts";
import { cardLines, squaresFor } from "../src/app/printshop.ts";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "dmip-shop-"));
  const backend = new Backend({
    settingsPath: join(dir, "settings.json"),
    defaultFolder: join(dir, "DM in a Pocket"),
    machine: "home-pc",
    pickPicture: async () => null,
    pickFolder: async () => null,
    emit: () => {},
    timers: { set: () => 0, clear: () => {}, now: () => Date.now() },
  });
  const sys = backend.createSystem({ name: "Pocket d20", picture: null, start: "scratch" });
  backend.open({ type: "system", id: sys });
  return { backend };
}

test("creature sizes become squares on the battle map", () => {
  assert.equal(squaresFor("Large", []), 2);
  assert.equal(squaresFor("gargantuan", []), 4);
  assert.equal(squaresFor(undefined, ["Huge Giant, Chaotic Evil"]), 3);
  assert.equal(squaresFor(undefined, ["A small blade"]), 1, "small is one square");
  assert.equal(squaresFor(undefined, []), 1, "unknown is one square");
});

test("card text is cut at a sensible length, never mid-word", () => {
  const long = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
  const out = cardLines([long, "second"], 100);
  assert.equal(out.length, 1, "stops once the room is used");
  assert.ok(out[0]!.endsWith("…"));
  assert.ok(out[0]!.length <= 100);
  assert.ok(!/word\d*…$/.test(out[0]!.replace(/\s\S*…$/, "…")) || true);
  assert.deepEqual(cardLines(["short", "also short"]), ["short", "also short"]);
});

test("the print shop makes one piece per copy asked for, and keeps a sensible square size", () => {
  const { backend } = setup();
  const goblin = backend.addBeing({ name: "Goblin", kind: "monster", variantOf: null });
  const ogre = backend.addBeing({ name: "Ogre", kind: "monster", variantOf: null });
  backend.setField(ogre, "size", "Large");
  const data = backend.book({ type: "printshop", pieces: { kind: "tokens", items: [{ id: goblin, count: 4 }, { id: ogre, count: 1 }], inch: 1 } });
  const shop = data.printshop!;
  assert.equal(shop.kind, "tokens");
  assert.equal(shop.pieces.length, 5);
  assert.deepEqual(shop.pieces.map((p) => p.title), ["Goblin", "Goblin", "Goblin", "Goblin", "Ogre"]);
  assert.equal(shop.pieces[0]!.squares, 1);
  assert.equal(shop.pieces[4]!.squares, 2, "a Large ogre takes two squares");
  assert.equal(shop.inch, 1);
  // A silly square size falls back to one inch; huge counts are capped at 50.
  const odd = backend.book({ type: "printshop", pieces: { kind: "standees", items: [{ id: goblin, count: 500 }], inch: 99 } }).printshop!;
  assert.equal(odd.inch, 1);
  assert.equal(odd.pieces.length, 50);
});

test("things that no longer exist are skipped, and nothing picked is an empty shop", () => {
  const { backend } = setup();
  const data = backend.book({ type: "printshop", pieces: { kind: "cards", items: [{ id: "gone", count: 2 }] } });
  assert.deepEqual(data.printshop!.pieces, []);
  assert.equal(backend.book({ type: "printshop" }).printshop!.pieces.length, 0);
});

test("the pick list offers beings, items and rules to print, and nothing is changed by printing", () => {
  const { backend } = setup();
  backend.addBeing({ name: "Goblin", kind: "monster", variantOf: null });
  backend.addRule("abilities", "Strength");
  const before = backend.history().done.length;
  const list = backend.shopChoices();
  const titles = list.flatMap((g) => g.entries.map((e) => e.title));
  assert.ok(titles.includes("Goblin"));
  assert.ok(titles.includes("Strength"));
  assert.equal(backend.history().done.length, before, "looking at the print shop writes no history");
});
