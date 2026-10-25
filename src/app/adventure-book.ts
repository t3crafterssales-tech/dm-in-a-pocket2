// The adventure booklet (version 2): a module printed like an old published adventure. The front
// page, then every encounter in tree order with its number, read-aloud text in a box and the DM's
// notes, then appendices for the creatures, treasure and handouts it uses. Built on the rulebook's
// pages, so the preview, PDF and Word file all work the same way.

import { F, SRD_CREDIT, SRD_LICENSE, bookEntry, isLink } from "../engine/index.ts";
import type { Id, Value, Workspace } from "../engine/index.ts";
import type { Book, Chapter, Entry } from "../engine/book.ts";
import { encounterTree } from "./encounters.ts";
import { mapView } from "./maps.ts";
import type { EncounterNode } from "./encounters.ts";
import { toPlain } from "../engine/richtext.ts";

/** How encounter numbers print: all of them (2.1.3), only the top level (2), or none. */
export type EncounterNumbering = "full" | "top" | "off";

const linkOf = (v: Value | undefined): Id | null => (isLink(v) ? v.link : null);
const links = (v: Value | undefined): Id[] => (Array.isArray(v) ? v.map(linkOf).filter((x): x is Id => !!x) : []);

/** The number an encounter prints with, or "" when numbers are off for it. */
function shownNumber(e: EncounterNode, numbering: EncounterNumbering): string {
  if (numbering === "off") return "";
  if (numbering === "top") return e.depth === 0 ? e.number : "";
  return e.number;
}

/** "2.1 The well", or just "The well". */
export function encounterTitle(e: EncounterNode, numbering: EncounterNumbering): string {
  const n = shownNumber(e, numbering);
  return n ? `${n} ${e.name}` : e.name;
}

export interface AdventureBook {
  book: Book;
  /** Names for page references: encounters carry their number, so "See 2 The cave (page 4)". */
  names: Record<Id, string>;
}

