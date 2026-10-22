// The journal at the table (version 2): tonight's page open by default, the rest a click away.

import type { PageView } from "../../app/backend.ts";
import { api } from "../api.ts";
import { attempt } from "../common.ts";
import { h, svg } from "../dom.ts";
import { ICONS } from "../icons.ts";
import { journalTreePanel, newPage, pageEditor } from "../journal-editor.ts";
import type { JournalHost } from "../journal-editor.ts";
import type { DeskCtx } from "./registry.ts";

let selected: string | null = null;
let showTree = false;

export async function journalTool(ctx: DeskCtx): Promise<HTMLElement> {
  const tree = (await attempt(() => api.journalTree())) ?? [];
  const pages = tree.flatMap((g) => g.pages);
  // Tonight's page first, unless another one was picked.
  if (!selected || !pages.some((p) => p.id === selected)) selected = pages.find((p) => p.session === ctx.data.session?.id)?.id ?? pages[0]?.id ?? null;
  const host: JournalHost = {
    readOnly: ctx.view.readOnly,
    selected,
    select: (id) => ((selected = id), (showTree = false), void ctx.refresh()),
    refresh: ctx.refresh,
    open: (id) => void ctx.peek(id),
    categories: ctx.meta.journalCategories,
    setCategories: (c) => ctx.setMeta({ journalCategories: c }),
  };
  const view: PageView | null = selected ? ((await attempt(() => api.pageView(selected!))) ?? null) : null;
  const head = h(
    "div",
    { class: "inline" },
    h("button", { class: "button plain small-button", onClick: () => ((showTree = !showTree), void ctx.refresh()) }, showTree ? "Back to the page" : `All pages (${pages.length})`),
    ctx.view.readOnly ? null : h("button", { class: "button plain small-button", onClick: () => void newPage(host) }, svg(ICONS.plus), "Page"),
  );
  return h("div", { class: "journal-tool" }, head, showTree || !view ? journalTreePanel(tree, host, null) : pageEditor(view, host, { compact: true }));
}
