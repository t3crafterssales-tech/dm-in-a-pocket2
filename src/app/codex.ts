// The Codex: everything in a game sorted into sections (Weapons, Armour, Gear, Monsters, Spells...),
// shown on the right of the world screen. Also the "quick" values the item and being sheets show
// as pickers, and refiling something into another section. Plain functions on the engine.

import { F, attachmentValues, challenge, isLink, levelKey, link, newId } from "../engine/index.ts";
import type { Attachment, Id, NodeRecord, Value, Workspace } from "../engine/index.ts";
import { brickNote } from "./library.ts";
import { categoryTree, ensureCategories, fileBeing } from "./sheets.ts";
import type { BeingKind } from "./sheets.ts";
import { CODEX_SECTIONS, DAMAGE_TYPES, STARTER_COINS, STARTER_MATERIALS } from "./codex-lists.ts";
import type { CodexKey } from "./codex-lists.ts";
export * from "./codex-lists.ts";

const BEING_SECTION: Record<BeingKind, CodexKey> = { monster: "monsters", npc: "npcs", character: "characters", race: "races", class: "classes" };
const SECTION_BEING = Object.fromEntries(Object.entries(BEING_SECTION).map(([k, v]) => [v, k])) as Record<CodexKey, BeingKind>;
const BRICK_SECTION: Record<string, CodexKey> = { spell: "spells", attack: "attacks", damage: "enchantments", effect: "enchantments", trait: "traits", immunity: "traits", abilityBonus: "traits", armor: "traits" };

export interface CodexEntry {
  id: Id;
  name: string;
  /** A few words under the name: "1d8 slashing · 10 gp", "CR 1/4", "Level 1 Evocation". */
  sub: string;
  source: "mine" | "template" | "others";
  fromBelow: boolean;
  /** For sorting: cost in the main coin (gold), and challenge as a number. */
  cost: number | null;
  cr: number | null;
  /** The node it is a variant of, if any. */
  parent: Id | null;
  /** Can be dragged onto a sheet (bricks, and items as gear). */
  attachable: boolean;
}

export interface CodexSection {
  key: CodexKey;
  title: string;
  one: string;
  icon: string;
  entries: CodexEntry[];
  /** How many of them the user made. */
  mine: number;
  /** Other sections something in this one can be moved to. */
  moveTo: CodexKey[];
}

/** The value of each coin in gold pieces, for sorting by cost. Unknown coins count as gold. */
const COIN_VALUE: Record<string, number> = { cp: 0.01, sp: 0.1, ep: 0.5, gp: 1, pp: 10 };

/** "15 gp" → { amount: 15, unit: "gp" }. Text without a number gives null. */
export function parseAmount(v: Value | undefined): { amount: number; unit: string } | null {
  if (typeof v === "number") return { amount: v, unit: "" };
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^(\d+(?:[.,]\d+)?)\s*([^\d\s.][^\d]*?)?\.?$/);
  if (!m) return null;
  return { amount: Number(m[1]!.replace(",", ".")), unit: (m[2] ?? "").trim().replace(/\.$/, "") };
}

export function costInGold(v: Value | undefined): number | null {
  const p = parseAmount(v);
  return p ? p.amount * (COIN_VALUE[p.unit.toLowerCase()] ?? 1) : null;
}

/** A category and every category above it, nearest first (any depth, so Weapon → Melee → Simple → Light works). */
function categoryChain(ws: Workspace, layerId: Id, id: Id | null | undefined): NodeRecord[] {
  const out: NodeRecord[] = [];
  const seen = new Set<Id>();
  let at = id ?? null;
  while (at && !seen.has(at)) {
    seen.add(at);
    const c = ws.get(layerId, at);
    if (!c || c.kind !== "category") break;
    out.push(c);
    const u = ws.resolve(layerId, c.id)?.fields[F.under];
    at = u && typeof u === "object" && !Array.isArray(u) && typeof (u as { link?: unknown }).link === "string" ? (u as { link: Id }).link : null;
  }
  return out;
}

