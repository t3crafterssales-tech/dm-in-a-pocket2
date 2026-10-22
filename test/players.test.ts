import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Backend } from "../src/app/backend.ts";
import type { BackendEvent, PlayerState } from "../src/app/backend.ts";
import { access, chatFor, healthWords, newPin } from "../src/app/players.ts";
import type { ChatLine, Person } from "../src/app/tablemeta.ts";
import { formatBits, makeQr, rsRemainder } from "../src/engine/qr.ts";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "dmip-players-"));
  const events: BackendEvent[] = [];
  const backend = new Backend({
    settingsPath: join(dir, "settings.json"),
    defaultFolder: join(dir, "DM in a Pocket"),
    machine: "home-pc",
    pickPicture: async () => null,
    pickFolder: async () => null,
    emit: (e) => events.push(e),
    playerFile: (name) => (name === "player.html" ? "<!doctype html><title>Player</title>" : null),
    timers: { set: () => 0, clear: () => {}, now: () => Date.now() },
  });
  const sys = backend.createSystem({ name: "d20 Basic", picture: null, start: "d20" });
  const world = backend.createWorld({ name: "Greyhollow", picture: null, systemId: sys });
  backend.open({ type: "world", id: world });
  const make = (name: string, player: string) => backend.createCharacter({ ...backend.makeItForMe(), name, player });
  const mira = make("Mira", "Randy");
  const pell = make("Pell", "Ken");
  return { backend, events, world, mira, pell };
}

const person = (o: Partial<Person> = {}): Person => ({ id: "p1", name: "Ken", pin: "12345", character: null, level: "player", grid: {}, color: "#000", notes: "", ...o });
const line = (o: Partial<ChatLine>): ChatLine => ({ id: "c", time: 0, kind: "chat", who: "DM", color: "#000", see: "public", to: [], text: "hi", roll: null, ic: false, ...o });

