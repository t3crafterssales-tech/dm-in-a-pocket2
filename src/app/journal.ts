// The journal (version 2): the DM's notebook. Pages are grouped by category (Session, Party
// notes, Lore, NPCs...), each with a priority (1 first; give a finished page 30 and it sinks), and
// built from blocks: pictures and text, moved and resized anywhere, like a scrapbook. A game
// night's page has the DM's notes on top and the table's log underneath. Typing a name links to
// its page, and that page shows "Mentioned in". Plain functions on the engine.

import { isLink, link, newId } from "../engine/index.ts";
import type { Id, NodeRecord, Value, Workspace } from "../engine/index.ts";
import { sessionOf } from "./table.ts";

export const DEFAULT_CATEGORIES = ["Session", "Party notes", "Lore", "Treasure", "Plot threads", "NPCs", "Quests", "Rumours", "Places", "Notes"];
export const PAGE_WIDTH = 800;
export const FONTS = ["Georgia", "Segoe UI", "Palatino Linotype", "Courier New", "Comic Sans MS"];

export interface Block {
  id: Id;
  type: "text" | "image";
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  font: string;
  size: number;
  color: string;
  picture: Id | null;
}

export interface PageEntry {
  id: Id;
  name: string;
  category: string;
  priority: number;
  picture: Id | null;
  favourite: boolean;
  session: Id | null;
  owner: string | null;
}

export interface PageView extends PageEntry {
  blocks: Block[];
  /** For a game night's page: the table's log under the DM's notes. */
  log: { time: number; kind: string; text: string }[];
  mentionedIn: { id: Id; name: string }[];
  /** Names on this page that have their own page or sheet, for links. */
  links: { name: string; id: Id; kind: string }[];
  shared: string[];
  revealed: boolean;
  readOnly?: boolean;
}

const num = (v: Value | undefined, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: Value | undefined, d = "") => (typeof v === "string" ? v : d);

export function blocksOf(v: Value | undefined): Block[] {
  return (Array.isArray(v) ? v : []).flatMap((b) => {
    if (!b || typeof b !== "object" || Array.isArray(b) || isLink(b)) return [];
    const o = b as Record<string, Value>;
    return [
      {
        id: str(o.id) || newId(),
        type: o.type === "image" ? "image" : "text",
        x: num(o.x, 20),
        y: num(o.y, 20),
        w: Math.max(40, num(o.w, 360)),
        h: Math.max(30, num(o.h, 160)),
        text: str(o.text),
        font: str(o.font, "Georgia"),
        size: num(o.size, 16),
        color: str(o.color, "#2b2620"),
        picture: typeof o.picture === "string" ? o.picture : null,
      } as Block,
    ];
  });
}

const blocksValue = (b: Block[]): Value => JSON.parse(JSON.stringify(b)) as Value;

function entryOf(ws: Workspace, layerId: Id, n: NodeRecord): PageEntry {
  const f = ws.resolve(layerId, n.id)!.fields;
  const blocks = blocksOf(f.blocks);
  return { id: n.id, name: n.name, category: str(f.category, "Notes"), priority: num(f.priority, 1), picture: n.picture ?? blocks.find((b) => b.type === "image")?.picture ?? null, favourite: n.favourite, session: isLink(f.session) ? f.session.link : null, owner: typeof f.owner === "string" && f.owner ? f.owner : null };
}

/**
 * The journal's tree: categories in their priority order (then the usual order), pages by
 * priority then name. `viewer` limits it to one player's own pages and what's shared with them.
 */
export function journalTree(ws: Workspace, layerId: Id, categoryOrder: { name: string; priority: number }[] = [], viewer: string | null = null): { category: string; priority: number; pages: PageEntry[] }[] {
  const pages = ws
    .list(layerId, "journal")
    .filter((n) => !n.template)
    .map((n) => entryOf(ws, layerId, n))
    .filter((p) => {
      if (viewer === null) return true;
      const f = ws.resolve(layerId, p.id)!.fields;
      const shared = Array.isArray(f.shared) ? f.shared.map((x) => str(x)) : [];
      return p.owner === viewer || shared.includes(viewer) || shared.includes("*");
    });
  const names = new Set([...categoryOrder.map((c) => c.name), ...pages.map((p) => p.category)]);
  const prio = (c: string) => categoryOrder.find((x) => x.name === c)?.priority ?? (DEFAULT_CATEGORIES.indexOf(c) >= 0 ? 100 + DEFAULT_CATEGORIES.indexOf(c) : 200);
  return [...names]
    .sort((a, b) => prio(a) - prio(b) || a.localeCompare(b))
    .map((c) => ({ category: c, priority: prio(c), pages: pages.filter((p) => p.category === c).sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name)) }));
}

