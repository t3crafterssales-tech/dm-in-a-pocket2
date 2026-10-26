// Finding commands for the command palette (Ctrl+K): every typed word must be somewhere in the
// command's label or its extra words, and commands that start with the words come first.

export interface Matchable {
  label: string;
  words?: string;
}

export function matchCommands<T extends Matchable>(commands: T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return commands;
  const scored: { c: T; score: number }[] = [];
  for (const c of commands) {
    const label = c.label.toLowerCase();
    const hay = `${label} ${(c.words ?? "").toLowerCase()}`;
    if (!words.every((w) => hay.includes(w))) continue;
    scored.push({ c, score: words.reduce((n, w) => n + (label.startsWith(w) ? 0 : label.includes(w) ? 1 : 2), 0) });
  }
  return scored.sort((a, b) => a.score - b.score).map((x) => x.c);
}
