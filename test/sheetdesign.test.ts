import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Backend } from "../src/app/backend.ts";
import { GRID, MIN_SPAN, defaultLayout, hideLines, moveGroup, normalizeLayout, paperSheet, resizeGroup, sheetGroups, tickLines } from "../src/app/sheetdesign.ts";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "dmip-sheetdesign-"));
  const backend = new Backend({
    settingsPath: join(dir, "settings.json"),
    defaultFolder: join(dir, "DM in a Pocket"),
    machine: "home-pc",
    pickPicture: async () => null,
    pickFolder: async () => null,
    emit: () => {},
    timers: { set: () => 0, clear: () => {}, now: () => Date.now() },
  });
  const sys = backend.createSystem({ name: "d20 Basic", picture: null, start: "d20" });
  const world = backend.createWorld({ name: "Greyhollow", picture: null, systemId: sys });
  backend.open({ type: "world", id: world });
  const input = backend.makeItForMe();
  const id = backend.createCharacter({ ...input, name: "Mira", player: "Randy", gold: "15 gp" });
  return { backend, sys, world, id };
}

test("a sheet is made of groups, each thing in one group, and empty ones are listed so they can be ticked", () => {
  const { backend, id } = setup();
  const groups = sheetGroups(backend.characterView(id));
  const ids = groups.map((g) => g.id);
  for (const want of ["name", "portrait", "combat", "abilities", "inventory", "features", "appearance", "notes"]) assert.ok(ids.includes(want), want);
  const keys = groups.flatMap((g) => g.lines.map((l) => l.key));
  assert.equal(new Set(keys).size, keys.length, "every line belongs to exactly one group");
  assert.equal(groups.find((g) => g.id === "abilities")!.lines.length, 6, "one line per ability the game has");
});

test("the default layout holds every group, at sensible widths, and a stored layout is repaired to fit", () => {
  const { backend, id } = setup();
  const groups = sheetGroups(backend.characterView(id));
  const d = defaultLayout(groups);
  assert.deepEqual(d.groups.map((g) => g.id), groups.map((g) => g.id));
  assert.ok(d.groups.every((g) => g.span >= MIN_SPAN && g.span <= GRID));
  // Unknown groups go, duplicates go, silly widths are clamped, groups it lacks come back at the end.
  const fixed = normalizeLayout({ groups: [{ id: "combat", span: 99 }, { id: "nonsense", span: 4 }, { id: "combat", span: 4 }, { id: "name", span: 1 }], unticked: ["hp", "hp", 5], hidden: ["hp", "ac"] }, groups);
  assert.deepEqual(fixed.groups.slice(0, 2), [{ id: "combat", span: GRID }, { id: "name", span: MIN_SPAN }]);
  assert.equal(fixed.groups.length, groups.length);
  assert.deepEqual(fixed.unticked, ["hp"]);
  assert.deepEqual(fixed.hidden, ["hp"], "hidden only means something for unticked lines");
  assert.deepEqual(normalizeLayout("junk", groups), d);
});

test("moving and resizing groups", () => {
  const { backend, id } = setup();
  const l = defaultLayout(sheetGroups(backend.characterView(id)));
  const moved = moveGroup(l, "inventory", 0);
  assert.equal(moved.groups[0]!.id, "inventory", "inventory at the top if you like");
  assert.equal(moved.groups.length, l.groups.length);
  assert.equal(resizeGroup(l, "combat", 1).groups.find((g) => g.id === "combat")!.span, MIN_SPAN, "never narrower than the minimum");
  assert.equal(resizeGroup(l, "combat", 6).groups.find((g) => g.id === "combat")!.span, 6);
  assert.equal(moveGroup(l, "missing", 0), l);
});

test("by default everything prints, and empty lines and groups disappear", () => {
  const { backend, id } = setup();
  const v = backend.characterView(id);
  const sheet = paperSheet(v, null);
  const all = sheet.rows.flat();
  const lines = all.flatMap((g) => g.lines);
  assert.ok(lines.some((l) => l.label === "Character" && l.values[0] === "Mira"));
  assert.ok(lines.every((l) => !l.blank), "nothing is blank until someone unticks it");
  assert.ok(!all.some((g) => g.id === "notes"), "a Notes group with nothing in it is left off");
  for (const row of sheet.rows) assert.ok(row.reduce((n, g) => n + g.span, 0) <= GRID, "a row never holds more than the page is wide");
});

