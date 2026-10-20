import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Backend } from "../src/app/backend.ts";

test("search finds anything by name, then by its words, and says which tab it is on", () => {
  const dir = mkdtempSync(join(tmpdir(), "dmip-search-"));
  const backend = new Backend({
    settingsPath: join(dir, "s.json"),
    defaultFolder: join(dir, "F"),
    machine: "m",
    pickPicture: async () => null,
    pickFolder: async () => null,
    emit: () => {},
    timers: { set: () => 0, clear: () => {}, now: () => Date.now() },
  });
  const sys = backend.createSystem({ name: "SRD", picture: null, start: "d20" });
  const world = backend.createWorld({ name: "Greyhollow", picture: null, systemId: sys });
  backend.open({ type: "world", id: world });
  const r = backend.search("poison");
  assert.equal(r.hits[0]!.name, "Poisoned", "an exact or starting name comes first");
  assert.deepEqual([r.hits[0]!.what, r.hits[0]!.tab], ["Condition", "Rules"]);
  assert.ok(r.total > 20, "monsters and spells that mention poison too");
  const viaText = r.hits.find((h) => h.snippet);
  assert.ok(viaText && /poison/i.test(viaText.snippet!));
  const fireball = backend.search("fireball").hits.find((h) => h.name === "Fireball")!;
  assert.deepEqual([fireball.what, fireball.tab], ["Spell", "Beings"]);
  assert.equal(backend.search("Goblin Warrior").hits[0]!.what, "Monster");
  assert.equal(backend.search("Longsword").hits[0]!.tab, "Items");
  assert.equal(backend.search("x").total, 0, "at least two letters");
  // Things made in the world are found too.
  backend.addLore("The Iron Hills", "place");
  assert.deepEqual(backend.search("iron hills").hits.map((h) => [h.name, h.tab]), [["The Iron Hills", "Lore"]]);
});
