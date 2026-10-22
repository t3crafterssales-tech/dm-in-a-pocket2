// Bookmarks (version 2): like the inside of a DM screen. Drag anything in from the Codex (a rule,
// a monster, a map, a journal page). Group them under headings, reorder them, click to open one
// over the table, hover to read it at a glance. A whole Codex section can be a little table, such
// as every potion with its price.

import type { Bookmark } from "../../app/backend.ts";
import { CODEX_SECTIONS } from "../../app/codex-lists.ts";
import { api } from "../api.ts";
import { attempt } from "../common.ts";
import { openDialog } from "../dialogs.ts";
import { h } from "../dom.ts";
import { DRAG_TYPE } from "../library-panel.ts";
import { NODE_DRAG } from "../codex-panel.ts";
import { askText } from "../pickers.ts";
import type { DeskCtx } from "./registry.ts";

export async function bookmarksTool(ctx: DeskCtx): Promise<HTMLElement> {
  const marks = ctx.meta.bookmarks;
  const groups = [...new Set(marks.map((m) => m.group || "Bookmarks"))];
  const save = (next: Bookmark[]) => ctx.setMeta({ bookmarks: next });
  const move = (id: string, by: number) => {
    const i = marks.findIndex((m) => m.id === id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= marks.length) return;
    const next = [...marks];
    [next[i], next[j]] = [next[j]!, next[i]!];
    void save(next);
  };
  const codex = marks.some((m) => m.section) ? ((await attempt(() => api.codex())) ?? []) : [];
  const body = h(
    "div",
    { class: "bookmarks-tool" },
    marks.length
      ? groups.map((g) =>
          h(
            "div",
            { class: "bm-group" },
            h("div", { class: "field-label" }, g),
            h(
              "ul",
              { class: "bm-list" },
              marks
                .filter((m) => (m.group || "Bookmarks") === g)
                .map((m) => {
                  const sec = m.section ? codex.find((s) => s.key === m.section) : null;
                  return h(
                    "li",
                    null,
                    m.node ? h("button", { class: "link", onClick: () => void ctx.peek(m.node!), title: "Open it over the table" }, m.label) : h("details", null, h("summary", null, m.label), sec ? h("table", { class: "bm-table" }, h("tbody", null, sec.entries.slice(0, 80).map((e) => h("tr", null, h("td", null, h("button", { class: "link small", onClick: () => void ctx.peek(e.id) }, e.name)), h("td", { class: "muted small" }, e.sub))))) : h("span", { class: "muted small" }, "That section is empty.")),
                    h("span", { class: "grow" }),
                    h("button", { class: "icon-button tiny", title: "Up", onClick: () => move(m.id, -1) }, "↑"),
                    h("button", { class: "icon-button tiny", title: "Down", onClick: () => move(m.id, 1) }, "↓"),
                    h("button", { class: "icon-button tiny", title: "Move to another heading", onClick: async () => {
                      const name = await askText("Put it under which heading?", m.group || "Bookmarks", "Heading");
                      if (name !== null) void save(marks.map((x) => (x.id === m.id ? { ...x, group: name.trim() || "Bookmarks" } : x)));
                    } }, "⇄"),
                    h("button", { class: "icon-button tiny", title: "Remove the bookmark", onClick: () => void save(marks.filter((x) => x.id !== m.id)) }, "×"),
                  );
                }),
            ),
          ),
        )
      : h("p", { class: "muted small" }, "Drag rules, monsters, maps or journal pages here from the Codex, like tabs in a Player's Handbook."),
    h("button", { class: "link small", onClick: () => void addSection(ctx) }, "+ A Codex section as a little table"),
  );
  body.addEventListener("dragover", (e) => {
    const types = e.dataTransfer?.types ?? [];
    if (!(types.includes(NODE_DRAG) || types.includes(DRAG_TYPE))) return;
    e.preventDefault();
    body.classList.add("drop-over");
  });
  body.addEventListener("dragleave", (e) => !body.contains(e.relatedTarget as Node) && body.classList.remove("drop-over"));
  body.addEventListener("drop", (e) => {
    body.classList.remove("drop-over");
    const ids = (JSON.parse(e.dataTransfer?.getData(NODE_DRAG) || "{}") as { ids?: string[] }).ids ?? (JSON.parse(e.dataTransfer?.getData(DRAG_TYPE) || "[]") as string[]);
    if (!ids.length) return;
    e.preventDefault();
    void (async () => {
      const add: Bookmark[] = [];
      for (const id of ids) {
        if (marks.some((m) => m.node === id)) continue;
        const n = await attempt(() => api.node(id));
        if (n) add.push({ id: `${Date.now()}-${id}`, node: id, section: null, label: n.name, group: "Bookmarks" });
      }
      await save([...marks, ...add]);
    })();
  });
  return body;
}

async function addSection(ctx: DeskCtx) {
  const d = openDialog("Bookmark a Codex section");
  const pick = h("select", { class: "text-input select", "aria-label": "Section" }, CODEX_SECTIONS.map((s) => h("option", { value: s.key }, s.title)));
  d.body.replaceChildren(h("p", { class: "muted small" }, "The whole section becomes a little table in your bookmarks, such as every piece of gear with its price."), pick);
  d.footer.replaceChildren(
    h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"),
    h("button", { class: "button primary", onClick: () => (d.close(), void ctx.setMeta({ bookmarks: [...ctx.meta.bookmarks, { id: `${Date.now()}`, node: null, section: pick.value, label: CODEX_SECTIONS.find((s) => s.key === pick.value)!.title, group: "Bookmarks" }] })) }, "Add"),
  );
}
