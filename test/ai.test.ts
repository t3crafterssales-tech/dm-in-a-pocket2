import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Backend } from "../src/app/backend.ts";
import type { AiTransport } from "../src/app/ai/job.ts";
import { readZip } from "../src/storage/index.ts";

type Reply = { text?: string; tools?: { name: string; input: Record<string, unknown> }[]; stop?: string };
type Script = (params: Parameters<AiTransport>[0], round: number) => Reply;

/** A pretend Claude that answers from a script, so no test ever spends money or needs the internet. */
function pretend(script: Script, seen: Parameters<AiTransport>[0][] = []): AiTransport {
  let round = 0;
  return async (params) => {
    seen.push(structuredClone(params));
    const r = script(params, round++);
    const content: unknown[] = [];
    if (r.text) content.push({ type: "text", text: r.text });
    (r.tools ?? []).forEach((t, i) => content.push({ type: "tool_use", id: `tu_${round}_${i}`, name: t.name, input: t.input }));
    return { id: `msg_${round}`, type: "message", role: "assistant", model: params.model, content, stop_reason: r.stop ?? (r.tools?.length ? "tool_use" : "end_turn"), stop_sequence: null, usage: { input_tokens: 10_000, output_tokens: 1_000 } } as never;
  };
}

/** The last tool answer the app sent back, parsed. */
const lastResult = (params: Parameters<AiTransport>[0]) => {
  const m = params.messages.at(-1)!;
  const block = (m.content as { type: string; content?: string }[]).find((b) => b.type === "tool_result")!;
  try {
    return JSON.parse(block.content!);
  } catch {
    return block.content;
  }
};

function setup(transport?: AiTransport) {
  const dir = mkdtempSync(join(tmpdir(), "dmip-ai-"));
  let key: string | null = null;
  const t = { current: transport ?? pretend(() => ({ text: "Hello." })) };
  const backend = new Backend({
    settingsPath: join(dir, "settings.json"),
    defaultFolder: join(dir, "DM in a Pocket"),
    machine: "home-pc",
    pickPicture: async () => null,
    pickFolder: async () => null,
    emit: () => {},
    secrets: { read: () => key, write: (k) => (key = k) },
    aiTransport: () => (params) => t.current(params),
    timers: { set: () => 0, clear: () => {}, now: () => Date.now() },
  });
  const sys = backend.createSystem({ name: "Pocket d20", picture: null, start: "scratch" });
  backend.open({ type: "system", id: sys });
  const str = backend.addRule("abilities", "Strength");
  const dex = backend.addRule("abilities", "Dexterity");
  const weapons = backend.categories().find((c) => c.name === "Weapon")!.id;
  const swords = backend.addCategory("Swords", weapons);
  const attack = backend.addBrick("attack", "Sword attack");
  backend.setField(attack, "ability", { link: str });
  const longsword = backend.addItem({ name: "Longsword", categoryId: swords, variantOf: null });
  const shortsword = backend.addItem({ name: "Shortsword", categoryId: swords, variantOf: null });
  backend.attach({ targets: [longsword, shortsword], bricks: [attack] });
  const club = backend.addItem({ name: "Club", categoryId: weapons, variantOf: null });
  backend.goHome();
  const world = backend.createWorld({ name: "Greyhollow", picture: null, systemId: sys });
  backend.open({ type: "world", id: world });
  backend.setAiOptions({ threshold: 100 });
  return { dir, backend, t, sys, world, str, dex, swords, attack, longsword, shortsword, club };
}

test("with no key the AI says so, and everything else works; a key must look like a key", async () => {
  const { backend } = setup();
  assert.equal(backend.aiStatus().hasKey, false);
  await assert.rejects(backend.aiAsk("Make the goblins sneakier", null), /Add your Claude API key in Settings/);
  assert.throws(() => backend.setAiKey("hello"), /starts with "sk-ant-"/);
  const st = backend.setAiKey("sk-ant-api03-abcdefghijklmnop1234");
  assert.deepEqual([st.hasKey, st.keyEnd], [true, "1234"]);
  assert.equal(backend.setAiKey(null).hasKey, false, "and it can be removed");
});

