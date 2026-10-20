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

// The plain-English summaries live in the engine, so the rulebook prints the same sentences.
export { CORE_FAMILIES, WORLD_RULE_VALUES, ruleText as ruleSummary } from "../engine/index.ts";