export function buildAdventureBook(ws: Workspace, layerId: Id, opts: { numbering?: EncounterNumbering; author?: string | null }): AdventureBook {
  const numbering = opts.numbering ?? "full";
  const layer = ws.layer(layerId);
  const tree = encounterTree(ws, layerId);
  const names: Record<Id, string> = {};
  const nameOf = (id: Id) => ws.get(layerId, id)?.name ?? "something removed";
  const creatures = new Set<Id>();
  const treasure = new Set<Id>();
  const handouts = new Set<Id>();

  const titles = new Map<Id, string>();
  const walkTitles = (list: EncounterNode[]) => list.forEach((e) => (titles.set(e.id, encounterTitle(e, numbering)), walkTitles(e.children)));
  walkTitles(tree);
  for (const [id, t] of titles) names[id] = t;

  const encounterEntry = (e: EncounterNode): Entry => {
    const r = ws.resolve(layerId, e.id)!;
    const f = r.fields;
    const paragraphs: string[] = [];
    const mentions: Id[] = [];
    // The DM's notes: "What's really going on".
    paragraphs.push(...toPlain(r.record.text).split(/\n+/).map((p) => p.trim()).filter(Boolean));
    const who = (Array.isArray(f.creatures) ? f.creatures : []).flatMap((c) => {
      if (!c || typeof c !== "object" || Array.isArray(c) || isLink(c)) return [];
      const id = linkOf((c as Record<string, Value>).being);
      if (!id) return [];
      const count = Number((c as Record<string, Value>).count) || 1;
      creatures.add(id);
      mentions.push(id);
      return [count > 1 ? `${nameOf(id)} ×${count}` : nameOf(id)];
    });
    if (who.length) paragraphs.push(`Creatures: ${who.join(", ")}.`);
    const loot = links(f.treasure);
    loot.forEach((id) => (treasure.add(id), mentions.push(id)));
    if (loot.length) paragraphs.push(`Treasure: ${loot.map(nameOf).join(", ")}.`);
    const papers = links(f.handouts);
    papers.forEach((id) => (handouts.add(id), mentions.push(id)));
    if (papers.length) paragraphs.push(`Handouts: ${papers.map(nameOf).join(", ")}.`);
    const next = links(f.leadsTo).filter((id) => titles.has(id));
    next.forEach((id) => mentions.push(id));
    if (next.length) paragraphs.push(`Leads to: ${next.map((id) => titles.get(id)).join(", ")}.`);
    const readAloud = typeof f.readAloud === "string" && f.readAloud.trim() ? f.readAloud.trim() : null;
    return { node: e.id, title: titles.get(e.id)!, stats: null, paragraphs, mentions, variants: e.children.map(encounterEntry), asParent: null, picture: r.record.picture, readAloud };
  };

  const chapters: Chapter[] = [];
  // The front page: who it's for, then the hook.
  const front = ws.list(layerId, "lore").find((n) => ws.resolve(layerId, n.id)!.fields.modulePage === true);
  if (front) {
    const f = ws.resolve(layerId, front.id)!.fields;
    const party = Number(f.partySize) || 0;
    const sessions = Number(f.sessions) || 0;
    const levels = typeof f.levels === "string" ? f.levels.trim() : "";
    const who = [party ? `${party} ${party === 1 ? "character" : "characters"}` : "characters", levels ? `of ${/^\d+$/.test(levels) ? "level" : "levels"} ${levels}` : ""].filter(Boolean).join(" ");
    const lines = [`An adventure for ${who}${sessions ? `, about ${sessions} ${sessions === 1 ? "session" : "sessions"} of play` : ""}.`];
    if (layer.base && ws.layer(layer.base).type === "world") lines.push(`Set in ${ws.layer(layer.base).name}.`);
    chapters.push({ id: `adv:front`, title: "Introduction", text: [lines.join(" "), front.text.trim()].filter(Boolean).join("\n\n"), entries: [] });
  }
  const encounters = tree.map(encounterEntry);
  if (encounters.length) chapters.push({ id: "adv:encounters", title: "The adventure", text: null, entries: encounters });
  const appendix = (id: string, title: string, ids: Set<Id>) => {
    const entries = [...ids]
      .map((i) => ws.get(layerId, i))
      .filter((n): n is NonNullable<typeof n> => !!n)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((n) => bookEntry(ws, layerId, n));
    if (entries.length) chapters.push({ id: `adv:${id}`, title, text: null, entries });
  };
  // Maps: the module's own, and any map with a pin on one of its encounters, with numbered rooms.
  const encounterIds = new Set(titles.keys());
  const maps = ws
    .list(layerId, "map")
    .filter((m) => !m.template && (ws.owner(layerId, m.id) === layerId || mapView(ws, layerId, m.id).pins.some((p) => p.target && encounterIds.has(p.target.id))))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (maps.length)
    chapters.push({
      id: "adv:maps",
      title: "Maps",
      text: null,
      entries: maps.map((m) => ({ node: m.id, title: m.name, stats: null, paragraphs: toPlain(m.text).split(/\n+/).map((p) => p.trim()).filter(Boolean), mentions: [], variants: [], asParent: null, picture: null, map: mapView(ws, layerId, m.id), mapNumbers: numbering !== "off" })),
    });
  appendix("creatures", "Appendix: Creatures", creatures);
  appendix("treasure", "Appendix: Treasure", treasure);
  appendix("handouts", "Appendix: Handouts", handouts);

  const index: Book["index"] = [];
  const walk = (e: Entry) => {
    index.push({ term: e.title, node: e.node });
    e.variants.forEach(walk);
  };
  chapters.forEach((c) => c.entries.forEach(walk));
  index.sort((a, b) => a.term.localeCompare(b.term, undefined, { numeric: true }));
  // Page references from the appendices (a wolf's bite naming Prone) need names too.
  const mentioned = (e: Entry) => {
    for (const m of e.mentions) names[m] ??= nameOf(m);
    e.variants.forEach(mentioned);
  };
  chapters.forEach((c) => c.entries.forEach(mentioned));

  const credits: string[] = [];
  const author = opts.author ?? layer.author;
  if (author) credits.push(`Created by ${author}.`);
  if ([...creatures, ...treasure, ...handouts].some((id) => ws.resolve(layerId, id)?.fields[F.license] === SRD_LICENSE)) credits.push(SRD_CREDIT);

  return { book: { title: layer.name, subtitle: "Adventure", chapters, index, credits }, names };
}