test("a bulk change by category: nothing changes until Accept, which is one undo step labelled with the request", async () => {
  const s = setup();
  s.backend.setAiKey("sk-ant-api03-abcdefghijklmnop1234");
  const sent: Parameters<AiTransport>[0][] = [];
  s.t.current = pretend((params, round) => {
    if (round === 0) return { tools: [{ name: "find_nodes", input: { query: null, kind: "item", category: "Swords", limit: null } }] };
    if (round === 1) {
      const found = lastResult(params) as { results: { id: string }[] };
      assert.equal(found.results.length, 2, "everything filed under Swords, not the Club");
      return { tools: found.results.map((r) => ({ name: "read_node", input: { id: r.id } })) };
    }
    if (round === 2) return { tools: [{ name: "edit_attachment", input: { items: [s.longsword, s.shortsword].map((n) => ({ node: n, attachment: s.backend.node(n).attachments[0]!.aid })), field: "ability", value: `@${s.dex}` } }] };
    return { text: "I found 2 swords. Both will attack with Dexterity." };
  }, sent);
  const before = s.backend.history().done.length;
  const r = await s.backend.aiAsk("All swords use Dexterity", null);
  assert.equal(r.status, "done");
  const view = s.backend.aiView();
  const answer = view.chat.at(-1)!;
  assert.equal(answer.text, "I found 2 swords. Both will attack with Dexterity.");
  assert.deepEqual(answer.lines, ["2 sheets: ability → Dexterity on one brick each"]);
  assert.equal(answer.status, "waiting");
  assert.equal(view.waiting, true);
  // Nothing has changed yet, and trying it out left no trace in History.
  assert.match(s.backend.node(s.longsword).attachments[0]!.sentence, /Strength/);
  assert.equal(s.backend.history().done.length, before);

  const { label } = s.backend.aiAccept();
  assert.equal(label, "AI: All swords use Dexterity");
  assert.match(s.backend.node(s.longsword).attachments[0]!.sentence, /Dexterity/);
  assert.match(s.backend.node(s.shortsword).attachments[0]!.sentence, /Dexterity/);
  const step = s.backend.history().done[0]!;
  assert.equal(step.label, "AI: All swords use Dexterity");
  assert.equal(s.backend.history().done.length, before + 1, "one step");
  assert.equal(s.backend.aiView().chat.at(-1)!.status, "accepted");
  // AI changes undo exactly like the user's own.
  s.backend.undo();
  assert.match(s.backend.node(s.longsword).attachments[0]!.sentence, /Strength/);

  // Only what each job needs was sent: no whole world file, and the working-on line.
  assert.ok(JSON.stringify(sent[0]!.system).includes("working on the whole world"));
  assert.ok(JSON.stringify(sent[0]).length < 20000);
  assert.ok(s.backend.aiStatus().spent.endsWith("this month"));
});

test("Reject throws the proposal away; nothing changes", async () => {
  const s = setup();
  s.backend.setAiKey("sk-ant-api03-abcdefghijklmnop1234");
  s.t.current = pretend((_p, round) => (round === 0 ? { tools: [{ name: "set_value", input: { nodes: [s.club], field: "cost", value: "1 sp" } }] } : { text: "Clubs cost 1 sp." }));
  await s.backend.aiAsk("Clubs cost 1 sp", s.club);
  s.backend.aiReject();
  assert.equal(s.backend.node(s.club).fields.cost, undefined);
  assert.equal(s.backend.aiView().chat.at(-1)!.status, "rejected");
  assert.throws(() => s.backend.aiAccept(), /nothing waiting/);
});

test("the AI can't delete: it can only suggest it, and the thing stays", async () => {
  const s = setup();
  s.backend.setAiKey("sk-ant-api03-abcdefghijklmnop1234");
  s.t.current = pretend((_p, round) => (round === 0 ? { tools: [{ name: "suggest_delete", input: { node: s.club, reason: "Nobody uses clubs here." } }, { name: "delete_node", input: { id: s.club } }] } : { text: "You could delete the Club." }));
  await s.backend.aiAsk("Tidy up the weapons", null);
  const answer = s.backend.aiView().chat.at(-1)!;
  assert.deepEqual(answer.suggestions, ["Delete Club? Nobody uses clubs here."]);
  assert.equal(answer.status, undefined, "a suggestion alone has nothing to accept");
  assert.equal(s.backend.node(s.club).name, "Club");
});

