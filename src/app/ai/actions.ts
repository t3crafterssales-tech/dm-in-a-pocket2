// The AI's fixed list of named actions (Part 7 of the rules). Read actions look things up and
// change nothing. Change actions are never run straight away: they are collected into a proposal,
// tried out (and put back) to check they work, and shown to the user as plain-words lines. Only
// Accept runs them for real, all together as one undo step. There is no delete action: the AI can
// only suggest a deletion.

import { F, findAttachment, isLink, link, sentence } from "../../engine/index.ts";
import type { Attachment, Id, NodeRecord, Value, Workspace } from "../../engine/index.ts";
import { BRICK_TYPES, createBrick } from "../library.ts";
import type { BrickType } from "../library.ts";
import { createLore, LORE_TEMPLATES } from "../lore.ts";
import { RULE_SECTIONS, createRuleNode, sectionOf } from "../rules.ts";
import { BEING_KINDS, categoryTree, createBeing, createCategory, createItem, scoreKey, scoreValue } from "../sheets.ts";
import type { BeingKind } from "../sheets.ts";
import { FIELD_LABELS } from "../upward.ts";
import { toPlain } from "../../engine/richtext.ts";

/** A tool as the Claude API describes one. */
export interface ToolDef {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required: string[]; additionalProperties: false };
  strict?: boolean;
}

/** A change the AI asked for, kept exactly as asked. New things are called new-1, new-2... */
export interface ChangeAction {
  tool: ChangeTool;
  input: Record<string, unknown>;
}

export type ChangeTool = "set_value" | "set_score" | "create_node" | "attach_brick" | "edit_attachment" | "move_to_category" | "suggest_delete" | "update_world_notes";
export const CHANGE_TOOLS: ChangeTool[] = ["set_value", "set_score", "create_node", "attach_brick", "edit_attachment", "move_to_category", "suggest_delete", "update_world_notes"];
export const READ_TOOLS = ["find_nodes", "read_node", "list_categories"] as const;

export class ActionError extends Error {}

const S = (description: string) => ({ type: "string", description });
const ids = (description: string) => ({ type: "array", items: { type: "string" }, description });
const obj = (properties: Record<string, unknown>, required: string[]): ToolDef["input_schema"] => ({ type: "object", properties, required, additionalProperties: false });
/** A value: words, a number, true or false, null to clear it, or a link written as "@<id>". */
const VALUE = { type: ["string", "number", "boolean", "null"], description: 'Words, a number, true/false, or null to clear it. To point at another thing, write "@" and its id, such as "@3fa2" or "@new-1".' };

