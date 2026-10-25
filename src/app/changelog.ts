// The world changelog (version 3): a plain-language summary of what changed since the last time
// the world was open, worked out from its history. "Changed Goblin ×4. Wrote the mill encounter."

export interface ChangeStep {
  label: string;
  time: number;
}

export interface Changelog {
  /** One plain line each, newest change first, repeats folded together ("Changed Goblin ×4"). */
  lines: string[];
  /** How many more lines there would have been. */
  more: number;
  /** How many steps in all. */
  total: number;
}

const SHOWN = 8;

/** Steps after `since`, folded into at most a handful of plain lines. Null when nothing changed. */
export function summarize(steps: ChangeStep[], since: number | null): Changelog | null {
  if (since === null) return null;
  const fresh = steps.filter((s) => s.time > since).sort((a, b) => b.time - a.time);
  if (!fresh.length) return null;
  const counts = new Map<string, number>();
  for (const s of fresh) {
    const label = s.label.trim().replace(/\.$/, "");
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const all = [...counts].map(([label, n]) => (n > 1 ? `${label} ×${n}` : label));
  return { lines: all.slice(0, SHOWN), more: Math.max(0, all.length - SHOWN), total: fresh.length };
}
