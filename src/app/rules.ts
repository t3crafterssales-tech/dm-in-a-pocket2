// The Rules tab: its sections, and the small rule nodes inside them. Plain functions on the
// engine, so they are tested without the window.

import { F, formulaText, link } from "../engine/index.ts";
import type { Id, NodeKind, NodeRecord, Value, Workspace } from "../engine/index.ts";

export type SectionKey = "core" | "abilities" | "resources" | "skills" | "conditions" | "combat" | "magic" | "advancement" | "time" | "currency" | "world";

export interface SectionDef {
  key: SectionKey;
  title: string;
  /** The kind of node a new entry in this section is. */
  kind: NodeKind;
  /** What the "+ New" button says. */
  noun: string;
}

export const RULE_SECTIONS: SectionDef[] = [
  { key: "core", title: "Core check", kind: "rule", noun: "core check" },
  { key: "abilities", title: "Abilities", kind: "ability", noun: "ability" },
  { key: "resources", title: "Resources", kind: "resource", noun: "resource" },
  { key: "skills", title: "Skills", kind: "skill", noun: "skill" },
  { key: "conditions", title: "Conditions", kind: "condition", noun: "condition" },
  { key: "combat", title: "Combat", kind: "rule", noun: "rule" },
  { key: "magic", title: "Magic and powers", kind: "rule", noun: "rule" },
  { key: "advancement", title: "Advancement", kind: "rule", noun: "rule" },
  { key: "time", title: "Time and rest", kind: "rule", noun: "rule" },
  { key: "currency", title: "Currency and economy", kind: "rule", noun: "rule" },
  // Permanent constraints such as "No metal": anything that breaks one is flagged red, now or later.
  { key: "world", title: "World rules", kind: "rule", noun: "world rule" },
];

const KIND_SECTION: Partial<Record<NodeKind, SectionKey>> = { ability: "abilities", resource: "resources", skill: "skills", condition: "conditions" };

/** The values every new node of a kind starts with. Nothing is required; these are the defaults. */
export function defaultsFor(kind: NodeKind, section: string | null): Record<string, Value> {
  if (kind === "ability") return { [F.label]: "", [F.rangeMin]: 3, [F.rangeMax]: 18, [F.bonus]: "d20" };
  if (kind === "resource") return { [F.label]: "", [F.maximum]: 10, [F.start]: "full", [F.recovery]: "long rest", [F.display]: "number", [F.thresholds]: [] };
  if (kind === "skill") return { [F.ability]: null };
  if (kind === "condition") return { [F.stages]: 1, [F.duration]: "", [F.save]: null };
  if (kind === "rule" && section === "core") return { [F.family]: "rollOver", [F.die]: "d20", [F.target]: "" };
  if (kind === "rule" && section === "world") return { [F.forbid]: { field: "material", equals: "" }, [F.exceptions]: [] };
  return {};
}

export interface RulesSection {
  /** A built-in section's key, or the category id of a section the user added. */
  key: string;
  title: string;
  kind: NodeKind;
  noun: string;
  builtIn: boolean;
  /** The category node, once it exists. */
  categoryId: Id | null;
  nodes: { id: Id; name: string; label: string | null; kind: NodeKind; fromBelow: boolean }[];
}

const RULE_KINDS: NodeKind[] = ["ability", "resource", "skill", "condition", "rule"];

/** The category at the top of the Rules sections, if this system has one yet. */
function rulesRoot(ws: Workspace, layerId: Id): NodeRecord | null {
  return ws.list(layerId, "category").find((c) => c.fields[F.role] === "rules") ?? null;
}

/** Section categories by key, plus the user's own sections. */
function sectionCategories(ws: Workspace, layerId: Id) {
  const root = rulesRoot(ws, layerId);
  const cats = ws.list(layerId, "category").filter((c) => root && isLinkTo(c.fields[F.under], root.id));
  const byKey = new Map<string, NodeRecord>();
  const custom: NodeRecord[] = [];
  for (const c of cats) {
    const key = c.fields[F.section];
    if (typeof key === "string" && RULE_SECTIONS.some((s) => s.key === key)) byKey.set(key, c);
    else custom.push(c);
  }
  return { root, byKey, custom };
}

function isLinkTo(v: Value | undefined, id: Id): boolean {
  return !!v && typeof v === "object" && !Array.isArray(v) && (v as { link?: unknown }).link === id;
}

