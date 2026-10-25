import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Backend } from "../src/app/backend.ts";
import type { AiTransport } from "../src/app/ai/job.ts";

type Params = Parameters<AiTransport>[0];

type Tool = { name: string; input: Record<string, unknown> };
function pretend(seen: Params[], text = "Done.", script?: (round: number) => Tool[] | null): AiTransport {
  let round = 0;
  return async (params) => {
    seen.push(structuredClone(params));
    const tools = script?.(round++) ?? null;
    const content: unknown[] = tools ? tools.map((t, i) => ({ type: "tool_use", id: `tu_${round}_${i}`, name: t.name, input: t.input })) : [{ type: "text", text }];
    return { id: "m", type: "message", role: "assistant", model: params.model, content, stop_reason: tools ? "tool_use" : "end_turn", stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 100 } } as never;
  };
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "dmip-aiw-"));
  const seen: Params[] = [];
  const t = { current: null as AiTransport | null };
  let key: string | null = "sk-ant-api03-abcdefghijklmnop1234";
  const backend = new Backend({
    settingsPath: join(dir, "settings.json"),
    defaultFolder: join(dir, "DM in a Pocket"),
    machine: "home-pc",
    pickPicture: async () => null,
    pickFolder: async () => null,
    emit: () => {},
    secrets: { read: () => key, write: (k) => (key = k) },
    aiTransport: () => (p) => (t.current ?? pretend(seen))(p),
    timers: { set: () => 0, clear: () => {}, now: () => Date.now() },
  });
  const sys = backend.createSystem({ name: "Pocket d20", picture: null, start: "scratch" });
  backend.goHome();
  const world = backend.createWorld({ name: "Greyhollow", picture: null, systemId: sys });
  backend.open({ type: "world", id: world });
  backend.setAiOptions({ threshold: 100 });
  return { backend, seen, t };
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

const place = (name: string, text: string): Tool => ({ name: "create_node", input: { kind: "lore", name, text, category: null, variant_of: null, being_kind: null, brick_type: null, lore_template: "place", values: [] } });

test("a creative request comes back as several labelled versions; nothing changes until you pick one", async () => {
  const { backend, seen, t } = setup();
  backend.setAiOptions({ versions: 2 });
  t.current = pretend(seen, "Two ideas for the north.", (round) => (round === 0 ? [{ name: "start_version", input: { label: "ruined and forgotten" } }, place("Ashfall Keep", "A shattered keep."), { name: "start_version", input: { label: "busy trade post" } }, place("Frostmere Market", "Furs and noise.")] : null));
  const r = await backend.aiAsk("Help me create a place in the north", null);
  assert.equal(r.status, "done");
  const entry = backend.aiView().chat.at(-1)!;
  assert.deepEqual(entry.versions!.map((v) => v.label), ["ruined and forgotten", "busy trade post"]);
  assert.match(JSON.stringify(seen[0]!.system), /Offer exactly 2 alternative versions/);
  assert.equal(backend.aiWorld().context.parts.find((p) => p.title === "Places"), undefined, "nothing was made yet");
  const before = backend.history().done.length;
  const done = backend.aiAccept(1);
  assert.equal(done.label, "AI: Help me create a place in the north (busy trade post)");
  assert.deepEqual(backend.aiWorld().context.parts.find((p) => p.title === "Places")!.items.map((x) => x.split(" (")[0]), ["Frostmere Market"]);
  assert.equal(backend.history().done.length, before + 1, "one undo step");
});

test("Create more adds fresh versions after the ones already shown", async () => {
  const { backend, seen, t } = setup();
  t.current = pretend(seen, "Ideas.", (round) => (round === 0 ? [{ name: "start_version", input: { label: "grim" } }, place("A", "a"), { name: "start_version", input: { label: "cosy" } }, place("B", "b")] : null));
  await backend.aiAsk("Create a village", null);
  t.current = pretend(seen, "More ideas.", (round) => (round === 0 ? [{ name: "start_version", input: { label: "haunted" } }, place("C", "c"), { name: "start_version", input: { label: "floating" } }, place("D", "d")] : null));
  await backend.aiMore();
  assert.deepEqual(backend.aiView().chat.at(-1)!.versions!.map((v) => v.label), ["grim", "cosy", "haunted", "floating"]);
  assert.match(JSON.stringify(seen.at(-1)!.messages), /already seen these versions: grim, cosy/);
  backend.aiAccept(3);
  assert.deepEqual(backend.aiWorld().context.parts.find((p) => p.title === "Places")!.items.map((x) => x.split(" (")[0]), ["D"]);
});

test("one version, or a bulk change, is answered the ordinary way", async () => {
  const { backend, seen } = setup();
  backend.setAiOptions({ versions: 1 });
  await backend.aiAsk("Create a village", null);
  assert.doesNotMatch(JSON.stringify(seen[0]!.system), /alternative versions/);
  backend.setAiOptions({ versions: 3 });
  await backend.aiAsk("Make all the swords use Dexterity", null);
  assert.doesNotMatch(JSON.stringify(seen[1]!.system), /alternative versions/);
  assert.equal(backend.aiStatus().versions, 3);
  assert.equal(backend.setAiOptions({ versions: 99 }).versions, 6);
  assert.equal(backend.setAiOptions({ versions: 0 }).versions, 1);
});
