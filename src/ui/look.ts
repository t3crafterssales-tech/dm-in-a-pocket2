// Puts a theme and a text size on the window (version 3). Screen only: the book page, print and
// PDF never read these, so paper is always black on white.

import { TEXT_SIZES, textSizeFor, themeFor, themeVariables, isDark } from "../app/themes.ts";

export function applyLook(themeId: string, textSize: string) {
  const t = themeFor(themeId);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(themeVariables(t))) root.style.setProperty(k, v);
  root.style.setProperty("color-scheme", isDark(t) ? "dark" : "light");
  root.dataset.theme = t.id;
  // One scaling step for the whole window, so every screen changes together.
  root.style.setProperty("zoom", String(TEXT_SIZES.find((s) => s.id === textSizeFor(textSize))!.zoom));
}