export function pageView(ws: Workspace, layerId: Id, id: Id): PageView {
  const r = ws.resolve(layerId, id);
  if (!r || r.record.kind !== "journal") throw new Error("That journal page isn't here any more.");
  const f = r.fields;
  const e = entryOf(ws, layerId, r.record);
  let log: PageView["log"] = [];
  if (e.session && ws.get(layerId, e.session)) log = sessionOf(ws, layerId, e.session).log;
  const blocks = blocksOf(f.blocks);
  const text = blocks.map((b) => b.text).join("\n");
  // Things with their own page or sheet whose names appear on this page.
  const named = ws.list(layerId).filter((n) => n.id !== id && !n.template && n.name.length >= 3 && ["being", "lore", "item", "journal", "map", "encounter", "table"].includes(n.kind) && ws.resolve(layerId, n.id)!.fields.beingKind !== "class");
  const links = named.filter((n) => mentions(text, n.name)).map((n) => ({ name: n.name, id: n.id, kind: n.kind }));
  return { ...e, blocks, log, mentionedIn: mentionedIn(ws, layerId, id), links, shared: Array.isArray(f.shared) ? f.shared.map((x) => str(x)) : [], revealed: f.revealed === true };
}

function mentions(text: string, name: string): boolean {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}($|[^\\p{L}\\p{N}])`, "iu").test(text);
}

/** "Mentioned in: Session 3, Session 7": journal pages whose words name this thing. */
export function mentionedIn(ws: Workspace, layerId: Id, id: Id): { id: Id; name: string }[] {
  const n = ws.get(layerId, id);
  if (!n || n.name.length < 3) return [];
  return ws
    .list(layerId, "journal")
    .filter((p) => p.id !== id && blocksOf(ws.resolve(layerId, p.id)!.fields.blocks).some((b) => b.type === "text" && mentions(b.text, n.name)))
    .map((p) => ({ id: p.id, name: p.name }));
}

// ---------- Changing pages (inside the caller's step) ----------

export function createPage(ws: Workspace, layerId: Id, name: string, category: string, opts: { owner?: string | null; picture?: Id | null } = {}): Id {
  const blocks: Block[] = opts.picture
    ? [{ id: newId(), type: "image", x: 0, y: 0, w: PAGE_WIDTH, h: 560, text: "", font: "Georgia", size: 16, color: "#2b2620", picture: opts.picture }]
    : [{ id: newId(), type: "text", x: 20, y: 20, w: PAGE_WIDTH - 40, h: 200, text: "", font: "Georgia", size: 16, color: "#2b2620", picture: null }];
  return ws.create(layerId, "journal", name, { fields: { category: category || "Notes", priority: 1, blocks: blocksValue(blocks), session: null, owner: opts.owner ?? null, shared: [], revealed: false } });
}

export function setPage(ws: Workspace, layerId: Id, id: Id, change: { category?: string; priority?: number; shared?: string[]; revealed?: boolean }) {
  if (change.category !== undefined) ws.setField(layerId, id, "category", change.category.trim() || "Notes");
  if (change.priority !== undefined) ws.setField(layerId, id, "priority", Math.max(1, Math.min(999, Math.round(change.priority))));
  if (change.shared !== undefined) ws.setField(layerId, id, "shared", change.shared);
  if (change.revealed !== undefined) ws.setField(layerId, id, "revealed", change.revealed);
}

function current(ws: Workspace, layerId: Id, id: Id): Block[] {
  const r = ws.resolve(layerId, id);
  if (!r || r.record.kind !== "journal") throw new Error("That journal page isn't here any more.");
  return blocksOf(r.fields.blocks);
}

/** + Add: a text box to type into straight away, or a picture. New blocks go under the others. */
export function addBlock(ws: Workspace, layerId: Id, id: Id, type: "text" | "image", picture: Id | null = null, at: { x: number; y: number } | null = null): Id {
  const blocks = current(ws, layerId, id);
  const bottom = blocks.reduce((m, b) => Math.max(m, b.y + b.h), 0);
  const bid = newId();
  blocks.push({ id: bid, type, x: at?.x ?? 20, y: at?.y ?? bottom + 16, w: type === "image" ? 360 : PAGE_WIDTH - 40, h: type === "image" ? 260 : 140, text: "", font: "Georgia", size: 16, color: "#2b2620", picture });
  ws.setField(layerId, id, "blocks", blocksValue(blocks));
  return bid;
}

export function setBlock(ws: Workspace, layerId: Id, id: Id, blockId: Id, change: Partial<Omit<Block, "id" | "type">> | null) {
  let blocks = current(ws, layerId, id);
  if (change === null) blocks = blocks.filter((b) => b.id !== blockId);
  else {
    const b = blocks.find((x) => x.id === blockId);
    if (!b) throw new Error("That block isn't on the page any more.");
    for (const [k, v] of Object.entries(change)) if (v !== undefined) (b as unknown as Record<string, unknown>)[k] = typeof v === "number" ? Math.round(v) : v;
    b.w = Math.max(40, Math.min(PAGE_WIDTH, b.w));
    b.x = Math.max(0, Math.min(PAGE_WIDTH - 40, b.x));
    b.y = Math.max(0, b.y);
  }
  ws.setField(layerId, id, "blocks", blocksValue(blocks));
}

/** After the session: a note becomes a lore page, or an NPC (the improvised innkeeper). */
export function pageToNode(ws: Workspace, layerId: Id, id: Id, kind: "lore" | "npc"): Id {
  const r = ws.resolve(layerId, id)!;
  const text = blocksOf(r.fields.blocks).filter((b) => b.type === "text").map((b) => b.text.trim()).filter(Boolean).join("\n");
  const picture = blocksOf(r.fields.blocks).find((b) => b.type === "image")?.picture ?? r.record.picture;
  if (kind === "lore") return ws.create(layerId, "lore", r.record.name, { text, picture, fields: { loreKind: "page" } });
  const creature = ws.list(layerId, "category").find((c) => c.fields.role === "creature");
  return ws.create(layerId, "being", r.record.name, { text, picture, category: creature ? link(creature.id) : null, fields: { beingKind: "npc", hp: 4, ac: 10, speed: "30 ft.", cr: "0" } });
}

/** The campaign diary: game nights in order, each with the DM's notes and the table's log. */
export function diary(ws: Workspace, layerId: Id, opts: { dmPages: boolean }): { title: string; notes: string[]; log: string[]; pictures: Id[] }[] {
  const pages = ws.list(layerId, "journal").map((n) => ({ n, e: entryOf(ws, layerId, n) }));
  const nights = pages
    .filter((p) => p.e.session && ws.get(layerId, p.e.session))
    .map((p) => ({ ...p, number: sessionOf(ws, layerId, p.e.session!).number }))
    .sort((a, b) => a.number - b.number);
  const out = nights.map((p) => {
    const blocks = blocksOf(ws.resolve(layerId, p.n.id)!.fields.blocks);
    return { title: p.n.name, notes: blocks.filter((b) => b.type === "text").flatMap((b) => b.text.split(/\n+/)).map((t) => t.trim()).filter(Boolean), log: sessionOf(ws, layerId, p.e.session!).log.map((l) => l.text), pictures: blocks.filter((b) => b.type === "image" && b.picture).map((b) => b.picture!) };
  });
  if (opts.dmPages)
    for (const p of pages.filter((x) => !x.e.session && !x.e.owner)) {
      const blocks = blocksOf(ws.resolve(layerId, p.n.id)!.fields.blocks);
      out.push({ title: p.n.name, notes: blocks.filter((b) => b.type === "text").flatMap((b) => b.text.split(/\n+/)).map((t) => t.trim()).filter(Boolean), log: [], pictures: blocks.filter((b) => b.type === "image" && b.picture).map((b) => b.picture!) });
    }
  return out;
}
