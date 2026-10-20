// The Beings and Items tabs: a list on the left (variants indented under their parents) and the
// open sheet in the middle, with its header numbers, ability scores and sections.

import type { AttachmentView, BeingKind, CategoryOption, Choices, ListEntry, NodeView } from "../app/backend.ts";
import { api, pictureUrl } from "./api.ts";
import { attempt } from "./common.ts";
import { notice, openDialog } from "./dialogs.ts";
import { h, svg } from "./dom.ts";
import { FieldMaker } from "./fields.ts";
import { ICONS } from "./icons.ts";
import { openDrill } from "./drill-dialog.ts";
import { openEditParent } from "./edit-parent.ts";
import { DRAG_TYPE, brickEditor, drop, libraryPanel } from "./library-panel.ts";
import { offerRestore } from "./flag-panel.ts";
import type { PlaceCtx } from "./place.ts";

export const BEING_TABS: { id: BeingKind; label: string; plural: string }[] = [
  { id: "character", label: "Character", plural: "Characters" },
  { id: "class", label: "Class", plural: "Classes" },
  { id: "race", label: "Race", plural: "Races" },
  { id: "monster", label: "Monster", plural: "Monsters" },
  { id: "npc", label: "NPC", plural: "NPCs" },
];

let beingTab: BeingKind = "monster";
const filters: Record<string, { text: string; favourites: boolean }> = {};
/** The left panel shows the tab's list or the library. */
const leftMode: Record<string, "list" | "library"> = {};
/** Sheets selected in each list with Ctrl-click and Shift-click; dropping adds to all of them. */
const listSelection = new Map<string, Set<string>>();
const listAnchor = new Map<string, string>();

let sortBy: "name" | "challenge" = "name";

const listKey = (which: "beings" | "items") => (which === "beings" ? `beings-${beingTab}` : "items");

export async function sheetPanels(ctx: PlaceCtx, which: "beings" | "items"): Promise<{ list: HTMLElement; editor: HTMLElement }> {
  const [entries, categories, choices] = await Promise.all([
    attempt(() => (which === "beings" ? api.beingsList(beingTab, beingTab === "monster" || beingTab === "npc" ? sortBy : "name") : api.itemsList())),
    attempt(() => api.categories()),
    attempt(() => api.choices()),
  ]);
  let view: NodeView | null = null;
  if (ctx.selected) {
    try {
      view = await api.node(ctx.selected);
      if (view.kind !== (which === "beings" ? "being" : "item") && view.kind !== "brick") view = null;
    } catch {
      view = null;
    }
  }
  // Opening a being from another sub-tab (for example from a flag) switches to its sub-tab.
  if (view && which === "beings" && view.fields.beingKind && view.fields.beingKind !== beingTab) {
    beingTab = view.fields.beingKind as BeingKind;
    return sheetPanels(ctx, which);
  }
  const key = listKey(which);
  const sel = listSelection.get(key) ?? new Set<string>();
  listSelection.set(key, sel);
  for (const id of [...sel]) if (!(entries ?? []).some((e) => e.id === id)) sel.delete(id);
  const open = view;
  // Where a drop goes: every selected sheet if the open one is among them, else the open sheet.
  const targets = () => {
    if (!open || open.kind === "brick") return { ids: [] as string[], names: "" };
    if (sel.size > 1 && sel.has(open.id)) return { ids: [...sel], names: `${sel.size} selected` };
    return { ids: [open.id], names: open.name };
  };
  const library = (leftMode[which] ?? "list") === "library" ? await libraryPanel(ctx, targets, which) : null;
  const c = choices ?? { abilities: [], conditions: [], resources: [] };
  return {
    list: listPanel(which, entries ?? [], categories ?? [], ctx, library),
    editor: open?.kind === "brick" ? brickEditor(open, c, ctx, () => void remove(open.id, ctx)) : sheetEditor(open, which, categories ?? [], c, ctx, targets),
  };
}

// ---------- The list ----------