/** Which Codex section an item belongs in, from where it is filed. */
export function itemSection(ws: Workspace, layerId: Id, n: NodeRecord): CodexKey {
  const chain = categoryChain(ws, layerId, n.category?.link);
  const role = chain.map((c) => ws.resolve(layerId, c.id)?.fields[F.role]).find((r) => typeof r === "string");
  if (role === "weapon") return "weapons";
  if (role === "armour") return "armour";
  if (chain.some((c) => c.name === "Magic items")) return "magic";
  return "gear";
}

/** Which Codex section any node is in, or null if it isn't shown in the Codex. */
export function sectionOfNode(ws: Workspace, layerId: Id, n: NodeRecord): CodexKey | null {
  // Ready-made encounters (top level only; the ones inside them come along when placed).
  if (n.kind === "encounter") return n.template && !isLink(ws.resolve(layerId, n.id)?.fields.inside) ? "encounters" : null;
  if (n.template && (n.kind === "item" || n.kind === "being")) return "templates";
  // Version 2: the table's things live in the Codex too.
  if (n.kind === "condition") return "conditions";
  if (n.kind === "table") return "tables";
  if (n.kind === "map") return "maps";
  if (n.kind === "journal") return ws.resolve(layerId, n.id)?.fields.owner ? null : "journal";
  if (n.kind === "macro") return "macros";
  if (n.kind === "layout") return "layouts";
  const f = ws.resolve(layerId, n.id)?.fields ?? {};
  if (n.kind === "item") return itemSection(ws, layerId, n);
  if (n.kind === "being") return BEING_SECTION[(typeof f[F.beingKind] === "string" ? f[F.beingKind] : "monster") as BeingKind] ?? "monsters";
  if (n.kind === "brick") return BRICK_SECTION[String(f[F.type] ?? "trait")] ?? "traits";
  return null;
}

export function codexSections(ws: Workspace, layerId: Id): CodexSection[] {
  const below = ws.layer(layerId).base;
  const map = new Map<CodexKey, CodexEntry[]>(CODEX_SECTIONS.map((s) => [s.key, []]));
  for (const n of ws.list(layerId)) {
    const key = sectionOfNode(ws, layerId, n);
    if (!key) continue;
    const f = ws.resolve(layerId, n.id)!.fields;
    map.get(key)!.push({
      id: n.id,
      name: n.name,
      sub: subLine(ws, layerId, n, f, key),
      source: n.source,
      fromBelow: !!below && ws.owner(layerId, n.id) !== layerId,
      cost: n.kind === "item" ? costInGold(f[F.cost]) : null,
      cr: n.kind === "being" ? challenge(f[F.cr]) : null,
      parent: n.parent?.link ?? null,
      attachable: (n.kind === "brick" || n.kind === "item") && !n.template,
    });
  }
  return CODEX_SECTIONS.map((s) => {
    const entries = map.get(s.key)!.sort((a, b) => a.name.localeCompare(b.name));
    const moveTo = s.what === "item" ? CODEX_SECTIONS.filter((x) => x.what === "item" && x.key !== s.key).map((x) => x.key) : s.what === "being" ? CODEX_SECTIONS.filter((x) => x.what === "being" && x.key !== s.key).map((x) => x.key) : [];
    return { key: s.key, title: s.title, one: s.one, icon: s.icon, entries, mine: entries.filter((e) => e.source === "mine").length, moveTo };
  });
}