test("new things get ids the next actions can use, and come out as the user's own", async () => {
  const s = setup();
  s.backend.setAiKey("sk-ant-api03-abcdefghijklmnop1234");
  s.t.current = pretend((params, round) => {
    if (round === 0) return { tools: [{ name: "create_node", input: { kind: "brick", name: "Venom bite", text: null, category: null, variant_of: null, being_kind: null, brick_type: "attack", lore_template: null, values: [{ field: "dice", value: "1d6" }, { field: "damageType", value: "poison" }] } }] };
    if (round === 1) {
      assert.match(String(lastResult(params)), /new-1/);
      return { tools: [{ name: "create_node", input: { kind: "being", name: "Cave Spider", text: "Hangs from cave roofs.", category: null, variant_of: null, being_kind: "monster", brick_type: null, lore_template: null, values: [{ field: "hp", value: 9 }, { field: "cr", value: "1/2" }] } }, { name: "attach_brick", input: { nodes: ["new-2"], brick: "new-1" } }] };
    }
    return { text: "A new spider with a venom bite." };
  });
  await s.backend.aiAsk("Make a cave spider", null);
  assert.deepEqual(s.backend.aiView().chat.at(-1)!.lines, ["New brick: Venom bite", "New monster: Cave Spider", "Added Venom bite to Cave Spider"]);
  assert.ok(!s.backend.beingsList("monster").some((e) => e.name === "Cave Spider"), "not before Accept");
  s.backend.aiAccept();
  const spider = s.backend.node(s.backend.beingsList("monster").find((e) => e.name === "Cave Spider")!.id);
  assert.deepEqual([spider.fields.hp, spider.fields.cr, spider.text, spider.source], [9, "1/2", "Hangs from cave roofs.", "mine"]);
  assert.equal(spider.attachments[0]!.name, "Venom bite");
});

