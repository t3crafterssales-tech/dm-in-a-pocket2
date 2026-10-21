// Maps (version 2): a picture brought in, drawing on top, and pins that link to anything (a
// place, a monster, an encounter, another map). Maps inside maps come from pins that link to
// maps. Plain functions on the engine, inside the caller's step unless they say otherwise.

import { F, isLink, link, newId } from "../engine/index.ts";
import type { Id, NodeRecord, Value, Workspace } from "../engine/index.ts";
import { encounterNumbers } from "./encounters.ts";

export const PIN_COLOURS = ["#1f1b16", "#b93a2e", "#2f6fb0", "#3c8a4a", "#b8860b", "#7b3fa0"];
export const PIN_SYMBOLS = ["house", "dragon", "sword", "scroll", "map", "person", "flag", "star", "skull", "chest", "tree", "door"] as const;
export type PinSymbol = (typeof PIN_SYMBOLS)[number];
export const STAMPS = ["door", "stairs", "tree", "table", "building", "mountain", "chest", "pillar"] as const;
export const TEXTURES = ["grass", "water", "stone", "wood", "sand", "lava"] as const;

export interface Grid {
  kind: "none" | "square" | "hex";
  size: number;
  scale: string;
  show: boolean;
}

export interface Pin {
  id: Id;
  x: number;
  y: number;
  link: { link: Id } | null;
  label: string;
  color: string;
  symbol: string;
}

export interface Shape {
  id: Id;
  layer: "drawing" | "labels" | "dm";
  tool: "room" | "line" | "brush" | "fill" | "stamp" | "text";
  points: number[];
  color: string;
  width: number;
  fill: string | null;
  texture: string | null;
  stamp: string | null;
  text: string | null;
  size: number;
}

export interface PinView extends Pin {
  /** What it links to, for the label, the symbol and clicking. */
  target: { id: Id; name: string; kind: string; isMap: boolean; number: string | null } | null;
  /** The link points at something deleted (a red flag). */
  missing: boolean;
}

export interface MapView {
  id: Id;
  name: string;
  text: string;
  picture: Id | null;
  width: number;
  height: number;
  background: string;
  grid: Grid;
  pins: PinView[];
  shapes: Shape[];
  /** Maps that have a pin to this one (its "parents" in the tree). */
  inside: { id: Id; name: string }[];
  readOnly?: boolean;
}

const num = (v: Value | undefined, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: Value | undefined, d = "") => (typeof v === "string" ? v : d);

export function gridOf(v: Value | undefined): Grid {
  const o = v && typeof v === "object" && !Array.isArray(v) && !isLink(v) ? (v as Record<string, Value>) : {};
  const kind = o.kind === "square" || o.kind === "hex" ? o.kind : "none";
  return { kind, size: Math.max(5, num(o.size, 50)), scale: str(o.scale, "5 feet"), show: o.show !== false };
}

function objects(v: Value | undefined): Record<string, Value>[] {
  return (Array.isArray(v) ? v : []).filter((x): x is Record<string, Value> => !!x && typeof x === "object" && !Array.isArray(x) && !isLink(x)) as Record<string, Value>[];
}

export function pinsOf(v: Value | undefined): Pin[] {
  return objects(v).map((o) => ({ id: str(o.id) || newId(), x: num(o.x, 0), y: num(o.y, 0), link: isLink(o.link) ? { link: o.link.link } : null, label: str(o.label), color: str(o.color, PIN_COLOURS[0]), symbol: str(o.symbol, "star") }));
}

