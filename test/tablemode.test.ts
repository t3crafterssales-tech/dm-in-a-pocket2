import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { link } from "../src/engine/index.ts";
import { Backend } from "../src/app/backend.ts";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "dmip-table-"));
  const backend = new Backend({
    settingsPath: join(dir, "settings.json"),
    defaultFolder: join(dir, "DM in a Pocket"),
    machine: "home-pc",
    pickPicture: async () => null,
    pickFolder: async () => null,
    emit: () => {},
    timers: { set: () => 0, clear: () => {}, now: () => Date.now() },
  });
  const sys = backend.createSystem({ name: "Pocket d20", picture: null, start: "d20" });
  const world = backend.createWorld({ name: "Greyhollow", picture: null, systemId: sys });
  backend.open({ type: "world", id: world });
  return { backend };
}

test("Table mode has Rules, Monsters, Items and Tables, in the rulebook's own words", () => {
  const { backend } = setup();
  const v = backend.tableMode();
  assert.deepEqual(v.tabs.map((t) => t.title), ["Rules", "Monsters", "Items", "Tables"]);
  const tab = (id: string) => v.tabs.find((t) => t.id === id)!;
  const goblin = tab("monsters").entries.find((e) => e.title === "Goblin")!;
  assert.match(goblin.stats!, /HP 7/);
  assert.ok(goblin.paragraphs.some((p) => /Scimitar/.test(p)));
  assert.ok(tab("rules").entries.some((e) => e.title === "Poisoned" && e.group === "Conditions"));
  assert.ok(tab("items").entries.some((e) => e.title === "Longsword"));
  // Mentions only point at things Table mode can open.
  const ids = new Set(v.tabs.flatMap((t) => t.entries.map((e) => e.id)));
  for (const e of v.tabs.flatMap((t) => t.entries)) for (const m of e.mentions) assert.ok(ids.has(m.id), `${e.title} → ${m.name}`);
});

test("variants appear in full, roll tables carry their rows, and stars show", () => {
  const { backend } = setup();
  const goblin = backend.tableMode().tabs[1]!.entries.find((e) => e.title === "Goblin")!.id;
  backend.addBeing({ name: "Goblin Scout", kind: "monster", variantOf: goblin });
  const ogre = backend.addBeing({ name: "Ogre", kind: "monster", variantOf: null });
  const t = backend.addLore("Forest encounters", "table");
  backend.setField(t, "die", "d6");
  backend.setField(t, "rows", [
    { from: 1, to: 5, text: "Wolves", result: null },
    { from: 6, to: 6, text: "", result: link(ogre) },
  ]);
  backend.toggleFavourite(ogre);
  const v = backend.tableMode();
  const monsters = v.tabs[1]!.entries;
  const boss = monsters.find((e) => e.title === "Goblin Scout")!;
  assert.match(boss.stats!, /HP 7/, "printed in full, not \"As Goblin\"");
  assert.equal(monsters.find((e) => e.id === ogre)!.favourite, true);
  const table = v.tabs[3]!.entries.find((e) => e.id === t)!;
  assert.deepEqual(table.table, { die: "d6", canRoll: true, rows: [{ range: "1-5", text: "Wolves", result: null }, { range: "6", text: "", result: { id: ogre, name: "Ogre" } }] });
  assert.ok(!v.tabs[0]!.entries.some((e) => e.id === t), "tables live in the Tables tab only");
});

test("Table mode works in a read-only world, and rolling changes nothing", () => {
  const { backend } = setup();
  const before = backend.history().done.length;
  const t = backend.addLore("Weather", "table");
  backend.setField(t, "rows", [{ from: 1, to: 6, text: "Rain", result: null }]);
  backend.session!.readOnly = true;
  assert.ok(backend.tableMode().tabs[3]!.entries.length >= 1);
  assert.equal(backend.rollTable(t).text, "Rain");
  assert.equal(backend.history().done.length, before + 2);
});
