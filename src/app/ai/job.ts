// One AI job: a request from the user, a few rounds of the AI reading what it needs and asking for
// changes, and a proposal at the end. Nothing in the world changes during a job. If anything goes
// wrong (the internet drops, the AI refuses, a round fails), the job ends with nothing applied.

import type Anthropic from "@anthropic-ai/sdk";
import type { Id, Workspace } from "../../engine/index.ts";
import { ActionError, CHANGE_TOOLS, READ_TOOLS, REPORT_TOOL, TOOLS, applyActions, placeholderFor, runReadTool } from "./actions.ts";
import type { Applied, ChangeAction, ChangeTool } from "./actions.ts";
import { CAREFUL, costOf } from "./models.ts";
import type { ModelInfo } from "./models.ts";

type M = Anthropic.Beta.Messages.BetaMessage;
type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type ToolResult = Anthropic.Beta.Messages.BetaToolResultBlockParam;

/** Sends one request to Claude. In the app it is the Anthropic SDK; in tests a pretend AI. */
export type AiTransport = (params: Params) => Promise<M>;

export class AiError extends Error {
  /** "offline", "key" (missing or refused), "refused", "failed" */
  readonly kind: string;
  constructor(kind: string, message: string) {
    super(message);
    this.kind = kind;
  }
}

export interface JobRequest {
  /** The user's words. */
  prompt: string;
  /** What the job is about: "Working on: Goblin" or the whole world. */
  workingOn: { id: Id; name: string } | null;
  /** World Notes, user lines and AI lines. */
  notes: { text: string; pinned: boolean }[];
  /** The recent chat, oldest first. */
  history: { role: "user" | "ai"; text: string }[];
  placeName: string;
  placeType: "world" | "system";
  model: ModelInfo;
  /** Extra instructions for special jobs (Check for errors, create from a document). */
  extra?: string;
  maxRounds?: number;
  /** "check": the AI may only look things up, report problems and update its World Notes. */
  mode?: "change" | "check";
}

export interface Report {
  nodes: Id[];
  category: "balance" | "economy" | "filing" | "lore";
  title: string;
  detail: string;
}

export interface JobResult {
  reply: string;
  /** Check for errors: the problems found. */
  reports: Report[];
  actions: ChangeAction[];
  preview: Applied;
  costUsd: number;
  modelName: string;
}

const SYSTEM = `You are the assistant inside DM in a Pocket, a desktop app where people build tabletop role-playing game systems and worlds: rules, monsters, items, spells, lore and roll tables. Nothing is ever changed without the user seeing it first: every change you ask for is collected into a proposal that the user reads and accepts or rejects as one step.

How to work:
- Look things up with find_nodes, read_node and list_categories before changing them. Use ids from the results; never invent ids.
- Ask for changes only with the change actions. They don't happen yet; each answer tells you it is queued, or why it can't be done, so you can fix it.
- Bulk changes go by category: "all swords" means everything filed under Swords. Find them first and include every one.
- Change only what the request is about. When the user is working on one thing, change only that thing unless they ask for more.
- You can't delete anything. If something should go, use suggest_delete and the user decides.
- Values that are numbers go in as numbers. Links to other things are written "@" and the id.
- If the request is unclear, or more than you can do with these actions, ask a short question instead of guessing.
- When you are done, reply in two or three short, plain sentences: what you propose and anything the user should know. The user is not a programmer: no ids, field names or code in your reply.`;

