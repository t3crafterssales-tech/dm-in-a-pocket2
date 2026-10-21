// Search (the box in the top bar, Ctrl+F): finds anything in a world or system by its name, its
// text or its values, and says which tab it lives on. Names that match come first.

import { F } from "../engine/index.ts";
import type { Id, NodeKind, Value, Workspace } from "../engine/index.ts";

export type SearchTab = "Rules" | "Beings" | "Items" | "Lore" | "Party" | "Adventure" | "Maps";

export interface SearchHit {
  id: Id;
  name: string;
  /** "Monster", "Condition", "Spell"... */
  what: string;
  tab: SearchTab;
  /** A few words around the match when it isn't in the name. */
  snippet: string | null;
}

const TAB: Partial<Record<NodeKind, SearchTab>> = { ability: "Rules", resource: "Rules", skill: "Rules", condition: "Rules", rule: "Rules", being: "Beings", brick: "Beings", item: "Items", lore: "Lore", table: "Lore", map: "Maps" };
const WHAT: Partial<Record<NodeKind, string>> = { ability: "Ability", resource: "Resource", skill: "Skill", condition: "Condition", rule: "Rule", item: "Item", lore: "Lore", table: "Roll table", encounter: "Encounter", map: "Map" };
const BEING: Record<string, string> = { monster: "Monster", npc: "NPC", character: "Character", race: "Race", class: "Class" };

function words(v: Value | undefined): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object" && !Array.isArray(v) && !("link" in v)) return Object.values(v as Record<string, Value>).map(words).join(" ");
  if (Array.isArray(v)) return v.map(words).join(" ");
  return "";
}

export function search(ws: Workspace, layerId: Id, query: string, limit = 40): { hits: SearchHit[]; total: number } {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return { hits: [], total: 0 };
  const byName: SearchHit[] = [];
  const byText: SearchHit[] = [];
  for (const n of ws.list(layerId)) {
    const fk = n.kind === "being" ? ws.resolve(layerId, n.id)!.fields[F.beingKind] : null;
    // Player characters live in the Party tab, a module's encounters in its Adventure tab.
    const tab = fk === "character" && !n.template ? "Party" : n.kind === "encounter" && !n.template && ws.layer(layerId).type === "module" ? "Adventure" : TAB[n.kind];
    if (!tab || (n.template && n.kind !== "being" && n.kind !== "item")) continue;
    const f = ws.resolve(layerId, n.id)!.fields;
    const what = n.kind === "being" ? (BEING[String(f[F.beingKind] ?? "monster")] ?? "Being") : n.kind === "brick" ? (f[F.type] === "spell" ? "Spell" : "Library brick") : (WHAT[n.kind] ?? n.kind);
    const hit = { id: n.id, name: n.name, what: n.template ? `${what} template` : what, tab, snippet: null as string | null };
    if (n.name.toLowerCase().includes(q)) {
      byName.push(hit);
      continue;
    }
    const text = `${n.text} ${Object.entries(f).filter(([k]) => k !== F.license).map(([, v]) => words(v)).join(" ")}`.replace(/\s+/g, " ");
    const at = text.toLowerCase().indexOf(q);
    if (at < 0) continue;
    const from = Math.max(0, at - 40);
    hit.snippet = `${from ? "…" : ""}${text.slice(from, at + q.length + 60).trim()}${at + q.length + 60 < text.length ? "…" : ""}`;
    byText.push(hit);
  }
  // Exact names first, then names that start with it (shorter first: Poisoned before Poison Breath), then the rest.
  const rank = (h: SearchHit) => (h.name.toLowerCase() === q ? 0 : h.name.toLowerCase().startsWith(q) ? 1 : 2);
  byName.sort((a, b) => rank(a) - rank(b) || a.name.length - b.name.length || a.name.localeCompare(b.name));
  byText.sort((a, b) => a.name.localeCompare(b.name));
  const all = [...byName, ...byText];
  return { hits: all.slice(0, limit), total: all.length };
}
