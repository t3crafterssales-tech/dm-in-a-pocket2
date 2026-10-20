// The Lore tab: lore pages, places, factions and book pages with their headings, and roll tables
// with a Roll button.

import type { LoreSection, NodeView } from "../app/backend.ts";
import { api } from "./api.ts";
import { attempt } from "./common.ts";
import { notice, openDialog } from "./dialogs.ts";
import { h, svg } from "./dom.ts";
import { FieldMaker } from "./fields.ts";
import { offerRestore } from "./flag-panel.ts";
import { ICONS } from "./icons.ts";
import type { PlaceCtx } from "./place.ts";

type Value = NodeView["fields"][string];
const collapsed = new Set<string>();

const TEMPLATES: Record<string, { value: string; label: string }[]> = {
  page: [{ value: "blank", label: "Blank page" }],
  place: [{ value: "place", label: "Place (What it looks like, Who lives there, Dangers, Adventure hooks)" }],
  faction: [{ value: "faction", label: "Faction (History, Structure, Territory, Allies and enemies, What it means to players)" }],
  table: [{ value: "table", label: "Roll table" }],
  bookPage: [
    { value: "howToPlay", label: "How to play (placed before Abilities)" },
    { value: "foreword", label: "Foreword (placed at the start)" },
  ],
};

const BOOKS = [
  ["players", "Player's Handbook"],
  ["monsters", "Monster Manual"],
  ["gm", "GM Guide"],
  ["world", "World Guide"],
  ["everything", "Complete Rulebook"],
];
const CHAPTERS = [
  ["core", "Core rules"],
  ["abilities", "Abilities"],
  ["resources", "Resources"],
  ["conditions", "Conditions"],
  ["skills", "Skills"],
  ["rules", "Rules of play"],
  ["races", "Races"],
  ["classes", "Classes"],
  ["monsters", "Monsters"],
  ["npcs", "Characters of the world"],
  ["items", "Equipment"],
  ["lore", "The world"],
];

export async function lorePanels(ctx: PlaceCtx): Promise<{ list: HTMLElement; editor: HTMLElement }> {
  const sections = (await attempt(() => api.loreList())) ?? [];
  let view: NodeView | null = null;
  if (ctx.selected) {
    try {
      view = await api.node(ctx.selected);
      if (view.kind !== "lore" && view.kind !== "table") view = null;
    } catch {
      view = null;
    }
  }
  const targets = view?.kind === "table" ? ((await attempt(() => api.linkTargets())) ?? []) : [];
  return { list: listPanel(sections, ctx), editor: view ? (view.kind === "table" ? tableEditor(view, targets, ctx) : loreEditor(view, ctx)) : emptyEditor(ctx) };
}

function listPanel(sections: LoreSection[], ctx: PlaceCtx) {
  return h(
    "aside",
    { class: "panel list-panel", "aria-label": "Lore", "data-scroll": "lore-list" },
    h("div", { class: "panel-head" }, "Lore"),
    sections.map((s) => {
      const open = !collapsed.has(s.kind);
      return h(
        "div",
        { class: "section" },
        h(
          "div",
          { class: "section-head" },
          h("button", { class: `section-toggle${open ? " open" : ""}`, "aria-expanded": open ? "true" : "false", onClick: () => (open ? collapsed.add(s.kind) : collapsed.delete(s.kind), void ctx.refresh()) }, svg(ICONS.chevron), h("span", null, s.title), s.entries.length ? h("span", { class: "muted small" }, s.entries.length) : null),
          ctx.view.readOnly ? null : h("button", { class: "icon-button small", title: `New ${s.title.toLowerCase().replace(/s$/, "")}`, "aria-label": `New in ${s.title}`, onClick: () => void createNew(s.kind, ctx) }, svg(ICONS.plus)),
        ),
        open
          ? h(
              "ul",
              { class: "items" },
              s.entries.map((e) => h("li", { class: `item${e.id === ctx.selected ? " selected" : ""}`, tabindex: 0, "data-key": `item-${e.id}`, onClick: () => ctx.select(e.id), onKeydown: (ev: KeyboardEvent) => ev.key === "Enter" && ctx.select(e.id) }, h("span", { class: "item-name" }, e.name), e.fromBelow ? h("span", { class: "from-below", title: "From the system" }, svg(ICONS.layers)) : null)),
              s.entries.length ? null : h("li", { class: "empty muted small" }, "None yet."),
            )
          : null,
      );
    }),
  );
}

