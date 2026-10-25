import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Backend } from "../src/app/backend.ts";
import type { AiTransport } from "../src/app/ai/job.ts";

type Params = Parameters<AiTransport>[0];

function pretend(seen: Params[], text = "Done."): AiTransport {
  return async (params) => {
    seen.push(structuredClone(params));
    return { id: "m", type: "message", role: "assistant", model: params.model, content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 100 } } as never;
  };
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "dmip-aiw-"));
  const seen: Params[] = [];
  let key: string | null = "sk-ant-api03-abcdefghijklmnop1234";
  const backend = new Backend({
    settingsPath: join(dir, "settings.json"),
    defaultFolder: join(dir, "DM in a Pocket"),
    machine: "home-pc",
    pickPicture: async () => null,
    pickFolder: async () => null,
    emit: () => {},
    secrets: { read: () => key, write: (k) => (key = k) },
    aiTransport: () => (p) => pretend(seen)(p),
    timers: { set: () => 0, clear: () => {}, now: () => Date.now() },
  });
  const sys = backend.createSystem({ name: "Pocket d20", picture: null, start: "scratch" });
  backend.goHome();
  const world = backend.createWorld({ name: "Greyhollow", picture: null, systemId: sys });
  backend.open({ type: "world", id: world });
  backend.setAiOptions({ threshold: 100 });
  return { backend, seen };
}

test("the AI is told about the world: its races, factions and places, and your own words", async () => {
  const { backend, seen } = setup();
  const vethkari = backend.addBeing({ name: "Vethkari", kind: "race", variantOf: null });
  backend.setText(vethkari, "Pale nomads of the northern ice who bury their dead in glaciers. They trade furs.");
  backend.addBeing({ name: "Folic tribe", kind: "race", variantOf: null });
  backend.addLore("The Grey Hands", "faction");
  backend.addLore("Frostmere", "place");
  backend.aiSetAbout("Grim and windswept. Magic is rare and costs something.");

  const w = backend.aiWorld();
  assert.deepEqual(w.context.parts.map((p) => p.title), ["Races", "Factions", "Places"]);
  assert.match(w.context.summary, /Vethkari \(Pale nomads of the northern ice who bury their dead in glaciers\.\)/);
  assert.match(w.context.summary, /Factions: The Grey Hands/);
  assert.match(w.context.summary, /Places: Frostmere/);
  assert.equal(w.about, "Grim and windswept. Magic is rare and costs something.");

  await backend.aiAsk("Make a place in the north", null);
  const system = JSON.stringify(seen[0]!.system);
  assert.match(system, /What you know about this world/);
  assert.match(system, /Vethkari/);
  assert.match(system, /Magic is rare and costs something/);
});

test("the summary is short: long lists are cut with 'and N more', and it is never the whole world", () => {
  const { backend } = setup();
  for (let i = 0; i < 40; i++) backend.addBeing({ name: `Monster ${i}`, kind: "monster", variantOf: null });
  const monsters = backend.aiWorld().context.parts.find((p) => p.title === "Monsters")!;
  assert.equal(monsters.items.length, 24);
  assert.equal(monsters.more, 16);
  assert.ok(backend.aiWorld().context.summary.length < 3600);
});

test("what you write about the world is kept with the world and can be cleared", () => {
  const { backend } = setup();
  backend.aiSetAbout("Epic and mythic.");
  assert.equal(backend.aiWorld().about, "Epic and mythic.");
  assert.equal(backend.aiSetAbout("").about, "");
});
