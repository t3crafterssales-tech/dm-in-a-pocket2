// Beings and Items: their kinds, the sheet each kind shows, the lists, and filing into
// categories. Plain functions on the engine, tested without the window.

import { F, challenge, isLink, link, newId } from "../engine/index.ts";
import type { Attachment, Id, NodeRecord, Value, Workspace } from "../engine/index.ts";

export type BeingKind = "character" | "class" | "race" | "monster" | "npc";

/** In the order of the Beings tab's sub-tabs. */
export const BEING_KINDS: { id: BeingKind; label: string; plural: string }[] = [
  { id: "character", label: "Character", plural: "Characters" },
  { id: "class", label: "Class", plural: "Classes" },
  { id: "race", label: "Race", plural: "Races" },
  { id: "monster", label: "Monster", plural: "Monsters" },
  { id: "npc", label: "NPC", plural: "NPCs" },
];

export interface HeaderField {
  key: string;
  label: string;
  type: "number" | "text";
  placeholder?: string;
}

export interface SheetDef {
  /** The key numbers always shown at the top. */
  header: HeaderField[];
  /** Show the system's abilities as score boxes. */
  scores: boolean;
  /** The sections bricks land in. */
  sections: string[];
}

const HP: HeaderField = { key: F.hp, label: "Hit points", type: "number" };
const AC: HeaderField = { key: F.ac, label: "Armour", type: "number" };
const SPEED: HeaderField = { key: F.speed, label: "Speed", type: "text", placeholder: "30 ft." };

/**
 * The basic sheets a system made from scratch starts with. (A system will be able to change its
 * own sheets later in this milestone; until then these are used for every system.)
 */
export const SHEETS: Record<BeingKind | "item", SheetDef> = {
  monster: { header: [HP, AC, SPEED, { key: F.cr, label: "Challenge", type: "text", placeholder: "1/4" }], scores: true, sections: ["Attacks and actions", "Traits and features", "Spells", "Gear"] },
  npc: { header: [HP, AC, SPEED, { key: F.cr, label: "Challenge", type: "text", placeholder: "1" }], scores: true, sections: ["Attacks and actions", "Traits and features", "Spells", "Gear"] },
  character: { header: [{ key: "level", label: "Level", type: "number" }, HP, AC, SPEED], scores: true, sections: ["Attacks and actions", "Features", "Spells", "Gear"] },
  race: { header: [{ key: "size", label: "Size", type: "text", placeholder: "Medium" }, SPEED], scores: false, sections: ["Traits", "Ability bonuses", "Languages"] },
  class: { header: [{ key: "hitDie", label: "Hit die", type: "text", placeholder: "d8" }, { key: F.maxLevel, label: "Levels", type: "number" }], scores: false, sections: ["Features", "Choices", "Proficiencies"] },
  item: {
    header: [
      { key: F.cost, label: "Cost", type: "text", placeholder: "15 gp" },
      { key: F.weight, label: "Weight", type: "text", placeholder: "3 lb." },
      // What it's made of, so world rules such as "No metal" can check it.
      { key: "material", label: "Material", type: "text", placeholder: "Metal" },
    ],
    scores: false,
    sections: ["Attacks", "Properties", "Enchantments"],
  },
};

export function sheetFor(n: NodeRecord, fields: Record<string, Value>): SheetDef | null {
  if (n.kind === "item") return SHEETS.item;
  if (n.kind !== "being") return null;
  const k = fields[F.beingKind];
  return SHEETS[(typeof k === "string" && k in SHEETS ? k : "monster") as BeingKind];
}

// ---------- Categories ----------

/** The top category a kind of being is filed under. */
export function beingRole(kind: BeingKind): "race" | "class" | "creature" {
  return kind === "race" ? "race" : kind === "class" ? "class" : "creature";
}

/** Files a being under the right top category for its kind, unless it is already in that tree. Inside the caller's step. */
export function fileBeing(ws: Workspace, layerId: Id, id: Id, kind: BeingKind) {
  const role = beingRole(kind);
  const cat = ensureCategories(ws, layerId).get(role)!;
  const n = ws.get(layerId, id)!;
  if (categoryTree(ws, layerId).find((c) => c.id === n.category?.link)?.role === role) return;
  ws.edit(layerId, id, (r) => (r.category = link(cat)));
}