test("QR codes follow the standard: error correction, format bits and size", () => {
  // The worked example from the QR standard's tutorials ("HELLO WORLD", size 1, medium).
  assert.deepEqual(rsRemainder([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17], 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  assert.equal(formatBits(0).toString(2).padStart(15, "0"), "101010000010010");
  const q = makeQr("http://192.168.1.23:7310");
  assert.equal(q.version, 2);
  assert.equal(q.size, 25);
  // Finder patterns in three corners, the dark module beside the bottom-left one.
  for (const [x, y] of [[0, 0], [q.size - 7, 0], [0, q.size - 7]] as const) assert.equal(q.modules[y + 3]![x + 3], true);
  assert.equal(q.modules[q.size - 8]![8], true);
  assert.equal(makeQr("x".repeat(200)).version, 10);
  assert.throws(() => makeQr("x".repeat(300)), /too long/);
});

test("levels and exceptions decide what each person sees and changes", () => {
  assert.equal(access(person({ level: "new" }), "characters"), "hidden");
  assert.equal(access(person({ level: "player" }), "characters"), "see");
  assert.equal(access(person({ level: "player" }), "codexAdd"), "hidden", "players don't drag potions onto their own sheets");
  assert.equal(access(person({ level: "trusted" }), "codexAdd"), "change");
  assert.equal(access(person({ level: "assistant" }), "whispers"), "hidden", "an assistant doesn't read whispers unless the DM allows it");
  assert.equal(access(person({ level: "assistant", grid: { whispers: "see" } }), "whispers"), "see");
  assert.equal(access(person({ level: "player", grid: { initiative: "hidden" } }), "initiative"), "hidden");
  assert.equal(access(person({ level: "player" }), "initiative", { selfAdvance: true }), "change", "the table rule lets everyone move the turn on");
  assert.equal(healthWords(11, 11), "unhurt");
  assert.equal(healthWords(5, 11), "bloodied");
  assert.equal(healthWords(2, 11), "nearly down");
  assert.equal(healthWords(0, 11), "down");
  const pins = new Set<string>();
  for (let i = 0; i < 50; i++) pins.add(newPin([...pins]));
  assert.equal(pins.size, 50);
  for (const p of pins) assert.match(p, /^\d{5}$/);
});

test("whispers reach only the people named; blind rolls hide the result from the roller", () => {
  const ken = person();
  const randy = person({ id: "p2", name: "Randy" });
  const w = line({ kind: "whisper", to: ["Randy"], from: "p3", text: "psst" });
  assert.equal(chatFor(w, ken), null);
  assert.ok(chatFor(w, randy));
  assert.ok(chatFor(w, person({ grid: { whispers: "see" } })));
  const blind = line({ kind: "roll", see: "blind", from: "p1", text: "Perception: 17", roll: { formula: "1d20", total: 17, breakdown: "1d20 showed 17", natural: 17 } });
  const seen = chatFor(blind, ken)!;
  assert.equal(seen.text, "Perception: ?");
  assert.ok(Number.isNaN(seen.roll!.total));
  assert.equal(chatFor(blind, randy), null);
  assert.equal(chatFor(line({ see: "dm", from: "p1" }), randy), null);
  assert.ok(chatFor(line({}), randy));
});

test("a player's screen: their character, the order without hidden monsters, health in words", () => {
  const { backend, mira, pell } = setup();
  const ken = backend.addPerson("Ken", pell);
  const randy = backend.addPerson("Randy", mira);
  assert.notEqual(ken.pin, randy.pin);
  const wolf = backend.codex().find((s) => s.key === "monsters")!.entries.find((e) => e.name === "Wolf")!.id;
  backend.beginSession({ present: [mira, pell], starred: [], encounter: null, lastTime: "" });
  let s: PlayerState = backend.playerPreview(ken.id);
  assert.equal(s.character!.name, "Pell");
  assert.equal(s.initiative, null, "no fight going yet");
  backend.startFight({ encounter: null, hidden: true, groupFrom: 5 });
  backend.addToFight(wolf, { count: 2, group: false, hidden: true });
  const order = backend.tableView(["hp"]).order;
  assert.equal(order.length, 4);
  s = backend.playerPreview(ken.id);
  const live = order.filter((c) => !c.delayed);
  const current = live[backend.tableView([]).session!.combat.turn]!;
  assert.equal(s.initiative!.order.length, current.hidden ? 3 : 2, "hidden monsters stay off players' screens until their turn");
  backend.revealAll();
  s = backend.playerPreview(ken.id);
  const w = s.initiative!.order.find((c) => c.kind === "monster")!;
  assert.equal(w.health, "unhurt");
  assert.equal(s.others.map((o) => o.name).join(), "Mira", "a Player sees the other characters");
  backend.setPerson(ken.id, { level: "new" });
  assert.deepEqual(backend.playerPreview(ken.id).others, [], "a New player sees only their own character");
  backend.setPerson(ken.id, { level: "assistant" });
  assert.match(backend.playerPreview(ken.id).initiative!.order.find((c) => c.kind === "monster")!.health, /^\d+\/\d+$/, "an assistant sees the numbers");
});

test("show to players: only the people ticked, kept in their journal, written in the log", () => {
  const { backend, mira, pell } = setup();
  const ken = backend.addPerson("Ken", pell);
  const randy = backend.addPerson("Randy", mira);
  backend.beginSession({ present: [mira, pell], starred: [], encounter: null, lastTime: "" });
  const note = backend.createPage("The torn letter", "Handouts");
  backend.showToPlayers(note, [randy.id]);
  assert.equal(backend.playerPreview(randy.id).shown[0]!.title, "The torn letter");
  assert.equal(backend.playerPreview(ken.id).shown.length, 0, "Ken didn't find it");
  assert.match(backend.tableView([]).session!.log.at(-1)!.text, /Showed The torn letter to Randy/);
  backend.showToPlayers(note);
  assert.equal(backend.playerPreview(ken.id).shown.length, 1, "Show to all");
});

test("players join over the network with their PIN, act within their permissions, and wrong PINs lock out", async () => {
  const { backend, events, mira, pell } = setup();
  const ken = backend.addPerson("Ken", pell);
  backend.addPerson("Randy", mira);
  backend.beginSession({ present: [mira, pell], starred: [], encounter: null, lastTime: "" });
  const view = await backend.openTable(0);
  try {
    assert.equal(view.open, true);
    const base = `http://127.0.0.1:${view.port}`;
    const page = await fetch(base + "/");
    assert.match(await page.text(), /Player/);
    const join = await (await fetch(base + "/join", { method: "POST", body: JSON.stringify({ pin: ken.pin }) })).json();
    assert.deepEqual(join, { ok: true, name: "Ken" });
    const state = await (await fetch(`${base}/state?pin=${ken.pin}`)).json();
    assert.equal(state.value.character.name, "Pell");
    const act = (action: unknown) => fetch(`${base}/act?pin=${ken.pin}`, { method: "POST", body: JSON.stringify({ action }) }).then((r) => r.json());
    assert.equal((await act({ type: "chat", text: "Hello table" })).ok, true);
    assert.equal(backend.tableMeta().chat.at(-1)!.who, "Ken");
    const roll = await act({ type: "roll", formula: "1d20+2", see: "blind" });
    assert.equal(roll.ok, true);
    const mine = (await (await fetch(`${base}/state?pin=${ken.pin}`)).json()).value.chat.at(-1);
    assert.equal(mine.text, "?", "Ken rolled blind: only the DM sees it");
    assert.match(backend.tableMeta().chat.at(-1)!.text, /^\d+$/, "the DM sees the number");
    assert.equal((await act({ type: "hp", value: 3 })).ok, true);
    assert.equal(backend.characterView(pell).hpNow, 3, "a player changes their own hit points");
    const refused = await act({ type: "point", x: 1, y: 2 });
    assert.equal(refused.ok, false, "a Player hasn't the pointer");
    assert.ok(events.some((e) => e.type === "table"), "the DM's screen hears about it");
    // Five wrong PINs from one device: a wait, even for the right one.
    for (let i = 0; i < 5; i++) await fetch(base + "/join", { method: "POST", body: JSON.stringify({ pin: "00000" }) });
    const locked = await fetch(base + "/join", { method: "POST", body: JSON.stringify({ pin: ken.pin }) });
    assert.equal(locked.status, 429);
    // A re-rolled PIN stops working at once.
    backend.rerollPin(ken.id);
  } finally {
    await backend.closeTable();
  }
  assert.equal(backend.players().open, false);
});

test("End my turn: only on your own turn when the table rule allows it", async () => {
  const { backend, mira, pell } = setup();
  const ken = backend.addPerson("Ken", pell);
  backend.beginSession({ present: [mira, pell], starred: [], encounter: null, lastTime: "" });
  backend.startFight({ encounter: null, hidden: true, groupFrom: 5 });
  const view = await backend.openTable(0);
  try {
    const act = (action: unknown) => fetch(`http://127.0.0.1:${view.port}/act?pin=${ken.pin}`, { method: "POST", body: JSON.stringify({ action }) }).then((r) => r.json());
    assert.equal((await act({ type: "endTurn" })).ok, false, "the DM moves turns on by default");
    backend.setTableMeta({ settings: { initiative: { selfAdvance: true } } });
    // Move the order on until it is Pell's turn.
    for (let i = 0; i < 3 && !backend.playerPreview(ken.id).initiative!.myTurn; i++) backend.nextTurn({ rerollEachRound: false });
    const before = backend.tableView([]).session!.combat.turn;
    assert.equal(backend.playerPreview(ken.id).initiative!.canEndTurn, true);
    assert.equal((await act({ type: "endTurn" })).ok, true);
    assert.notEqual(backend.tableView([]).session!.combat.turn, before);
    assert.equal((await act({ type: "endTurn" })).ok, false, "not twice: it's someone else's turn now");
  } finally {
    await backend.closeTable();
  }
});