function subLine(ws: Workspace, layerId: Id, n: NodeRecord, f: Record<string, Value>, key: CodexKey): string {
  if (n.kind === "encounter") {
    const count = Array.isArray(f.creatures) ? f.creatures.reduce<number>((t, c) => t + (c && typeof c === "object" && !Array.isArray(c) && typeof (c as Record<string, Value>).count === "number" ? ((c as Record<string, Value>).count as number) : 0), 0) : 0;
    const words = typeof f.readAloud === "string" ? f.readAloud.split(/\s+/).slice(0, 8).join(" ") : "";
    return [count ? `${count} creature${count === 1 ? "" : "s"}` : "", words ? `${words}…` : ""].filter(Boolean).join(" · ");
  }
  const cost = typeof f[F.cost] === "string" ? (f[F.cost] as string) : "";
  if (n.kind === "item") {
    const r = ws.resolve(layerId, n.id)!;
    const parts: string[] = [];
    for (const { attachment } of r.attachments) {
      const v = attachmentValues(ws, layerId, attachment);
      if (v[F.type] === "attack" && typeof v[F.dice] === "string" && v[F.dice]) {
        parts.push(`${v[F.dice]} ${v[F.damageType] ?? ""}`.trim());
        break;
      }
      if (v[F.type] === "armor" && typeof v.bonus === "number") {
        parts.push(`Armour +${v.bonus}`);
        break;
      }
    }
    if (key === "magic" && typeof f.rarity === "string" && f.rarity) parts.push(f.rarity);
    if (cost) parts.push(cost);
    return parts.join(" · ");
  }
  if (n.kind === "being") {
    const kind = f[F.beingKind];
    if ((kind === "monster" || kind === "npc" || kind === undefined) && f[F.cr] !== undefined && f[F.cr] !== "") return `CR ${String(f[F.cr])}${typeof f[F.hp] === "number" ? ` · ${f[F.hp]} HP` : ""}`;
    if (kind === "class" && typeof f.hitDie === "string" && f.hitDie) return `Hit die ${f.hitDie}`;
    if (kind === "character" && typeof f.level === "number") return `Level ${f.level}`;
    if (kind === "race" && typeof f.size === "string") return f.size;
    return "";
  }
  if (n.kind === "brick" && f[F.type] === "spell") {
    const lvl = f[F.spellLevel];
    const school = typeof f[F.school] === "string" ? f[F.school] : "";
    return typeof lvl === "number" ? (lvl === 0 ? `${school} cantrip`.trim() : `Level ${lvl} ${school}`.trim()) : brickNote(ws, layerId, n.id);
  }
  if (n.kind === "table") return `${typeof f.die === "string" ? f.die : "d6"} · ${Array.isArray(f.rows) ? f.rows.length : 0} rows`;
  if (n.kind === "journal") return [typeof f.category === "string" ? f.category : "", typeof f.priority === "number" ? `priority ${f.priority}` : ""].filter(Boolean).join(" · ");
  if (n.kind === "map") return `${Array.isArray(f.pins) ? f.pins.length : 0} pins`;
  if (n.kind === "condition") return n.text.split(/[.\n]/)[0]?.slice(0, 60) ?? "";
  if (n.kind === "macro") return typeof f.summary === "string" ? f.summary : "";
  if (n.kind === "layout") return f.layoutKind === "book" ? "Book" : "Sheet";
  return n.kind === "brick" ? brickNote(ws, layerId, n.id) : "";
}

/**
 * Refiling: moves something into another section, inside the caller's step. An item is filed
 * under that section's top category; a being becomes that kind of being. Bricks don't move: what
 * a brick is decides where it goes.
 */
export function moveToSection(ws: Workspace, layerId: Id, id: Id, to: CodexKey) {
  const n = ws.get(layerId, id);
  if (!n) throw new Error("That isn't here any more.");
  const from = sectionOfNode(ws, layerId, n);
  const target = CODEX_SECTIONS.find((s) => s.key === to);
  if (!target || !from) throw new Error("That isn't a Codex section.");
  if (from === to) return;
  if (n.kind === "item" && target.what === "item") {
    const cats = ensureCategories(ws, layerId);
    let cat: Id;
    if (to === "magic") {
      const tree = categoryTree(ws, layerId);
      cat = tree.find((c) => c.role === "item" && c.depth === 1 && c.name === "Magic items")?.id ?? ws.create(layerId, "category", "Magic items", { fields: { [F.under]: link(cats.get("item")!) } });
    } else cat = cats.get(to === "weapons" ? "weapon" : to === "armour" ? "armour" : "item")!;
    ws.edit(layerId, id, (r) => (r.category = link(cat)));
    return;
  }
  if (n.kind === "being" && target.what === "being") {
    const kind = SECTION_BEING[to];
    ws.edit(layerId, id, (r) => (r.fields[F.beingKind] = kind));
    fileBeing(ws, layerId, id, kind);
    return;
  }
  throw new Error(`A ${CODEX_SECTIONS.find((s) => s.key === from)!.one} can't be moved to ${target.title}.`);
}

