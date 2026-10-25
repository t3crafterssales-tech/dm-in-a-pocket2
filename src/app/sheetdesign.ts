// The sheet designer (version 2.6, Jeff: "groups you drag around, not a full page designer").
// A character's sheet is made of groups (Name, Portrait, Combat, Abilities, Inventory, Trackers,
// Features, Appearance, Notes). A layout is just their order, how wide each is (in twelfths of
// the page), and which lines are ticked to print. The same layout draws the sheet on screen and
// on paper. Plain functions, tested without the window.

import type { Id } from "../engine/index.ts";
import type { CharacterView } from "./characters.ts";

/** The page is twelve columns wide. */
export const GRID = 12;
/** The narrowest a group gets before its text would be squashed. */
export const MIN_SPAN = 3;

export interface SheetLine {
  /** Stable across edits, so a tick keeps meaning the same line: "hp", "ability:<id>", "tracker:<id>". */
  key: string;
  label: string;
  /** What it says now: one entry for a plain line, several for a list. Empty when there is nothing yet. */
  values: string[];
  /** How many lines tall the blank box is when it prints blank for pencil. */
  rows: number;
  /** Things players often keep in pencil, listed first in the panel. */
  pencil: boolean;
  picture?: Id | null;
}

export interface SheetGroup {
  id: string;
  title: string;
  lines: SheetLine[];
}

export interface SheetLayout {
  /** Top to bottom, left to right. */
  groups: { id: string; span: number }[];
  /** Lines the user unticked: they print blank to write in. */
  unticked: string[];
  /** Among the unticked: lines left off the paper completely instead of blank. */
  hidden: string[];
}

const SPANS: Record<string, number> = { name: 9, portrait: 3, combat: 12, abilities: 12, inventory: 6, trackers: 6, features: 12, appearance: 6, notes: 6 };

const line = (key: string, label: string, values: string[], extra: Partial<SheetLine> = {}): SheetLine => ({ key, label, values: values.filter((v) => v !== ""), rows: 1, pencil: false, ...extra });
const num = (n: number | null) => (n === null ? [] : [String(n)]);

/** Every group a character has, with every line it could print (empty lines included, so they can be ticked). */
export function sheetGroups(v: CharacterView): SheetGroup[] {
  const summary = [v.race?.name, v.class ? `${v.class.name} ${v.level}` : `Level ${v.level}`, v.background?.name].filter(Boolean).join(" · ");
  const groups: SheetGroup[] = [
    { id: "name", title: "Name", lines: [line("name", "Character", [v.name]), line("player", "Player", [v.player]), line("summary", "Race, class and level", [summary]), line("xp", "Experience", v.xp ? [String(v.xp)] : [], { pencil: true })] },
    { id: "portrait", title: "Portrait", lines: [line("portrait", "Portrait", [], { picture: v.picture, rows: 6 })] },
    { id: "combat", title: "Combat", lines: [line("hpNow", "Hit points now", num(v.hpNow), { pencil: true }), line("hp", "Most hit points", num(v.hp), { pencil: true }), line("ac", "Armour", num(v.ac), { pencil: true }), line("speed", "Speed", [v.speed])] },
    { id: "abilities", title: "Abilities", lines: v.scores.map((s) => line(`ability:${s.ability}`, s.name, s.score === null ? [] : [`${s.score}${s.bonus === null ? "" : ` (${s.bonus >= 0 ? "+" : ""}${s.bonus})`}`])) },
    { id: "inventory", title: "Inventory", lines: [line("money", "Money", [v.gold], { pencil: true }), line("gear", "Gear", v.gear.map((g) => g.name), { rows: 6, pencil: true })] },
    { id: "trackers", title: "Trackers", lines: v.trackers.map((t) => line(`tracker:${t.id}`, t.name, [`${t.value} of ${t.max}`], { pencil: true })) },
    {
      id: "features",
      title: "Features",
      lines: [
        line("features", "Features", v.features.map((f) => (f.sentence ? `${f.name}: ${f.sentence}` : f.name)), { rows: 8 }),
        line("choices", "Choices", v.choices.filter((c) => c.picked.length).map((c) => `${c.from}, ${c.label}: ${c.options.filter((o) => c.picked.includes(o.id)).map((o) => o.name).join(", ")}`), { rows: 3 }),
      ],
    },
    { id: "appearance", title: "Appearance", lines: [...v.appearance.map((a) => line(`appearance:${a.key}`, a.label, [a.value])), ...extraLines(v, "Appearance")] },
  ];
  // The game's own additions (Scars, Sanity...) join Notes, or make a group of their own by section.
  const sections = [...new Set(v.extras.map((e) => e.section).filter((s) => s !== "Appearance"))];
  if (!sections.includes("Notes")) sections.push("Notes");
  for (const s of sections) groups.push({ id: s === "Notes" ? "notes" : `section:${s}`, title: s, lines: [...extraLines(v, s), ...(s === "Notes" ? [line("notes", "Notes", [], { rows: 6 })] : [])] });
  return groups.filter((g) => g.lines.length);
}