function listPanel(which: "beings" | "items", all: ListEntry[], categories: CategoryOption[], ctx: PlaceCtx, library: HTMLElement | null) {
  const key = listKey(which);
  const sel = listSelection.get(key)!;
  const f = (filters[key] ??= { text: "", favourites: false });
  const noun = which === "beings" ? BEING_TABS.find((t) => t.id === beingTab)!.label.toLowerCase() : "item";
  const match = (e: ListEntry) => (!f.text || e.name.toLowerCase().includes(f.text.toLowerCase())) && (!f.favourites || e.favourite);
  const filtering = !!f.text || f.favourites;
  // While filtering, a match is shown even if its parent isn't.
  const entries = filtering ? all.filter(match).map((e) => ({ ...e, depth: 0 })) : all;

  const filterBox = h("input", { class: "text-input small-input", placeholder: "Filter by name", value: f.text, "data-key": `filter-${key}`, "aria-label": "Filter by name" });
  filterBox.addEventListener("input", () => {
    f.text = filterBox.value;
    void ctx.refresh();
  });
  const sortable = which === "beings" && (beingTab === "monster" || beingTab === "npc");
  const sortSelect = sortable
    ? h("select", { class: "text-input select small-select", "aria-label": "Sort by", title: "Sort by" }, h("option", { value: "name", selected: sortBy !== "challenge" }, "A to Z"), h("option", { value: "challenge", selected: sortBy === "challenge" }, "By challenge"))
    : null;
  sortSelect?.addEventListener("change", () => ((sortBy = sortSelect.value as "name" | "challenge"), void ctx.refresh()));
  const star = h("button", { class: `icon-button small star${f.favourites ? " on" : ""}`, title: f.favourites ? "Showing favourites only" : "Show favourites only", "aria-pressed": f.favourites ? "true" : "false", onClick: () => ((f.favourites = !f.favourites), void ctx.refresh()) }, svg(ICONS.star));

  // Click opens one; Ctrl-click adds or removes one; Shift-click selects a run, like File Explorer.
  const click = (e: ListEntry, ev: MouseEvent) => {
    const anchor = listAnchor.get(key);
    if (ev.shiftKey && anchor) {
      const a = entries.findIndex((x) => x.id === anchor);
      const b = entries.findIndex((x) => x.id === e.id);
      if (a >= 0 && b >= 0) {
        if (!(ev.ctrlKey || ev.metaKey)) sel.clear();
        for (const x of entries.slice(Math.min(a, b), Math.max(a, b) + 1)) sel.add(x.id);
      }
      return ctx.select(e.id);
    }
    if (ev.ctrlKey || ev.metaKey) {
      if (!sel.size && ctx.selected && entries.some((x) => x.id === ctx.selected)) sel.add(ctx.selected);
      if (sel.has(e.id)) sel.delete(e.id);
      else sel.add(e.id);
      listAnchor.set(key, e.id);
      return sel.has(e.id) ? ctx.select(e.id) : void ctx.refresh();
    }
    sel.clear();
    sel.add(e.id);
    listAnchor.set(key, e.id);
    ctx.select(e.id);
  };
  const dropOnItem = (e: ListEntry) => ({
    onDragover: (ev: DragEvent) => {
      if (!ev.dataTransfer?.types.includes(DRAG_TYPE) || ctx.view.readOnly) return;
      ev.preventDefault();
      (ev.currentTarget as HTMLElement).classList.add("drop-over");
    },
    onDragleave: (ev: DragEvent) => (ev.currentTarget as HTMLElement).classList.remove("drop-over"),
    onDrop: (ev: DragEvent) => {
      ev.preventDefault();
      const bricks = JSON.parse(ev.dataTransfer!.getData(DRAG_TYPE) || "[]") as string[];
      void drop(sel.size > 1 && sel.has(e.id) ? [...sel] : [e.id], bricks, ctx);
    },
  });
  const item = (e: ListEntry) =>
    h(
      "li",
      {
        class: `item depth-${Math.min(e.depth, 6)}${e.id === ctx.selected ? " selected" : sel.size > 1 && sel.has(e.id) ? " multi" : ""}`,
        tabindex: 0,
        "data-key": `item-${e.id}`,
        "aria-selected": sel.has(e.id) || e.id === ctx.selected ? "true" : "false",
        onClick: (ev: MouseEvent) => click(e, ev),
        onKeydown: (ev: KeyboardEvent) => {
          if (ev.key === "Enter") ctx.select(e.id);
          if (ev.key === "Delete" && !ctx.view.readOnly) void remove(e.id, ctx);
        },
        ...dropOnItem(e),
      },
      e.depth ? h("span", { class: "variant-mark", "aria-hidden": "true" }, "↳") : null,
      h("span", { class: "item-name" }, e.name),
      e.favourite ? h("span", { class: "star-mark", title: "Favourite" }, svg(ICONS.star)) : null,
      e.note ? h("span", { class: "item-label" }, e.note) : null,
      e.fromBelow ? h("span", { class: "from-below", title: "From the system" }, svg(ICONS.layers)) : null,
    );

  let body: HTMLElement;
  if (!entries.length) body = h("p", { class: "muted small pad" }, filtering ? "Nothing matches." : `No ${which === "beings" ? BEING_TABS.find((t) => t.id === beingTab)!.plural.toLowerCase() : "items"} yet.`);
  else if (which === "items" && !filtering) {
    // Items are grouped by where they are filed.
    const groups = new Map<string, ListEntry[]>();
    for (const e of entries) {
      const top = e.depth === 0 ? (e.categoryPath ?? "Uncategorized") : [...groups.keys()].at(-1)!;
      groups.set(top, [...(groups.get(top) ?? []), e]);
    }
    body = h(
      "div",
      null,
      [...groups.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([title, list]) => h("div", { class: "section" }, h("div", { class: "group-title" }, title), h("ul", { class: "items flat" }, list.map(item)))),
    );
  } else body = h("ul", { class: "items flat" }, entries.map(item));

  const mode = leftMode[which] ?? "list";
  const switcher = h(
    "div",
    { class: "switch", role: "tablist", "aria-label": "Show" },
    h("button", { class: `switch-button${mode === "list" ? " active" : ""}`, role: "tab", "aria-selected": mode === "list" ? "true" : "false", onClick: () => ((leftMode[which] = "list"), void ctx.refresh()) }, which === "beings" ? "Beings" : "Items"),
    h("button", { class: `switch-button${mode === "library" ? " active" : ""}`, role: "tab", "aria-selected": mode === "library" ? "true" : "false", onClick: () => ((leftMode[which] = "library"), void ctx.refresh()) }, "Library"),
  );
  if (library)
    return h(
      "aside",
      { class: "panel list-panel library-mode", "aria-label": "Library" },
      h("div", { class: "panel-head" }, switcher),
      sel.size > 1 ? h("div", { class: "multi-note small" }, `${sel.size} sheets are selected in the list: what you add goes to all of them.`) : null,
      library,
    );
  return h(
    "aside",
    { class: "panel list-panel", "aria-label": which === "beings" ? "Beings" : "Items", "data-scroll": `list-${key}` },
    h(
      "div",
      { class: "panel-head" },
      switcher,
      ctx.view.readOnly ? null : h("button", { class: "button primary small-button head-button", onClick: () => void createNew(which, all, categories, ctx) }, svg(ICONS.plus), `New ${noun}`),
    ),
    sel.size > 1 ? h("div", { class: "multi-note small" }, `${sel.size} selected. Open the Library and drop bricks on any one of them to add to all.`) : null,
    which === "beings"
      ? h(
          "div",
          { class: "subtabs", role: "tablist" },
          BEING_TABS.map((t) => h("button", { class: `subtab${t.id === beingTab ? " active" : ""}`, role: "tab", "aria-selected": t.id === beingTab ? "true" : "false", onClick: () => ((beingTab = t.id), ctx.select(null)) }, t.plural)),
        )
      : null,
    h("div", { class: "filter-row" }, filterBox, sortSelect, star),
    body,
  );
}

