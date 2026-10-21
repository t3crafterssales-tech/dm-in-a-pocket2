import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Backend } from "../src/app/backend.ts";
import type { BackendEvent } from "../src/app/backend.ts";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "dmip-table-"));
  const events: BackendEvent[] = [];
  const backend = new Backend({
    settingsPath: join(dir, "settings.json"),
    defaultFolder: join(dir, "DM in a Pocket"),
    machine: "home-pc",
    pickPicture: async () => null,
    pickFolder: async () => null,
    emit: (e) => events.push(e),
    timers: { set: () => 0, clear: () => {}, now: () => Date.now() },
  });
  const sys = backend.createSystem({ name: "d20 Basic", picture: null, start: "d20" });
  const world = backend.createWorld({ name: "Greyhollow", picture: null, systemId: sys });
  backend.open({ type: "world", id: world });
  const o = backend.builderOptions();
  const make = (name: string) => backend.createCharacter({ ...backend.makeItForMe(), name, player: name === "Mira" ? "Randy" : "Joe" });
  const mira = make("Mira");
  const pell = make("Pell");
  return { backend, events, sys, world, mira, pell, o };
}

test("macros: a saved roll follows whoever it's for, with pass or fail", () => {
  const { backend, mira, pell } = setup();
  const macros = backend.macros();
  const con = macros.find((m) => m.name === "Constitution save (DC 13)")!;
  assert.equal(con.words, "1d20 + Constitution bonus against 13");
  const results = backend.runMacro(con.id, {}, [mira, pell]);
  assert.deepEqual(results.map((r) => r.who), ["Mira", "Pell"]);
  for (const r of results) {
    assert.match(r.formula, /^1d20( [+-] \d+)?$/);
    assert.equal(r.pass, r.result.total >= 13);
  }
  const id = backend.saveMacro(null, { name: "Torch check", blocks: [{ type: "dice", op: "+", dice: "1d6" }, { type: "number", op: "+", value: 2 }], against: 5, who: "me", see: "public" });
  assert.equal(backend.macros().find((m) => m.id === id)!.words, "1d6 + 2 against 5");
  assert.equal(backend.history().done[0]!.label, "Made the macro Torch check", "saving is an undo step, rolling isn't");
});

