import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { link } from "../src/engine/index.ts";
import { Backend } from "../src/app/backend.ts";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "dmip-flags-"));
  const make = () =>
    new Backend({
      settingsPath: join(dir, "settings.json"),
      defaultFolder: join(dir, "DM in a Pocket"),
      machine: "home-pc",
      pickPicture: async () => null,
      pickFolder: async () => null,
      emit: () => {},
      timers: { set: () => 0, clear: () => {}, now: () => Date.now() },
    });
  const backend = make();
  const sys = backend.createSystem({ name: "My d20", picture: null, start: "scratch" });
  backend.open({ type: "system", id: sys });
  const str = backend.addRule("abilities", "Strength");
  const dex = backend.addRule("abilities", "Dexterity");
  const hp = backend.addRule("resources", "Hit points");
  backend.setField(hp, "maximum", { formula: [{ op: "+", ability: link(str), use: "score" }, { op: "+", number: 10 }] });
  const claw = backend.addBrick("attack", "Claw");
  backend.setField(claw, "ability", link(str));
  const goblin = backend.addBeing({ name: "Goblin", kind: "monster", variantOf: null });
  backend.setField(goblin, "hp", 7);
  backend.setScore(goblin, str, 8);
  backend.attach({ targets: [goblin], bricks: [claw] });
  return { backend, sys, str, dex, hp, claw, goblin, make };
}

const red = (b: Backend) => b.flagPanel().blocks.filter((x) => x.color === "red");

test("deleting Strength gives one red block for everything it broke, marked new until seen", () => {
  const { backend, str } = setup();
  assert.equal(red(backend).length, 0);
  backend.deleteNode(str);
  const blocks = red(backend);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]!.title, "Strength removed: 3 things affected");
  assert.deepEqual(blocks[0]!.nodes.map((n) => n.name).sort(), ["Claw", "Goblin", "Hit points"]);
  assert.equal(blocks[0]!.isNew, true);
  assert.equal(backend.flagPanel().counts.red, 1);
  assert.equal(backend.flagPanel().counts.new, 1);
  backend.markSeen([blocks[0]!.key]);
  assert.equal(red(backend)[0]!.isNew, false);
  assert.equal(backend.flagPanel().counts.new, 0);
});

test("fix by hand: tick some, point them at Dexterity, the rest stay counted; then remove the last link", () => {
  const { backend, str, dex, claw, goblin } = setup();
  backend.deleteNode(str);
  const key = red(backend)[0]!.key;
  const d = backend.missingDetail(key);
  assert.equal(d.missingName, "Strength");
  assert.ok(d.binId, "it's in the recycle bin");
  assert.deepEqual(d.candidates.map((c) => c.name), ["Dexterity"]);
  assert.deepEqual(d.slots.map((s) => [s.nodeName, s.where]).sort(), [["Claw", "its ability"], ["Goblin", "an ability score"], ["Hit points", "its maximum"]]);

  const pick = d.slots.filter((s) => s.nodeName !== "Goblin").map((s) => s.slot);
  assert.equal(backend.fixMissing(key, pick, dex).label, "2 things now use Dexterity instead of Strength");
  assert.equal(red(backend)[0]!.title, "Strength removed: 1 thing affected", "the counter drops");
  const green = backend.flagPanel().blocks.find((b) => b.color === "green")!;
  assert.equal(green.title, "2 things now use Dexterity instead of Strength");
  assert.equal(green.canUndo, true);
  assert.match(backend.node(claw).summary, /Dexterity/);

  const rest = backend.missingDetail(key).slots.map((s) => s.slot);
  backend.fixMissing(key, rest, null);
  assert.equal(red(backend).length, 0, "the block is gone at zero");
  assert.equal(backend.node(goblin).scores.length, 0);
  // The older green block can no longer be undone from the panel; the newest can.
  const greens = backend.flagPanel().blocks.filter((b) => b.color === "green");
  assert.deepEqual(greens.map((g) => g.canUndo), [true, false]);
});

test("Undo on a green block brings the flag back", () => {
  const { backend, str, dex } = setup();
  backend.deleteNode(str);
  const key = red(backend)[0]!.key;
  backend.fixMissing(key, backend.missingDetail(key).slots.map((s) => s.slot), dex);
  assert.equal(red(backend).length, 0);
  const green = backend.flagPanel().blocks.find((b) => b.color === "green")!;
  backend.undoLog(green.key);
  assert.equal(red(backend).length, 1);
  assert.equal(backend.flagPanel().blocks.filter((b) => b.color === "green").length, 0);
});