/**
 * Makes the Rules category and its section categories if they don't exist yet. Systems made
 * before the Rules tab existed get them the first time something is added. Runs inside the
 * caller's step, so it undoes together with what was added.
 */
export function ensureSections(ws: Workspace, layerId: Id): Map<SectionKey, Id> {
  let { root, byKey } = sectionCategories(ws, layerId);
  const rootId = root?.id ?? ws.create(layerId, "category", "Rules", { fields: { [F.role]: "rules" } });
  const out = new Map<SectionKey, Id>();
  for (const s of RULE_SECTIONS) {
    const id = byKey.get(s.key)?.id ?? ws.create(layerId, "category", s.title, { fields: { [F.section]: s.key, [F.under]: link(rootId) } });
    out.set(s.key, id);
  }
  return out;
}

/** Which section a node shows in: its category's section, else by its kind, else General rules. */
export function sectionOf(ws: Workspace, layerId: Id, n: NodeRecord): string {
  const c = n.category ? ws.get(layerId, n.category.link) : null;
  if (c) {
    const key = c.fields[F.section];
    if (typeof key === "string") return key;
    const { custom } = sectionCategories(ws, layerId);
    if (custom.some((x) => x.id === c.id)) return c.id;
  }
  if (n.fields.section === "Core check") return "core";
  if (n.fields[F.forbid]) return "world";
  return KIND_SECTION[n.kind] ?? "combat";
}

/** Everything the Rules tab lists, section by section, in the order of the design. */
export function rulesTab(ws: Workspace, layerId: Id): RulesSection[] {
  const { byKey, custom } = sectionCategories(ws, layerId);
  const below = ws.layer(layerId).base;
  const nodes = ws
    .list(layerId)
    .filter((n) => RULE_KINDS.includes(n.kind) && !n.template)
    // Abilities keep the order they were made in, like a character sheet (STR, DEX, CON...).
    .sort((a, b) => (a.kind === "ability" && b.kind === "ability" ? a.created - b.created : a.name.localeCompare(b.name)));
  const entry = (n: NodeRecord) => ({
    id: n.id,
    name: n.name,
    label: typeof n.fields[F.label] === "string" && n.fields[F.label] ? (n.fields[F.label] as string) : null,
    kind: n.kind,
    fromBelow: !!below && ws.owner(layerId, n.id) !== layerId,
  });
  const sections: RulesSection[] = RULE_SECTIONS.map((s) => ({ ...s, builtIn: true, categoryId: byKey.get(s.key)?.id ?? null, nodes: [] }));
  for (const c of custom.sort((a, b) => a.name.localeCompare(b.name))) sections.push({ key: c.id, title: c.name, kind: "rule", noun: "rule", builtIn: false, categoryId: c.id, nodes: [] });
  for (const n of nodes) {
    const key = sectionOf(ws, layerId, n);
    (sections.find((s) => s.key === key) ?? sections.find((s) => s.key === "combat")!).nodes.push(entry(n));
  }
  return sections;
}

/** Adds a rule node to a section, with its defaults, as one undo step. */
export function createRuleNode(ws: Workspace, layerId: Id, sectionKey: string, name: string): Id {
  return ws.transact(`Added ${name}`, () => {
    const keys = ensureSections(ws, layerId);
    const def = RULE_SECTIONS.find((s) => s.key === sectionKey);
    const categoryId = def ? keys.get(def.key)! : sectionKey;
    if (!def && !ws.get(layerId, categoryId)) throw new Error("That section is gone.");
    const kind = def?.kind ?? "rule";
    return ws.create(layerId, kind, name, { category: link(categoryId), fields: defaultsFor(kind, def?.key ?? null) });
  });
}

/** Adds a section of the user's own ("+ New section"). */
export function createSection(ws: Workspace, layerId: Id, title: string): Id {
  return ws.transact(`Added the ${title} section`, () => {
    ensureSections(ws, layerId);
    const root = rulesRoot(ws, layerId)!;
    return ws.create(layerId, "category", title, { fields: { [F.under]: link(root.id) } });
  });
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
export function ruleSummary(ws: Workspace, layerId: Id, nodeId: Id): string {
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
      if (sectionOf(ws, layerId, n) === "core") return coreSummary(f);
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
