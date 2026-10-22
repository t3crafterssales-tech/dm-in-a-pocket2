// Players at the DM's table (version 2.5): the door, who has joined (green dots), their PINs and
// the permissions grid, without leaving the table.

import { playersSection } from "../players-panel.ts";
import type { DeskCtx } from "./registry.ts";

export async function playersTool(ctx: DeskCtx): Promise<HTMLElement> {
  return playersSection({ readOnly: ctx.view.readOnly, refresh: ctx.refresh, roster: ctx.data.roster, compact: true });
}
