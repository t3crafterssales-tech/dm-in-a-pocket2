// The starter systems (version 3): generic, original, and nothing trademarked. Each is built from
// the same Quick start questions as a hand-made system, then given its own core-check wording, so
// what you get is ordinary rules you can change. "Bare bones" is the empty one.

import { F } from "../../engine/index.ts";
import type { Id, Workspace } from "../../engine/index.ts";
import { buildQuickStart } from "../quickstart.ts";
import type { QuickStartAnswers } from "../quickstart.ts";

export type LibraryStart = "pool" | "percentile" | "moves" | "chronicles";

interface Starter {
  label: string;
  note: string;
  answers: QuickStartAnswers;
  /** Changes to the core check after Quick start has made it. */
  core?: { die: string; target: string; text: string };
}

export const LIBRARY_STARTS: Record<LibraryStart, Starter> = {
  pool: {
    label: "d6 Pool",
    note: "Roll a handful of d6s and count the 5s and 6s.",
    answers: { check: "pool", abilities: "four", health: "wounds", tone: "gritty", map: "theatre", magic: "none" },
  },
  percentile: {
    label: "Percentile",
    note: "Roll d100 under your skill. Gritty, for horror and old-school games.",
    answers: { check: "percentile", abilities: "classic", health: "hp", tone: "gritty", map: "theatre", magic: "none" },
  },
  moves: {
    label: "2d6 Moves",
    note: "Roll 2d6: 10 or more succeeds, 7 to 9 succeeds with a cost, 6 or less goes wrong.",
    answers: { check: "bands", abilities: "three", health: "wounds", tone: "heroic", map: "theatre", magic: "none" },
    core: { die: "2d6", target: "10", text: "When a character does something risky, roll two six-sided dice and add the ability that fits. On 10 or more, it works the way they hoped. On 7 to 9, it works, but with a cost, a hard choice or a complication. On 6 or less, things go wrong and the GM says how." },
  },
  chronicles: {
    label: "d10 Chronicles",
    note: "Roll a pool of d10s; every 6 or more is a success and every 10 counts double.",
    answers: { check: "pool", abilities: "classic", health: "hp", tone: "gritty", map: "theatre", magic: "none" },
    core: { die: "d10", target: "6", text: "When the outcome is uncertain, gather one ten-sided die for each point in the ability and skill that fit, and roll them all. Each die showing the number to beat (usually 6) or more is a success, and a 10 counts as two. Harder tasks raise the number to beat or ask for more successes. A task with no successes fails." },
  },
};

export const isLibraryStart = (id: string): id is LibraryStart => id in LIBRARY_STARTS;

/** Builds a starter into a new system. Returns nothing; the caller wraps it in its own step. */
export function buildLibraryStart(ws: Workspace, layerId: Id, which: LibraryStart): void {
  const s = LIBRARY_STARTS[which];
  buildQuickStart(ws, layerId, s.answers);
  if (!s.core) return;
  const core = ws.list(layerId).find((n) => n.kind === "rule" && n.name === "The core check");
  if (!core) return;
  ws.transact("Starter wording", () => {
    ws.setField(layerId, core.id, F.die, s.core!.die);
    ws.setField(layerId, core.id, F.target, s.core!.target);
    ws.edit(layerId, core.id, (r) => void (r.text = s.core!.text));
  });
}
