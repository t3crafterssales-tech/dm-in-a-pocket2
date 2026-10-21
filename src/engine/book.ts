// The rulebook, written automatically from a system and world. This builds the book's content
// and structure; turning it into a PDF or Word file happens in the export milestone.

import { F, SRD_LICENSE, attachmentValues, levelKey } from "./conventions.ts";
import { findLinks, isLink } from "./links.ts";
import { isCoreCheck, ruleText } from "./rulestext.ts";
import { cap, sentence } from "./text.ts";
import type { Attachment, Id, NodeRecord, Value } from "./types.ts";
import type { Workspace } from "./workspace.ts";

export type BookType = "players" | "monsters" | "gm" | "world" | "everything";
export type ChapterId = "core" | "abilities" | "resources" | "conditions" | "skills" | "rules" | "races" | "classes" | "spells" | "monsters" | "npcs" | "items" | "lore";

export const CHAPTER_TITLES: Record<ChapterId, string> = {
  core: "Core rules",
  abilities: "Abilities",
  resources: "Resources",
  conditions: "Conditions",
  skills: "Skills",
  rules: "Rules of play",
  races: "Races",
  classes: "Classes",
  spells: "Spells",
  monsters: "Monsters",
  npcs: "Characters of the world",
  items: "Equipment",
  lore: "The world",
};

/** Each book type comes with a sensible set of chapters ticked. */
export const BOOK_CHAPTERS: Record<BookType, ChapterId[]> = {
  players: ["core", "abilities", "resources", "conditions", "skills", "rules", "races", "classes", "spells", "items"],
  monsters: ["monsters", "npcs"],
  gm: ["core", "rules", "conditions", "monsters", "npcs", "items", "lore"],
  world: ["lore", "races", "npcs"],
  everything: ["core", "abilities", "resources", "conditions", "skills", "rules", "races", "classes", "spells", "monsters", "npcs", "items", "lore"],
};

export const BOOK_TITLES: Record<BookType, string> = {
  players: "Player's Handbook",
  monsters: "Monster Manual",
  gm: "GM Guide",
  world: "World Guide",
  everything: "Complete Rulebook",
};

export const SRD_CREDIT =
  'This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.';

export interface BookOptions {
  type: BookType;
  /** Chapters to include, in order. Defaults to the book type's chapters. */
  chapters?: ChapterId[];
  /** "differences" prints variants as "As Elf, plus..."; "full" prints every entry in full. */
  variants?: "differences" | "full";
  /** Sort monsters by challenge instead of alphabetically. */
  monstersByChallenge?: boolean;
  author?: string | null;
}

export interface Entry {
  /** The node this entry is about (used for the index and page references). */
  node: Id;
  title: string;
  /** Short numbers line for stat blocks, such as "HP 7 · AC 15 · Speed 30 ft · Challenge 1/4". */
  stats: string | null;
  paragraphs: string[];
  /** Nodes this entry links to, so the PDF can add "see Poisoned, page 42". */
  mentions: Id[];
  /** Variants printed under this entry. */
  variants: Entry[];
  /** For variants printed as differences: the entry they are "as". */
  asParent: string | null;
  picture: Id | null;
}

export interface Chapter {
  id: ChapterId | `page:${string}`;
  title: string;
  /** Free text for book pages (foreword, How to play). */
  text: string | null;
  entries: Entry[];
}

export interface Book {
  title: string;
  subtitle: string;
  chapters: Chapter[];
  /** Every entry title, alphabetically, with the node it points at. */
  index: { term: string; node: Id }[];
  credits: string[];
}