/**
 * Create new: a name, what it is, and where it starts from: nothing, a variant of something (or of
 * a template), or a copy of something. A new item suggests its category's template.
 */
async function createNew(which: "beings" | "items", existing: ListEntry[], categories: CategoryOption[], ctx: PlaceCtx) {
  const templates = ((await attempt(() => api.templates())) ?? []).filter((t) => (which === "beings" ? t.kind === "being" : t.kind === "item"));
  const d = openDialog(which === "beings" ? "New being" : "New item");
  const name = h("input", { class: "text-input", placeholder: which === "beings" ? "For example: Goblin" : "For example: Longsword", maxlength: 200 });
  const kind = h("select", { class: "text-input" }, BEING_TABS.map((t) => h("option", { value: t.id, selected: t.id === beingTab }, t.label)));
  const start = h(
    "select",
    { class: "text-input" },
    h("option", { value: "" }, "Nothing: it's new"),
    templates.length ? h("optgroup", { label: "A variant of a template" }, templates.map((t) => h("option", { value: `variant:${t.id}` }, t.name))) : null,
    existing.length ? h("optgroup", { label: "A variant of" }, existing.map((e) => h("option", { value: `variant:${e.id}` }, `${"\u00a0\u00a0".repeat(e.depth)}${e.name}`))) : null,
    existing.length ? h("optgroup", { label: "A copy of" }, existing.map((e) => h("option", { value: `copy:${e.id}` }, `${"\u00a0\u00a0".repeat(e.depth)}${e.name}`))) : null,
  );
  const category = h("select", { class: "text-input" }, h("option", { value: "" }, "Item (the default)"), categories.filter((c) => c.role !== "creature").map((c) => h("option", { value: c.id }, `${"\u00a0\u00a0\u00a0".repeat(c.depth)}${c.name}`)));
  const asTemplate = h("input", { type: "checkbox" });
  const hint = h("p", { class: "muted small" }, "A variant starts with everything its parent has and still gets the parent's later changes. A copy starts the same but goes its own way.");
  const create = h("button", { class: "button primary" }, "Create");
  let suggested = false;
  const refresh = () => {
    create.disabled = !name.value.trim();
    kind.disabled = !!start.value;
    asTemplate.disabled = start.value.startsWith("copy:");
    if (asTemplate.disabled) asTemplate.checked = false;
  };
  // New items suggest their category's template in "Start from", without overriding a choice.
  category.addEventListener("change", () => {
    const t = templates.find((x) => x.categoryId === category.value);
    if (t && (!start.value || suggested)) {
      start.value = `variant:${t.id}`;
      suggested = true;
      hint.textContent = `Suggested: a variant of the ${t.name} template, so it gets the shared parts. Choose Nothing to start blank.`;
    } else if (suggested && !t) {
      start.value = "";
      suggested = false;
    }
    refresh();
  });
  start.addEventListener("change", () => ((suggested = false), refresh()));
  name.addEventListener("input", refresh);
  name.addEventListener("keydown", (e) => e.key === "Enter" && (e.preventDefault(), create.click()));
  d.body.append(
    h("label", { class: "field-label" }, "Name"),
    name,
    ...(which === "beings" ? [h("label", { class: "field-label spaced" }, "What is it?"), kind] : [h("label", { class: "field-label spaced" }, "Filed under"), category]),
    h("label", { class: "field-label spaced" }, "Start from"),
    start,
    hint,
    h("label", { class: "check spaced-check" }, asTemplate, "Make it a template: a parent that holds shared parts, not a real thing (kept out of the lists and the rulebook)"),
  );
  create.addEventListener("click", async () => {
    if (!name.value.trim()) return;
    create.disabled = true;
    const [how, from] = start.value ? (start.value.split(":") as ["variant" | "copy", string]) : [null, null];
    if (!how) {
      d.close();
      if (!(await offerRestore(name.value, which === "beings" ? "being" : "item", ctx))) return;
    }
    const id = await attempt(async () => {
      if (how === "copy") return api.copyNode(from!, name.value);
      const variantOf = how === "variant" ? from : null;
      return which === "beings"
        ? api.addBeing({ name: name.value, kind: kind.value as BeingKind, variantOf, template: asTemplate.checked })
        : api.addItem({ name: name.value, categoryId: category.value || null, variantOf, template: asTemplate.checked });
    });
    if (!id) return refresh();
    d.close();
    if (asTemplate.checked) {
      // Templates live in the library, so open the library to show where it went.
      leftMode[which] = "library";
      notice(`${name.value.trim()} is a template. It lives in the library's Templates group.`, "blue", undefined, 6000);
    }
    ctx.select(id);
  });
  d.footer.append(h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"), create);
  refresh();
  name.focus();
}

async function remove(id: string, ctx: PlaceCtx) {
  const r = await attempt(() => api.deleteNode(id));
  if (!r) return;
  notice(`${r.label}. It's in the recycle bin; anything that used it is flagged.`, "blue", {
    label: "Undo",
    run: async () => {
      await attempt(() => api.undo());
      ctx.select(id);
    },
  });
  ctx.select(null);
}

// ---------- The sheet ----------

function sheetEditor(view: NodeView | null, which: "beings" | "items", categories: CategoryOption[], choices: Choices, ctx: PlaceCtx, targets: () => { ids: string[]; names: string }) {
  if (!view)
    return h(
      "section",
      { class: "panel editor" },
      h(
        "div",
        { class: "empty-editor" },
        h("h2", null, ctx.view.name),
        h("p", { class: "muted" }, which === "beings" ? "Pick something on the left, or make a new one. Monsters, NPCs, characters, races and classes are all made the same way." : "Pick an item on the left, or make a new one."),
      ),
    );
  const ro = view.readOnly;
  const ed = new FieldMaker(view, ctx);
  const sheet = view.sheet!;

  const nameInput = h("input", { class: "title-input", value: view.name, "data-key": "f-name", "aria-label": "Name", disabled: ro, maxlength: 200 });
  nameInput.addEventListener("change", () => void ed.save(() => api.rename(view.id, nameInput.value)));
  nameInput.addEventListener("keydown", (e) => e.key === "Enter" && nameInput.blur());

  const pic = h(
    "button",
    { class: `sheet-picture${view.picture ? "" : " empty"}`, disabled: ro, title: view.picture ? "Change the picture" : "Add a picture", "aria-label": "Picture" },
    view.picture ? h("img", { src: pictureUrl(view.picture), alt: "" }) : [svg(ICONS.image), h("span", null, "Picture")],
  );
  pic.addEventListener("click", async () => {
    const id = await attempt(() => api.pickPicture());
    if (id) await ed.save(() => api.setPicture(view.id, id));
  });

  const kindLabel = view.kind === "item" ? "Item" : (BEING_TABS.find((t) => t.id === view.fields.beingKind)?.label ?? "Being");
  const categorySelect = h(
    "select",
    { class: "text-input select chip-sized", "data-key": "f-category", disabled: ro, "aria-label": "Category" },
    h("option", { value: "", selected: !view.categoryId }, "Uncategorized"),
    categories.map((c) => h("option", { value: c.id, selected: c.id === view.categoryId }, `${"   ".repeat(c.depth)}${c.name}`)),
    h("option", { value: "__new" }, "+ New category…"),
  );
  categorySelect.addEventListener("change", async () => {
    if (categorySelect.value === "__new") {
      const made = await newCategory(categories);
      if (made) await ed.save(() => api.setCategory(view.id, made));
      else await ctx.refresh();
      return;
    }
    await ed.save(() => api.setCategory(view.id, categorySelect.value || null));
  });

  const head = h(
    "div",
    { class: "sheet-head" },
    pic,
    h(
      "div",
      { class: "sheet-title" },
      h(
        "div",
        { class: "title-row" },
        nameInput,
        ed.pencil("name"),
        h("button", { class: `icon-button star${view.favourite ? " on" : ""}`, disabled: ro, title: view.favourite ? "Favourite (click to unstar)" : "Add to favourites", "aria-pressed": view.favourite ? "true" : "false", onClick: () => void ed.save(() => api.toggleFavourite(view.id)) }, svg(ICONS.star)),
        ro ? null : h("button", { class: "icon-button", title: "Delete (it goes to the recycle bin)", "aria-label": `Delete ${view.name}`, onClick: () => void remove(view.id, ctx) }, svg(ICONS.trash)),
      ),
      h(
        "div",
        { class: "chips" },
        h("span", { class: "chip" }, kindLabel),
        view.template ? h("span", { class: "chip template-chip", title: "A parent that holds shared parts. It stays out of the lists and the rulebook, and lives in the library's Templates group." }, "Template") : null,
        h("label", { class: "chip-select" }, "Filed under ", categorySelect),
        ro
          ? null
          : h(
              "button",
              { class: "link small", title: view.template ? "Make it a real thing that shows in the lists and the rulebook" : "Make it a parent that holds shared parts for other sheets", onClick: () => void ed.save(() => api.setTemplate(view.id, !view.template)) },
              view.template ? "Make it real" : "Make template",
            ),
        view.parent
          ? h(
              "span",
              { class: "chip variant-chip" },
              "Variant of ",
              h("button", { class: "link", onClick: () => ctx.select(view.parent!.id) }, view.parent.name),
              ro ? null : h("button", { class: "link small", title: `Change ${view.parent.name} without leaving this sheet (or Alt-click the sheet)`, onClick: () => void openEditParent(view, ctx) }, "Edit parent"),
              ro ? null : h("button", { class: "link small detach", title: "Make it a fully independent copy", onClick: () => void ed.save(() => api.detach(view.id)) }, "Detach"),
            )
          : view.parentMissing
            ? h("span", { class: "chip broken-chip" }, "Its parent was removed")
            : null,
        view.fromBelow ? h("span", { class: "chip muted", title: "This comes from the system. Changes you make here stay in this world, marked with a pencil." }, svg(ICONS.layers), "From the system") : null,
      ),
      h(
        "div",
        { class: "stat-row" },
        sheet.header.map((f) =>
          h(
            "label",
            { class: "stat" },
            h("span", { class: "stat-label" }, f.label, ed.pencil(f.key)),
            f.type === "number" ? ed.number(f.key) : ed.text(f.key, f.placeholder ?? ""),
          ),
        ),
      ),
    ),
  );

  const scores = sheet.scores ? scoreRow(view, choices, ed) : null;
  const bySection = new Map<string, AttachmentView[]>();
  for (const a of view.attachments) bySection.set(a.section, [...(bySection.get(a.section) ?? []), a]);
  const extra = [...bySection.keys()].filter((s) => !sheet.sections.includes(s));
  const sections = h(
    "div",
    { class: "sheet-sections" },
    [...sheet.sections, ...extra].map((s) =>
      h(
        "div",
        { class: "sheet-section" },
        h("div", { class: "sheet-section-title" }, s),
        (bySection.get(s) ?? []).map((a) => brickCard(view, a, ctx)),
        bySection.get(s)?.length ? null : h("div", { class: "drop-hint muted small" }, ro ? "Nothing here." : "Drag bricks from the Library onto the sheet; they land in the right section."),
      ),
    ),
  );

  const textBox = h("textarea", { class: "text-input rules-text", "data-key": "f-text", rows: 5, disabled: ro, placeholder: "Description: what it looks like, how it behaves, where it comes from." }, view.text);
  textBox.addEventListener("change", () => void ed.save(() => api.setText(view.id, textBox.value)));

  const t = targets();
  const panel: HTMLElement = h(
    "section",
    {
      class: "panel editor sheet-drop",
      "data-scroll": "editor",
      title: view.parent && !ro ? `Alt-click to edit ${view.parent.name}` : "",
      onClick: (ev: MouseEvent) => {
        if (ev.altKey && view.parent && !ro) (ev.preventDefault(), void openEditParent(view, ctx));
      },
      onDragover: (ev: DragEvent) => {
        if (!ev.dataTransfer?.types.includes(DRAG_TYPE) || ro) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = "copy";
        panel.classList.add("drop-over");
      },
      onDragleave: (ev: DragEvent) => {
        if (!panel.contains(ev.relatedTarget as Node)) panel.classList.remove("drop-over");
      },
      onDrop: (ev: DragEvent) => {
        ev.preventDefault();
        panel.classList.remove("drop-over");
        const bricks = JSON.parse(ev.dataTransfer!.getData(DRAG_TYPE) || "[]") as string[];
        void drop(targets().ids, bricks, ctx);
      },
    },
    t.ids.length > 1 ? h("div", { class: "multi-banner" }, `${t.names}: what you drop here is added to all of them.`) : null,
    h(
      "div",
      { class: "editor-inner wide" },
      head,
      scores,
      sections,
      h("div", { class: "field" }, h("div", { class: "field-label" }, "Description", ed.pencil("text")), textBox),
      view.variants ? h("p", { class: "muted small" }, `${view.variants} ${view.variants === 1 ? "variant follows" : "variants follow"} this one; changes here reach them unless they set that value themselves.`) : null,
      h(
        "div",
        { class: "used-by" },
        h("div", { class: "field-label" }, "Used by"),
        view.usedBy.length ? h("ul", { class: "link-list" }, view.usedBy.map((u) => h("li", null, h("button", { class: "link", onClick: () => ctx.select(u.id) }, u.name)))) : h("p", { class: "muted small" }, "Nothing uses this yet."),
      ),
    ),
  );
  return panel;
}

/** A brick on a sheet: what it does in plain words, where it came from, and a remove button. */
function brickCard(view: NodeView, a: AttachmentView, ctx: PlaceCtx) {
  const own = !a.from;
  return h(
    "div",
    {
      class: `brick-card clickable${a.missing ? " broken" : ""}${own ? "" : " inherited"}`,
      "data-key": `card-${a.aid}`,
      tabindex: 0,
      title: own ? "Click to change it on this sheet only. Drop a brick here to put it inside." : `Comes from ${a.from!.name}`,
      onClick: (ev: MouseEvent) => {
        if ((ev.target as HTMLElement).closest("button") || ev.altKey) return;
        void openDrill(view, a.aid, ctx);
      },
      onKeydown: (ev: KeyboardEvent) => ev.key === "Enter" && ev.target === ev.currentTarget && void openDrill(view, a.aid, ctx),
      // Dropping a brick onto a card nests it inside: it happens only when this one does.
      onDragover: (ev: DragEvent) => {
        if (!own || view.readOnly || !ev.dataTransfer?.types.includes(DRAG_TYPE)) return;
        ev.preventDefault();
        ev.stopPropagation();
        (ev.currentTarget as HTMLElement).classList.add("drop-over");
      },
      onDragleave: (ev: DragEvent) => (ev.currentTarget as HTMLElement).classList.remove("drop-over"),
      onDrop: (ev: DragEvent) => {
        if (!own || view.readOnly) return;
        ev.preventDefault();
        ev.stopPropagation();
        document.querySelector(".sheet-drop")?.classList.remove("drop-over");
        const bricks = JSON.parse(ev.dataTransfer!.getData(DRAG_TYPE) || "[]") as string[];
        void (async () => {
          const r = await attempt(() => api.attachInside(view.id, a.aid, bricks));
          if (r) notice(`${r.label}.`, "green", { label: "Undo", run: async () => (await attempt(() => api.undo()), await ctx.refresh()) }, 6000);
          await ctx.refresh();
        })();
      },
    },
    h(
      "div",
      { class: "brick-card-head" },
      a.brickId && !a.missing
        ? h("button", { class: "brick-name link-plain", title: "Open the original in the library", onClick: () => ctx.select(a.brickId!) }, a.name)
        : h("span", { class: "brick-name" }, a.missing ? `[missing: ${a.name}]` : a.name),
      a.from ? h("span", { class: "chip muted small-chip", title: `Comes from ${a.from.name}. Change it there.` }, `From ${a.from.name}`) : null,
      own && !view.readOnly
        ? h(
            "button",
            {
              class: "icon-button small",
              title: "Remove from this sheet",
              "aria-label": `Remove ${a.name}`,
              onClick: async () => {
                const r = await attempt(() => api.removeAttachment(view.id, a.aid));
                if (r) notice(`${r.label}.`, "blue", { label: "Undo", run: async () => (await attempt(() => api.undo()), await ctx.refresh()) }, 6000);
                await ctx.refresh();
              },
            },
            svg(ICONS.close),
          )
        : null,
    ),
    // The card already shows the name, so the sentence doesn't repeat it.
    h("div", { class: "brick-sentence" }, a.sentence.startsWith(`${a.name}: `) ? capFirst(a.sentence.slice(a.name.length + 2)) : a.sentence),
  );
}

/** The system's abilities as score boxes, with the bonus worked out beside each. */
function scoreRow(view: NodeView, choices: Choices, ed: FieldMaker) {
  if (!choices.abilities.length) return h("p", { class: "muted small" }, "Add abilities (such as Strength) in the Rules tab, and their score boxes appear on every sheet.");
  const scores = new Map(view.scores.map((s) => [s.ability, s.score]));
  const missing = view.scores.filter((s) => !choices.abilities.some((a) => a.id === s.ability));
  return h(
    "div",
    { class: "score-row" },
    choices.abilities.map((a) => {
      const v = scores.get(a.id);
      const bonus = v === undefined ? "" : a.bonus === "d20" ? signed(Math.floor((v - 10) / 2)) : a.bonus === "score" ? signed(v) : "";
      const input = h("input", { class: "text-input score-input", type: "number", value: v === undefined ? "" : String(v), "data-key": `score-${a.id}`, disabled: view.readOnly, "aria-label": a.name });
      input.addEventListener("change", () => {
        const raw = input.value.trim();
        if (raw !== "" && !Number.isFinite(Number(raw))) return;
        void ed.save(() => api.setScore(view.id, a.id, raw === "" ? null : Number(raw)));
      });
      input.addEventListener("keydown", (e) => e.key === "Enter" && input.blur());
      return h("label", { class: "score", title: a.name }, h("span", { class: "score-label" }, a.label ?? a.name, ed.pencil(`score_${a.id}`)), input, h("span", { class: "score-bonus muted small" }, bonus));
    }),
    missing.map((s) => h("div", { class: "score broken", title: "This ability was removed. See the flag panel." }, h("span", { class: "score-label" }, `[missing: ${view.missing[s.ability] ?? "removed"}]`), h("span", null, String(s.score)))),
  );
}

function capFirst(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `−${Math.abs(n)}`;
}

/** "+ New category…": a name, and optionally which category it goes inside. */
function newCategory(categories: CategoryOption[]): Promise<string | null> {
  return new Promise((resolve) => {
    let made: string | null = null;
    const d = openDialog("New category", { onClose: () => resolve(made) });
    const name = h("input", { class: "text-input", placeholder: "For example: Melee", maxlength: 200 });
    const under = h("select", { class: "text-input" }, h("option", { value: "" }, "Nothing: a new top category"), categories.filter((c) => c.depth < 2).map((c) => h("option", { value: c.id }, `${"   ".repeat(c.depth)}${c.name}`)));
    const ok = h("button", { class: "button primary", disabled: true }, "Add category");
    name.addEventListener("input", () => (ok.disabled = !name.value.trim()));
    name.addEventListener("keydown", (e) => e.key === "Enter" && (e.preventDefault(), ok.click()));
    ok.addEventListener("click", async () => {
      if (!name.value.trim()) return;
      const id = await attempt(() => api.addCategory(name.value, under.value || null));
      if (!id) return;
      made = id;
      d.close();
    });
    d.body.append(h("label", { class: "field-label" }, "Name"), name, h("label", { class: "field-label spaced" }, "Inside"), under, h("p", { class: "muted small" }, "Categories go up to three levels deep, such as Weapon → Melee → Metal."));
    d.footer.append(h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"), ok);
    name.focus();
  });
}
