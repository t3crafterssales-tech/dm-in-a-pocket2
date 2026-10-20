// Plain-English summaries of rule nodes: shown at the top of each rule's editor so the user can
// check it says what they meant, and printed in the rulebook.

import { pointBuyFrom, pointBuyText } from "./pointbuy.ts";
import { F, formulaText } from "./conventions.ts";
import type { Id, NodeRecord, Value } from "./types.ts";
import type { Workspace } from "./workspace.ts";

/** The core check is filed in the Rules tab's Core check section (or, in older files, labelled so). */
export function isCoreCheck(ws: Workspace, layerId: Id, n: NodeRecord): boolean {
  if (n.kind !== "rule") return false;
  if (n.fields.section === "Core check") return true;
  const c = n.category ? ws.get(layerId, n.category.link) : null;
  return c?.fields[F.section] === "core";
}

/** The values a world rule can be about. "Other" lets the user name any value. */
export const WORLD_RULE_VALUES: { key: string; label: string }[] = [
  { key: "material", label: "Material" },
  { key: "damageType", label: "Damage type" },
  { key: "size", label: "Size" },
  { key: "beingKind", label: "Kind of being" },
];

// ---------- Plain-English summaries ----------

export const CORE_FAMILIES: { id: string; label: string }[] = [
  { id: "rollOver", label: "Roll over a target (d20 + bonus against a difficulty)" },
  { id: "rollUnder", label: "Roll under your stat" },
  { id: "pool", label: "Dice pool, counting successes" },
  { id: "bands", label: "2d6 bands (full success, partial, fail)" },
  { id: "percentile", label: "Percentile (roll d100 under your skill)" },
  { id: "step", label: "Step dice (d4 to d12)" },
  { id: "none", label: "No dice (cards, tokens or narration)" },
  { id: "other", label: "Other" },
];

const BONUS_TEXT: Record<string, string> = {
  d20: "its bonus is (score - 10) / 2, rounded down",
  score: "the score is the bonus",
  table: "its bonus comes from a table",
  none: "it gives no bonus",
};

function str(v: Value | undefined, fallback = ""): string {
  return typeof v === "string" || typeof v === "number" ? String(v) : fallback;
}

function linkName(ws: Workspace, layerId: Id, v: Value | undefined): string | null {
  if (!v || typeof v !== "object" || Array.isArray(v) || typeof (v as { link?: unknown }).link !== "string") return null;
  const id = (v as { link: Id }).link;
  return ws.get(layerId, id)?.name ?? `[missing: ${ws.binEntryFor(id)?.node.name ?? "removed"}]`;
}

/** The sentence at the top of a rule node's editor, confirming it says what the user meant. */
export function ruleText(ws: Workspace, layerId: Id, nodeId: Id): string {
  const r = ws.resolve(layerId, nodeId);
  if (!r) return "";
  const n = r.record;
  const f = r.fields;
  const label = str(f[F.label]);
  const named = label ? `${n.name} (${label})` : n.name;
  switch (n.kind) {
    case "ability":
      return `${named}: scores from ${str(f[F.rangeMin], "?")} to ${str(f[F.rangeMax], "?")}; ${BONUS_TEXT[str(f[F.bonus], "d20")] ?? BONUS_TEXT.d20}.`;
    case "resource": {
      const start = f[F.start] === "empty" ? "starts empty" : f[F.start] === "set" ? `starts at ${str(f[F.startValue], "?")}` : "starts full";
      const rec = f[F.recovery] === "never" ? "never recovers" : f[F.recovery] === "spend" ? "recovers by spending something" : `recovers each ${str(f[F.recovery], "long rest")}`;
      const thresholds = Array.isArray(f[F.thresholds]) ? (f[F.thresholds] as Value[]) : [];
      const th = thresholds
        .map((t) => (t && typeof t === "object" && !Array.isArray(t) ? `at ${str((t as Record<string, Value>).at, "?")} you are ${linkName(ws, layerId, (t as Record<string, Value>).condition) ?? "?"}` : ""))
        .filter(Boolean);
      return `${named}: maximum ${formulaText(ws, layerId, f[F.maximum])}; ${start}; ${rec}${th.length ? `; ${th.join("; ")}` : ""}.`;
    }
    case "skill": {
      const a = linkName(ws, layerId, f[F.ability]);
      return a ? `${n.name} uses ${a}.` : `${n.name} doesn't use an ability.`;
    }
    case "condition": {
      const parts = [Number(f[F.stages] ?? 1) > 1 ? `${str(f[F.stages])} stages, each worse than the last` : ""];
      if (str(f[F.duration])) parts.push(`lasts ${str(f[F.duration])}`);
      const save = f[F.save];
      if (save && typeof save === "object" && !Array.isArray(save)) {
        const s = save as Record<string, Value>;
        parts.push(`a DC ${str(s.dc, "?")} ${linkName(ws, layerId, s.ability) ?? "?"} saving throw resists or ends it`);
      }
      const shown = parts.filter(Boolean);
      return shown.length ? `${n.name}: ${shown.join("; ")}.` : `${n.name}: described in its text.`;
    }
    default:
      if (isCoreCheck(ws, layerId, n)) return coreSummary(f);
      if (f[F.method] === "pointBuy") return pointBuyText(pointBuyFrom(n.id, f));
      if (f[F.forbid] && typeof f[F.forbid] === "object" && !Array.isArray(f[F.forbid])) {
        const fb = f[F.forbid] as Record<string, Value>;
        const what = WORLD_RULE_VALUES.find((v) => v.key === fb.field)?.label.toLowerCase() ?? String(fb.field ?? "?");
        const ex = Array.isArray(f[F.exceptions]) ? (f[F.exceptions] as Value[]).length : 0;
        const value = str(fb.equals);
        if (!value) return `World rule: choose what nothing may be (for example, nothing may have the ${what} Metal).`;
        return `World rule: nothing may have the ${what} ${value}${ex ? `, except ${ex} deliberate exception${ex === 1 ? "" : "s"}` : ""}. Anything added later is checked too.`;
      }
      return n.text.trim() ? `${n.name}: written out in its text.` : `${n.name}: nothing written yet.`;
  }
}

function coreSummary(f: Record<string, Value>): string {
  const die = str(f[F.die], "d20");
  const target = str(f[F.target]);
  switch (str(f[F.family], "rollOver")) {
    case "rollOver":
      return `Roll ${die} + bonus; meet or beat the ${target || "difficulty"} to succeed.`;
    case "rollUnder":
      return `Roll ${die}; roll equal to or under your stat to succeed.`;
    case "pool":
      return `Roll a pool of ${die}; each die showing ${target || "5"} or more is a success.`;
    case "bands":
      return `Roll 2d6 + bonus: ${target || "10"} or more is a full success, 7 or more a partial success, lower a fail.`;
    case "percentile":
      return "Roll d100; roll equal to or under your skill to succeed.";
    case "step":
      return "Roll a die from d4 to d12, bigger for better abilities; meet or beat the difficulty to succeed.";
    case "none":
      return `No dice: ${target || "outcomes are decided by cards, tokens or narration"}.`;
    default:
      return "A check of the system's own design, written out in its text.";
  }
}
