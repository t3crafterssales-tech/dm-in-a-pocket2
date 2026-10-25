// The AI panel's back end: one conversation per world, the World Notes, and the proposal waiting
// for Accept. Saved with the world (Session.ai). Accept runs the proposal as one undo step
// labelled "AI: <the request>"; Reject throws it away. Nothing changes before Accept.

import { newId } from "../../engine/index.ts";
import type { Id } from "../../engine/index.ts";
import { LibraryError } from "../../storage/index.ts";
import { readPanel } from "../flagpanel.ts";
import { sectionOf } from "../rules.ts";
import type { Session } from "../session.ts";
import type { ChangeAction } from "./actions.ts";
import { applyActions, runReadTool } from "./actions.ts";
import { splitDocument } from "./documents.ts";
import { AiError, runJob } from "./job.ts";
import type { AiTransport, JobResult } from "./job.ts";
import { dollars, estimateCost, pickModel } from "./models.ts";
import type { JobSize, ModelChoice } from "./models.ts";
import { toPlain } from "../../engine/richtext.ts";

export interface Note {
  text: string;
  /** Written by the user: kept, and never changed by the AI. */
  pinned: boolean;
}

export interface ChatEntry {
  role: "user" | "ai";
  text: string;
  time: number;
  /** For the AI's answers: the proposal in plain words, and what became of it. */
  lines?: string[];
  suggestions?: string[];
  status?: "waiting" | "accepted" | "rejected";
  costUsd?: number;
  model?: string;
}

export interface AiMemory {
  notes: Note[];
  chat: ChatEntry[];
}

interface Pending {
  label: string;
  actions: ChangeAction[];
  notes: string[] | null;
  /** The chat entry showing this proposal. */
  entry: number;
}

/** Kept with the session while the world is open; a proposal isn't saved, so closing drops it. */
const pending = new WeakMap<Session, Pending>();

const CHAT_KEEP = 200;

export function readMemory(s: Session): AiMemory {
  const raw = (s.ai ?? {}) as Partial<AiMemory>;
  const notes = Array.isArray(raw.notes) ? raw.notes.filter((n): n is Note => !!n && typeof n.text === "string").map((n) => ({ text: n.text, pinned: !!n.pinned })) : [];
  const chat = Array.isArray(raw.chat) ? raw.chat.filter((c): c is ChatEntry => !!c && (c.role === "user" || c.role === "ai") && typeof c.text === "string") : [];
  return { notes, chat };
}

function writeMemory(s: Session, m: AiMemory) {
  s.setAi({ notes: m.notes, chat: m.chat.slice(-CHAT_KEEP) });
}

export interface AiView {
  chat: ChatEntry[];
  notes: Note[];
  /** True when the last answer has a proposal waiting for Accept or Reject. */
  waiting: boolean;
  /** A job done section by section (a document, or a whole system), if one is under way. */
  build: { title: string; done: number; total: number; next: string | null } | null;
}

export function aiView(s: Session): AiView {
  const m = readMemory(s);
  const p = pending.get(s);
  const b = builds.get(s);
  return { chat: m.chat, notes: m.notes, waiting: !!p, build: b ? { title: b.title, done: b.index, total: b.steps.length, next: b.steps[b.index]?.title ?? null } : null };
}

// ---------- Section by section: create from a document, or generate a whole system ----------

interface BuildStep {
  title: string;
  /** What this part asks the AI to do. */
  instruction: string;
  /** For documents: this part of the user's text. */
  text?: string;
}

interface Build {
  title: string;
  steps: BuildStep[];
  index: number;
}

/** Kept while the world is open, like a waiting proposal. */
const builds = new WeakMap<Session, Build>();