/** The small starting set of categories from the design, by role. */
export const STARTER_CATEGORIES: { role: string; name: string }[] = [
  { role: "weapon", name: "Weapon" },
  { role: "armour", name: "Armour" },
  { role: "item", name: "Item" },
  { role: "creature", name: "Creature" },
  { role: "race", name: "Race" },
  { role: "class", name: "Class" },
  { role: "spell", name: "Spell" },
];

/** Makes the starter categories if they aren't there yet, inside the caller's step. */
export function ensureCategories(ws: Workspace, layerId: Id): Map<string, Id> {
  const out = new Map<string, Id>();
  const cats = ws.list(layerId, "category");
  for (const c of STARTER_CATEGORIES) {
    const found = cats.find((x) => x.fields[F.role] === c.role);
    out.set(c.role, found?.id ?? ws.create(layerId, "category", c.name, { fields: { [F.role]: c.role } }));
  }
  return out;
}

export interface CategoryOption {
  id: Id;
  name: string;
  /** "Weapon → Melee → Metal" */
  path: string;
  depth: number;
  /** The role at the top of its tree, such as "weapon". */
  role: string | null;
}

/** Every category outside the Rules sections, as a tree in order, up to three levels deep. */
export function categoryTree(ws: Workspace, layerId: Id): CategoryOption[] {
  const all = ws.list(layerId, "category");
  const rulesRoot = all.find((c) => c.fields[F.role] === "rules")?.id;
  const under = (c: NodeRecord) => (isLink(c.fields[F.under]) ? (c.fields[F.under] as { link: Id }).link : null);
  const cats = all.filter((c) => c.fields[F.role] !== "rules" && c.fields[F.section] === undefined && (!rulesRoot || under(c) !== rulesRoot));
  const ids = new Set(cats.map((c) => c.id));
  const parentOf = (c: NodeRecord) => {
    const u = under(c);
    return u && ids.has(u) ? u : null;
  };
  const out: CategoryOption[] = [];
  const walk = (parent: Id | null, depth: number, path: string, role: string | null) => {
    for (const c of cats.filter((x) => parentOf(x) === parent).sort((a, b) => a.name.localeCompare(b.name))) {
      const r = (typeof c.fields[F.role] === "string" ? (c.fields[F.role] as string) : null) ?? role;
      const p = path ? `${path} → ${c.name}` : c.name;
      out.push({ id: c.id, name: c.name, path: p, depth, role: r });
      if (depth < 2) walk(c.id, depth + 1, p, r);
    }
  };
  walk(null, 0, "", null);
  return out;
}

/** "+ New category": up to three levels deep. */
export function createCategory(ws: Workspace, layerId: Id, name: string, under: Id | null): Id {
  const tree = categoryTree(ws, layerId);
  const parent = under ? tree.find((c) => c.id === under) : null;
  if (under && !parent) throw new Error("That category is gone.");
  if (parent && parent.depth >= 2) throw new Error("Categories go three levels deep at most (Weapon → Melee → Metal).");
  return ws.transact(`Added the ${name} category`, () => ws.create(layerId, "category", name, { fields: under ? { [F.under]: link(under) } : {} }));
}

// ---------- Lists ----------

export interface ListEntry {
  id: Id;
  name: string;
  /** The parent, when it's a variant shown under it. */
  parent: Id | null;
  depth: number;
  /** Small text beside the name, such as "CR 1/4" or "15 gp". */
  note: string | null;
  categoryPath: string | null;
  fromBelow: boolean;
  favourite: boolean;
  /** Challenge as a number, for sorting monsters ("1/4" is 0.25). */
  cr: number | null;
  /** "mine" (homemade), "template" (from a starter) or "others" (imported). */
  source: "mine" | "template" | "others";
}

export type SourceFilter = "all" | "mine" | "template" | "others";

