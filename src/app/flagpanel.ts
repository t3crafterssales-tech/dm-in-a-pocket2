// The flag panel: every problem or notice as a colour-coded block (red broken, yellow looks off,
// blue just so you know, green fixed with Undo). Red and yellow are worked out fresh from the
// world every time, so they clear themselves; blue and green are a short log kept with the world.

import { DEFAULT_CHECKS, HISTORY_MAX_AGE_MS, getAt, isLink, link, redFlags, worldRuleFlags, yellowFlags } from "../engine/index.ts";
import type { Id, NodeKind, Slot, Workspace } from "../engine/index.ts";

export interface LogEntry {
  id: string;
  color: "blue" | "green";
  title: string;
  time: number;
  /** The undo step it made, so a green block can offer Undo while it is the latest step. */
  stepId: string | null;
  nodes: Id[];
}

/** What is kept with the world. */
export interface PanelState {
  /** Flags the user chose to ignore, one by one. */
  ignored: string[];
  /** Kinds of yellow warning ignored world-wide ("Ignore all like this"). Red can't be. */
  ignoredKinds: string[];
  /** Flags the user has looked at, so they no longer count as new. */
  seen: string[];
  log: LogEntry[];
}

export function readPanel(raw: unknown): PanelState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<PanelState>;
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const log = Array.isArray(r.log)
    ? r.log.filter((e): e is LogEntry => !!e && typeof e === "object" && (e.color === "blue" || e.color === "green") && typeof e.title === "string" && typeof e.time === "number")
    : [];
  return { ignored: strings(r.ignored), ignoredKinds: strings(r.ignoredKinds), seen: strings(r.seen), log };
}

export interface FlagBlock {
  key: string;
  color: "red" | "yellow" | "blue" | "green";
  /** "missing" (a link to something gone), "rule" (breaks a world rule), or a yellow kind. */
  kind: string;
  category: string | null;
  title: string;
  detail: string;
  nodes: { id: Id; name: string }[];
  isNew: boolean;
  /** Green blocks: Undo works while it is the latest change. */
  canUndo: boolean;
  time: number | null;
}

export interface FlagPanelView {
  /** Red, then yellow, then blue, then green, as in the design. */
  blocks: FlagBlock[];
  ignored: FlagBlock[];
  counts: { red: number; yellow: number; blue: number; green: number; new: number };
}

/** Red and yellow flags as they are right now. */
export function liveFlags(ws: Workspace, layerId: Id, redOnly = false): FlagBlock[] {
  const name = (id: Id) => ({ id, name: ws.get(layerId, id)?.name ?? "?" });
  const red: FlagBlock[] = [
    ...redFlags(ws, layerId).map((f) => ({
      key: f.key,
      color: "red" as const,
      kind: "missing",
      category: null,
      title: f.title,
      detail: f.inBin ? "It's in the recycle bin and can be restored, or each link can be pointed somewhere else." : "Point each link somewhere else, or remove it.",
      nodes: [...new Set(f.slots.map((s) => s.node))].map(name),
      isNew: false,
      canUndo: false,
      time: null,
    })),
    ...worldRuleFlags(ws, layerId).map((f) => ({ key: f.key, color: "red" as const, kind: "rule", category: null, title: f.title, detail: "Change them, or choose I meant that for deliberate exceptions.", nodes: f.offenders.map(name), isNew: false, canUndo: false, time: null })),
  ];
  if (redOnly) return red;
  const yellow: FlagBlock[] = yellowFlags(ws, layerId, DEFAULT_CHECKS).map((f) => ({ key: f.key, color: "yellow" as const, kind: f.kind, category: f.category, title: f.title, detail: f.detail, nodes: f.nodes.map(name), isNew: false, canUndo: false, time: null }));
  return [...red, ...yellow];
}

export function panelView(ws: Workspace, layerId: Id, state: PanelState, now: number): FlagPanelView {
  const live = liveFlags(ws, layerId).map((b) => ({ ...b, isNew: !state.seen.includes(b.key) }));
  const isIgnored = (b: FlagBlock) => state.ignored.includes(b.key) || (b.color === "yellow" && state.ignoredKinds.includes(b.kind));
  const shown = live.filter((b) => !isIgnored(b));
  const latest = ws.history.at(-1)?.id ?? null;
  const log = state.log
    .filter((e) => now - e.time < HISTORY_MAX_AGE_MS)
    .sort((a, b) => b.time - a.time)
    .map((e) => ({
      key: `log:${e.id}`,
      color: e.color,
      kind: "log",
      category: null,
      title: e.title,
      detail: "",
      nodes: e.nodes.filter((id) => ws.exists(layerId, id)).map((id) => ({ id, name: ws.get(layerId, id)!.name })),
      isNew: false,
      canUndo: e.color === "green" && !!e.stepId && e.stepId === latest,
      time: e.time,
    }));
  const blocks = [...shown.filter((b) => b.color === "red"), ...shown.filter((b) => b.color === "yellow"), ...log.filter((b) => b.color === "blue"), ...log.filter((b) => b.color === "green")];
  return {
    blocks,
    ignored: live.filter(isIgnored),
    counts: {
      red: shown.filter((b) => b.color === "red").length,
      yellow: shown.filter((b) => b.color === "yellow").length,
      blue: log.filter((b) => b.color === "blue").length,
      green: log.filter((b) => b.color === "green").length,
      new: shown.filter((b) => b.isNew).length,
    },
  };
}