/** The parts of a whole system, in the order a designer would build them. */
const GENERATE_STEPS: { title: string; instruction: string }[] = [
  { title: "The core check and abilities", instruction: "Make the core check (kind core) and the abilities (kind abilities) for this game." },
  { title: "Resources and conditions", instruction: "Make the resources (hit points and anything like it; kind resources) and the conditions (kind conditions)." },
  { title: "Skills", instruction: "Make the skills (kind skills), each with the ability it uses (value ability, a link to the ability)." },
  { title: "Rules of play", instruction: "Write the main rules of play: combat, magic or powers if any, advancement, time and rest, money (kinds combat, magic, advancement, time, currency), a short text each." },
  { title: "Monsters and characters", instruction: "Make about ten monsters and a few characters of the world (kind being), with hit points, armour, speed, challenge and a short description, and attack bricks where they fit." },
  { title: "Equipment", instruction: "Make about fifteen items (kind item): weapons with attack bricks, armour, and useful gear, with costs that make sense against each other, filed in fitting categories." },
  { title: "Lore", instruction: "Make a few lore pages, places and factions (kind lore) that set the scene." },
];

export function buildStart(s: Session, kind: "document" | "generate", input: { name?: string; text?: string; prompt?: string }): AiView {
  if (s.readOnly) throw new LibraryError(`${s.readOnlyReason ?? "This is read-only."} Nothing can be changed here.`);
  if (pending.get(s)) throw new LibraryError("Accept or reject the last proposal first.");
  if (kind === "document") {
    const text = String(input.text ?? "").trim();
    if (!text) throw new LibraryError("That document has no words in it.");
    const parts = splitDocument(text);
    const name = String(input.name ?? "your document").slice(0, 100);
    builds.set(s, {
      title: `Create from "${name}"`,
      steps: parts.map((t, i) => ({
        title: `Part ${i + 1} of ${parts.length}`,
        instruction: `Build what this part of the user's own document describes, using their names and numbers. Use the kinds of thing the app has (rules in the right Rules tab section, abilities, resources, skills, conditions, beings, items, bricks, lore, roll tables). Things made from earlier parts are already in the world: look them up and use or add to them rather than making them again. Only make what the text describes; don't invent extra content.`,
        text: t,
      })),
      index: 0,
    });
  } else {
    const idea = String(input.prompt ?? "").trim();
    if (!idea) throw new LibraryError("Describe the game you'd like, such as \"a cyberpunk game with a d6 dice pool\".");
    builds.set(s, { title: `Generate: ${idea.length > 60 ? `${idea.slice(0, 57)}…` : idea}`, steps: GENERATE_STEPS.map((g) => ({ ...g, instruction: `The user's idea for the game: ${idea}\n\n${g.instruction}` })), index: 0 });
  }
  return aiView(s);
}

/** Runs the next section; its proposal is accepted or rejected like any other. */
export async function buildNext(s: Session, send: AiTransport, opts: { choice: ModelChoice; threshold: number; confirmed?: boolean }, record: (usd: number) => void, now: () => number): Promise<AskResult> {
  const b = builds.get(s);
  if (!b) throw new LibraryError("There is nothing being built.");
  const step = b.steps[b.index];
  if (!step) {
    builds.delete(s);
    throw new LibraryError("All the sections are done.");
  }
  const plan = b.steps.map((x, i) => `${i + 1}. ${x.title}${i < b.index ? " (done)" : i === b.index ? " (now)" : ""}`).join("\n");
  const extra = [`This is one section of a bigger job, "${b.title}", done section by section so the user can check each one:\n${plan}`, step.instruction, step.text ? `The user's text for this part:\n"""\n${step.text}\n"""` : ""].filter(Boolean).join("\n\n");
  const r = await ask(
    s,
    send,
    { prompt: `${b.title}: ${step.title}. Please build this section.`, shown: `${b.title}: ${step.title}`, label: `AI: ${b.title}, ${step.title.toLowerCase()}`, workingOn: null, choice: opts.choice, threshold: opts.threshold, confirmed: opts.confirmed, size: "big", extra },
    record,
    now,
  );
  if (r.status === "done") {
    b.index++;
    if (b.index >= b.steps.length) builds.delete(s);
    return { ...r, view: aiView(s) };
  }
  return r;
}