export const TOOLS: ToolDef[] = [
  {
    name: "find_nodes",
    description: "Look things up (read only). Matches the name or text, a kind, and/or a category (which includes its sub-categories). Use the category to find things for bulk changes: 'all swords' means everything filed under Swords, never a name search.",
    input_schema: obj({ query: { type: ["string", "null"], description: "Words to look for in the name or text, or null." }, kind: { type: ["string", "null"], description: "ability, resource, skill, condition, rule, brick, being, item, lore, table or category; or null." }, category: { type: ["string", "null"], description: "A category id or name, or null." }, limit: { type: ["integer", "null"], description: "Most results to return (default 50, at most 300)." } }, ["query", "kind", "category", "limit"]),
  },
  { name: "read_node", description: "Read one thing in full (read only): its values, its text, and the bricks on it with their attachment ids.", input_schema: obj({ id: S("The id.") }, ["id"]) },
  { name: "list_categories", description: "List the categories things can be filed in, and the Rules tab's sections (read only).", input_schema: obj({}, []) },
  {
    name: "set_value",
    description: 'Propose changing one value on one or more things (a bulk change is one step). field is "name", "text" (the description) or a value such as hp, ac, speed, cr, cost, weight, label, rangeMin, rangeMax, dice, damageType, ability, wording, material.',
    input_schema: obj({ nodes: ids("The ids of the things to change."), field: S("The value to change."), value: VALUE }, ["nodes", "field", "value"]),
  },
  { name: "set_score", description: "Propose setting an ability score on a sheet (STR 14 and so on).", input_schema: obj({ node: S("The sheet's id."), ability: S("The ability's id."), score: { type: ["integer", "null"], description: "The score, or null to follow the parent again." } }, ["node", "ability", "score"]) },
  {
    name: "create_node",
    description:
      "Propose making something new. kind is a Rules tab section key (core, abilities, resources, skills, conditions, combat, magic, advancement, time, currency, world) for rules; or being, item, brick, lore, table or category. For a being give being_kind (monster, npc, character, race, class); for a brick give brick_type (attack, spell, trait, effect, damage, immunity, abilityBonus, armor); for lore give lore_template (blank, place, faction). Returns an id such as new-1 that later actions can use.",
    input_schema: obj(
      {
        kind: S("What to make."),
        name: S("Its name."),
        text: { type: ["string", "null"], description: "Its description, or null." },
        category: { type: ["string", "null"], description: "For items and categories: the category id to file it in (for a category: the one it goes under), or null." },
        variant_of: { type: ["string", "null"], description: "For beings and items: the id of the parent it is a variant of, or null." },
        being_kind: { type: ["string", "null"], description: "For beings, or null." },
        brick_type: { type: ["string", "null"], description: "For bricks, or null." },
        lore_template: { type: ["string", "null"], description: "For lore, or null." },
        values: { type: "array", description: "Values to set on it.", items: { type: "object", properties: { field: { type: "string" }, value: VALUE }, required: ["field", "value"], additionalProperties: false } },
      },
      ["kind", "name", "text", "category", "variant_of", "being_kind", "brick_type", "lore_template", "values"],
    ),
  },
  { name: "attach_brick", description: "Propose putting a library brick (or an item, as gear) on one or more sheets.", input_schema: obj({ nodes: ids("The sheets."), brick: S("The brick's or item's id.") }, ["nodes", "brick"]) },
  {
    name: "edit_attachment",
    description: "Propose changing a brick on a sheet, only on that sheet (such as the Longsword's attack using Dexterity). Get attachment ids from read_node.",
    input_schema: obj({ items: { type: "array", description: "Which brick on which sheet.", items: { type: "object", properties: { node: { type: "string" }, attachment: { type: "string" } }, required: ["node", "attachment"], additionalProperties: false } }, field: S("The value, such as ability, dice, damageType or wording."), value: VALUE }, ["items", "field", "value"]),
  },
  { name: "move_to_category", description: "Propose filing one or more things under a category.", input_schema: obj({ nodes: ids("The things."), category: S("The category id.") }, ["nodes", "category"]) },
  { name: "suggest_delete", description: "Suggest that the user deletes something. You can't delete: this only shows the suggestion, and the user decides.", input_schema: obj({ node: S("The id."), reason: S("Why, in a few words.") }, ["node", "reason"]) },
  {
    name: "update_world_notes",
    description: "Replace your own World Notes lines (tone, important facts such as 'no oxygen in the water', key decisions). Lines the user wrote are kept and never change. Keep it short: at most about 20 lines.",
    input_schema: obj({ lines: { type: "array", items: { type: "string" }, description: "Your lines." } }, ["lines"]),
  },
];
/** Check for errors only: the AI reports problems; it changes nothing. */
/** Version 4: for a creative request the AI offers several complete alternatives, each started with this. */
export const VERSION_TOOL: ToolDef = {
  name: "start_version",
  description: "Start one complete alternative version of what the user asked for. Give it a short label that says how it feels, such as 'ruined and forgotten' or 'busy trade post'. Everything you queue after this belongs to this version until you call start_version again. Each version must work on its own, and its new ids start again from new-1.",
  input_schema: obj({ label: S("A few words on how this version feels.") }, ["label"]),
};

export const REPORT_TOOL: ToolDef = {
  name: "report_problem",
  description: "Report one problem you found, as a yellow flag for the user. Only for real problems in the categories you were asked to check; say plainly what looks wrong and why.",
  input_schema: obj(
    {
      nodes: ids("The ids of the things it is about."),
      category: { type: "string", enum: ["balance", "economy", "filing", "lore"], description: "Which kind of check found it." },
      title: S("A short title in plain words, such as 'The Iron Helm breaks the no-metal rule'."),
      detail: S("One or two plain sentences: what looks wrong and what might fix it."),
    },
    ["nodes", "category", "title", "detail"],
  ),
};
for (const t of [...TOOLS, REPORT_TOOL]) t.strict = true;

// ---------- Reading ----------

const shortValue = (ws: Workspace, layerId: Id, v: Value): unknown => {
  if (isLink(v)) return `@${v.link} (${ws.peek(layerId, v.link)?.name ?? "missing"})`;
  if (v && typeof v === "object") return JSON.stringify(v).slice(0, 200);
  return v;
};

