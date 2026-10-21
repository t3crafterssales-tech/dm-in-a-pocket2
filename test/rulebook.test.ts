import { STANDARD_CORE_TEXT } from "../src/app/codex-lists.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { link } from "../src/engine/index.ts";
import { Backend } from "../src/app/backend.ts";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "dmip-book-"));
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

test("the rulebook prints what the Rules tab says, in the same words", () => {
  const { backend } = setup();
  const str = backend.addRule("abilities", "Strength");
  backend.setField(str, "label", "STR");
  backend.addRule("abilities", "Dexterity");
  const hp = backend.addRule("resources", "Hit points");
  backend.setField(hp, "maximum", { formula: [{ op: "+", ability: link(str), use: "score" }, { op: "+", number: 10 }] });
  backend.addRule("core", "The core check");
  const { book } = backend.book({ type: "players" });
  const ch = (id: string) => book.chapters.find((c) => c.id === id)!;
  assert.deepEqual(ch("abilities").entries.map((e) => e.title), ["Strength", "Dexterity"], "in the order they were made");
  assert.equal(ch("abilities").entries[0]!.stats, "Short label STR");
  assert.deepEqual(ch("abilities").entries[0]!.paragraphs, ["Scores from 3 to 18; its bonus is (score - 10) / 2, rounded down."]);
  assert.deepEqual(ch("resources").entries[0]!.paragraphs, ["Maximum Strength score + 10; starts full; recovers each long rest."]);
  // A new core check starts with the standard wording for its kind (backlog 1), then the summary.
  assert.deepEqual(ch("core").entries[0]!.paragraphs, [STANDARD_CORE_TEXT.rollOver, "Roll d20 + bonus; meet or beat the difficulty to succeed."]);
});

test("a core check's standard wording follows its kind, until the user writes their own", () => {
  const { backend } = setup();
  const core = backend.addRule("core", "The core check");
  assert.equal(backend.node(core).text, STANDARD_CORE_TEXT.rollOver);
  backend.setField(core, "family", "rollUnder");
  assert.equal(backend.node(core).text, STANDARD_CORE_TEXT.rollUnder, "the standard wording changes with the kind");
  backend.undo();
  assert.equal(backend.node(core).text, STANDARD_CORE_TEXT.rollOver, "one undo puts both back");
  backend.setText(core, "Roll a d20 and pray.");
  backend.setField(core, "family", "pool");
  assert.equal(backend.node(core).text, "Roll a d20 and pray.", "your own words are never replaced");
});

test("a monster's effect names its brick, and points at the condition it causes", () => {
  const { backend } = setup();
  const poisoned = backend.addRule("conditions", "Poisoned");
  const bite = backend.addBrick("effect", "Poison Bite");
  backend.setField(bite, "condition", link(poisoned));
  const goblin = backend.addBeing({ name: "Goblin", kind: "monster", variantOf: null });
  backend.attach({ targets: [goblin], bricks: [bite] });
  const data = backend.book({ type: "everything", author: "Jeff" });
  const g = data.book.chapters.find((c) => c.id === "monsters")!.entries[0]!;
  assert.ok(g.paragraphs.includes("Poison Bite. The target is Poisoned."));
  assert.deepEqual(g.mentions, [poisoned]);
  assert.equal(data.names[poisoned], "Poisoned");
  assert.ok(data.book.credits.includes("Created by Jeff."));
  assert.equal(data.pageSize, "Letter");
});

test("book choices list every book type with its usual chapters; unknown types fall back to everything", () => {
  const { backend } = setup();
  const c = backend.bookChoices();
  assert.deepEqual(c.types.map((t) => t.title), ["Player's Handbook", "Monster Manual", "GM Guide", "World Guide", "Complete Rulebook"]);
  backend.addBeing({ name: "Goblin", kind: "monster", variantOf: null });
  assert.equal(backend.book({ type: "nonsense" as never }).book.subtitle, "Complete Rulebook");
  assert.deepEqual(backend.book({ type: "everything", chapters: ["monsters"] }).book.chapters.map((x) => x.title), ["Monsters"]);
  assert.equal(backend.book({ type: "players", pageSize: "A4" }).pageSize, "A4");
});
