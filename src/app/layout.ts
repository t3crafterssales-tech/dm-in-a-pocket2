// How the panels are arranged (version 3). Kept with the app's settings on this computer, not in
// the world file, because it's about the screen, not the world. Panels keep their identity: they
// move, resize, fold up or float, but the codex is always the codex.

export type PanelId = "codex" | "flags" | "ai";
export const PANELS: PanelId[] = ["codex", "flags", "ai"];
export const PANEL_NAMES: Record<PanelId, string> = { codex: "Codex", flags: "Flags", ai: "AI" };

export interface FloatBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  /** How wide the side column (the codex and flags) is, in pixels. */
  sideWidth: number;
  /** The side column folded to a thin strip. */
  sideFolded: boolean;
  /** The flag strip and the AI panel folded to just their headings. */
  flagsFolded: boolean;
  aiFolded: boolean;
  /** Panels pulled out as their own small windows, with where they sit on the screen. */
  floating: Partial<Record<PanelId, FloatBox>>;
}

export const SIDE_MIN = 200;
export const SIDE_MAX = 720;
export const DEFAULT_SIDE = 340;

export function defaultLayout(): Layout {
  return { sideWidth: DEFAULT_SIDE, sideFolded: false, flagsFolded: false, aiFolded: false, floating: {} };
}

/** The built-in arrangements, switched in one click. */
export const BUILT_IN_PRESETS: { name: string; blurb: string; layout: Layout }[] = [
  { name: "Builder", blurb: "A big editing area with the codex on the side. Best for making things.", layout: defaultLayout() },
  { name: "Game night", blurb: "The codex shrinks, flags and AI fold away, so your table has the room.", layout: { sideWidth: 240, sideFolded: false, flagsFolded: true, aiFolded: true, floating: {} } },
  { name: "Writer", blurb: "Everything is tucked away so your writing fills the middle.", layout: { sideWidth: DEFAULT_SIDE, sideFolded: true, flagsFolded: true, aiFolded: true, floating: {} } },
  { name: "Dual monitor", blurb: "Wide codex beside your work, with the flags floating so you can drag them to the other screen.", layout: { sideWidth: 560, sideFolded: false, flagsFolded: false, aiFolded: false, floating: { flags: { x: 80, y: 120, w: 360, h: 300 } } } },
];

const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);

/** Whatever was stored, made safe. A damaged layout never stops the app: it falls back to the default. */
export function cleanLayout(raw: unknown): Layout {
  const d = defaultLayout();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Partial<Layout> & { floating?: Record<string, unknown> };
  const floating: Layout["floating"] = {};
  for (const p of PANELS) {
    const b = r.floating?.[p] as Partial<FloatBox> | undefined;
    if (b && typeof b === "object") floating[p] = { x: num(b.x, -2000, 8000, 60), y: num(b.y, 0, 6000, 90), w: num(b.w, 220, 2000, 340), h: num(b.h, 120, 2000, 300) };
  }
  return { sideWidth: num(r.sideWidth, SIDE_MIN, SIDE_MAX, d.sideWidth), sideFolded: r.sideFolded === true, flagsFolded: r.flagsFolded === true, aiFolded: r.aiFolded === true, floating };
}

export function cleanPresetName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const n = name.replace(/\s+/g, " ").trim().slice(0, 40);
  return n || null;
}

/** All the presets, built in first, then the user's own. */
export function allPresets(own: Record<string, Layout>): { name: string; blurb: string; layout: Layout; own: boolean }[] {
  return [...BUILT_IN_PRESETS.map((p) => ({ ...p, own: false })), ...Object.entries(own).map(([name, layout]) => ({ name, blurb: "Your own arrangement.", layout, own: true }))];
}