export function buildStop(s: Session): AiView {
  builds.delete(s);
  return aiView(s);
}

export interface AskOptions {
  prompt: string;
  workingOn: Id | null;
  choice: ModelChoice;
  threshold: number;
  /** The user saw the estimate and said go ahead. */
  confirmed?: boolean;
  /** For special jobs. */
  size?: JobSize;
  extra?: string;
  /** The words saved in the chat, if different from the prompt (a long document, say). */
  shown?: string;
  /** The History label, if not "AI: <the request>". */
  label?: string;
}

export type AskResult = { status: "estimate"; estimate: string; model: string } | { status: "done"; view: AiView; costUsd: number };

/** How big a request looks, for Automatic: one thing is small; the whole world or "all" is big. */
function sizeOf(prompt: string, workingOn: Id | null): JobSize {
  if (workingOn && prompt.length < 400 && !/\b(all|every|each|whole|entire|create|generate|new)\b/i.test(prompt)) return "small";
  return "big";
}

export async function ask(s: Session, send: AiTransport, opts: AskOptions, record: (usd: number) => void, now: () => number): Promise<AskResult> {
  const prompt = opts.prompt.trim();
  if (!prompt) throw new LibraryError("Type what you'd like the AI to do.");
  if (pending.get(s)) throw new LibraryError("Accept or reject the last proposal first.");
  const m = readMemory(s);
  const target = opts.workingOn ? s.ws.peek(s.id, opts.workingOn) : null;
  const model = pickModel(opts.choice, opts.size ?? sizeOf(prompt, target ? target.id : null));
  const guess = estimateCost(model, prompt.length + (opts.extra?.length ?? 0) + JSON.stringify(m.notes).length + m.chat.slice(-10).reduce((n, c) => n + c.text.length, 0) + 12000);
  if (!opts.confirmed && guess > opts.threshold) return { status: "estimate", estimate: `About ${dollars(guess)} with ${model.name}. Estimates are approximate.`, model: model.name };

  let result: JobResult;
  try {
    result = await runJob(send, s.ws, s.id, {
      prompt,
      workingOn: target ? { id: target.id, name: target.name } : null,
      notes: m.notes,
      history: m.chat.map((c) => ({ role: c.role, text: c.text })),
      placeName: s.name,
      placeType: s.type,
      model,
      extra: opts.extra,
    });
  } catch (e) {
    if (e instanceof AiError) throw new LibraryError(e.message);
    throw e;
  }
  record(result.costUsd);
  const time = now();
  m.chat.push({ role: "user", text: opts.shown ?? prompt, time });
  const hasChanges = result.actions.some((a) => a.tool !== "suggest_delete");
  const entry: ChatEntry = { role: "ai", text: result.reply, time, lines: result.preview.lines, suggestions: result.preview.suggestions, status: hasChanges ? "waiting" : undefined, costUsd: result.costUsd, model: result.modelName };
  m.chat.push(entry);
  writeMemory(s, m);
  const words = opts.shown ?? prompt;
  const label = opts.label ?? `AI: ${words.length > 80 ? `${words.slice(0, 77)}…` : words}`;
  if (hasChanges) pending.set(s, { label, actions: result.actions, notes: result.preview.notes, entry: m.chat.length - 1 });
  return { status: "done", view: aiView(s), costUsd: result.costUsd };
}