function categoryPath(ws: Workspace, layerId: Id, n: NodeRecord): string {
  const parts: string[] = [];
  let c = n.category ? ws.peek(layerId, n.category.link) : null;
  for (let i = 0; c && i < 5; i++) {
    parts.unshift(c.name);
    const up = c.fields[F.under];
    c = isLink(up) ? ws.peek(layerId, up.link) : null;
  }
  return parts.join(" → ");
}

/** Every category under (and including) one, by id or name. */
function categoryFamily(ws: Workspace, layerId: Id, idOrName: string): Set<Id> {
  const cats = ws.list(layerId, "category");
  const start = cats.filter((c) => c.id === idOrName || c.name.toLowerCase() === idOrName.toLowerCase());
  const out = new Set(start.map((c) => c.id));
  for (let grew = true; grew; ) {
    grew = false;
    for (const c of cats) {
      const up = c.fields[F.under];
      if (!out.has(c.id) && isLink(up) && out.has(up.link)) {
        out.add(c.id);
        grew = true;
      }
    }
  }
  return out;
}

export function runReadTool(ws: Workspace, layerId: Id, tool: string, input: Record<string, unknown>): unknown {
  if (tool === "list_categories") {
    return {
      categories: categoryTree(ws, layerId).map((c) => ({ id: c.id, path: c.path })),
      rule_sections: RULE_SECTIONS.map((s) => s.key),
      abilities: ws.list(layerId, "ability").map((a) => ({ id: a.id, name: a.name })),
    };
  }
  if (tool === "read_node") {
    const id = String(input.id ?? "");
    const r = ws.resolve(layerId, id);
    if (!r) throw new ActionError(`Nothing has the id ${id}.`);
    const n = r.record;
    const fields = Object.fromEntries(Object.entries(r.fields).filter(([k]) => k !== F.license).map(([k, v]) => [k, shortValue(ws, layerId, v)]));
    return {
      id: n.id,
      name: n.name,
      kind: n.kind,
      category: categoryPath(ws, layerId, n) || null,
      section: ["ability", "resource", "skill", "condition", "rule"].includes(n.kind) ? sectionOf(ws, layerId, n) : undefined,
      variant_of: n.parent ? { id: n.parent.link, name: ws.peek(layerId, n.parent.link)?.name ?? "missing" } : null,
      template: n.template || undefined,
      text: toPlain(n.text).slice(0, 3000),
      values: fields,
      bricks: r.attachments.map(({ attachment, from }) => ({ attachment: attachment.aid, brick: attachment.brick?.link ?? null, name: attachment.name ?? (attachment.brick ? ws.peek(layerId, attachment.brick.link)?.name : null), says: sentence(ws, layerId, attachment), inherited: from ? "from its parent; change it there" : undefined })),
    };
  }
  if (tool === "find_nodes") {
    const q = typeof input.query === "string" ? input.query.trim().toLowerCase() : "";
    const kind = typeof input.kind === "string" ? input.kind : "";
    const fam = typeof input.category === "string" && input.category ? categoryFamily(ws, layerId, input.category) : null;
    if (fam && !fam.size) throw new ActionError(`There is no category called ${String(input.category)}.`);
    const limit = Math.max(1, Math.min(300, Number(input.limit ?? 50) || 50));
    const all = ws.list(layerId).filter((n) => (!kind || n.kind === kind) && (!fam || (n.category && fam.has(n.category.link))) && (!q || n.name.toLowerCase().includes(q) || toPlain(n.text).toLowerCase().includes(q)));
    return {
      total: all.length,
      results: all.slice(0, limit).map((n) => {
        const f = ws.resolve(layerId, n.id)!.fields;
        const facts = [F.cr, F.hp, F.cost].filter((k) => f[k] !== undefined && f[k] !== "").map((k) => `${k} ${String(f[k])}`).join(", ");
        return { id: n.id, name: n.name, kind: n.kind, category: categoryPath(ws, layerId, n) || undefined, facts: facts || undefined };
      }),
    };
  }
  throw new ActionError(`There is no action called ${tool}.`);
}

// ---------- Changing ----------

const FIELD = /^[A-Za-z][A-Za-z0-9_]*$/;
/** Values the app files things by, which the AI must not touch directly. */
const PROTECTED = new Set<string>([F.license, F.section, F.role, F.under, F.type, F.beingKind]);

