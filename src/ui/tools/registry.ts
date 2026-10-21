// The tools on the DM's table. Each is its own little program: it draws itself from the table's
// data, and may have a gear with its own settings. Mods can add tools later.

import type { PlaceView, TableMeta, TableView } from "../../app/backend.ts";
import { bookmarksTool } from "./bookmarks.ts";
import { clockTool, clockGear } from "./clock.ts";
import { diceTool, diceGear } from "./dice.ts";
import { encounterTool } from "./encounter.ts";
import { initiativeTool, initiativeGear } from "./initiative.ts";
import { journalTool } from "./journal-tool.ts";
import { logTool, logGear } from "./log.ts";
import { mapTool } from "./map-tool.ts";
import { partyTool } from "./party-tool.ts";
import { referenceTool } from "./reference.ts";
import { tablesTool } from "./tables-tool.ts";

export interface DeskCtx {
  view: PlaceView;
  data: TableView;
  meta: TableMeta;
  refresh: () => Promise<void>;
  settings: (tool: string) => Record<string, unknown>;
  setSettings: (tool: string, patch: Record<string, unknown>) => Promise<void>;
  setMeta: (patch: Partial<Omit<TableMeta, "chat">>) => Promise<void>;
  /** Back to building. */
  leave: () => void;
  /** Opens a thing as a floating card over the table. */
  peek: (id: string) => Promise<void>;
}

export interface Tool {
  render: (ctx: DeskCtx) => Promise<HTMLElement>;
  gear?: (ctx: DeskCtx) => Promise<void>;
}

export const TOOLS: Record<string, Tool> = {
  encounter: { render: encounterTool },
  initiative: { render: initiativeTool, gear: initiativeGear },
  dice: { render: diceTool, gear: diceGear },
  clock: { render: clockTool, gear: clockGear },
  tables: { render: tablesTool },
  journal: { render: journalTool },
  bookmarks: { render: bookmarksTool },
  party: { render: partyTool },
  map: { render: mapTool },
  log: { render: logTool, gear: logGear },
  reference: { render: referenceTool },
};