// ---------- The quick values on a sheet ----------

export interface QuickView {
  /** Which pattern the sheet follows. */
  pattern: "weapon" | "armour" | "gear" | "being" | "other";
  section: CodexKey | null;
  /** The first attack on an item, with whether this sheet can change it (it isn't inherited). */
  attack: { aid: Id; own: boolean; from: string | null; dice: string; damageType: string } | null;
  /** The first armour brick on an item. */
  armour: { aid: Id; own: boolean; from: string | null; bonus: number } | null;
  /** The armour subcategories (Light, Medium, Heavy, Shield) and which one it is in. */
  armourTypes: { id: Id; name: string }[];
  /** Lists for the pickers, drawn from what this game already uses so a new one joins every list. */
  materials: string[];
  coins: string[];
  damageTypes: string[];
  /** The standard description a copy of starter content keeps, to go back to. */
  standardText: string | null;
}

export function quickView(ws: Workspace, layerId: Id, id: Id): QuickView {
  const r = ws.resolve(layerId, id);
  if (!r) throw new Error("That isn't here any more.");
  const n = r.record;
  const tree = categoryTree(ws, layerId);
  const section = sectionOfNode(ws, layerId, n);
  const pattern = n.kind === "being" ? "being" : n.kind !== "item" ? "other" : section === "weapons" ? "weapon" : section === "armour" ? "armour" : "gear";
  let attack: QuickView["attack"] = null;
  let armour: QuickView["armour"] = null;
  for (const { attachment, from } of r.attachments) {
    const v = attachmentValues(ws, layerId, attachment);
    const fromName = from ? (ws.get(layerId, from)?.name ?? null) : null;
    if (!attack && v[F.type] === "attack") attack = { aid: attachment.aid, own: !from, from: fromName, dice: String(v[F.dice] ?? ""), damageType: String(v[F.damageType] ?? "") };
    if (!armour && v[F.type] === "armor") armour = { aid: attachment.aid, own: !from, from: fromName, bonus: Number(v.bonus ?? 0) };
  }
  const armourRoot = tree.find((c) => c.role === "armour" && c.depth === 0);
  const armourTypes = armourRoot ? tree.filter((c) => c.depth === 1 && c.path.startsWith(`${armourRoot.name} → `)).map((c) => ({ id: c.id, name: c.name })) : [];
  const materials = new Set(STARTER_MATERIALS);
  const coins = new Set<string>(STARTER_COINS);
  const damage = new Set(DAMAGE_TYPES);
  for (const x of ws.list(layerId)) {
    const f = ws.resolve(layerId, x.id)!.fields;
    if (x.kind === "item") {
      if (typeof f.material === "string" && f.material.trim()) materials.add(f.material.trim());
      const c = parseAmount(f[F.cost]);
      if (c?.unit) coins.add(c.unit);
    }
    if (typeof f[F.damageType] === "string" && /^[a-z]+$/i.test(f[F.damageType] as string)) damage.add((f[F.damageType] as string).toLowerCase());
  }
  const coinOrder = (c: string) => (COIN_VALUE[c.toLowerCase()] ?? 1000);
  return {
    pattern,
    section,
    attack,
    armour,
    armourTypes,
    materials: [...materials].sort((a, b) => a.localeCompare(b)),
    coins: [...coins].sort((a, b) => coinOrder(a) - coinOrder(b) || a.localeCompare(b)),
    damageTypes: [...damage],
    standardText: typeof r.fields.standardText === "string" ? (r.fields.standardText as string) : r.record.parent ? (ws.resolve(layerId, r.record.parent.link)?.record.text ?? null) : null,
  };
}

/**
 * "Make my own copy" of starter content: an independent copy the user owns, which remembers the
 * starter's description as its standard description. Inside the caller's step.
 */
export function standardOf(ws: Workspace, layerId: Id, sourceId: Id): string | null {
  const src = ws.resolve(layerId, sourceId);
  if (!src) return null;
  if (typeof src.fields.standardText === "string") return src.fields.standardText as string;
  return src.record.source === "template" ? src.record.text : null;
}

// ---------- Copies ----------