/** Things of one kind, with variants indented under their parents (any depth). */
/** Templates stay out of the lists (they live in the library's Templates group). */
export function sheetList(
  ws: Workspace,
  layerId: Id,
  filter: (n: NodeRecord, fields: Record<string, Value>) => boolean,
  note: (fields: Record<string, Value>) => string | null,
  sort: "name" | "challenge" = "name",
  source: SourceFilter = "all",
): ListEntry[] {
  const below = ws.layer(layerId).base;
  const tree = categoryTree(ws, layerId);
  const nodes = ws
    .list(layerId)
    .map((n) => ({ n, f: ws.resolve(layerId, n.id)!.fields }))
    .filter(({ n, f }) => !n.template && filter(n, f) && (source === "all" || n.source === source));
  const ids = new Set(nodes.map((x) => x.n.id));
  // By challenge: lowest first, things with no challenge last; then by name.
  const cmp = (a: { n: NodeRecord; f: Record<string, Value> }, b: { n: NodeRecord; f: Record<string, Value> }) => {
    if (sort === "challenge") {
      const ca = challenge(a.f[F.cr]) ?? Infinity;
      const cb = challenge(b.f[F.cr]) ?? Infinity;
      if (ca !== cb) return ca - cb;
    }
    return a.n.name.localeCompare(b.n.name);
  };
  const out: ListEntry[] = [];
  const add = (parent: Id | null, depth: number, seen: Set<Id>) => {
    const kids = nodes.filter(({ n }) => (parent === null ? !n.parent || !ids.has(n.parent.link) : n.parent?.link === parent)).sort(cmp);
    for (const { n, f } of kids) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      out.push({ id: n.id, name: n.name, parent, depth, note: note(f), categoryPath: tree.find((c) => c.id === n.category?.link)?.path ?? null, fromBelow: !!below && ws.owner(layerId, n.id) !== layerId, favourite: n.favourite, cr: challenge(f[F.cr]), source: n.source });
      add(n.id, depth + 1, seen);
    }
  };
  add(null, 0, new Set());
  return out;
}

export function beingsList(ws: Workspace, layerId: Id, kind: BeingKind, sort: "name" | "challenge" = "name", source: SourceFilter = "all"): ListEntry[] {
  return sheetList(
    ws,
    layerId,
    (n, f) => n.kind === "being" && (f[F.beingKind] ?? "monster") === kind,
    (f) => (kind === "monster" || kind === "npc" ? (f[F.cr] !== undefined && f[F.cr] !== "" ? `CR ${String(f[F.cr])}` : null) : kind === "character" && typeof f.level === "number" ? `Level ${f.level}` : null),
    sort,
    source,
  );
}

export function itemsList(ws: Workspace, layerId: Id, source: SourceFilter = "all"): ListEntry[] {
  return sheetList(ws, layerId, (n) => n.kind === "item", (f) => (typeof f[F.cost] === "string" && f[F.cost] ? (f[F.cost] as string) : null), "name", source);
}

export interface TemplateEntry {
  id: Id;
  name: string;
  kind: "being" | "item";
  beingKind: BeingKind | null;
  categoryId: Id | null;
}

