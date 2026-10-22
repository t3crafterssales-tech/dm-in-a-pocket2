// The print shop (version 2.6, Jeff: "I like printing what's made in the app"): paper pieces for
// the table. Fold-over standees and round tokens sized to each creature, and cards (spells, items,
// monsters, conditions, and initiative tent cards). The pieces are laid out on pages by the book
// page (book-view.ts), so the preview, the PDF and the printer match.

import type { Id } from "../engine/index.ts";

export type PieceKind = "standees" | "tokens" | "cards" | "initiative";

export interface Piece {
  id: Id;
  title: string;
  picture: Id | null;
  /** Squares across on the battle map: Tiny and Small and Medium 1, Large 2, Huge 3, Gargantuan 4. */
  squares: number;
  stats: string | null;
  lines: string[];
  /** What it is, for the card's corner ("Spell", "Monster"). */
  kind: string;
}

export interface PrintShop {
  kind: PieceKind;
  pieces: Piece[];
  /** How big one square is on paper: 1 inch is the usual battle map. */
  inch: number;
}

const SIZES: Record<string, number> = { tiny: 1, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 };

/** A creature's size from its own field, or from its description ("Large Giant, Chaotic Evil"). */
export function squaresFor(sizeField: unknown, words: string[]): number {
  const f = typeof sizeField === "string" ? sizeField.toLowerCase().trim() : "";
  if (SIZES[f]) return SIZES[f]!;
  for (const w of words) {
    const m = /\b(tiny|small|medium|large|huge|gargantuan)\b/i.exec(w);
    if (m) return SIZES[m[1]!.toLowerCase()]!;
  }
  return 1;
}

/** Cards keep to a short text: the first few paragraphs, cut at a sensible length. */
export function cardLines(paragraphs: string[], max = 520): string[] {
  const out: string[] = [];
  let used = 0;
  for (const p of paragraphs) {
    if (used >= max) break;
    const room = max - used;
    out.push(p.length > room ? `${p.slice(0, Math.max(0, room - 1)).replace(/\s+\S*$/, "")}…` : p);
    used += p.length;
  }
  return out;
}
