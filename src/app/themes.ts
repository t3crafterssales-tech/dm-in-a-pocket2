// Themes and text size (version 3). A theme is five colours: background, panel, text, accent and
// border. Every other colour in the window is worked out from those five, so a theme can never
// leave something unreadable behind. Themes change the screen only; print, PDF and the rulebook
// always use black text on white.

export interface Theme {
  id: string;
  name: string;
  background: string;
  panel: string;
  text: string;
  accent: string;
  border: string;
}

export const THEMES: Theme[] = [
  { id: "default", name: "Default", background: "#f6f1e7", panel: "#fffdf8", text: "#2b2620", accent: "#8a4b2a", border: "#ddd2bf" },
  { id: "parchment", name: "Parchment", background: "#f1e5c8", panel: "#faf2dc", text: "#3a2d1a", accent: "#9a590b", border: "#d3bf92" },
  { id: "ink", name: "Ink", background: "#ffffff", panel: "#ffffff", text: "#000000", accent: "#000000", border: "#000000" },
  { id: "ember", name: "Ember", background: "#1b1311", panel: "#261a17", text: "#f1e4dc", accent: "#c44a26", border: "#4a312a" },
  { id: "steel", name: "Steel", background: "#12171d", panel: "#1a2129", text: "#e3e9ef", accent: "#6fa3d6", border: "#2f3b48" },
  { id: "verdant", name: "Verdant", background: "#121a14", panel: "#19241c", text: "#e4ecdf", accent: "#7ea46c", border: "#2f4234" },
];

export type TextSize = "small" | "normal" | "large";
export const TEXT_SIZES: { id: TextSize; name: string; zoom: number }[] = [
  { id: "small", name: "Small", zoom: 0.9 },
  { id: "normal", name: "Normal", zoom: 1 },
  { id: "large", name: "Large", zoom: 1.15 },
];

export const themeFor = (id: unknown): Theme => THEMES.find((t) => t.id === id) ?? THEMES[0]!;
export const textSizeFor = (id: unknown): TextSize => (id === "small" || id === "large" ? id : "normal");

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

/** How bright a colour looks, from 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The contrast between two colours, from 1 (none) to 21 (black on white). 4.5 is comfortable to read. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Writing on top of the accent colour: whichever of near-white and near-black reads better. */
export function accentInk(accent: string): string {
  return contrast(accent, "#fffaf3") >= contrast(accent, "#1b1511") ? "#fffaf3" : "#1b1511";
}

export const isDark = (t: Theme) => luminance(t.background) < 0.2;

/** Red, yellow, blue and green keep their meaning on every theme, lightened on the dark ones. */
export function statusColours(t: Theme): { red: string; yellow: string; blue: string; green: string } {
  if (isDark(t)) return { red: "#e57a6d", yellow: "#dcae45", blue: "#74abe4", green: "#68b878" };
  // On a light theme the yellow is darkened only if the panel is too warm for it to be read.
  const yellow = contrast("#b8860b", t.panel) >= 3 ? "#b8860b" : "#94690a";
  return { red: "#b93a2e", yellow, blue: "#2f6fb0", green: "#3c8a4a" };
}

/** The values the window sets on its root element for a theme. */
export function themeVariables(t: Theme): Record<string, string> {
  const s = statusColours(t);
  return { "--paper": t.background, "--card": t.panel, "--ink": t.text, "--accent": t.accent, "--line": t.border, "--accent-ink": accentInk(t.accent), "--red": s.red, "--yellow": s.yellow, "--blue": s.blue, "--green": s.green, "--focus": s.blue };
}