async function createNew(kind: string, ctx: PlaceCtx) {
  const d = openDialog("New lore");
  const name = h("input", { class: "text-input", placeholder: kind === "table" ? "For example: Forest encounters" : "For example: The Grey Hands", maxlength: 200 });
  const template = h("select", { class: "text-input" }, (TEMPLATES[kind] ?? TEMPLATES.page!).map((t) => h("option", { value: t.value }, t.label)));
  const ok = h("button", { class: "button primary", disabled: true }, "Create");
  name.addEventListener("input", () => (ok.disabled = !name.value.trim()));
  name.addEventListener("keydown", (e) => e.key === "Enter" && (e.preventDefault(), ok.click()));
  ok.addEventListener("click", async () => {
    if (!name.value.trim()) return;
    d.close();
    if (!(await offerRestore(name.value, kind === "table" ? "table" : "lore", ctx))) return;
    const id = await attempt(() => api.addLore(name.value, template.value));
    if (id) ctx.select(id);
  });
  d.body.append(h("label", { class: "field-label" }, "Name"), name, h("label", { class: "field-label spaced" }, "Start from"), template);
  d.footer.append(h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"), ok);
  name.focus();
}

function emptyEditor(ctx: PlaceCtx) {
  return h("section", { class: "panel editor" }, h("div", { class: "empty-editor" }, h("h2", null, ctx.view.name), h("p", { class: "muted" }, "Lore pages, places and factions, pages that appear only in a rulebook (a foreword, How to play), and roll tables. Press + beside a section to add one.")));
}

function head(view: NodeView, ed: FieldMaker, ctx: PlaceCtx, kindLabel: string) {
  const ro = view.readOnly;
  const nameInput = h("input", { class: "title-input", value: view.name, "data-key": "f-name", "aria-label": "Name", disabled: ro, maxlength: 200 });
  nameInput.addEventListener("change", () => void ed.save(() => api.rename(view.id, nameInput.value)));
  nameInput.addEventListener("keydown", (e) => e.key === "Enter" && nameInput.blur());
  return h(
    "div",
    { class: "editor-head" },
    h(
      "div",
      { class: "title-row" },
      nameInput,
      ed.pencil("name"),
      ro
        ? null
        : h(
            "button",
            {
              class: "icon-button",
              title: "Delete (it goes to the recycle bin)",
              "aria-label": `Delete ${view.name}`,
              onClick: async () => {
                const r = await attempt(() => api.deleteNode(view.id));
                if (r) notice(`${r.label}. It's in the recycle bin.`, "blue", { label: "Undo", run: async () => (await attempt(() => api.undo()), ctx.select(view.id)) });
                ctx.select(null);
              },
            },
            svg(ICONS.trash),
          ),
    ),
    h("div", { class: "chips" }, h("span", { class: "chip" }, kindLabel), view.fromBelow ? h("span", { class: "chip muted" }, svg(ICONS.layers), "From the system") : null),
  );
}

function loreEditor(view: NodeView, ctx: PlaceCtx) {
  const ed = new FieldMaker(view, ctx);
  const ro = view.readOnly;
  const isBookPage = view.fields.bookPage === true;
  const kind = isBookPage ? "Book page" : view.fields.loreKind === "place" ? "Place" : view.fields.loreKind === "faction" ? "Faction" : "Lore page";
  const sections = (view.fields.sections && typeof view.fields.sections === "object" && !Array.isArray(view.fields.sections) ? view.fields.sections : {}) as Record<string, Value>;
  const entries = Object.entries(sections);
  const saveSections = (next: [string, Value][]) => ed.save(() => api.setField(view.id, "sections", Object.fromEntries(next)));

  const parts: HTMLElement[] = [];
  if (isBookPage) {
    const books = Array.isArray(view.fields.books) ? (view.fields.books as Value[]).map(String) : [];
    parts.push(
      ed.row(
        "In these books",
        "books",
        h(
          "div",
          { class: "inline wrap" },
          BOOKS.map(([id, label]) => {
            const box = h("input", { type: "checkbox", checked: books.includes(id!), disabled: ro });
            box.addEventListener("change", () => void ed.save(() => api.setField(view.id, "books", box.checked ? [...books, id!] : books.filter((b) => b !== id))));
            return h("label", { class: "check" }, box, label);
          }),
        ),
      ),
      ed.row("Placed before", "before", ed.select("before", CHAPTERS.map(([value, label]) => ({ value: value!, label: label! })))),
    );
  }
  entries.forEach(([heading, text], i) => {
    const title = h("input", { class: "text-input heading-input", value: heading, "data-key": `sec-h-${i}`, disabled: ro, "aria-label": "Heading" });
    title.addEventListener("change", () => title.value.trim() && title.value.trim() !== heading && !(title.value.trim() in sections) && void saveSections(entries.map(([k, v], j) => (j === i ? [title.value.trim(), v] : [k, v]))));
    const body = h("textarea", { class: "text-input rules-text", rows: 4, "data-key": `sec-t-${i}`, disabled: ro }, typeof text === "string" ? text : "");
    body.addEventListener("change", () => void saveSections(entries.map(([k, v], j) => (j === i ? [k, body.value] : [k, v]))));
    parts.push(
      h(
        "div",
        { class: "field lore-section" },
        h("div", { class: "inline" }, title, ro ? null : h("button", { class: "icon-button small", title: "Remove this heading", "aria-label": `Remove ${heading}`, onClick: () => void saveSections(entries.filter((_, j) => j !== i)) }, svg(ICONS.close))),
        body,
      ),
    );
  });
  if (!ro && !isBookPage)
    parts.push(
      h(
        "button",
        {
          class: "link small",
          onClick: () => {
            let n = "New heading";
            for (let k = 2; n in sections; k++) n = `New heading ${k}`;
            void saveSections([...entries, [n, ""]]);
          },
        },
        "+ Add a heading",
      ),
    );
  const textBox = h("textarea", { class: "text-input rules-text", "data-key": "f-text", rows: isBookPage ? 12 : 5, disabled: ro, placeholder: isBookPage ? "The page's text. Leave a blank line between paragraphs." : "Anything else about it. Everyone who reads the rulebook can read this; there are no secret notes." }, view.text);
  textBox.addEventListener("change", () => void ed.save(() => api.setText(view.id, textBox.value)));
  return h(
    "section",
    { class: "panel editor", "data-scroll": "editor" },
    h(
      "div",
      { class: "editor-inner" },
      head(view, ed, ctx, kind),
      h("div", { class: "fields" }, parts),
      h("div", { class: "field" }, h("div", { class: "field-label" }, isBookPage ? "The page" : "More", ed.pencil("text")), textBox),
      h("div", { class: "used-by" }, h("div", { class: "field-label" }, "Used by"), view.usedBy.length ? h("ul", { class: "link-list" }, view.usedBy.map((u) => h("li", null, h("button", { class: "link", onClick: () => ctx.select(u.id) }, u.name)))) : h("p", { class: "muted small" }, "Nothing links here yet.")),
    ),
  );
}

let lastRoll: { id: string; text: string } | null = null;

function tableEditor(view: NodeView, targets: { id: string; name: string; group: string }[], ctx: PlaceCtx) {
  const ed = new FieldMaker(view, ctx);
  const ro = view.readOnly;
  type Row = { from: number; to: number; text: string; result: { link: string } | null };
  const rows = (Array.isArray(view.fields.rows) ? view.fields.rows : []) as unknown as Row[];
  const save = (next: Row[]) => ed.save(() => api.setField(view.id, "rows", next as unknown as Value));
  const groups = [...new Set(targets.map((t) => t.group))];
  const roll = h(
    "button",
    {
      class: "button primary",
      onClick: async () => {
        const r = await attempt(() => api.rollTable(view.id));
        if (!r) return;
        lastRoll = { id: view.id, text: `Rolled ${r.roll}: ${[r.text, r.result?.name].filter(Boolean).join(" — ") || "no row for that number"}` };
        await ctx.refresh();
      },
    },
    "Roll",
  );
  const table = h(
    "table",
    { class: "compare roll-table" },
    h("thead", null, h("tr", null, h("th", null, "From"), h("th", null, "To"), h("th", null, "Result"), h("th", null, "Links to"), h("th", null, ""))),
    h(
      "tbody",
      null,
      rows.map((r, i) => {
        const num = (key: "from" | "to") => ed.plainNumber(r[key], (n) => save(rows.map((x, j) => (j === i ? { ...x, [key]: n } : x))), `row-${key}-${i}`);
        const text = h("input", { class: "text-input", value: r.text, "data-key": `row-text-${i}`, disabled: ro, placeholder: "What happens" });
        text.addEventListener("change", () => void save(rows.map((x, j) => (j === i ? { ...x, text: text.value } : x))));
        const id = r.result?.link ?? "";
        const missing = !!id && !targets.some((t) => t.id === id);
        const sel = h(
          "select",
          { class: `text-input select${missing ? " broken" : ""}`, disabled: ro, "data-key": `row-link-${i}` },
          h("option", { value: "" }, "Nothing"),
          missing ? h("option", { value: id, selected: true }, `[missing: ${view.missing[id] ?? "removed"}]`) : null,
          groups.map((g) => h("optgroup", { label: g }, targets.filter((t) => t.group === g).map((t) => h("option", { value: t.id, selected: t.id === id }, t.name)))),
        );
        sel.addEventListener("change", () => void save(rows.map((x, j) => (j === i ? { ...x, result: sel.value ? { link: sel.value } : null } : x))));
        return h("tr", null, h("td", null, num("from")), h("td", null, num("to")), h("td", null, text), h("td", null, sel), h("td", null, ro ? null : h("button", { class: "icon-button small", title: "Remove this row", "aria-label": "Remove this row", onClick: () => void save(rows.filter((_, j) => j !== i)) }, svg(ICONS.close))));
      }),
    ),
  );
  const next = rows.length ? Math.max(...rows.map((r) => r.to)) + 1 : 1;
  return h(
    "section",
    { class: "panel editor", "data-scroll": "editor" },
    h(
      "div",
      { class: "editor-inner" },
      head(view, ed, ctx, "Roll table"),
      ed.row("Dice", "die", h("div", { class: "inline" }, ed.text("die", "d6, 2d6, d20 or d100"), roll)),
      lastRoll?.id === view.id ? h("p", { class: "summary" }, lastRoll.text) : null,
      table,
      ro ? null : h("button", { class: "link small", onClick: () => void save([...rows, { from: next, to: next, text: "", result: null }]) }, "+ Add a row"),
      h("div", { class: "field" }, h("div", { class: "field-label" }, "Description", ed.pencil("text")), (() => {
        const t = h("textarea", { class: "text-input rules-text", rows: 3, "data-key": "f-text", disabled: ro, placeholder: "When to roll on it." }, view.text);
        t.addEventListener("change", () => void ed.save(() => api.setText(view.id, t.value)));
        return t;
      })()),
    ),
  );
}