/** Accept: the whole proposal as one undo step. If it can no longer be done, nothing changes. */
export function accept(s: Session): { label: string; view: AiView } {
  if (s.readOnly) throw new LibraryError(`${s.readOnlyReason ?? "This is read-only."} Nothing can be changed here.`);
  const p = pending.get(s);
  if (!p) throw new LibraryError("There is nothing waiting to accept.");
  const label = p.label;
  const world = p.actions.filter((a) => a.tool !== "update_world_notes" && a.tool !== "suggest_delete");
  try {
    if (world.length) s.ws.transact(label, () => applyActions(s.ws, s.id, world), "ai");
  } catch (e) {
    throw new LibraryError(`That can't be done any more (${e instanceof Error ? e.message : String(e)}). Nothing was changed. Ask again.`);
  }
  pending.delete(s);
  const m = readMemory(s);
  if (p.notes) m.notes = [...m.notes.filter((n) => n.pinned), ...p.notes.map((text) => ({ text, pinned: false }))];
  if (m.chat[p.entry]) m.chat[p.entry]!.status = "accepted";
  writeMemory(s, m);
  return { label, view: aiView(s) };
}

export function reject(s: Session): AiView {
  const p = pending.get(s);
  if (!p) return aiView(s);
  pending.delete(s);
  const m = readMemory(s);
  if (m.chat[p.entry]) m.chat[p.entry]!.status = "rejected";
  writeMemory(s, m);
  return aiView(s);
}

/**
 * The user edits the World Notes as text, a line each. Lines the AI wrote and the user left as
 * they were stay the AI's; anything new or changed is the user's and pinned.
 */
export function setNotes(s: Session, text: string): AiView {
  const m = readMemory(s);
  const ai = new Set(m.notes.filter((n) => !n.pinned).map((n) => n.text));
  m.notes = String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 60)
    .map((t) => ({ text: t.slice(0, 500), pinned: !ai.has(t) }));
  writeMemory(s, m);
  return aiView(s);
}

export function clearChat(s: Session): AiView {
  pending.delete(s);
  builds.delete(s);
  const m = readMemory(s);
  m.chat = [];
  writeMemory(s, m);
  return aiView(s);
}

// ---------- Check for errors, and live checking ----------

const CATEGORY_WORDS: Record<string, string> = {
  balance: "Balance: damage, hit points or other numbers far off for a challenge rating, compared with the system's own content",
  economy: "Economy: prices that don't make sense against similar things",
  filing: "Filing: things filed in the wrong category, sheets missing what their kind needs, near-duplicates",
  lore: "Lore consistency: things that contradict the World Notes, the world rules, or each other (for example a metal sword in a world with no metal, or two dates for the same war)",
};

/**
 * What a check looks at: the user's own things (homemade, from others, or changed in this world),
 * newest first, or just the ones a live check names. Starter content is looked up only as needed.
 */
function thingsToCheck(s: Session, only: Set<Id> | null, limit = 120): { id: Id; text: string }[] {
  const layer = s.ws.layer(s.id);
  // Made by hand or by others, changed in this world, or edited since the starter made it.
  const mine = (n: { id: Id; source: string; created: number; changed: number }) => n.source !== "template" || !!layer.changes[n.id] || n.changed - n.created > 1000;
  const nodes = s.ws
    .list(s.id)
    .filter((n) => n.kind !== "category" && !n.template && (only ? only.has(n.id) : mine(n)))
    .sort((a, b) => (b.changed ?? 0) - (a.changed ?? 0))
    .slice(0, limit);
  return nodes.map((n) => {
    const r = runReadTool(s.ws, s.id, "read_node", { id: n.id }) as { text?: string };
    if (typeof r.text === "string" && r.text.length > 400) r.text = `${r.text.slice(0, 400)}…`;
    return { id: n.id, text: JSON.stringify(r) };
  });
}

function worldRules(s: Session): string[] {
  return s.ws
    .list(s.id, "rule")
    .filter((n) => sectionOf(s.ws, s.id, n) === "world")
    .map((n) => `${n.name}${n.text ? `: ${toPlain(n.text)}` : ""}`);
}

export interface CheckOptions {
  choice: ModelChoice;
  threshold: number;
  confirmed?: boolean;
  /** Live checking: only these things, quietly, with the quick model. */
  only?: Id[];
}

