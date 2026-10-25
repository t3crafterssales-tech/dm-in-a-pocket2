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

// ---------- Check for errors, Ask AI on a flag, live checking ----------

test("Check for errors looks at the user's own work, and what it finds arrives as yellow flags in the ticked categories", async () => {
  const s = setup();
  s.backend.setAiKey("sk-ant-api03-abcdefghijklmnop1234");
  s.backend.addRule("world", "No metal");
  const seen: Parameters<AiTransport>[0][] = [];
  s.t.current = pretend((params, round) => {
    const tools = params.tools!.map((t) => (t as { name: string }).name);
    assert.ok(tools.includes("report_problem") && !tools.includes("set_value") && !tools.includes("create_node"), "a check can only look and report");
    if (round === 0)
      return {
        tools: [
          { name: "report_problem", input: { nodes: [s.longsword], category: "lore", title: "The Longsword is metal in a world with no metal", detail: "Make it bronze-free stone, or remove it." } },
          { name: "report_problem", input: { nodes: ["gone"], category: "balance", title: "Ghost", detail: "" } },
          { name: "set_value", input: { nodes: [s.club], field: "cost", value: "9 gp" } },
        ],
      };
    return { text: "I found 1 problem." };
  }, seen);
  const r = await s.backend.aiCheck();
  assert.deepEqual(r.status === "done" && r.found, 1);
  const extra = JSON.stringify(seen[0]!.system);
  assert.match(extra, /World rules:\\n- No metal/);
  assert.match(extra, /Lore consistency/);
  assert.match(extra, /Longsword/, "the user's own things are sent");
  assert.equal(s.backend.node(s.club).fields.cost, undefined, "a check changes nothing");
  const flag = s.backend.flagPanel().blocks.find((b) => b.key.startsWith("ai:"))!;
  assert.deepEqual([flag.color, flag.category, flag.title], ["yellow", "lore", "The Longsword is metal in a world with no metal"]);
  assert.match(flag.detail, /Found by the AI/);
  assert.match(s.backend.aiView().chat.at(-1)!.text, /flag panel/);
  // Switching the category off hides them; "It's fine" removes one like any other yellow flag.
  s.backend.setCheck("lore", { on: false });
  assert.ok(!s.backend.flagPanel().blocks.some((b) => b.key.startsWith("ai:")));
  s.backend.setCheck("lore", { on: true });
  s.backend.markGood(flag.key);
  assert.ok(!s.backend.flagPanel().blocks.some((b) => b.key === flag.key));
  // A check with the categories switched off doesn't run.
  for (const c of ["balance", "economy", "filing", "lore"] as const) s.backend.setCheck(c, { on: false });
  await assert.rejects(s.backend.aiCheck(), /switched off/);
});

test("the next check replaces the old findings", async () => {
  const s = setup();
  s.backend.setAiKey("sk-ant-api03-abcdefghijklmnop1234");
  s.t.current = pretend((_p, round) => (round === 0 ? { tools: [{ name: "report_problem", input: { nodes: [s.club], category: "economy", title: "The Club is too dear", detail: "" } }] } : { text: "1 problem." }));
  await s.backend.aiCheck();
  s.t.current = pretend(() => ({ text: "Nothing wrong now." }));
  await s.backend.aiCheck();
  assert.ok(!s.backend.flagPanel().blocks.some((b) => b.key.startsWith("ai:")));
});

test("Ask AI on a flag proposes a fix in the AI panel, working on what the flag is about; other ideas asks again", async () => {
  const s = setup();
  s.backend.setAiKey("sk-ant-api03-abcdefghijklmnop1234");
  // A broken link: the Swords' attack uses Strength, which is deleted.
  s.backend.deleteNode(s.str);
  const red = s.backend.flagPanel().blocks.find((b) => b.color === "red")!;
  const seen: Parameters<AiTransport>[0][] = [];
  // Each job: propose a change first, then explain it.
  s.t.current = pretend((p) => (typeof p.messages.at(-1)!.content === "string" ? { tools: [{ name: "set_value", input: { nodes: [s.attack], field: "ability", value: `@${s.dex}` } }] } : { text: "Use Dexterity instead." }), seen);
  await s.backend.aiFixFlag(red.key);
  assert.match(String(seen[0]!.messages.at(-1)!.content), /most reasonable fix.*red \(broken\)/);
  assert.equal(s.backend.aiView().waiting, true);
  s.backend.aiReject();
  await s.backend.aiFixFlag(red.key, true);
  assert.match(String(seen.at(-2)!.messages.at(-1)!.content), /different fix/, "the second job's request");
  s.backend.aiAccept();
  assert.ok(!s.backend.flagPanel().blocks.some((b) => b.color === "red"), "fixed");
});

