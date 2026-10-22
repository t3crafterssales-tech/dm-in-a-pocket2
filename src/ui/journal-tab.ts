// The Journal tab (version 2): the DM's notebook outside a game night. Pages grouped by category
// on the right (categories in the order the DM wants), the open page in the middle. Exports the
// campaign diary through the same screen as the rulebook.

import type { PageView } from "../app/backend.ts";
import { api } from "./api.ts";
import { attempt } from "./common.ts";
import { notice, openDialog } from "./dialogs.ts";
import { h, svg } from "./dom.ts";
import { ICONS } from "./icons.ts";
import { journalTreePanel, newPage, pageEditor } from "./journal-editor.ts";
import type { JournalHost } from "./journal-editor.ts";
import type { PlaceCtx } from "./place.ts";

export async function journalPanels(ctx: PlaceCtx): Promise<{ list: HTMLElement; editor: HTMLElement }> {
  const [tree, meta] = await Promise.all([attempt(() => api.journalTree()), attempt(() => api.tableMeta())]);
  const host: JournalHost = {
    readOnly: ctx.view.readOnly,
    selected: ctx.selected,
    select: ctx.select,
    refresh: ctx.refresh,
    open: (id) => void ctx.open(id),
    categories: meta?.journalCategories ?? [],
    setCategories: async (c) => {
      await attempt(() => api.setTableMeta({ journalCategories: c }));
    },
  };
  let view: PageView | null = null;
  if (ctx.selected) view = (await attempt(() => api.pageView(ctx.selected!))) ?? null;
  const head = h(
    "div",
    { class: "panel-head" },
    h("span", null, "Journal"),
    h("span", { class: "grow" }),
    ctx.view.readOnly ? null : h("button", { class: "button primary small-button head-button", onClick: () => void newPage(host) }, svg(ICONS.plus), "Add page"),
  );
  const list = h(
    "aside",
    { class: "panel list-panel", "aria-label": "Journal", "data-scroll": "journal-tree" },
    head,
    journalTreePanel(tree ?? [], host, null),
    h(
      "div",
      { class: "pad inline" },
      h("button", { class: "link small", title: "Put the categories in the order you want them", onClick: () => void orderCategories(host, (tree ?? []).map((g) => g.category)) }, "Order categories…"),
      h("button", { class: "link small", title: "The story so far, session by session, as a PDF or Word file", onClick: () => void exportDiary() }, "Campaign diary…"),
    ),
  );
  const editor = view
    ? h("section", { class: "panel editor", "data-scroll": "journal-page" }, h("div", { class: "sheet" }, pageEditor(view, host)))
    : h(
        "section",
        { class: "panel editor" },
        h(
          "div",
          { class: "empty-editor" },
          h("h2", null, "The journal"),
          h("p", { class: "muted" }, "Your notebook: plot threads, NPC voices, things the party owes. Each game night gets its own page by itself, with the table's log underneath your notes. Private: shared files leave it out unless you tick it."),
          ctx.view.readOnly ? null : h("button", { class: "button primary", onClick: () => void newPage(host) }, svg(ICONS.plus), "Add page"),
        ),
      );
  return { list, editor };
}

async function orderCategories(host: JournalHost, names: string[]) {
  const order = [...names];
  const d = openDialog("Order of the categories");
  const draw = () =>
    d.body.replaceChildren(
      h("p", { class: "muted small" }, "The journal reads in this order: Characters first, then Lore, then NPCs, or however you like."),
      h(
        "ol",
        { class: "cat-order" },
        order.map((c, i) =>
          h(
            "li",
            null,
            h("span", { class: "grow" }, c),
            h("button", { class: "icon-button tiny", disabled: i === 0, onClick: () => ([order[i - 1], order[i]] = [order[i]!, order[i - 1]!], draw()) }, "↑"),
            h("button", { class: "icon-button tiny", disabled: i === order.length - 1, onClick: () => ([order[i + 1], order[i]] = [order[i]!, order[i + 1]!], draw()) }, "↓"),
          ),
        ),
      ),
    );
  draw();
  d.footer.replaceChildren(
    h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"),
    h(
      "button",
      {
        class: "button primary",
        onClick: async () => {
          await host.setCategories(order.map((name, i) => ({ name, priority: i + 1 })));
          d.close();
          await host.refresh();
        },
      },
      "Save",
    ),
  );
}

async function exportDiary() {
  const d = openDialog("Campaign diary");
  const dm = h("input", { type: "checkbox" });
  d.body.replaceChildren(h("p", { class: "muted" }, "The story so far, session by session: your notes for each night and what happened at the table."), h("label", { class: "check" }, dm, "Put my own (DM-only) pages in too"));
  const go = (kind: "pdf" | "word") => async () => {
    const req = { type: "diary" as const, diaryDmPages: dm.checked };
    if (kind === "pdf") {
      const r = await window.dm.bookPdf(req);
      if (!r.ok) notice(r.message, "red");
      else if (r.value) notice(`Saved ${String(r.value).split(/[\\/]/).pop()}.`, "green", { label: "Open it", run: () => void window.dm.openPdf(String(r.value)) }, 8000);
    } else {
      const path = await attempt(() => api.bookWord(req));
      if (path) notice(`Saved ${path.split(/[\\/]/).pop()}.`, "green", { label: "Open it", run: () => void window.dm.openPdf(path) }, 8000);
    }
    d.close();
  };
  d.footer.replaceChildren(h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"), h("button", { class: "button plain", onClick: go("word") }, "Save as Word…"), h("button", { class: "button primary", onClick: go("pdf") }, "Save as PDF…"));
}