test("unticked lines print blank to write in, or vanish when hidden; the name can be left off too", () => {
  const { backend, id } = setup();
  const v = backend.characterView(id);
  let l = defaultLayout(sheetGroups(v));
  l = tickLines(l, ["hpNow", "hp", "ac", "money", "name"], false);
  let lines = paperSheet(v, l).rows.flat().flatMap((g) => g.lines);
  const hp = lines.find((x) => x.label === "Hit points now")!;
  assert.equal(hp.blank, true);
  assert.deepEqual(hp.values, [], "a blank line keeps its label but not its value");
  const nm = lines.find((x) => x.label === "Character")!;
  assert.deepEqual([nm.blank, nm.values], [true, []], "a deliberate untick beats every other rule, even for the name");
  l = hideLines(l, ["hp", "name", "speed"], true);
  lines = paperSheet(v, l).rows.flat().flatMap((g) => g.lines);
  assert.ok(!lines.some((x) => x.label === "Character"), "hidden completely, the name is gone from the paper");
  assert.ok(!lines.some((x) => x.label === "Most hit points"), "hidden completely");
  assert.ok(lines.some((x) => x.label === "Speed" && !x.blank), "hiding a ticked line does nothing");
  // Ticking again brings it back, and out of hiding.
  l = tickLines(l, ["hp"], true);
  assert.ok(!l.hidden.includes("hp"));
  assert.ok(paperSheet(v, l).rows.flat().flatMap((g) => g.lines).some((x) => x.label === "Most hit points" && !x.blank));
});

test("the layout is the character's own, from the Codex, or the system's, and each change is one undoable step", () => {
  const { backend, id } = setup();
  assert.equal(backend.sheetDesign(id).source.kind, "default");
  const base = backend.sheetDesign(id).layout;
  const steps = backend.history().done.length;
  backend.setSheetLayout(id, moveGroup(base, "inventory", 0));
  assert.equal(backend.history().done.length, steps + 1);
  const mine = backend.sheetDesign(id);
  assert.equal(mine.source.kind, "own");
  assert.equal(mine.layout.groups[0]!.id, "inventory");
  backend.undo();
  assert.equal(backend.sheetDesign(id).source.kind, "default", "undo puts it back");
  backend.redo();
  // Kept in the Codex and used by name, then the system's default for everyone.
  const kept = backend.saveSheetLayout("Inventory first", mine.layout, false);
  assert.deepEqual(backend.sheetLayouts().map((x) => x.name), ["Inventory first"]);
  backend.useSheetLayout(id, kept);
  assert.deepEqual(backend.sheetDesign(id).source, { kind: "codex", name: "Inventory first" });
  backend.useSheetLayout(id, null);
  assert.equal(backend.sheetDesign(id).source.kind, "default");
  backend.saveSheetLayout("Table default", resizeGroup(base, "combat", 6), true);
  const system = backend.sheetDesign(id);
  assert.deepEqual(system.source, { kind: "system", name: "Table default" });
  assert.equal(system.layout.groups.find((g) => g.id === "combat")!.span, 6);
  backend.setSheetLayout(id, moveGroup(base, "inventory", 0));
  assert.equal(backend.sheetDesign(id).source.kind, "own", "a player's adjustment stays theirs");
  backend.setSheetLayout(id, null);
  assert.equal(backend.sheetDesign(id).source.kind, "system", "Use the system's goes back");
});

test("saving a layout again with the same name replaces it, and only one layout is the default", () => {
  const { backend, id } = setup();
  const base = backend.sheetDesign(id).layout;
  const a = backend.saveSheetLayout("Plain", base, true);
  const again = backend.saveSheetLayout("Plain", resizeGroup(base, "combat", 4), true);
  assert.equal(again, a);
  const b = backend.saveSheetLayout("Other", base, true);
  const list = backend.sheetLayouts();
  assert.equal(list.length, 2);
  assert.deepEqual(list.filter((x) => x.isDefault).map((x) => x.id), [b]);
});

test("the sheet prints through the book path with the layout in force, or one being tried", () => {
  const { backend, id } = setup();
  const plain = backend.book({ type: "sheet", character: id });
  assert.ok(plain.sheet);
  assert.equal(plain.book.subtitle, "Character sheet");
  const tried = backend.book({ type: "sheet", character: id, sheetLayout: tickLines(backend.sheetDesign(id).layout, ["hpNow"], false) });
  assert.ok(tried.sheet!.rows.flat().flatMap((g) => g.lines).some((l) => l.label === "Hit points now" && l.blank));
  assert.ok(!backend.sheetDesign(id).layout.unticked.includes("hpNow"), "trying a layout on paper keeps nothing");
});
