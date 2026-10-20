// The AI panel's back end: one conversation per world, the World Notes, and the proposal waiting
// for Accept. Saved with the world (Session.ai). Accept runs the proposal as one undo step
// labelled "AI: <the request>"; Reject throws it away. Nothing changes before Accept.

import type { Id } from "../../engine/index.ts";
import { LibraryError } from "../../storage/index.ts";
import type { Session } from "../session.ts";
import type { ChangeAction } from "./actions.ts";
import { applyActions } from "./actions.ts";
import { AiError, runJob } from "./job.ts";
import type { AiTransport, JobResult } from "./job.ts";
import { dollars, estimateCost, pickModel } from "./models.ts";
import type { JobSize, ModelChoice } from "./models.ts";

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
  prompt: string;
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
}

export function aiView(s: Session): AiView {
  const m = readMemory(s);
  const p = pending.get(s);
  return { chat: m.chat, notes: m.notes, waiting: !!p };
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
  const guess = estimateCost(model, prompt.length + JSON.stringify(m.notes).length + m.chat.slice(-10).reduce((n, c) => n + c.text.length, 0) + 12000);
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
  if (hasChanges) pending.set(s, { prompt, actions: result.actions, notes: result.preview.notes, entry: m.chat.length - 1 });
  return { status: "done", view: aiView(s), costUsd: result.costUsd };
}

/** Accept: the whole proposal as one undo step. If it can no longer be done, nothing changes. */
export function accept(s: Session): { label: string; view: AiView } {
  if (s.readOnly) throw new LibraryError(`${s.readOnlyReason ?? "This is read-only."} Nothing can be changed here.`);
  const p = pending.get(s);
  if (!p) throw new LibraryError("There is nothing waiting to accept.");
  const label = `AI: ${p.prompt.length > 80 ? `${p.prompt.slice(0, 77)}…` : p.prompt}`;
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
  const m = readMemory(s);
  m.chat = [];
  writeMemory(s, m);
  return aiView(s);
}