/** Template parents: not real things, just the shared parts their children inherit. */
export function templatesList(ws: Workspace, layerId: Id): TemplateEntry[] {
  return ws
    .list(layerId)
    .filter((n) => n.template && (n.kind === "being" || n.kind === "item"))
    .map((n) => {
      const bk = ws.resolve(layerId, n.id)!.fields[F.beingKind];
      return { id: n.id, name: n.name, kind: n.kind as "being" | "item", beingKind: n.kind === "being" ? ((typeof bk === "string" ? bk : "monster") as BeingKind) : null, categoryId: n.category?.link ?? null };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------- Creating ----------

export function createBeing(ws: Workspace, layerId: Id, name: string, kind: BeingKind, variantOf: Id | null, template = false): Id {
  return ws.transact(`Added ${name}`, () => {
    const cats = ensureCategories(ws, layerId);
    if (variantOf) {
      const parent = ws.get(layerId, variantOf);
      if (!parent || parent.kind !== "being") throw new Error("That isn't here any more.");
      // A variant starts with everything its parent has, including its category and kind.
      return ws.create(layerId, "being", name, { parent: link(variantOf), category: parent.category, template });
    }
    // Races and classes are filed under Race and Class, never among the creatures (backlog 7).
    return ws.create(layerId, "being", name, { category: link(cats.get(beingRole(kind))!), fields: { [F.beingKind]: kind }, template });
  });
}

export function createItem(ws: Workspace, layerId: Id, name: string, categoryId: Id | null, variantOf: Id | null, template = false): Id {
  return ws.transact(`Added ${name}`, () => {
    const cats = ensureCategories(ws, layerId);
    if (variantOf) {
      const parent = ws.get(layerId, variantOf);
      if (!parent || parent.kind !== "item") throw new Error("That isn't here any more.");
      return ws.create(layerId, "item", name, { parent: link(variantOf), category: categoryId ? link(categoryId) : parent.category, template });
    }
    return ws.create(layerId, "item", name, { category: link(categoryId ?? cats.get("item")!), template });
  });
}

/**
 * "Start by copying": a new sheet that begins as a copy of another, with all its bricks. A copy
 * of a variant stays in the same family (same parent, same own changes), so it looks the same and
 * still gets the parent's later changes.
 */
export function copyNode(ws: Workspace, layerId: Id, sourceId: Id, name: string): Id {
  const src = ws.get(layerId, sourceId);
  if (!src || (src.kind !== "being" && src.kind !== "item")) throw new Error("Only beings and items can be copied this way.");
  return ws.transact(`Added ${name} as a copy of ${src.name}`, () =>
    ws.create(layerId, src.kind, name, {
      parent: src.parent,
      category: src.category,
      picture: src.picture,
      text: src.text,
      template: false,
      fields: structuredClone(src.fields),
      attachments: src.attachments.map(freshAids),
    }),
  );
}

/** Turns a sheet into a template parent, or back into a real thing. */
export function setTemplate(ws: Workspace, layerId: Id, id: Id, on: boolean) {
  const n = ws.get(layerId, id);
  if (!n || (n.kind !== "being" && n.kind !== "item")) throw new Error("Only beings and items can be templates.");
  ws.transact(on ? `Made ${n.name} a template` : `Made ${n.name} a real ${n.kind === "item" ? "item" : "being"}`, () => ws.edit(layerId, id, (r) => (r.template = on)));
}

/**
 * Detach: a variant becomes a fully independent copy. It copies in everything it inherited, then
 * cuts the link, so it looks exactly the same afterwards.
 */
export function detach(ws: Workspace, layerId: Id, id: Id) {
  const r = ws.resolve(layerId, id);
  if (!r || !r.record.parent) throw new Error("It isn't a variant of anything.");
  ws.transact(`Detached ${r.record.name}`, () =>
    ws.edit(layerId, id, (c) => {
      c.fields = structuredClone(r.fields);
      c.attachments = [...c.attachments, ...r.attachments.filter((x) => x.from !== null).map((x) => freshAids(x.attachment))];
      c.parent = null;
    }),
  );
}

function freshAids(a: Attachment): Attachment {
  return { ...structuredClone(a), aid: newId(), children: a.children.map(freshAids) };
}

// ---------- Ability scores on a sheet ----------

/**
 * Each score is its own value, `score_<ability id>` = { ability: link, score }, so a variant that
 * changes only Dexterity keeps following its parent for every other score, and deleting an ability
 * flags every sheet that uses it.
 */
export function scoreKey(ability: Id): string {
  return `score_${ability}`;
}

export function scoresOf(fields: Record<string, Value>): { ability: Id; score: number }[] {
  return Object.entries(fields).flatMap(([k, v]) => {
    if (!k.startsWith("score_") || !v || typeof v !== "object" || Array.isArray(v)) return [];
    const r = v as Record<string, Value>;
    return isLink(r.ability) ? [{ ability: (r.ability as { link: Id }).link, score: Number(r.score ?? 0) }] : [];
  });
}

export function scoreValue(ability: Id, score: number): Value {
  return { ability: link(ability), score };
}