test("all or nothing: if the internet drops mid-job, nothing is applied and the chat says nothing changed", async () => {
  const s = setup();
  s.backend.setAiKey("sk-ant-api03-abcdefghijklmnop1234");
  let round = 0;
  s.t.current = async (params) => {
    if (round++ === 0) return pretend(() => ({ tools: [{ name: "set_value", input: { nodes: [s.club], field: "cost", value: "1 sp" } }] }))(params);
    throw Object.assign(new Error("Connection error."), { name: "APIConnectionError" });
  };
  await assert.rejects(s.backend.aiAsk("Clubs cost 1 sp", null), /Couldn't reach Claude.*Nothing was changed/);
  assert.equal(s.backend.node(s.club).fields.cost, undefined);
  assert.equal(s.backend.aiView().waiting, false);
  // A refusal and a wrong key are plain messages too.
  s.t.current = pretend(() => ({ stop: "refusal" }));
  await assert.rejects(s.backend.aiAsk("Clubs cost 1 sp", null), /declined/);
  s.t.current = async () => {
    throw Object.assign(new Error("invalid x-api-key"), { status: 401 });
  };
  await assert.rejects(s.backend.aiAsk("Clubs cost 1 sp", null), /didn't accept the API key/);
});

test("a change that can't be done goes back to the AI as a reason, so it can correct itself", async () => {
  const s = setup();
  s.backend.setAiKey("sk-ant-api03-abcdefghijklmnop1234");
  s.t.current = pretend((params, round) => {
    if (round === 0) return { tools: [{ name: "set_value", input: { nodes: ["nope"], field: "cost", value: "1 sp" } }] };
    if (round === 1) {
      assert.match(String(lastResult(params)), /Nothing has the id nope/);
      return { tools: [{ name: "set_value", input: { nodes: [s.club], field: "license", value: "x" } }] };
    }
    if (round === 2) {
      assert.match(String(lastResult(params)), /can't change the value "license"/);
      return { tools: [{ name: "set_value", input: { nodes: [s.club], field: "cost", value: "1 sp" } }] };
    }
    return { text: "Done." };
  });
  await s.backend.aiAsk("Clubs cost 1 sp", null);
  assert.deepEqual(s.backend.aiView().chat.at(-1)!.lines, ["Club: cost nothing → 1 sp"]);
});

test("World Notes: the AI rewrites only its own lines; lines the user writes are pinned and kept", async () => {
  const s = setup();
  s.backend.setAiKey("sk-ant-api03-abcdefghijklmnop1234");
  s.backend.setWorldNotes("There is no oxygen in the water.");
  s.t.current = pretend((params, round) => {
    if (round === 0) {
      assert.match(JSON.stringify(params.system), /no oxygen in the water\. \(written by the user; keep it\)/, "the AI reads the notes every time");
      return { tools: [{ name: "update_world_notes", input: { lines: ["The tone is grim and wet.", "Swords use Dexterity."] } }] };
    }
    return { text: "Notes updated." };
  });
  await s.backend.updateWorldNotes();
  s.backend.aiAccept();
  assert.deepEqual(s.backend.aiView().notes, [
    { text: "There is no oxygen in the water.", pinned: true },
    { text: "The tone is grim and wet.", pinned: false },
    { text: "Swords use Dexterity.", pinned: false },
  ]);
  // Editing a line makes it the user's.
  s.backend.setWorldNotes("There is no oxygen in the water.\nThe tone is grim and wet.\nSwords use Strength.");
  assert.deepEqual(s.backend.aiView().notes.map((n) => n.pinned), [true, false, true]);
});

test("big jobs over the cost threshold show an estimate first, naming the model", async () => {
  const s = setup();
  s.backend.setAiKey("sk-ant-api03-abcdefghijklmnop1234");
  s.backend.setAiOptions({ threshold: 0, model: "careful" });
  const r = await s.backend.aiAsk("Rewrite every weapon for a desert world", null);
  assert.equal(r.status, "estimate");
  if (r.status === "estimate") assert.match(r.estimate, /^About .* with Claude Opus 5\.5 \(careful\)/);
  assert.equal(s.backend.aiView().chat.length, 0, "nothing was sent");
  const seen: Parameters<AiTransport>[0][] = [];
  s.t.current = pretend(() => ({ text: "Fine." }), seen);
  await s.backend.aiAsk("Rewrite every weapon for a desert world", null, true);
  assert.equal(seen[0]!.model, "claude-opus-5-5");
  assert.deepEqual((seen[0] as unknown as { fallbacks: string }).fallbacks, "default", "a declined careful request is retried on another model");
  assert.equal(s.backend.aiStatus().spent, "$0.06 this month", "10,000 in and 1,000 out on Opus 5.5: 4 cents plus 2 cents");
  // Automatic picks the quick model for a small edit to one thing.
  s.backend.setAiOptions({ model: "auto", threshold: 100 });
  await s.backend.aiAsk("Make this sneakier", s.club);
  assert.equal(seen.at(-1)!.model, "claude-haiku-5-5");
  assert.match(JSON.stringify(seen.at(-1)!.system), /working on: Club/);
});

test("the chat is saved with the world; a shared copy carries the World Notes but the chat only if ticked", async () => {
  const s = setup();
  s.backend.setAiKey("sk-ant-api03-abcdefghijklmnop1234");
  s.backend.setWorldNotes("Rain never stops.");
  await s.backend.aiAsk("Hello", null);
  s.backend.goHome();
  s.backend.open({ type: "world", id: s.world });
  assert.deepEqual(s.backend.aiView().chat.map((c) => c.text), ["Hello", "Hello."]);
  const plain = join(s.dir, "plain.dmworld");
  await s.backend.share({}, plain);
  const meta = (f: string) => JSON.parse(readZip(readFileSync(f)).get("world.json")!.toString()).meta[s.world].ai;
  assert.deepEqual(meta(plain), { notes: [{ text: "Rain never stops.", pinned: true }], chat: [] });
  const withChat = join(s.dir, "chat.dmworld");
  await s.backend.share({ chat: true }, withChat);
  assert.equal(meta(withChat).chat.length, 2);
  // The key is never in a shared file.
  assert.ok(!readFileSync(withChat).toString("latin1").includes("sk-ant-api03"));
});

test("a read-only world can ask, but nothing can be accepted", async () => {
  const s = setup();
  s.backend.setAiKey("sk-ant-api03-abcdefghijklmnop1234");
  s.t.current = pretend((_p, round) => (round === 0 ? { tools: [{ name: "set_value", input: { nodes: [s.club], field: "cost", value: "1 sp" } }] } : { text: "OK." }));
  await s.backend.aiAsk("Clubs cost 1 sp", null);
  s.backend.session!.readOnly = true;
  assert.throws(() => s.backend.aiAccept(), /Nothing can be changed here/);
});

test("Offline: the AI buttons say so and nothing is sent", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dmip-ai-off-"));
  let sent = 0;
  const backend = new Backend({
    settingsPath: join(dir, "s.json"),
    defaultFolder: join(dir, "F"),
    machine: "m",
    pickPicture: async () => null,
    pickFolder: async () => null,
    emit: () => {},
    secrets: { read: () => "sk-ant-api03-abcdefghijklmnop1234", write: () => {} },
    aiTransport: () => async () => {
      sent++;
      throw new Error("no");
    },
    isOnline: () => false,
    timers: { set: () => 0, clear: () => {}, now: () => Date.now() },
  });
  const sys = backend.createSystem({ name: "S", picture: null, start: "scratch" });
  backend.open({ type: "system", id: sys });
  assert.equal(backend.aiStatus().online, false);
  await assert.rejects(backend.aiAsk("Hi", null), /^Error: Offline/);
  assert.equal(sent, 0);
});