function systemPrompt(req: JobRequest): Anthropic.Beta.Messages.BetaTextBlockParam[] {
  const notes = req.notes.length ? req.notes.map((n) => `- ${n.text}${n.pinned ? " (written by the user; keep it)" : ""}`).join("\n") : "(none yet)";
  const context = [
    `This is the ${req.placeType} "${req.placeName}".`,
    req.workingOn ? `The user is working on: ${req.workingOn.name} (id ${req.workingOn.id}).` : "The user is working on the whole " + req.placeType + ".",
    `World Notes:\n${notes}`,
    req.extra ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");
  // The fixed part comes first and is cached; the part that changes comes after it.
  return [
    { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
    { type: "text", text: context },
  ];
}

export async function runJob(send: AiTransport, ws: Workspace, layerId: Id, req: JobRequest): Promise<JobResult> {
  const messages: MessageParam[] = [];
  // The recent chat as plain words, then the new request.
  for (const h of req.history.slice(-10)) messages.push({ role: h.role === "user" ? "user" : "assistant", content: h.text });
  if (messages[0]?.role === "assistant") messages.shift();
  messages.push({ role: "user", content: req.prompt });

  const actions: ChangeAction[] = [];
  const reports: Report[] = [];
  const check = req.mode === "check";
  const tools = check ? [...TOOLS.filter((t) => (READ_TOOLS as readonly string[]).includes(t.name) || t.name === "update_world_notes"), REPORT_TOOL] : TOOLS;
  let cost = 0;
  let reply = "";
  const rounds = req.maxRounds ?? 12;
  for (let round = 0; ; round++) {
    if (round >= rounds) throw new AiError("failed", "The AI took too many steps without finishing, so nothing was changed. Try asking for less at once.");
    const params: Params = {
      model: req.model.id,
      max_tokens: 16000,
      system: systemPrompt(req),
      tools: tools as Anthropic.Beta.Messages.BetaTool[],
      tool_choice: { type: "auto" },
      output_config: { effort: "medium" },
      messages,
    };
    // A careful request the AI's safety checks decline is tried again on another model.
    if (req.model.id === CAREFUL.id) Object.assign(params, { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
    let res: M;
    try {
      res = await send(params);
    } catch (e) {
      throw toAiError(e);
    }
    cost += costOf(res.model ?? req.model.id, res.usage ?? {});
    if (res.stop_reason === "refusal") throw new AiError("refused", "The AI declined this request, so nothing was changed.");
    if (res.stop_reason === "max_tokens") throw new AiError("failed", "The AI's answer was cut off, so nothing was changed. Try asking for less at once.");
    // Keep everything it sent, exactly as sent, so the next round continues the same conversation.
    messages.push({ role: "assistant", content: res.content as Anthropic.Beta.Messages.BetaContentBlockParam[] });
    const uses = res.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use");
    reply = res.content
      .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!uses.length) break;
    const results: ToolResult[] = [];
    for (const u of uses) {
      const input = (u.input && typeof u.input === "object" ? u.input : {}) as Record<string, unknown>;
      try {
        if (check && u.name === "report_problem") {
          const nodes = (Array.isArray(input.nodes) ? input.nodes : []).map((x) => String(x).replace(/^@/, "")).filter((x) => ws.peek(layerId, x));
          if (!nodes.length) throw new ActionError("Name at least one thing that exists.");
          const category = ["balance", "economy", "filing", "lore"].includes(String(input.category)) ? (String(input.category) as Report["category"]) : "lore";
          reports.push({ nodes, category, title: String(input.title ?? "").slice(0, 200) || "Something looks off", detail: String(input.detail ?? "").slice(0, 600) });
          results.push({ type: "tool_result", tool_use_id: u.id, content: "Noted." });
        } else if (check && u.name !== "update_world_notes" && (CHANGE_TOOLS as string[]).includes(u.name)) {
          throw new ActionError("This is a check: report problems with report_problem; don't change anything.");
        } else if ((READ_TOOLS as readonly string[]).includes(u.name)) {
          results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(runReadTool(ws, layerId, u.name, input)) });
        } else if ((CHANGE_TOOLS as string[]).includes(u.name)) {
          const next = [...actions, { tool: u.name as ChangeTool, input }];
          const tried = tryOut(ws, layerId, next);
          actions.push(next.at(-1)!);
          const made = u.name === "create_node" ? ` It will be called ${placeholderFor(actions)}; use that id in later actions.` : "";
          results.push({ type: "tool_result", tool_use_id: u.id, content: `Queued: ${tried.lines.at(-1) ?? tried.suggestions.at(-1) ?? "done"}.${made}` });
        } else throw new ActionError(`There is no action called ${u.name}.`);
      } catch (e) {
        if (!(e instanceof ActionError)) throw e;
        results.push({ type: "tool_result", tool_use_id: u.id, content: e.message, is_error: true });
      }
    }
    // Every answer goes back in one message.
    messages.push({ role: "user", content: results });
  }
  const preview = actions.length ? tryOut(ws, layerId, actions) : { lines: [], suggestions: [], notes: null, touched: 0 };
  return { reply: reply || (actions.length ? "Here is what I propose." : "I have nothing to change."), reports, actions, preview, costUsd: cost, modelName: req.model.name };
}

class PutBack extends Error {
  readonly applied: Applied;
  constructor(applied: Applied) {
    super("put back");
    this.applied = applied;
  }
}

/**
 * Tries the actions out and puts everything back, to check they can be done and to describe them.
 * Nothing is saved and nothing goes into history: a step that fails is undone in full.
 */
export function tryOut(ws: Workspace, layerId: Id, actions: ChangeAction[]): Applied {
  try {
    ws.transact("AI trial", () => {
      throw new PutBack(applyActions(ws, layerId, actions));
    });
  } catch (e) {
    if (e instanceof PutBack) return e.applied;
    if (e instanceof ActionError) throw e;
    throw new ActionError(e instanceof Error ? e.message : String(e));
  }
  throw new ActionError("Nothing was tried.");
}

/** The SDK's typed errors, in plain words. */
export function toAiError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  const err = e as { status?: number; name?: string; message?: string };
  const status = typeof err?.status === "number" ? err.status : null;
  if (status === 401 || status === 403) return new AiError("key", "Claude didn't accept the API key. Check it in Settings.");
  if (status === 429) return new AiError("failed", "Claude is busy or the key's limit was reached. Try again in a minute. Nothing was changed.");
  if (status === 400) return new AiError("failed", `Claude couldn't do that request (${err.message ?? "bad request"}). Nothing was changed.`);
  if (status && status >= 500) return new AiError("failed", "Claude had a problem on its side. Try again in a minute. Nothing was changed.");
  if (err?.name === "APIConnectionError" || err?.name === "APIConnectionTimeoutError") return new AiError("offline", "Couldn't reach Claude. Check the internet connection. Nothing was changed.");
  return new AiError("failed", `${err.message ?? "Something went wrong"}. Nothing was changed.`);
}
