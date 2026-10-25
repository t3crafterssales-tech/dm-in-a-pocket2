// "What changed since you were last here" (version 3): a plain-language summary at the top of a
// world when it opens, open the first time and a single quiet line afterwards. It can be dismissed.

import { api } from "./api.ts";
import { attempt } from "./common.ts";
import { h } from "./dom.ts";

/** Places whose changelog has already been shown open once this time round. */
const glanced = new Set<string>();

export async function changelogCard(placeId: string, refresh: () => Promise<void>): Promise<HTMLElement | null> {
  const c = await attempt(() => api.changelog());
  if (!c) return null;
  const first = !glanced.has(placeId);
  glanced.add(placeId);
  const dismiss = h("button", { class: "icon-button", title: "Dismiss", "aria-label": "Dismiss what changed", onClick: async () => (await attempt(() => api.dismissChangelog()), glanced.delete(placeId), await refresh()) }, "×");
  return h(
    "details",
    { class: "banner changelog", open: first },
    h("summary", null, h("strong", null, "Since you were last here: "), `${c.total} change${c.total === 1 ? "" : "s"}`, dismiss),
    h("ul", { class: "changelog-lines" }, c.lines.map((l) => h("li", null, `${l}.`)), c.more ? h("li", { class: "muted" }, `…and ${c.more} more.`) : null),
  );
}