export interface Applied {
  /** One plain-words line per action, such as "Goblin: hit points 7 → 9". */
  lines: string[];
  /** Deletions the AI suggested; never done for it. */
  suggestions: string[];
  /** World Notes lines, if the AI rewrote them. */
  notes: string[] | null;
  /** How many things it touches. */
  touched: number;
}

/**
 * Runs the actions on the workspace, inside the caller's step. Throws ActionError with a plain
 * reason if one can't be done, so the caller can put everything back.
 */
export function applyActions(ws: Workspace, layerId: Id, actions: ChangeAction[]): Applied {
  const made = new Map<string, Id>();
  const out: Applied = { lines: [], suggestions: [], notes: null, touched: 0 };
  const touched = new Set<Id>();
  const id = (raw: unknown): Id => {
    const s = String(raw ?? "").replace(/^@/, "");
    const real = made.get(s) ?? s;
    if (!ws.peek(layerId, real)) throw new ActionError(`Nothing has the id ${s}.`);
    return real;
  };
  const value = (raw: unknown): Value | undefined => {
    if (raw === null || raw === undefined) return undefined;
    if (typeof raw === "string" && raw.startsWith("@")) return link(id(raw));
    if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") return raw;
    throw new ActionError("A value must be words, a number, true or false.");
  };
  const name = (nid: Id) => ws.peek(layerId, nid)?.name ?? "something";
  const words = (v: Value | undefined) => (v === undefined || v === null || v === "" ? "nothing" : isLink(v) ? name(v.link) : typeof v === "object" ? "(set)" : String(v));
  const setOne = (nid: Id, field: string, raw: unknown) => {
    if (field !== "name" && field !== "text" && (!FIELD.test(field) || PROTECTED.has(field) || field.startsWith("score_"))) throw new ActionError(`The AI can't change the value "${field}".`);
    const before = ws.resolve(layerId, nid)!;
    const v = value(raw);
    if (field === "name" || field === "text") {
      const text = v === undefined ? "" : String(isLink(v) ? name(v.link) : v);
      if (field === "name" && !text.trim()) throw new ActionError("A name can't be empty.");
      ws.edit(layerId, nid, (r) => (r[field] = field === "name" ? text.trim().slice(0, 200) : text));
      const short = text.length > 70 ? `${text.slice(0, 67)}…` : text;
      return `${before.record.name}: ${field === "name" ? `renamed to ${text.trim()}` : `description → "${short}"`}`;
    }
    ws.setField(layerId, nid, field, v);
    return `${before.record.name}: ${(FIELD_LABELS[field] ?? field).toLowerCase()} ${words(before.fields[field])} → ${words(v)}`;
  };

  for (const a of actions) {
    const i = a.input;
    switch (a.tool) {
      case "set_value": {
        const list = Array.isArray(i.nodes) ? i.nodes.map(id) : [];
        if (!list.length) throw new ActionError("No things were named to change.");
        const field = String(i.field ?? "");
        const lines = list.map((n) => setOne(n, field, i.value));
        list.forEach((n) => touched.add(n));
        out.lines.push(...(lines.length > 5 ? [...lines.slice(0, 4), `…and ${lines.length - 4} more`] : lines));
        break;
      }
      case "set_score": {
        const n = id(i.node);
        const ab = id(i.ability);
        if (ws.peek(layerId, ab)?.kind !== "ability") throw new ActionError("That isn't an ability.");
        const score = i.score === null ? undefined : Number(i.score);
        if (score !== undefined && !Number.isFinite(score)) throw new ActionError("A score must be a number.");
        ws.setField(layerId, n, scoreKey(ab), score === undefined ? undefined : scoreValue(ab, score));
        touched.add(n);
        out.lines.push(`${name(n)}: ${name(ab)} ${score ?? "follows its parent"}`);
        break;
      }
      case "create_node": {
        const kind = String(i.kind ?? "");
        const nm = String(i.name ?? "").trim().slice(0, 200);
        if (!nm) throw new ActionError("A new thing needs a name.");
        const parent = i.variant_of ? id(i.variant_of) : null;
        const cat = i.category ? id(i.category) : null;
        let nid: Id;
        if (RULE_SECTIONS.some((s) => s.key === kind)) nid = createRuleNode(ws, layerId, kind, nm);
        else if (kind === "being") {
          const bk = String(i.being_kind ?? "monster");
          if (!BEING_KINDS.some((b) => b.id === bk)) throw new ActionError(`${bk} isn't a kind of being.`);
          nid = createBeing(ws, layerId, nm, bk as BeingKind, parent);
        } else if (kind === "item") nid = createItem(ws, layerId, nm, cat, parent);
        else if (kind === "brick") {
          const bt = String(i.brick_type ?? "trait");
          if (!BRICK_TYPES.some((b) => b.id === bt)) throw new ActionError(`${bt} isn't a kind of brick.`);
          nid = createBrick(ws, layerId, bt as BrickType, nm);
        } else if (kind === "lore") {
          const t = String(i.lore_template ?? "blank");
          if (!LORE_TEMPLATES[t]) throw new ActionError(`${t} isn't a kind of lore page.`);
          nid = createLore(ws, layerId, nm, t);
        } else if (kind === "table") nid = createLore(ws, layerId, nm, "table");
        else if (kind === "category") nid = createCategory(ws, layerId, nm, cat);
        else throw new ActionError(`The app can't make a "${kind}".`);
        made.set(`new-${made.size + 1}`, nid);
        if (typeof i.text === "string" && i.text) ws.edit(layerId, nid, (r) => (r.text = String(i.text)));
        for (const fv of Array.isArray(i.values) ? (i.values as { field: string; value: unknown }[]) : []) setOne(nid, String(fv.field), fv.value);
        // Things the AI makes are the user's own, like anything made by hand.
        ws.edit(layerId, nid, (r) => (r.source = "mine"));
        touched.add(nid);
        out.lines.push(`New ${kind === "being" ? String(i.being_kind ?? "monster") : kind}: ${nm}`);
        break;
      }
      case "attach_brick": {
        const b = id(i.brick);
        const bn = ws.peek(layerId, b)!;
        if (bn.kind !== "brick" && bn.kind !== "item") throw new ActionError(`${bn.name} isn't a brick or an item.`);
        const list = Array.isArray(i.nodes) ? i.nodes.map(id) : [];
        for (const n of list) ws.attach(layerId, n, b);
        list.forEach((n) => touched.add(n));
        out.lines.push(`Added ${bn.name} to ${list.length === 1 ? name(list[0]!) : `${list.length} sheets`}`);
        break;
      }
      case "edit_attachment": {
        const field = String(i.field ?? "");
        if (!FIELD.test(field) || field === F.type) throw new ActionError(`The AI can't change the value "${field}".`);
        const items = Array.isArray(i.items) ? (i.items as { node: string; attachment: string }[]) : [];
        if (!items.length) throw new ActionError("No bricks were named to change.");
        const v = value(i.value);
        for (const it of items) {
          const n = id(it.node);
          const rec = ws.peek(layerId, n)!;
          if (!findAttachment(rec.attachments, String(it.attachment))) throw new ActionError(`That brick isn't on ${rec.name}'s own sheet (it may come from its parent).`);
          ws.editAttachment(layerId, n, String(it.attachment), (att: Attachment) => {
            if (v === undefined) delete att.overrides[field];
            else att.overrides[field] = v;
          });
          touched.add(n);
        }
        out.lines.push(`${items.length === 1 ? name(id(items[0]!.node)) : `${items.length} sheets`}: ${(FIELD_LABELS[field] ?? field).toLowerCase()} → ${words(v)}${items.length === 1 ? "" : " on one brick each"}`);
        break;
      }
      case "move_to_category": {
        const c = id(i.category);
        if (ws.peek(layerId, c)?.kind !== "category") throw new ActionError("That isn't a category.");
        const list = Array.isArray(i.nodes) ? i.nodes.map(id) : [];
        for (const n of list) ws.edit(layerId, n, (r) => (r.category = link(c)));
        list.forEach((n) => touched.add(n));
        out.lines.push(`Filed ${list.length === 1 ? name(list[0]!) : `${list.length} things`} under ${name(c)}`);
        break;
      }
      case "suggest_delete":
        out.suggestions.push(`Delete ${name(id(i.node))}? ${String(i.reason ?? "")}`.trim());
        break;
      case "update_world_notes": {
        const lines = Array.isArray(i.lines) ? i.lines.map((l) => String(l).trim()).filter(Boolean).slice(0, 40) : [];
        out.notes = lines;
        out.lines.push("Updated the World Notes");
        break;
      }
      default:
        throw new ActionError(`There is no action called ${String(a.tool)}.`);
    }
  }
  out.touched = touched.size;
  return out;
}

/** The id a create_node action will be known by, for telling the AI. */
export function placeholderFor(actions: ChangeAction[]): string {
  return `new-${actions.filter((a) => a.tool === "create_node").length}`;
}