export function buildBook(ws: Workspace, layerId: Id, opts: BookOptions): Book {
  const chapters = opts.chapters ?? BOOK_CHAPTERS[opts.type];
  const layer = ws.layer(layerId);
  const variantsAs = opts.variants ?? "differences";
  const visible = ws.list(layerId).filter((n) => !n.template);
  const out: Chapter[] = [];
  const pages = visible.filter((n) => n.kind === "lore" && n.fields[F.bookPage] === true && inBook(n, opts.type));

  for (const ch of chapters) {
    for (const p of pages.filter((p) => p.fields[F.before] === ch)) out.push(pageChapter(p));
    const nodes = visible.filter((n) => chapterOf(ws, layerId, n) === ch);
    if (!nodes.length) continue;
    out.push({ id: ch, title: CHAPTER_TITLES[ch], text: null, entries: arrange(ws, layerId, nodes, ch, variantsAs, !!opts.monstersByChallenge) });
  }
  for (const p of pages.filter((p) => !chapters.includes(p.fields[F.before] as ChapterId))) out.push(pageChapter(p));

  const index: Book["index"] = [];
  const walk = (e: Entry) => {
    index.push({ term: e.title, node: e.node });
    e.variants.forEach(walk);
  };
  out.forEach((c) => c.entries.forEach(walk));
  index.sort((a, b) => a.term.localeCompare(b.term));

  const credits: string[] = [];
  const author = opts.author ?? layer.author;
  if (author) credits.push(`Created by ${author}.`);
  if (visible.some((n) => n.fields[F.license] === SRD_LICENSE)) credits.push(SRD_CREDIT);

  return { title: layer.name, subtitle: BOOK_TITLES[opts.type], chapters: out, index, credits };
}

function inBook(n: NodeRecord, type: BookType): boolean {
  const books = n.fields[F.books];
  if (!Array.isArray(books) || books.length === 0) return true;
  return type === "everything" || books.includes(type);
}

function pageChapter(p: NodeRecord): Chapter {
  return { id: `page:${p.id}`, title: p.name, text: p.text, entries: [] };
}

export function chapterOf(ws: Workspace, layerId: Id, n: NodeRecord): ChapterId | null {
  const f = ws.resolve(layerId, n.id)!.fields;
  switch (n.kind) {
    case "ability":
      return "abilities";
    case "resource":
      return "resources";
    case "condition":
      return "conditions";
    case "skill":
      return "skills";
    case "rule":
      return f[F.forbid] ? null : f.section === "Core check" || sectionKey(ws, layerId, n) === "core" ? "core" : "rules";
    case "item":
      return "items";
    case "lore":
      // Book pages and a module's front page print in their own places.
      return f[F.bookPage] === true || f.modulePage === true ? null : "lore";
    case "table":
      return "lore";
    case "brick":
      // Spells print in their own chapter; other library bricks print where they are used.
      return f[F.type] === "spell" ? "spells" : null;
    case "being":
      return ({ race: "races", class: "classes", monster: "monsters", npc: "npcs", character: null } as Record<string, ChapterId | null>)[String(f[F.beingKind])] ?? null;
    default:
      return null;
  }
}

/** The Rules tab section a node is filed in, from its category ("core", "combat", ...). */
function sectionKey(ws: Workspace, layerId: Id, n: NodeRecord): string | null {
  const c = n.category ? ws.get(layerId, n.category.link) : null;
  const key = c?.fields[F.section];
  return typeof key === "string" ? key : null;
}

function arrange(ws: Workspace, layerId: Id, nodes: NodeRecord[], ch: ChapterId, variantsAs: "differences" | "full", byCr: boolean): Entry[] {
  const ids = new Set(nodes.map((n) => n.id));
  const sort = (list: NodeRecord[]) => {
    if (ch === "monsters" && byCr) {
      const cr = (n: NodeRecord) => crNumber(ws.resolve(layerId, n.id)!.fields[F.cr]);
      return [...list].sort((a, b) => cr(a) - cr(b) || a.name.localeCompare(b.name));
    }
    // Abilities keep the order they were made in, as on a character sheet (STR, DEX, CON...).
    if (ch === "abilities") return [...list].sort((a, b) => a.created - b.created);
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  };
  if (variantsAs === "full") return sort(nodes).map((n) => entry(ws, layerId, n, false));
  // Variants go under their parent, unless the parent is a template or isn't in this chapter.
  const top = nodes.filter((n) => !n.parent || !ids.has(n.parent.link));
  const build = (n: NodeRecord, asVariant: boolean): Entry => {
    const e = entry(ws, layerId, n, asVariant);
    e.variants = sort(nodes.filter((c) => c.parent?.link === n.id)).map((c) => build(c, true));
    return e;
  };
  return sort(top).map((n) => build(n, false));
}

