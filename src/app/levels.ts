// Class level tables: each feature on a class is gained at a level (Rage at 1, Sneak Attack at 3).
// The level is a value on the class, one per feature (level_<attachment id>), so a subclass
// inherits its parent's levels, can move one for itself, and adds its own features at their levels.

import { F, levelKey } from "../engine/index.ts";
import type { Id, Workspace } from "../engine/index.ts";
import { sentence } from "../engine/index.ts";

export const DEFAULT_MAX_LEVEL = 20;

export interface LevelFeature {
  aid: Id;
  name: string;
  sentence: string;
  /** The parent class it comes from, for a subclass. */
  from: string | null;
}

export interface LevelTable {
  max: number;
  rows: { level: number; features: LevelFeature[] }[];
  /** Features on the class not placed on a level yet. */
  unplaced: LevelFeature[];
}

export function isClass(ws: Workspace, layerId: Id, id: Id): boolean {
  const r = ws.resolve(layerId, id);
  return !!r && r.record.kind === "being" && r.fields[F.beingKind] === "class";
}

export function maxLevel(fields: Record<string, unknown>): number {
  const m = Number(fields[F.maxLevel]);
  return Number.isInteger(m) && m >= 1 && m <= 100 ? m : DEFAULT_MAX_LEVEL;
}

export function levelTable(ws: Workspace, layerId: Id, classId: Id): LevelTable {
  const r = ws.resolve(layerId, classId);
  if (!r) throw new Error("That isn't here any more.");
  const max = maxLevel(r.fields);
  const rows = Array.from({ length: max }, (_, i) => ({ level: i + 1, features: [] as LevelFeature[] }));
  const unplaced: LevelFeature[] = [];
  for (const { attachment: a, from } of r.attachments) {
    const brick = a.brick ? ws.peek(layerId, a.brick.link) : null;
    const f: LevelFeature = { aid: a.aid, name: a.name ?? brick?.name ?? "?", sentence: sentence(ws, layerId, a), from: from ? (ws.peek(layerId, from)?.name ?? null) : null };
    const level = Number(r.fields[levelKey(a.aid)]);
    if (Number.isInteger(level) && level >= 1 && level <= max) rows[level - 1]!.features.push(f);
    else unplaced.push(f);
  }
  return { max, rows, unplaced };
}

function checkLevel(ws: Workspace, layerId: Id, classId: Id, level: number) {
  if (!isClass(ws, layerId, classId)) throw new Error("Only classes have a level table.");
  const max = maxLevel(ws.resolve(layerId, classId)!.fields);
  if (!Number.isInteger(level) || level < 1 || level > max) throw new Error(`Choose a level from 1 to ${max}.`);
}

/** Dropping bricks on a row: they are added to the class at that level, as one step. */
export function attachAtLevel(ws: Workspace, layerId: Id, classId: Id, bricks: Id[], level: number): string {
  checkLevel(ws, layerId, classId, level);
  const names = bricks.map((b) => ws.peek(layerId, b)?.name).filter(Boolean);
  if (names.length !== bricks.length) throw new Error("That isn't in the library any more.");
  const label = `Added ${names.length === 1 ? names[0] : `${names.length} features`} to ${ws.peek(layerId, classId)!.name} at level ${level}`;
  ws.transact(label, () => {
    for (const b of bricks) {
      const aid = ws.attach(layerId, classId, b);
      ws.setField(layerId, classId, levelKey(aid), level);
    }
  });
  return label;
}

/** Moves a feature to another level, or off the table (null). */
export function setFeatureLevel(ws: Workspace, layerId: Id, classId: Id, aid: Id, level: number | null): string {
  if (level !== null) checkLevel(ws, layerId, classId, level);
  const r = ws.resolve(layerId, classId)!;
  const a = r.attachments.find((x) => x.attachment.aid === aid);
  if (!a) throw new Error("That feature isn't on this class.");
  const name = a.attachment.name ?? (a.attachment.brick ? ws.peek(layerId, a.attachment.brick.link)?.name : null) ?? "the feature";
  const label = level === null ? `Took ${name} off the level table` : `Moved ${name} to level ${level}`;
  ws.transact(label, () => ws.setField(layerId, classId, levelKey(aid), level ?? undefined));
  return label;
}