/** Keeps the saved memory small: only flags that still exist, and log entries from the last 30 days. */
export function tidy(ws: Workspace, layerId: Id, state: PanelState, now: number): PanelState {
  const keys = new Set(liveFlags(ws, layerId).map((b) => b.key));
  return {
    ignored: state.ignored.filter((k) => keys.has(k)),
    ignoredKinds: state.ignoredKinds,
    seen: state.seen.filter((k) => keys.has(k)),
    log: state.log.filter((e) => now - e.time < HISTORY_MAX_AGE_MS).slice(-500),
  };
}

// ---------- Fixing a broken link by hand ----------

export interface BrokenSlot {
  slot: Slot;
  nodeId: Id;
  nodeName: string;
  /** Where on it, in plain words: "its maximum", "the Claw brick", "its parent". */
  where: string;
}

export interface MissingDetail {
  key: string;
  missing: Id;
  missingName: string;
  /** The recycle bin entry, if it can be restored. */
  binId: Id | null;
  kind: NodeKind | null;
  slots: BrokenSlot[];
  /** Things of the same kind it could point at instead. */
  candidates: { id: Id; name: string }[];
}

export function missingDetail(ws: Workspace, layerId: Id, key: string): MissingDetail {
  const f = redFlags(ws, layerId).find((x) => x.key === key);
  if (!f) throw new Error("That flag has cleared already.");
  const entry = ws.binEntryFor(f.missing);
  const kind = entry?.node.kind ?? null;
  return {
    key,
    missing: f.missing,
    missingName: f.missingName,
    binId: entry?.id ?? null,
    kind,
    slots: f.slots.map((s) => ({ slot: s, nodeId: s.node, nodeName: ws.get(layerId, s.node)?.name ?? "?", where: describeSlot(ws, layerId, s) })),
    candidates: kind
      ? ws
          .list(layerId, kind)
          .filter((n) => !n.template)
          .map((n) => ({ id: n.id, name: n.name }))
          .sort((a, b) => a.name.localeCompare(b.name))
      : [],
  };
}

const FIELD_WORDS: Record<string, string> = { maximum: "its maximum", ability: "its ability", condition: "its condition", thresholds: "a threshold", save: "its saving throw", category: "its category" };

export function describeSlot(ws: Workspace, layerId: Id, s: Slot): string {
  const p = s.path;
  if (p[0] === "parent") return "its parent (it was a variant)";
  if (p[0] === "category") return "its category";
  if (p[0] === "fields" && typeof p[1] === "string") {
    if (p[1].startsWith("score_")) return "an ability score";
    return FIELD_WORDS[p[1]] ?? `its ${p[1]}`;
  }
  if (p[0] === "attachments") {
    const node = ws.get(layerId, s.node);
    const aidStep = [...p].reverse().find((x): x is { aid: Id } => typeof x === "object");
    const last = p[p.length - 1];
    if (last === "brick") return "a brick on its sheet";
    if (aidStep && node) return `a brick's ${typeof last === "string" ? last : "value"}`;
  }
  return "a link";
}

/** Points the chosen broken links at something else (or removes them), as one undo step. */
export function fixMissing(ws: Workspace, layerId: Id, key: string, slots: Slot[], to: Id | null): string {
  const d = missingDetail(ws, layerId, key);
  // Only links that still point at the missing thing are touched.
  const valid = slots.filter((s) => {
    const n = ws.get(s.layer, s.node);
    const v = n ? getAt(n, s.path) : undefined;
    return s.layer === layerId && isLink(v) && v.link === d.missing;
  });
  if (!valid.length) throw new Error("Those links have changed since. Open the flag again.");
  if (to && !ws.exists(layerId, to)) throw new Error("That isn't here any more.");
  const things = new Set(valid.map((s) => s.node)).size;
  const words = `${things} thing${things === 1 ? "" : "s"}`;
  const label = to ? `${words} now use ${ws.get(layerId, to)!.name} instead of ${d.missingName}` : `${words} no longer use ${d.missingName}`;
  ws.transact(label, () => ws.fixLinks(valid, d.missing, to));
  return label;
}

/** "I meant that": deliberate exceptions to a world rule, stored on the rule itself. */
export function meantThat(ws: Workspace, layerId: Id, key: string, nodes: Id[]): string {
  const f = worldRuleFlags(ws, layerId).find((x) => x.key === key);
  if (!f) throw new Error("That flag has cleared already.");
  const rule = ws.get(layerId, f.rule)!;
  const pick = nodes.filter((n) => f.offenders.includes(n));
  if (!pick.length) throw new Error("Choose which ones are on purpose.");
  const r = ws.resolve(layerId, f.rule)!;
  const old = Array.isArray(r.fields.exceptions) ? r.fields.exceptions.filter(isLink) : [];
  const label = pick.length === 1 ? `${ws.get(layerId, pick[0]!)!.name} is a deliberate exception to "${rule.name}"` : `${pick.length} deliberate exceptions to "${rule.name}"`;
  ws.transact(label, () => ws.setField(layerId, f.rule, "exceptions", [...old, ...pick.map((id) => link(id))]));
  return label;
}

