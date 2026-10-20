// Red flags: links that point at nothing. Found from links alone, so they need no AI and are
// always complete. Grouped by cause: one flag per missing thing, listing everything it broke.

import type { Id, Slot } from "./types.ts";
import type { Workspace } from "./workspace.ts";

export interface RedFlag {
  key: string;
  color: "red";
  /** What is missing. */
  missing: Id;
  /** Its name, from the recycle bin if it is there. */
  missingName: string;
  /** True if it is in the recycle bin and can be restored. */
  inBin: boolean;
  /** Every link that points at it, from this layer's point of view. */
  slots: Slot[];
  title: string;
}

export function redFlags(ws: Workspace, layerId: Id): RedFlag[] {
  const groups = new Map<Id, Slot[]>();
  for (const s of ws.links(layerId)) {
    if (ws.exists(layerId, s.to)) continue;
    const { to, ...slot } = s;
    const list = groups.get(to) ?? [];
    list.push(slot);
    groups.set(to, list);
  }
  return [...groups.entries()].map(([missing, slots]) => {
    const entry = ws.binEntryFor(missing);
    const name = entry?.node.name ?? "Something";
    const things = new Set(slots.map((s) => s.node)).size;
    return {
      key: `missing:${missing}`,
      color: "red",
      missing,
      missingName: name,
      inBin: !!entry,
      slots,
      title: `${name} removed: ${things} thing${things === 1 ? "" : "s"} affected`,
    };
  });
}
