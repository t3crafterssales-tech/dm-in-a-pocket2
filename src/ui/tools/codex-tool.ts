// The Codex at the table (version 2): drag monsters into initiative, loot onto the party, rules
// into bookmarks. Clicking something opens it over the table instead of leaving it.

import { codexPanel } from "../codex-panel.ts";
import type { PlaceCtx } from "../place.ts";
import type { DeskCtx } from "./registry.ts";

export async function codexTool(ctx: DeskCtx): Promise<HTMLElement> {
  const place: PlaceCtx = { view: ctx.view, selected: null, select: () => {}, refresh: ctx.refresh, go: () => {}, open: async (id) => void (await ctx.peek(id)) };
  return codexPanel(place);
}