function freshAids(a: Attachment): Attachment {
  return { ...structuredClone(a), aid: newId(), children: a.children.map(freshAids) };
}

/** A name nothing of that kind uses yet: "My Battleaxe", then "My Battleaxe 2". */
export function freeNodeName(ws: Workspace, layerId: Id, kind: NodeRecord["kind"], name: string): string {
  const used = new Set(ws.list(layerId, kind).map((n) => n.name.toLowerCase()));
  let out = name;
  for (let i = 2; used.has(out.toLowerCase()); i++) out = `${name} ${i}`;
  return out;
}

/**
 * "Make my own copy": an independent copy the user owns and can change freely, with everything
 * the original has (including what it inherited). A copy of starter content keeps the starter's
 * description as its standard description, to go back to. Inside the caller's step.
 */
export function makeOwnCopy(ws: Workspace, layerId: Id, sourceId: Id, name?: string): Id {
  const src = ws.resolve(layerId, sourceId);
  if (!src || !["item", "being", "brick"].includes(src.record.kind)) throw new Error("Only things in the Codex can be copied this way.");
  const n = src.record;
  const standard = standardOf(ws, layerId, sourceId);
  const fields = structuredClone(src.fields);
  if (standard) fields.standardText = standard;
  // New ids for the copied bricks; a class's "gained at level" values follow them.
  const attachments = src.attachments.map((x) => freshAids(x.attachment));
  src.attachments.forEach((x, i) => {
    const old = levelKey(x.attachment.aid);
    if (old in fields) {
      fields[levelKey(attachments[i]!.aid)] = fields[old]!;
      delete fields[old];
    }
  });
  return ws.create(layerId, n.kind, freeNodeName(ws, layerId, n.kind, name?.trim() || (n.source === "template" ? `My ${n.name}` : `${n.name} (copy)`)), {
    category: n.category,
    picture: n.picture,
    text: src.record.text || (src.record.parent ? (ws.resolve(layerId, src.record.parent.link)?.record.text ?? "") : ""),
    template: false,
    fields,
    // Everything it has, its own and inherited, so it looks the same and goes its own way.
    attachments,
  });
}

/** Ctrl+D: a child copy (variant) that starts with everything and still follows the original. Inside the caller's step. */
export function makeVariant(ws: Workspace, layerId: Id, sourceId: Id, name?: string): Id {
  const n = ws.get(layerId, sourceId);
  if (!n || !["item", "being", "brick"].includes(n.kind)) throw new Error("Only things in the Codex can have variants made this way.");
  return ws.create(layerId, n.kind, freeNodeName(ws, layerId, n.kind, name?.trim() || `${n.name} (variant)`), { parent: link(sourceId), category: n.category });
}

/**
 * "Start blank" from the start screen: a new thing in a section with sensible defaults, so even a
 * blank weapon has an attack to change. Inside the caller's step.
 */