function crNumber(v: Value | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.includes("/")) {
    const [a, b] = v.split("/").map(Number);
    return a !== undefined && b ? a / b : 0;
  }
  return Number(v) || 0;
}

const STAT_LABELS: [string, string][] = [
  [F.label, "Short label"],
  [F.hp, "HP"],
  [F.ac, "AC"],
  [F.speed, "Speed"],
  [F.cr, "Challenge"],
  [F.cost, "Cost"],
  [F.weight, "Weight"],
  ["material", "Material"],
  ["handling", "Held"],
];

/** One thing as the rulebook prints it. The sheets' "How it prints" box uses this too, so they always agree. */
export function bookEntry(ws: Workspace, layerId: Id, n: NodeRecord, asVariant = false): Entry {
  return entry(ws, layerId, n, asVariant);
}

function entry(ws: Workspace, layerId: Id, n: NodeRecord, asVariant: boolean): Entry {
  const r = ws.resolve(layerId, n.id)!;
  const parent = n.parent ? ws.get(layerId, n.parent.link) : null;
  const showOnlyOwn = asVariant && !!parent && !parent.template;
  const fields = showOnlyOwn ? n.fields : r.fields;
  const attachments = showOnlyOwn ? r.attachments.filter((x) => x.from === null) : r.attachments;
  const stats = n.kind === "brick" ? spellStats(fields) : STAT_LABELS.filter(([k]) => fields[k] !== undefined && fields[k] !== null && fields[k] !== "").map(([k, label]) => `${label} ${String(fields[k])}`);
  const paragraphs: string[] = [];
  if (showOnlyOwn) {
    const changed = stats.length ? ` (${stats.join(", ")})` : "";
    paragraphs.push(`As ${parent!.name}${changed}${attachments.length ? ", plus:" : "."}`);
  }
  // One text box per node; each line in it is a paragraph.
  paragraphs.push(...n.text.split(/\n+/).map((p) => p.trim()).filter(Boolean));
  paragraphs.push(...describeFields(ws, layerId, n, fields));
  // A class's features print in level order: "Level 3. Sneak Attack: ...". Others stay in sheet order.
  const levelOf = (aid: string) => {
    const l = Number(r.fields[levelKey(aid)]);
    return Number.isInteger(l) && l > 0 ? l : null;
  };
  const isClass = n.kind === "being" && r.fields[F.beingKind] === "class";
  const ordered = isClass ? [...attachments].sort((a, b) => (levelOf(a.attachment.aid) ?? 1e9) - (levelOf(b.attachment.aid) ?? 1e9)) : attachments;
  for (const { attachment } of ordered) {
    const level = isClass ? levelOf(attachment.aid) : null;
    const s = sentence(ws, layerId, attachment);
    // On a sheet the card shows the brick's name; in the book an effect needs it said: "Poison Bite. The target is Poisoned."
    const target = attachment.brick ? ws.get(layerId, attachment.brick.link) : null;
    const name = attachment.name || target?.name || "";
    const type = attachmentValues(ws, layerId, attachment)[F.type];
    const said = name && (type === "effect" || type === "damage") && !s.toLowerCase().includes(name.toLowerCase()) ? `${name}. ${s}` : s;
    paragraphs.push(level ? `Level ${level}. ${said}` : said);
  }
  // Page references go to things the book prints: what bricks link to (Poisoned), and carried items,
  // never the library bricks themselves.
  const mentions = new Set<Id>();
  for (const v of Object.values(fields)) if (isLink(v)) mentions.add(v.link);
  const fromAttachment = (a: Attachment) => {
    const target = a.brick ? ws.get(layerId, a.brick.link) : null;
    if (target?.kind === "item") mentions.add(target.id);
    for (const l of findLinks({ values: attachmentValues(ws, layerId, a), save: a.save, choice: a.choice })) {
      const n = ws.get(layerId, l.to);
      if (n && n.kind !== "brick" && n.kind !== "category") mentions.add(l.to);
    }
    a.children.forEach(fromAttachment);
  };
  for (const { attachment } of attachments) fromAttachment(attachment);
  return { node: n.id, title: n.name, stats: !showOnlyOwn && stats.length ? stats.join(" · ") : null, paragraphs, mentions: [...mentions], variants: [], asParent: showOnlyOwn ? parent!.name : null, picture: n.picture };
}

