// What goes inside a brick window: the brick's real sheet (so it can be edited right there), or a
// short read-only card for things that only have a page of their own in a tab (rules, lore...).

import { api } from "./api.ts";
import { attempt } from "./common.ts";
import { h } from "./dom.ts";
import { beingSheet } from "./being-sheet.ts";
import { itemSheet } from "./item-sheet.ts";
import { brickEditor } from "./library-panel.ts";
import { removeNode } from "./sheets-tab.ts";
import { closeWindow, openWindow } from "./brick-windows.ts";
import type { PlaceCtx } from "./place.ts";

export async function buildWindowContent(id: string, base: PlaceCtx): Promise<{ name: string; el: HTMLElement } | null> {
  const view = await attempt(() => api.node(id));
  if (!view) return null;
  // Inside a window, "open" opens another window, and deleting the brick closes this one.
  const ctx: PlaceCtx = {
    ...base,
    selected: id,
    select: (x) => (x === null ? closeWindow(id, false) : void openWindow(x)),
    open: (x) => openWindow(x),
  };
  const [categories, choices] = await Promise.all([attempt(() => api.categories()), attempt(() => api.choices())]);
  const c = choices ?? { abilities: [], conditions: [], resources: [] };
  let el: HTMLElement;
  if (view.kind === "item") el = await itemSheet(view, categories ?? [], c, ctx);
  else if (view.kind === "being") el = await beingSheet(view, categories ?? [], c, ctx);
  else if (view.kind === "brick") el = brickEditor(view, c, ctx, () => void removeNode(id, ctx));
  else {
    const preview = await attempt(() => api.printPreview(id));
    el = h(
      "div",
      { class: "bw-plain" },
      preview?.stats ? h("div", { class: "stats-line small" }, preview.stats) : null,
      ...(preview?.paragraphs.length ? preview.paragraphs.slice(0, 20).map((t) => h("p", null, t)) : [h("p", null, view.text || "Nothing written yet.")]),
      h("p", { class: "muted small" }, "This one is edited in its own tab. Use Open in middle (top right)."),
    );
  }
  return { name: view.name, el };
}
