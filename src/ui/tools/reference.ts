// The rules reference (version 2): the old Table mode's reading view as a tool. Search rules,
// monsters, items and tables, and read them right there, with nothing to change by accident.

import type { TableModeView } from "../../app/tablemode.ts";
import { api } from "../api.ts";
import { attempt } from "../common.ts";
import { h } from "../dom.ts";
import type { DeskCtx } from "./registry.ts";

let data: TableModeView | null = null;
let find = "";
let open: string | null = null;

/** The reading data is built once per visit to the table; Build clears it. */
export function forgetReference() {
  data = null;
}

export async function referenceTool(ctx: DeskCtx): Promise<HTMLElement> {
  if (!data) data = (await attempt(() => api.tableMode())) ?? { tabs: [] };
  const all = data.tabs.flatMap((t) => t.entries.map((e) => ({ ...e, tabTitle: t.title })));
  const box = h("input", { class: "text-input", type: "search", value: find, placeholder: "Find a rule, monster, item…", "aria-label": "Find", "data-key": "ref-find" });
  box.addEventListener("input", () => {
    find = box.value;
    void ctx.refresh();
  });
  const words = find.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hits = words.length ? all.filter((e) => words.every((w) => [e.title, e.stats ?? "", ...e.paragraphs].join(" ").toLowerCase().includes(w))).slice(0, 30) : [];
  const entry = open ? all.find((e) => e.id === open) : null;
  return h(
    "div",
    { class: "reference-tool" },
    box,
    entry
      ? h(
          "div",
          { class: "ref-entry" },
          h("div", { class: "inline" }, h("strong", null, entry.title), h("span", { class: "grow" }), h("button", { class: "link small", onClick: () => void ctx.peek(entry.id) }, "Float it"), h("button", { class: "link small", onClick: () => ((open = null), void ctx.refresh()) }, "Back")),
          entry.stats ? h("div", { class: "stats-line small" }, entry.stats) : null,
          entry.paragraphs.map((p) => h("p", { class: "small" }, p)),
          entry.table ? h("table", { class: "bm-table" }, h("tbody", null, entry.table.rows.map((r) => h("tr", null, h("td", null, r.range), h("td", { class: "small" }, [r.text, r.result?.name].filter(Boolean).join(": ")))))) : null,
        )
      : hits.length
        ? h("ul", { class: "ref-hits" }, hits.map((e) => h("li", null, h("button", { class: "link", onClick: () => ((open = e.id), void ctx.refresh()) }, e.title), h("span", { class: "muted tiny" }, ` ${e.group}`))))
        : h("p", { class: "muted small" }, words.length ? "Nothing matches." : "Search the whole game while you play."),
  );
}