test("a flag that clears itself (here by Undo of the delete) leaves one blue notice", () => {
  const { backend, str } = setup();
  backend.deleteNode(str);
  backend.undo();
  const blue = backend.flagPanel().blocks.filter((b) => b.color === "blue");
  assert.equal(blue.length, 1);
  assert.match(blue[0]!.title, /^1 flag cleared: Strength removed: 3 things affected$/);
});

test("Ignore hides one flag behind Show ignored; Ignore all like this works for yellow only; Mark as fine turns green", () => {
  const { backend, goblin } = setup();
  const boss = backend.addBeing({ name: "Goblin Boss", kind: "monster", variantOf: null });
  const archer = backend.addBeing({ name: "Goblin Archer", kind: "monster", variantOf: null });
  const yellow = () => backend.flagPanel().blocks.filter((b) => b.color === "yellow");
  assert.equal(yellow().length, 2, "two goblins with no hit points or attacks");
  backend.ignoreFlag(yellow()[0]!.key);
  assert.equal(yellow().length, 1);
  assert.equal(backend.flagPanel().ignored.length, 1);
  backend.unignore(backend.flagPanel().ignored[0]!.key);
  assert.equal(yellow().length, 2);

  backend.ignoreKind("empty-sheet");
  assert.equal(yellow().length, 0);
  backend.unignore("empty-sheet");
  assert.throws(() => backend.ignoreKind("missing"), /one at a time/);

  const r = backend.markGood(yellow()[0]!.key);
  assert.match(r.label, /^Marked as fine: /);
  assert.equal(yellow().length, 1);
  assert.ok(backend.flagPanel().blocks.some((b) => b.color === "green" && b.title === r.label));
  assert.throws(() => backend.markGood("missing:nothing"), /cleared already/);
  void goblin;
  void boss;
  void archer;
});

test("the panel's memory (ignored flags, green and blue blocks) is saved with the system and comes back", () => {
  const { backend, sys, make } = setup();
  backend.addBeing({ name: "Goblin Boss", kind: "monster", variantOf: null });
  const y = backend.flagPanel().blocks.find((b) => b.color === "yellow")!;
  backend.markGood(y.key);
  backend.goHome();
  const again = make();
  again.open({ type: "system", id: sys });
  assert.ok(!again.flagPanel().blocks.some((b) => b.key === y.key), "still ignored");
  assert.ok(again.flagPanel().blocks.some((b) => b.color === "green" && b.title.startsWith("Marked as fine")));
  again.clearLog();
  assert.equal(again.flagPanel().counts.green, 0);
});

test("world rules: 'No metal' flags the Iron Helm in red, and I meant that makes a deliberate exception", () => {
  const { backend } = setup();
  const rule = backend.addRule("combat", "No metal");
  backend.setField(rule, "forbid", { field: "material", equals: "Metal" });
  const helm = backend.addItem({ name: "Iron Helm", categoryId: null, variantOf: null });
  backend.setField(helm, "material", "metal");
  const flag = red(backend).find((b) => b.kind === "rule")!;
  assert.equal(flag.title, '1 thing breaks "No metal"');
  assert.deepEqual(flag.nodes.map((n) => n.name), ["Iron Helm"]);
  assert.throws(() => backend.ignoreKind("rule"), /one at a time/);
  assert.equal(backend.meantThat(flag.key, [helm]).label, 'Iron Helm is a deliberate exception to "No metal"');
  assert.equal(red(backend).length, 0);
  backend.undo();
  assert.equal(red(backend).length, 1, "undo takes the exception away again");
});

test("check categories: each can be switched off or made stricter in World settings, and red never switches off", () => {
  const { backend, sys, make, goblin } = setup();
  const boss = backend.addBeing({ name: "Goblin Boss", kind: "monster", variantOf: null });
  const yellow = (b: Backend) => b.flagPanel().blocks.filter((x) => x.color === "yellow");
  assert.ok(yellow(backend).some((f) => f.category === "filing"));
  backend.setCheck("filing", { on: false });
  assert.ok(!yellow(backend).some((f) => f.category === "filing"), "Filing switched off");
  assert.equal(backend.checkSettings().filing.on, false);
  assert.throws(() => backend.setCheck("filing", { level: "extreme" as never }), /Relaxed, Normal or Strict/);
  backend.setCheck("balance", { level: "strict" });
  backend.goHome();
  const again = make();
  again.open({ type: "system", id: sys });
  assert.deepEqual(again.checkSettings().filing, { on: false, level: "normal" }, "kept with the system");
  assert.equal(again.checkSettings().balance.level, "strict");
  void goblin;
  void boss;
});