export function newInSection(ws: Workspace, layerId: Id, key: CodexKey, name: string): Id {
  const cats = ensureCategories(ws, layerId);
  const s = CODEX_SECTIONS.find((x) => x.key === key);
  if (!s || s.what === "template" || key === "layouts") throw new Error("That isn't something that can be made here.");
  if (key === "conditions") {
    const sec = ws.list(layerId, "category").find((c) => c.fields[F.section] === "conditions");
    return ws.create(layerId, "condition", name, { category: sec ? link(sec.id) : null, fields: { [F.stages]: 1, [F.duration]: "", [F.save]: null } });
  }
  if (key === "tables") return ws.create(layerId, "table", name, { fields: { die: "d6", rows: [] } });
  if (key === "maps") return ws.create(layerId, "map", name, { fields: { width: 1600, height: 1000, background: "#efe6d2", grid: { kind: "none", size: 50, scale: "5 feet", show: true }, pins: [], shapes: [] } });
  if (key === "journal") return ws.create(layerId, "journal", name, { fields: { category: "Notes", priority: 1, blocks: [], session: null, owner: null, shared: [], revealed: false } });
  if (key === "macros") return ws.create(layerId, "macro", name, { fields: { blocks: [{ type: "dice", dice: "1d20", op: "+" }], against: null, who: "me", see: "public", summary: "1d20" } });
  if (key === "encounters") return ws.create(layerId, "encounter", name, { template: true, fields: { readAloud: "", inside: null, order: 0, leadsTo: [], creatures: [], treasure: [], handouts: [] } });
  if (s.what === "being") {
    const kind = SECTION_BEING[key];
    const fields: Record<string, Value> = { [F.beingKind]: kind };
    if (kind === "monster" || kind === "npc") Object.assign(fields, { [F.hp]: 10, [F.ac]: 12, [F.speed]: "30 ft.", [F.cr]: kind === "monster" ? "1/4" : "1" });
    if (kind === "class") Object.assign(fields, { hitDie: "d8" });
    if (kind === "race") Object.assign(fields, { size: "Medium", [F.speed]: "30 ft." });
    const id = ws.create(layerId, "being", name, { fields });
    fileBeing(ws, layerId, id, kind);
    return id;
  }
  if (s.what === "brick") {
    const type = key === "spells" ? "spell" : key === "attacks" ? "attack" : key === "enchantments" ? "damage" : "trait";
    const defaults: Record<string, Value> = type === "spell" ? { [F.spellLevel]: 1, [F.school]: "Evocation", [F.dice]: "", [F.damageType]: "", [F.wording]: "" } : type === "attack" ? { [F.ability]: null, [F.dice]: "1d6", [F.damageType]: "slashing" } : type === "damage" ? { [F.dice]: "1d6", [F.damageType]: "fire" } : { [F.wording]: "" };
    return ws.create(layerId, "brick", name, { category: type === "spell" && cats.get("spell") ? link(cats.get("spell")!) : null, fields: { [F.type]: type, ...defaults } });
  }
  const role = key === "weapons" ? "weapon" : key === "armour" ? "armour" : "item";
  let category = cats.get(role)!;
  if (key === "magic") category = categoryTree(ws, layerId).find((c) => c.role === "item" && c.name === "Magic items")?.id ?? ws.create(layerId, "category", "Magic items", { fields: { [F.under]: link(cats.get("item")!) } });
  const fields: Record<string, Value> = { [F.cost]: "10 gp", [F.weight]: "3 lb." };
  if (key === "weapons") fields.handling = "One-handed";
  const id = ws.create(layerId, "item", name, { category: link(category), fields });
  if (key === "weapons") ws.attach(layerId, id, ws.create(layerId, "brick", freeNodeName(ws, layerId, "brick", `${name} attack`), { fields: { [F.type]: "attack", [F.ability]: null, [F.dice]: "1d6", [F.damageType]: "slashing" } }));
  if (key === "armour") ws.attach(layerId, id, ws.create(layerId, "brick", freeNodeName(ws, layerId, "brick", `${name} protection`), { fields: { [F.type]: "armor", bonus: 1 } }));
  return id;
}

// ---------- Choices ("choose one of these") ----------

/**
 * "+ Add a choice": a Choices box on a sheet, such as "Choose one fighting style: Archery,
 * Defense, Dueling". The options are links to things in the Codex. Inside the caller's step.
 */
export function addChoice(ws: Workspace, layerId: Id, nodeId: Id, input: { label: string; pick: number; options: Id[] }): Id {
  const label = input.label.trim();
  if (!label) throw new Error("Say what is being chosen, for example: fighting style.");
  const options = [...new Set(input.options)].filter((id) => ws.get(layerId, id));
  return ws.attach(layerId, nodeId, null, { choice: { label, pick: Math.max(1, Math.round(input.pick) || 1), again: false, restrict: "", options: options.map((id) => link(id)) } });
}

/** Dropping things onto a Choices box adds them as options. Inside the caller's step. */
export function addChoiceOptions(ws: Workspace, layerId: Id, nodeId: Id, aid: Id, ids: Id[]) {
  ws.editAttachment(layerId, nodeId, aid, (a) => {
    if (!a.choice) throw new Error("That isn't a Choices box.");
    const have = new Set(a.choice.options.map((o) => o.link));
    for (const id of ids) if (id !== nodeId && ws.get(layerId, id) && !have.has(id)) a.choice.options.push(link(id));
  });
}