export type CheckResult = { status: "estimate"; estimate: string; model: string } | { status: "done"; found: number; costUsd: number; nothing: boolean };

export async function check(s: Session, send: AiTransport, opts: CheckOptions, record: (usd: number) => void, now: () => number): Promise<CheckResult> {
  const panel = readPanel(s.flagPanel);
  const cats = (Object.keys(CATEGORY_WORDS) as (keyof typeof CATEGORY_WORDS)[]).filter((c) => panel.checks[c as keyof typeof panel.checks]?.on !== false);
  if (!cats.length) throw new LibraryError("Every kind of check is switched off in World settings → Checks.");
  const live = !!opts.only;
  const things = thingsToCheck(s, opts.only ? new Set(opts.only) : null);
  if (!things.length) return { status: "done", found: 0, costUsd: 0, nothing: true };
  const rules = worldRules(s);
  const extra = [
    live
      ? "This is a live check of something the user just changed. Look only at the things below and what they touch."
      : "This is Check for errors. Review the things below: the user's own work. Look up the system's own content with find_nodes and read_node to know what is normal.",
    `Check only these, and report each real problem with report_problem:\n${cats.map((c) => `- ${CATEGORY_WORDS[c]} (sensitivity: ${panel.checks[c as keyof typeof panel.checks].level})`).join("\n")}`,
    "Broken links and world-rule breaks the app finds by itself are already flagged in red; report only what it can't see. Don't report things that are fine, and don't repeat yourself. Change nothing.",
    rules.length ? `World rules:\n${rules.map((r) => `- ${r}`).join("\n")}` : "",
    live ? "" : "If the World Notes should change, call update_world_notes once.",
    "When done, reply with one short sentence: how many problems you found.",
    `Things to check:\n${things.map((t) => t.text).join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const m = readMemory(s);
  const model = pickModel(live ? "quick" : opts.choice, live ? "small" : "big");
  const guess = estimateCost(model, extra.length + JSON.stringify(m.notes).length, live ? 2 : 4);
  if (!live && !opts.confirmed && guess > opts.threshold) return { status: "estimate", estimate: `About ${dollars(guess)} with ${model.name} to check ${things.length} thing${things.length === 1 ? "" : "s"}. Estimates are approximate.`, model: model.name };

  let result: JobResult;
  try {
    result = await runJob(send, s.ws, s.id, { prompt: live ? "Check what I just changed." : "Check for errors.", workingOn: null, notes: m.notes, history: [], placeName: s.name, placeType: s.type, model, extra, mode: "check", maxRounds: live ? 4 : 10 });
  } catch (e) {
    if (e instanceof AiError) throw new LibraryError(e.message);
    throw e;
  }
  record(result.costUsd);
  // The new findings replace the old ones they cover: every checked category, or the things a live check looked at.
  const covered = new Set(things.map((t) => t.id));
  const p = readPanel(s.flagPanel);
  p.aiFlags = p.aiFlags.filter((f) => (live ? !f.nodes.some((id) => covered.has(id)) : !cats.includes(f.category)));
  const time = now();
  for (const r of result.reports) p.aiFlags.push({ id: newId(), category: r.category, title: r.title, detail: r.detail, nodes: r.nodes, time });
  s.setFlagPanel(p);
  if (result.preview.notes) m.notes = [...m.notes.filter((n) => n.pinned), ...result.preview.notes.map((text) => ({ text, pinned: false }))];
  if (!live) {
    m.chat.push({ role: "user", text: "Check for errors", time });
    m.chat.push({ role: "ai", text: result.reports.length ? `${result.reply} They are in the flag panel as yellow flags.` : result.reply || "I found nothing wrong.", time, lines: result.reports.map((r) => r.title), costUsd: result.costUsd, model: result.modelName });
  }
  writeMemory(s, m);
  return { status: "done", found: result.reports.length, costUsd: result.costUsd, nothing: false };
}