test("live checking: off until switched on; then a few seconds after the user's changes, only those things are checked", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dmip-ai-live-"));
  const timers: (() => void)[] = [];
  const seen: Parameters<AiTransport>[0][] = [];
  let events: string[] = [];
  const backend = new Backend({
    settingsPath: join(dir, "s.json"),
    defaultFolder: join(dir, "F"),
    machine: "m",
    pickPicture: async () => null,
    pickFolder: async () => null,
    emit: (e) => events.push(e.type),
    secrets: { read: () => "sk-ant-api03-abcdefghijklmnop1234", write: () => {} },
    aiTransport: () => pretend((params, round) => (round % 2 === 0 ? { tools: [{ name: "report_problem", input: { nodes: [String(JSON.stringify(params.system).match(/\\"id\\":\\"([0-9a-f]+)/)![1])], category: "balance", title: "Too tough", detail: "" } }] } : { text: "1." }), seen),
    timers: { set: (fn) => timers.push(fn), clear: () => {}, now: () => Date.now() },
  });
  const sys = backend.createSystem({ name: "S", picture: null, start: "scratch" });
  backend.open({ type: "system", id: sys });
  assert.equal(backend.aiStatus().tip, true, "a one-time tip when a key is there");
  const ogre = backend.addBeing({ name: "Ogre", kind: "monster", variantOf: null });
  backend.setField(ogre, "hp", 500);
  await backend.runLive();
  assert.equal(seen.length, 0, "off by default: nothing is checked");
  backend.setAiLive(true);
  assert.equal(backend.aiStatus().tip, false);
  backend.setField(ogre, "hp", 600);
  backend.setField(ogre, "ac", 30);
  await backend.runLive();
  assert.equal(seen.length, 2, "one check for both changes");
  assert.match(JSON.stringify(seen[0]!.system), /live check/);
  assert.equal(seen[0]!.model, "claude-haiku-5-5", "the quick model");
  assert.ok(events.includes("aiFlags"));
  assert.equal(backend.flagPanel().blocks.filter((b) => b.key.startsWith("ai:")).length, 1);
  // The AI's own accepted changes don't start a live check.
  events = [];
  await backend.runLive();
  assert.deepEqual(events, []);
});

test("Check for errors on a starter system sends only what the user made or changed, not the whole SRD", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dmip-ai-srd-"));
  const seen: Parameters<AiTransport>[0][] = [];
  let now = Date.now();
  const backend = new Backend({
    settingsPath: join(dir, "s.json"),
    defaultFolder: join(dir, "F"),
    machine: "m",
    pickPicture: async () => null,
    pickFolder: async () => null,
    emit: () => {},
    now: () => now,
    secrets: { read: () => "sk-ant-api03-abcdefghijklmnop1234", write: () => {} },
    aiTransport: () => pretend(() => ({ text: "Nothing wrong." }), seen),
    timers: { set: () => 0, clear: () => {}, now: () => now },
  });
  const sys = backend.createSystem({ name: "SRD", picture: null, start: "d20" });
  backend.open({ type: "system", id: sys });
  assert.deepEqual(await backend.aiCheck(), { status: "done", found: 0, costUsd: 0, nothing: true }, "nothing of the user's own yet: nothing is sent");
  assert.equal(seen.length, 0);
  now += 60_000;
  const goblin = backend.beingsList("monster").find((e) => e.name === "Goblin Warrior")!.id;
  backend.setField(goblin, "hp", 30);
  backend.addBeing({ name: "Bog Hag", kind: "monster", variantOf: null });
  await backend.aiCheck();
  const sent = JSON.stringify(seen[0]!.system);
  assert.match(sent, /Goblin Warrior/);
  assert.match(sent, /Bog Hag/);
  assert.ok(!/Adult Red Dragon/.test(sent));
  assert.ok(sent.length < 15000);
});

// ---------- Create from a document, and whole-system generation ----------

import { writeFileSync } from "node:fs";
import { docxText, splitDocument } from "../src/app/ai/documents.ts";

test("documents are read from text and Word files and cut into parts at paragraph breaks", async () => {
  const s = setup();
  const long = Array.from({ length: 40 }, (_, i) => `Paragraph ${i}. ${"Words ".repeat(80)}`).join("\n");
  const parts = splitDocument(long, 4000);
  assert.ok(parts.length > 3);
  assert.ok(parts.every((p) => p.length <= 4000 && /^Paragraph \d+\./.test(p)), "never in the middle of a paragraph");
  assert.equal(parts.join("\n").replace(/\s+/g, " "), long.replace(/\s+/g, " ").trim(), "nothing is lost");
  // The app's own Word export reads back.
  s.backend.goHome();
  s.backend.open({ type: "system", id: s.sys });
  const docx = join(s.dir, "rules.docx");
  await s.backend.bookWord({ type: "everything" }, docx);
  const text = docxText(readFileSync(docx));
  assert.match(text, /Strength/);
  assert.ok(!text.includes("<w:"));
  await assert.rejects(s.backend.aiFromDocument(join(s.dir, "x.pdf")), /plain text \(\.txt, \.md\) and Word/);
});

test("create from a document: part by part, each a proposal of its own, using the user's own words", async () => {
  const s = setup();
  s.backend.setAiKey("sk-ant-api03-abcdefghijklmnop1234");
  const file = join(s.dir, "My game.md");
  writeFileSync(file, `# Sanity\nEvery hero has Sanity from 1 to 10.\n${"x".repeat(11980)}\n# The Gloom\nA shadow beast with 30 hit points.`);
  const seen: Parameters<AiTransport>[0][] = [];
  s.t.current = pretend((p) => {
    const sys = JSON.stringify(p.system);
    if (typeof p.messages.at(-1)!.content !== "string") return { text: "Done." };
    if (sys.includes("Sanity from 1 to 10")) return { tools: [{ name: "create_node", input: { kind: "abilities", name: "Sanity", text: null, category: null, variant_of: null, being_kind: null, brick_type: null, lore_template: null, values: [{ field: "rangeMin", value: 1 }, { field: "rangeMax", value: 10 }] } }] };
    if (!sys.includes("shadow beast with 30")) return { text: "Nothing here to build." };
    return { tools: [{ name: "create_node", input: { kind: "being", name: "The Gloom", text: "A shadow beast.", category: null, variant_of: null, being_kind: "monster", brick_type: null, lore_template: null, values: [{ field: "hp", value: 30 }] } }] };
  }, seen);
  const v = (await s.backend.aiFromDocument(file))!;
  const total = splitDocument(readFileSync(file, "utf8")).length;
  assert.ok(total >= 2);
  assert.deepEqual(v.build, { title: 'Create from "My game"', done: 0, total, next: `Part 1 of ${total}` });
  assert.equal(seen.length, 0, "planning costs nothing");
  await s.backend.aiBuildNext();
  assert.match(JSON.stringify(seen[0]!.system), /This is one section of a bigger job/);
  assert.deepEqual(s.backend.aiView().chat.at(-1)!.lines, ["New abilities: Sanity"]);
  await assert.rejects(s.backend.aiBuildNext(), /Accept or reject the last proposal first/);
  s.backend.aiAccept();
  assert.equal(s.backend.history().done[0]!.label, `AI: Create from "My game", part 1 of ${total}`);
  assert.deepEqual(s.backend.aiView().build?.next, `Part 2 of ${total}`);
  // The rest, accepting whatever each part proposes.
  while (s.backend.aiView().build) {
    await s.backend.aiBuildNext();
    if (s.backend.aiView().waiting) s.backend.aiAccept();
  }
  assert.ok(s.backend.rulesTab().find((x) => x.key === "abilities")!.nodes.some((n) => n.name === "Sanity"));
  assert.ok(s.backend.beingsList("monster").some((e) => e.name === "The Gloom"));
});

test("whole-system generation runs section by section; Stop ends it, and each section can show its cost first", async () => {
  const s = setup();
  s.backend.setAiKey("sk-ant-api03-abcdefghijklmnop1234");
  const v = s.backend.aiGenerate("A cyberpunk game with a d6 dice pool");
  assert.deepEqual([v.build!.total, v.build!.next], [8, "The core check and abilities"]);
  s.backend.setAiOptions({ threshold: 0 });
  const r = await s.backend.aiBuildNext();
  assert.equal(r.status, "estimate");
  assert.equal(s.backend.aiView().build!.done, 0, "an estimate doesn't use up the section");
  s.t.current = pretend(() => ({ text: "Nothing to add here." }));
  await s.backend.aiBuildNext(true);
  assert.equal(s.backend.aiView().build!.next, "Resources and conditions", "a section with nothing to propose moves on");
  s.backend.aiBuildStop();
  assert.equal(s.backend.aiView().build, null);
  assert.throws(() => s.backend.aiGenerate("  "), /Describe the game/);
});
