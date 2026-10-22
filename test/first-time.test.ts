import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Backend } from "../src/app/backend.ts";

function fresh(settings?: object) {
  const dir = mkdtempSync(join(tmpdir(), "dmip-first-"));
  if (settings) writeFileSync(join(dir, "settings.json"), JSON.stringify(settings));
  return new Backend({ settingsPath: join(dir, "settings.json"), defaultFolder: join(dir, "DM in a Pocket"), machine: "pc", pickPicture: async () => null, pickFolder: async () => null, emit: () => {}, timers: { set: () => 0, clear: () => {}, now: () => Date.now() } });
}

test("a new computer gets the welcome; someone who used an older version doesn't", () => {
  assert.equal(fresh().firstTime().welcomed, false);
  assert.equal(fresh({ mainFolder: null }).firstTime().welcomed, true);
  const b = fresh();
  b.setFirstTime({ welcomed: true, tipSeen: "Rules" });
  assert.deepEqual([b.firstTime().welcomed, b.firstTime().tipsSeen], [true, ["Rules"]]);
});

test("the sample valley: a system, a world and a module with encounters, a map, a table and a handout", () => {
  const b = fresh();
  const s = b.makeSample();
  assert.deepEqual(b.firstTime().sample, s);
  assert.equal(b.makeSample().module, s.module, "made once; Help brings it back only if it's gone");
  b.open({ type: "module", id: s.module });
  const enc = b.encounterTree();
  assert.equal(enc.length >= 4, true);
  const codex = b.codex();
  assert.equal(codex.find((x) => x.key === "maps")!.entries.length, 1);
  assert.equal(codex.find((x) => x.key === "journal")!.entries.length, 1);
  assert.ok(codex.find((x) => x.key === "tables")!.entries.some((e) => e.name === "Road encounters"));
  const map = b.mapView(codex.find((x) => x.key === "maps")!.entries[0]!.id);
  assert.equal(map.pins.filter((p) => p.target).length, 6, "pins open the places and encounters");
  assert.equal(b.flags().filter((f) => f.color === "red").length, 0, "nothing broken in the sample");
  const r = b.rollTable(codex.find((x) => x.key === "tables")!.entries.find((e) => e.name === "Road encounters")!.id);
  assert.ok(r.text.length > 5);
  assert.ok(b.firstTime().stepsDone.includes("roll"), "rolling on a table ticks the first steps");
});

test("the book designer: leave things out, front pages from the journal, contents and index ticks, saved books", () => {
  const b = fresh();
  const s = b.makeSample();
  b.open({ type: "world", id: s.world });
  const all = b.bookContents({ type: "monsters" });
  const monsters = all.flatMap((c) => c.entries);
  assert.ok(monsters.length > 50);
  const giants = monsters.filter((e) => /giant/i.test(e.title)).map((e) => e.id);
  const leaveOut = monsters.map((e) => e.id).filter((id) => !giants.includes(id));
  const book = b.book({ type: "monsters", leaveOut, index: false, contents: false });
  const kept = book.book.chapters.flatMap((c) => c.entries.map((e) => e.title));
  assert.ok(kept.length >= 1 && kept.every((t) => /giant/i.test(t)), "a monster manual of only the giants");
  assert.deepEqual(book.book.index, []);
  assert.equal(book.contents, false);
  const cover = b.createPage("Cover", "Front pages");
  const credits = b.createPage("Credits", "Front pages");
  b.setPage(cover, { priority: 1 });
  b.setPage(credits, { priority: 2 });
  assert.deepEqual(b.book({ type: "players" }).front!.map((f) => f.title), ["Cover", "Credits"]);
  assert.deepEqual(b.book({ type: "players", frontOff: [credits] }).front!.map((f) => f.title), ["Cover"]);
  b.saveBookLayout("Giants", { type: "monsters", leaveOut });
  assert.equal(b.bookLayouts()[0]!.request.leaveOut!.length, leaveOut.length);
  assert.equal(b.codex().find((x) => x.key === "layouts")!.entries.length, 1, "saved in the Codex");
});