export function shapesOf(v: Value | undefined): Shape[] {
  return objects(v).map((o) => ({
    id: str(o.id) || newId(),
    layer: o.layer === "labels" || o.layer === "dm" ? o.layer : "drawing",
    tool: (["room", "line", "brush", "fill", "stamp", "text"] as const).find((t) => t === o.tool) ?? "line",
    points: Array.isArray(o.points) ? o.points.map((p) => (typeof p === "number" ? p : 0)) : [],
    color: str(o.color, "#1f1b16"),
    width: num(o.width, 3),
    fill: typeof o.fill === "string" ? o.fill : null,
    texture: typeof o.texture === "string" ? o.texture : null,
    stamp: typeof o.stamp === "string" ? o.stamp : null,
    text: typeof o.text === "string" ? o.text : null,
    size: num(o.size, 24),
  }));
}

const asValue = (x: unknown): Value => JSON.parse(JSON.stringify(x)) as Value;

/** The symbol a pin starts with, from what it links to. */
export function symbolFor(ws: Workspace, layerId: Id, target: NodeRecord | null): PinSymbol {
  if (!target) return "star";
  const f = ws.resolve(layerId, target.id)?.fields ?? {};
  switch (target.kind) {
    case "map":
      return "map";
    case "encounter":
      return "flag";
    case "item":
      return "sword";
    case "being":
      return f[F.beingKind] === "monster" ? "dragon" : "person";
    case "lore": {
      const t = str(f.template);
      return t === "place" ? "house" : "scroll";
    }
    case "table":
    case "rule":
      return "scroll";
    default:
      return "star";
  }
}

/** A new map, from a picture or blank. Inside the caller's step. */
export function createMap(ws: Workspace, layerId: Id, name: string, opts: { picture?: Id | null; width?: number; height?: number } = {}): Id {
  return ws.create(layerId, "map", name, {
    picture: opts.picture ?? null,
    fields: { width: Math.max(100, Math.round(opts.width ?? 1600)), height: Math.max(100, Math.round(opts.height ?? 1000)), background: "#efe6d2", grid: { kind: "none", size: 50, scale: "5 feet", show: true }, pins: [], shapes: [] },
  });
}

export function mapView(ws: Workspace, layerId: Id, id: Id): MapView {
  const r = ws.resolve(layerId, id);
  if (!r || r.record.kind !== "map") throw new Error("That map isn't here any more.");
  const f = r.fields;
  const numbers = ws.layer(layerId).type === "module" ? encounterNumbers(ws, layerId) : new Map<Id, string>();
  const pins: PinView[] = pinsOf(f.pins).map((p) => {
    if (!p.link) return { ...p, target: null, missing: false };
    const t = ws.get(layerId, p.link.link);
    if (!t) return { ...p, target: null, missing: true };
    return { ...p, target: { id: t.id, name: t.name, kind: t.kind, isMap: t.kind === "map", number: numbers.get(t.id) ?? null }, missing: false };
  });
  const inside = ws
    .list(layerId, "map")
    .filter((m) => m.id !== id && pinsOf(ws.resolve(layerId, m.id)!.fields.pins).some((p) => p.link?.link === id))
    .map((m) => ({ id: m.id, name: m.name }));
  return { id, name: r.record.name, text: r.record.text, picture: r.record.picture, width: num(f.width, 1600), height: num(f.height, 1000), background: str(f.background, "#efe6d2"), grid: gridOf(f.grid), pins, shapes: shapesOf(f.shapes), inside };
}

export interface MapTreeNode {
  id: Id;
  name: string;
  children: MapTreeNode[];
}