/** A spell's numbers line: "Level 3 Evocation · Action · 150 feet · V, S, M · Instantaneous". */
function spellStats(f: Record<string, Value>): string[] {
  const level = typeof f[F.spellLevel] === "number" ? (f[F.spellLevel] as number) : null;
  const school = typeof f[F.school] === "string" ? (f[F.school] as string) : "";
  const head = level === null ? school : level === 0 ? `${school} cantrip`.trim() : `Level ${level} ${school}`.trim();
  const ritual = f[F.ritual] === true ? " (ritual)" : "";
  return [head + ritual, f[F.castingTime], f[F.range], f[F.components], f[F.duration]].filter((x): x is string => typeof x === "string" && x !== "").map((x) => x[0]!.toUpperCase() + x.slice(1));
}

/** "Strength (STR): scores from 3 to 18" printed under the heading Strength reads "Scores from 3 to 18". */
function withoutName(text: string, n: NodeRecord, f: Record<string, Value>): string {
  const label = typeof f[F.label] === "string" && f[F.label] ? ` (${f[F.label]})` : "";
  for (const prefix of [`${n.name}${label}: `, `${n.name}: `]) if (text.startsWith(prefix)) return cap(text.slice(prefix.length));
  return text;
}

/** Sentences for rule nodes, written from their fields (the same sentences the editor shows). */
function describeFields(ws: Workspace, layerId: Id, n: NodeRecord, f: Record<string, Value>): string[] {
  const name = (v: Value | undefined) => (isLink(v) ? ws.get(layerId, v.link)?.name ?? "something removed" : "");
  switch (n.kind) {
    case "brick":
      // Only spells print as entries of their own.
      return typeof f[F.spellClasses] === "string" && f[F.spellClasses] ? [`Classes: ${f[F.spellClasses]}.`] : [];
    case "ability":
    case "resource":
      return [withoutName(ruleText(ws, layerId, n.id), n, f)];
    case "condition": {
      const own = withoutName(ruleText(ws, layerId, n.id), n, f);
      return [own.toLowerCase() === "described in its text." ? "" : own, typeof f.effects === "string" ? f.effects : "", f.tick ? cap(String(f.tick)) + "." : ""].filter(Boolean);
    }
    case "skill":
      return isLink(f.ability) ? [`Uses ${name(f.ability)}.`] : [];
    case "rule":
      if (isCoreCheck(ws, layerId, n) || f[F.method] === "pointBuy") return [ruleText(ws, layerId, n.id)];
      return typeof f.ruleText === "string" && f.ruleText ? [f.ruleText] : [];
    case "lore": {
      const sections = f.sections;
      if (!sections || typeof sections !== "object" || Array.isArray(sections) || isLink(sections)) return [];
      return Object.entries(sections as Record<string, Value>).filter(([, v]) => typeof v === "string" && v).map(([k, v]) => `${k}. ${v}`);
    }
    case "table": {
      // "d6: 1-2 Goblins; 3-5 Wolves; 6 An ogre"
      const rows = Array.isArray(f.rows) ? f.rows : [];
      const lines = rows.flatMap((r) => {
        if (!r || typeof r !== "object" || Array.isArray(r) || isLink(r)) return [];
        const x = r as Record<string, Value>;
        const range = x.from === x.to || x.to === undefined ? String(x.from ?? "?") : `${x.from}-${x.to}`;
        const what = [typeof x.text === "string" ? x.text : "", isLink(x.result) ? name(x.result) : ""].filter(Boolean).join(": ");
        return [`${range}. ${what}`];
      });
      return lines.length ? [`Roll ${typeof f.die === "string" ? f.die : "a die"}.`, ...lines] : [];
    }
    default: {
      const origin = f.origin;
      return isLink(origin) ? [`Origin: ${name(origin)}.`] : [];
    }
  }
}