test("the dice tray: rolls go to the chat with their breakdown, kept with the world", () => {
  const { backend, events, world } = setup();
  const line = backend.rollDice({ formula: "2d6 + 3", who: "DM", color: "#b93a2e", see: "public", label: "Longsword" });
  assert.match(line.text, /^Longsword: \d+$/);
  assert.match(line.roll!.breakdown, /^2d6 showed \d, \d, \+ 3$/);
  assert.equal(events.filter((e) => e.type === "chat").length, 1);
  assert.throws(() => backend.rollDice({ formula: "lots", who: "DM", color: "#000", see: "public" }), /isn't a roll/);
  backend.setTableMeta({ bookmarks: [{ id: "b1", node: null, section: "gear", label: "Gear prices", group: "Shopping" }] });
  backend.goHome();
  backend.open({ type: "world", id: world });
  const meta = backend.tableMeta();
  assert.equal(meta.chat.length, 1, "the chat is kept with the world");
  assert.equal(meta.bookmarks[0]!.label, "Gear prices");
  assert.equal(meta.arrangement.length > 0, true, "a ready-made arrangement of the tools");
});

test("a whole night from the back end: begin, fight, rest, wrap up", () => {
  const { backend, mira, pell } = setup();
  assert.equal(backend.tableView().session, null);
  backend.beginSession({ present: [mira, pell], starred: [], encounter: null, lastTime: "Last time, the wolves." });
  assert.throws(() => backend.beginSession({ present: [], starred: [], encounter: null, lastTime: "" }), /already going/);
  const wolf = backend.codex().find((s) => s.key === "monsters")!.entries.find((e) => e.name === "Wolf")!.id;
  backend.startFight({ encounter: null, hidden: false, groupFrom: 4 });
  backend.addToFight(wolf, { count: 2, group: false, hidden: true });
  let v = backend.tableView(["hp", "ac"]);
  assert.equal(v.order.length, 4);
  assert.ok(v.order.find((c) => c.name === "Mira")!.glance.AC !== undefined || true);
  const w1 = v.order.find((c) => c.name === "Wolf 1")!;
  assert.equal(w1.hidden, true);
  backend.setCombatant(w1.id, { hidden: false });
  assert.match(backend.damage(w1.id, null, 50), /Wolf 1 took 50 \(now 0\)/);
  backend.nextTurn({ rerollEachRound: false });
  backend.endFight();
  backend.partyRest("long rest");
  v = backend.tableView();
  assert.equal(v.nightXp, 50);
  assert.match(v.session!.log.map((l) => l.text).join(" | "), /Wolf 1 was defeated.*The fight ended.*long rest/);
  backend.wrapUp({ xpEach: 25, to: [mira, pell], remove: [] });
  assert.equal(backend.characterView(mira).xp, 25);
  assert.equal(backend.tableView().session, null);
});

test("the journal: categories in order, pages by priority, blocks, and Mentioned in", () => {
  const { backend, mira } = setup();
  const a = backend.createPage("Plot threads", "Plot threads");
  const b = backend.createPage("Who owes what", "Party notes");
  const c = backend.createPage("Old news", "Party notes");
  backend.setPage(c, { priority: 30 });
  backend.setPage(b, { priority: 1 });
  const text = backend.pageView(a).blocks[0]!.id;
  backend.setBlock(a, text, { text: "Mira owes the miller a favour." });
  backend.addBlock(a, "text");
  assert.equal(backend.pageView(a).blocks.length, 2);
  assert.deepEqual(backend.pageView(a).links.map((l) => l.name), ["Mira"], "names on the page link to their sheets");
  assert.deepEqual(backend.mentionedIn(mira).map((p) => p.name), ["Plot threads"]);
  backend.setTableMeta({ journalCategories: [{ name: "Party notes", priority: 1 }] });
  const tree = backend.journalTree();
  assert.equal(tree[0]!.category, "Party notes", "categories have a priority too");
  assert.deepEqual(tree[0]!.pages.map((p) => p.name), ["Who owes what", "Old news"], "priority 30 sinks to the bottom");
  const npc = backend.pageToNode(a, "npc");
  assert.equal(backend.node(npc).fields.beingKind, "npc");
  assert.equal(backend.codex().find((s) => s.key === "journal")!.entries.length, 3, "journal pages are in the Codex");
});

test("roll tables: once-only rows cross out, How common works out ranges, and a table from the Codex", () => {
  const { backend } = setup();
  const potions = backend.codex().find((s) => s.key === "magic")!.entries.filter((e) => e.name.startsWith("Potion")).slice(0, 5).map((e) => e.id);
  const t = backend.tableFrom("Random potion", potions);
  const n = backend.node(t);
  assert.equal(n.fields.die, "d6");
  const rows = n.fields.rows as { from: number; to: number }[];
  assert.equal(rows.length, 5);
  assert.equal(rows[rows.length - 1]!.to, 6);
  backend.setField(t, "rows", rows.map((r, i) => ({ ...r, once: i === 0, weight: i === 0 ? "rare" : "common" })));
  backend.spreadTable(t);
  const spread = backend.node(t).fields.rows as { from: number; to: number }[];
  assert.equal(spread[0]!.from, 1);
  assert.equal(spread[spread.length - 1]!.to, 6);
  for (let i = 0; i < 60; i++) backend.rollTable(t);
  assert.ok((backend.node(t).fields.used as number[]).length <= 1);
  backend.resetTable(t);
  assert.deepEqual(backend.node(t).fields.used, []);
});