/** Maps inside maps, like File Explorer: a map pinned on another sits under it. */
export function mapTree(ws: Workspace, layerId: Id): MapTreeNode[] {
  const maps = ws.list(layerId, "map").filter((m) => !m.template);
  const ids = new Set(maps.map((m) => m.id));
  const kids = new Map<Id, Id[]>();
  const hasParent = new Set<Id>();
  for (const m of maps) {
    const c = pinsOf(ws.resolve(layerId, m.id)!.fields.pins)
      .map((p) => p.link?.link)
      .filter((x): x is Id => !!x && ids.has(x) && x !== m.id);
    kids.set(m.id, [...new Set(c)]);
    c.forEach((x) => hasParent.add(x));
  }
  const byId = new Map(maps.map((m) => [m.id, m]));
  const build = (id: Id, seen: Set<Id>): MapTreeNode => ({
    id,
    name: byId.get(id)!.name,
    children: (kids.get(id) ?? []).filter((c) => !seen.has(c)).sort((a, b) => byId.get(a)!.name.localeCompare(byId.get(b)!.name)).map((c) => build(c, new Set([...seen, c]))),
  });
  // Top level: maps nobody pins. Maps only reachable in a loop also show at the top, never lost.
  let tops = maps.filter((m) => !hasParent.has(m.id));
  const reached = new Set<Id>();
  const walk = (n: MapTreeNode) => (reached.add(n.id), n.children.forEach(walk));
  const out = tops.map((m) => build(m.id, new Set([m.id])));
  out.forEach(walk);
  tops = maps.filter((m) => !reached.has(m.id));
  for (const m of tops) {
    if (reached.has(m.id)) continue;
    const n = build(m.id, new Set([m.id]));
    walk(n);
    out.push(n);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// ---------- Pins ----------

function savePins(ws: Workspace, layerId: Id, mapId: Id, pins: Pin[]) {
  ws.setField(layerId, mapId, "pins", asValue(pins));
}

function currentPins(ws: Workspace, layerId: Id, mapId: Id): Pin[] {
  const r = ws.resolve(layerId, mapId);
  if (!r || r.record.kind !== "map") throw new Error("That map isn't here any more.");
  return pinsOf(r.fields.pins);
}

/** Things dropped from the Codex onto the map: a pin for each, starting black with its symbol. */
export function addPins(ws: Workspace, layerId: Id, mapId: Id, targets: (Id | null)[], x: number, y: number, look: { color?: string; symbol?: string; label?: string } = {}): Id[] {
  const pins = currentPins(ws, layerId, mapId);
  const out: Id[] = [];
  targets.forEach((t, i) => {
    const node = t ? ws.get(layerId, t) : null;
    if (t && !node) throw new Error("That isn't here any more.");
    const id = newId();
    pins.push({ id, x: x + i * 30, y: y + i * 30, link: t ? { link: t } : null, label: look.label ?? "", color: look.color ?? PIN_COLOURS[0]!, symbol: look.symbol ?? symbolFor(ws, layerId, node) });
    out.push(id);
  });
  savePins(ws, layerId, mapId, pins);
  return out;
}

export function movePins(ws: Workspace, layerId: Id, mapId: Id, moves: { id: Id; x: number; y: number }[]) {
  const pins = currentPins(ws, layerId, mapId);
  for (const m of moves) {
    const p = pins.find((x) => x.id === m.id);
    if (p) ((p.x = Math.round(m.x)), (p.y = Math.round(m.y)));
  }
  savePins(ws, layerId, mapId, pins);
}

/** Changes name, colour or symbol of one or many pins together; `link` relinks (null unlinks). */
export function editPins(ws: Workspace, layerId: Id, mapId: Id, ids: Id[], change: { label?: string; color?: string; symbol?: string; link?: Id | null }) {
  const pins = currentPins(ws, layerId, mapId);
  for (const p of pins.filter((x) => ids.includes(x.id))) {
    if (change.label !== undefined) p.label = change.label.trim();
    if (change.color !== undefined) p.color = change.color;
    if (change.symbol !== undefined) p.symbol = change.symbol;
    if (change.link !== undefined) {
      if (change.link && !ws.get(layerId, change.link)) throw new Error("That isn't here any more.");
      p.link = change.link ? { link: change.link } : null;
    }
  }
  savePins(ws, layerId, mapId, pins);
}

export function deletePins(ws: Workspace, layerId: Id, mapId: Id, ids: Id[]) {
  savePins(ws, layerId, mapId, currentPins(ws, layerId, mapId).filter((p) => !ids.includes(p.id)));
}

/**
 * Copies pins, the Blender way: connected (Ctrl+D) keeps the same look and the same link;
 * separate (Ctrl+Shift+D) keeps the look but has no link, a symbol just for looks.
 */
export function copyPins(ws: Workspace, layerId: Id, mapId: Id, ids: Id[], connected: boolean): Id[] {
  const pins = currentPins(ws, layerId, mapId);
  const out: Id[] = [];
  for (const p of pins.filter((x) => ids.includes(x.id))) {
    const id = newId();
    pins.push({ ...p, id, x: p.x + 30, y: p.y + 30, link: connected ? p.link : null });
    out.push(id);
  }
  savePins(ws, layerId, mapId, pins);
  return out;
}

// ---------- Drawing ----------

function currentShapes(ws: Workspace, layerId: Id, mapId: Id): Shape[] {
  const r = ws.resolve(layerId, mapId);
  if (!r || r.record.kind !== "map") throw new Error("That map isn't here any more.");
  return shapesOf(r.fields.shapes);
}

export function addShape(ws: Workspace, layerId: Id, mapId: Id, s: Omit<Shape, "id">): Id {
  const shapes = currentShapes(ws, layerId, mapId);
  const id = newId();
  // Points rounded to whole units keep the file small.
  shapes.push({ ...s, id, points: s.points.map((p) => Math.round(p)) });
  ws.setField(layerId, mapId, "shapes", asValue(shapes));
  return id;
}

export function deleteShapes(ws: Workspace, layerId: Id, mapId: Id, ids: Id[]) {
  ws.setField(layerId, mapId, "shapes", asValue(currentShapes(ws, layerId, mapId).filter((s) => !ids.includes(s.id))));
}

/** Fill: colours or textures a room or a closed shape. */
export function fillShape(ws: Workspace, layerId: Id, mapId: Id, id: Id, fill: string | null, texture: string | null) {
  const shapes = currentShapes(ws, layerId, mapId);
  const s = shapes.find((x) => x.id === id);
  if (!s) throw new Error("That drawing isn't there any more.");
  s.fill = fill;
  s.texture = texture;
  ws.setField(layerId, mapId, "shapes", asValue(shapes));
}

/** Map settings: size, background, grid. */
export function setMapSettings(ws: Workspace, layerId: Id, mapId: Id, change: { width?: number; height?: number; background?: string; grid?: Partial<Grid> }) {
  const r = ws.resolve(layerId, mapId)!;
  if (change.width !== undefined) ws.setField(layerId, mapId, "width", Math.max(100, Math.round(change.width)));
  if (change.height !== undefined) ws.setField(layerId, mapId, "height", Math.max(100, Math.round(change.height)));
  if (change.background !== undefined) ws.setField(layerId, mapId, "background", change.background);
  if (change.grid) ws.setField(layerId, mapId, "grid", asValue({ ...gridOf(r.fields.grid), ...change.grid }));
}

/** Distance between two points in the grid's own words: "35 feet" (counting squares, 5 feet each). */
export function measure(grid: Grid, a: { x: number; y: number }, b: { x: number; y: number }): string {
  const units = Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, grid.size);
  const m = /^\s*([\d.]+)\s*(.*)$/.exec(grid.scale);
  const per = m ? Number(m[1]) : 1;
  const word = m ? m[2]!.trim() || "squares" : grid.scale || "squares";
  const total = Math.round(units * per * 10) / 10;
  return `${total} ${word}`;
}

/** Every map that pins this thing ("On the map: Greyhollow town"). */
export function mapsShowing(ws: Workspace, layerId: Id, id: Id): { id: Id; name: string }[] {
  return ws
    .list(layerId, "map")
    .filter((m) => pinsOf(ws.resolve(layerId, m.id)!.fields.pins).some((p) => p.link?.link === id))
    .map((m) => ({ id: m.id, name: m.name }));
}