function extraLines(v: CharacterView, section: string): SheetLine[] {
  return v.extras.filter((e) => e.section === section).map((e) => line(`extra:${section}:${e.label}`, e.label, [e.value]));
}

/** The layout everyone starts with: every group, in the usual order, at its usual width. */
export function defaultLayout(groups: SheetGroup[]): SheetLayout {
  return { groups: groups.map((g) => ({ id: g.id, span: SPANS[g.id] ?? 6 })), unticked: [], hidden: [] };
}

const clampSpan = (n: unknown, fallback: number) => Math.min(GRID, Math.max(MIN_SPAN, Math.round(typeof n === "number" && Number.isFinite(n) ? n : fallback)));
const strings = (x: unknown): string[] => (Array.isArray(x) ? [...new Set(x.filter((s): s is string => typeof s === "string"))] : []);

/**
 * Makes any stored layout fit this character: groups it doesn't have are dropped, groups it
 * gained are added at the end, widths are kept between the minimum and the full page.
 */
export function normalizeLayout(raw: unknown, groups: SheetGroup[]): SheetLayout {
  const base = defaultLayout(groups);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const have = new Set(groups.map((g) => g.id));
  const seen = new Set<string>();
  const out: SheetLayout["groups"] = [];
  for (const g of Array.isArray(r.groups) ? r.groups : []) {
    if (!g || typeof g !== "object") continue;
    const id = (g as { id?: unknown }).id;
    if (typeof id !== "string" || !have.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, span: clampSpan((g as { span?: unknown }).span, SPANS[id] ?? 6) });
  }
  for (const g of base.groups) if (!seen.has(g.id)) out.push(g);
  const unticked = strings(r.unticked);
  return { groups: out, unticked, hidden: strings(r.hidden).filter((k) => unticked.includes(k)) };
}

// ---------- Changing a layout (each returns a new one) ----------

export function moveGroup(l: SheetLayout, id: string, toIndex: number): SheetLayout {
  const from = l.groups.findIndex((g) => g.id === id);
  if (from < 0) return l;
  const groups = [...l.groups];
  const [g] = groups.splice(from, 1);
  groups.splice(Math.min(groups.length, Math.max(0, toIndex)), 0, g!);
  return { ...l, groups };
}

export function resizeGroup(l: SheetLayout, id: string, span: number): SheetLayout {
  return { ...l, groups: l.groups.map((g) => (g.id === id ? { ...g, span: clampSpan(span, g.span) } : g)) };
}

/** Tick or untick lines. Ticking a line also brings it back from "hide completely". */
export function tickLines(l: SheetLayout, keys: string[], on: boolean): SheetLayout {
  const unticked = on ? l.unticked.filter((k) => !keys.includes(k)) : [...new Set([...l.unticked, ...keys])];
  return { ...l, unticked, hidden: l.hidden.filter((k) => unticked.includes(k)) };
}

/** For unticked lines: leave them off the paper completely instead of printing a blank box. */
export function hideLines(l: SheetLayout, keys: string[], hide: boolean): SheetLayout {
  const hidden = hide ? [...new Set([...l.hidden, ...keys.filter((k) => l.unticked.includes(k))])] : l.hidden.filter((k) => !keys.includes(k));
  return { ...l, hidden };
}

// ---------- Paper ----------

export interface PaperLine {
  label: string;
  values: string[];
  /** Unticked: the label and an empty box to write in. */
  blank: boolean;
  rows: number;
  picture: Id | null;
}

export interface PaperGroup {
  id: string;
  title: string;
  span: number;
  lines: PaperLine[];
}

export interface PaperSheet {
  title: string;
  /** Groups packed into rows of twelve columns, which is also how the screen flows them. */
  rows: PaperGroup[][];
}

/**
 * What goes on the paper. Ticked lines print what the character has, and nothing when they have
 * nothing (empty fields disappear); unticked lines print blank for pencil, or not at all when
 * hidden. A deliberate untick beats every other rule, so even the name can be left off.
 */
export function paperSheet(v: CharacterView, layout: SheetLayout | null): PaperSheet {
  const groups = sheetGroups(v);
  const l = normalizeLayout(layout, groups);
  const byId = new Map(groups.map((g) => [g.id, g]));
  const out: PaperGroup[] = [];
  for (const { id, span } of l.groups) {
    const g = byId.get(id);
    if (!g) continue;
    const lines: PaperLine[] = [];
    for (const ln of g.lines) {
      const off = l.unticked.includes(ln.key);
      if (off && l.hidden.includes(ln.key)) continue;
      if (off) lines.push({ label: ln.label, values: [], blank: true, rows: ln.rows, picture: null });
      else if (ln.values.length || ln.picture) lines.push({ label: ln.label, values: ln.values, blank: false, rows: ln.rows, picture: ln.picture ?? null });
    }
    if (lines.length) out.push({ id, title: g.title, span, lines });
  }
  const rows: PaperGroup[][] = [];
  let used = GRID;
  for (const g of out) {
    if (used + g.span > GRID) {
      rows.push([]);
      used = 0;
    }
    rows[rows.length - 1]!.push(g);
    used += g.span;
  }
  return { title: v.name, rows };
}
