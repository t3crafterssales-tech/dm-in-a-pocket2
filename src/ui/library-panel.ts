// The library in the left panel: reusable bricks in collapsible sections, each with its own
// filter. Click, Ctrl-click and Shift-click select; drag onto a sheet (or press "Add") to attach.
// Double-click opens the original, and changing it there changes every sheet that uses it.

import type { BrickType, Choices, LibraryEntry, LibrarySection, NodeView } from "../app/backend.ts";
import { api } from "./api.ts";
import { attempt } from "./common.ts";
import { notice, openDialog } from "./dialogs.ts";
import { h, svg } from "./dom.ts";
import { FieldMaker } from "./fields.ts";
import { ICONS } from "./icons.ts";
import type { PlaceCtx } from "./place.ts";
import { newNameBox } from "./rules-tab.ts";

export const DRAG_TYPE = "application/x-dm-bricks";

/** Selected library entries, in the order they appear. Survives switching tabs, like a clipboard. */
export const librarySelection = new Set<string>();
let anchor: string | null = null;
const collapsed = new Set<string>(["damage", "immunity", "abilityBonus", "armor"]);
const sectionFilter: Record<string, string> = {};
let adding: string | null = null;

/**
 * The library panel. `targets` says which sheets a drop or "Add" goes to (the open sheet, or
 * every selected one in the list).
 */
export async function libraryPanel(ctx: PlaceCtx, targets: () => { ids: string[]; names: string }): Promise<HTMLElement> {
  const sections = (await attempt(() => api.library())) ?? [];
  const visible: LibraryEntry[] = [];
  const all = new Map(sections.flatMap((s) => s.entries.map((e) => [e.id, e] as const)));
  for (const id of [...librarySelection]) if (!all.has(id)) librarySelection.delete(id);

  const body = sections.map((s) => {
    const open = !collapsed.has(s.type);
    const filter = sectionFilter[s.type] ?? "";
    const entries = s.entries.filter((e) => !filter || e.name.toLowerCase().includes(filter.toLowerCase()));
    if (open) visible.push(...entries);
    return h(
      "div",
      { class: "section" },
      h(
        "div",
        { class: "section-head" },
        h(
          "button",
          { class: `section-toggle${open ? " open" : ""}`, "aria-expanded": open ? "true" : "false", onClick: () => (open ? collapsed.add(s.type) : collapsed.delete(s.type), void ctx.refresh()) },
          svg(ICONS.chevron),
          h("span", null, s.title),
          s.entries.length ? h("span", { class: "muted small" }, s.entries.length) : null,
        ),
        ctx.view.readOnly || s.type === "item" ? null : h("button", { class: "icon-button small", title: `New ${s.title.toLowerCase()} brick`, "aria-label": `New brick in ${s.title}`, onClick: () => ((adding = s.type), collapsed.delete(s.type), void ctx.refresh()) }, svg(ICONS.plus)),
      ),
      open ? sectionBody(s, entries, filter, visible, ctx) : null,
    );
  });

  const t = targets();
  const selected = [...librarySelection];
  const addBar =
    selected.length && t.ids.length && !ctx.view.readOnly
      ? h(
          "div",
          { class: "add-bar" },
          h("span", { class: "small" }, `${selected.length} selected`),
          h("button", { class: "button primary small-button", title: "Or drag them onto the sheet", onClick: () => void drop(t.ids, selected, ctx) }, `Add to ${t.names}`),
          h("button", { class: "link small", onClick: () => (librarySelection.clear(), void ctx.refresh()) }, "Clear"),
        )
      : selected.length
        ? h("div", { class: "add-bar muted small" }, `${selected.length} selected. Open a sheet to add them to it.`)
        : h("div", { class: "add-bar muted small" }, "Drag bricks onto a sheet. Ctrl-click or Shift-click to pick several.");
  return h("div", { class: "library" }, h("div", { class: "library-sections", "data-scroll": "library" }, body), addBar);
}

function sectionBody(s: LibrarySection, entries: LibraryEntry[], filter: string, visible: LibraryEntry[], ctx: PlaceCtx) {
  const filterBox = s.entries.length > 5 || filter ? h("input", { class: "text-input small-input section-filter", placeholder: `Filter ${s.title.toLowerCase()}`, value: filter, "data-key": `libfilter-${s.type}` }) : null;
  filterBox?.addEventListener("input", () => {
    sectionFilter[s.type] = filterBox.value;
    void ctx.refresh();
  });
  return h(
    "div",
    null,
    filterBox,
    h(
      "ul",
      { class: "items flat lib-items" },
      entries.map((e) =>
        h(
          "li",
          {
            class: `item lib-item${librarySelection.has(e.id) ? " selected" : ""}${e.id === ctx.selected ? " open" : ""}`,
            tabindex: 0,
            draggable: ctx.view.readOnly ? "false" : "true",
            "data-key": `lib-${e.id}`,
            title: `${e.note}\nDouble-click to open the original.`,
            onClick: (ev: MouseEvent) => select(e.id, ev, visible, ctx),
            onDblclick: () => ctx.select(e.id),
            onKeydown: (ev: KeyboardEvent) => {
              if (ev.key === "Enter") ctx.select(e.id);
              if (ev.key === " ") (ev.preventDefault(), select(e.id, ev as unknown as MouseEvent, visible, ctx));
            },
            onDragstart: (ev: DragEvent) => {
              if (!librarySelection.has(e.id)) {
                librarySelection.clear();
                librarySelection.add(e.id);
              }
              ev.dataTransfer!.setData(DRAG_TYPE, JSON.stringify([...librarySelection]));
              ev.dataTransfer!.effectAllowed = "copy";
              document.body.classList.add("dragging-bricks");
            },
            onDragend: () => document.body.classList.remove("dragging-bricks"),
          },
          h("span", { class: "item-name" }, e.name),
          e.fromBelow ? h("span", { class: "from-below", title: "From the system" }, svg(ICONS.layers)) : null,
        ),
      ),
      adding === s.type
        ? h(
            "li",
            { class: "item adding" },
            newNameBox(`Name of the new ${s.title.toLowerCase()} brick`, `newbrick-${s.type}`, (name) => void addBrick(s.type as BrickType, name, ctx), () => ((adding = null), void ctx.refresh())),
          )
        : null,
      !s.entries.length && adding !== s.type ? h("li", { class: "empty muted small" }, s.type === "item" ? "Items made in the Items tab can be carried as gear." : "None yet.") : null,
    ),
  );
}

/** Click selects one; Ctrl-click adds or removes one; Shift-click selects a run, like File Explorer. */
function select(id: string, ev: MouseEvent, visible: LibraryEntry[], ctx: PlaceCtx) {
  if (ev.shiftKey && anchor) {
    const a = visible.findIndex((e) => e.id === anchor);
    const b = visible.findIndex((e) => e.id === id);
    if (a >= 0 && b >= 0) {
      if (!(ev.ctrlKey || ev.metaKey)) librarySelection.clear();
      for (const e of visible.slice(Math.min(a, b), Math.max(a, b) + 1)) librarySelection.add(e.id);
    }
  } else if (ev.ctrlKey || ev.metaKey) {
    if (librarySelection.has(id)) librarySelection.delete(id);
    else librarySelection.add(id);
    anchor = id;
  } else {
    librarySelection.clear();
    librarySelection.add(id);
    anchor = id;
  }
  void ctx.refresh();
}

async function addBrick(type: BrickType, name: string, ctx: PlaceCtx) {
  adding = null;
  const id = await attempt(() => api.addBrick(type, name));
  if (id) {
    librarySelection.clear();
    librarySelection.add(id);
    ctx.select(id);
  } else await ctx.refresh();
}

/** Attaches bricks to sheets, asking first only when it must (a spell on an item). */
export async function drop(targets: string[], bricks: string[], ctx: PlaceCtx) {
  if (!targets.length || !bricks.length) return;
  const needs = await attempt(() => api.dropNeedsAnswers(targets, bricks));
  if (needs === undefined) return;
  let answers: { activation?: { when: string[]; join: "any" | "all" }; uses?: { count: number | string; per: string } | null } = {};
  if (needs) {
    const a = await askWhenAndHowOften();
    if (!a) return;
    answers = a;
  }
  const r = await attempt(() => api.attach({ targets, bricks, ...answers }));
  if (r && (targets.length > 1 || bricks.length > 1)) notice(`${r.label}.`, "green", { label: "Undo", run: async () => (await attempt(() => api.undo()), await ctx.refresh()) }, 6000);
  await ctx.refresh();
}

/** The smart-drop question, with sensible defaults so Enter accepts them. */
function askWhenAndHowOften(): Promise<{ activation: { when: string[]; join: "any" }; uses: { count: number; per: string } | null } | null> {
  return new Promise((resolve) => {
    let answer: { activation: { when: string[]; join: "any" }; uses: { count: number; per: string } | null } | null = null;
    const d = openDialog("When does it work?", { onClose: () => resolve(answer) });
    const when = h(
      "select",
      { class: "text-input" },
      [
        ["action", "As an action"],
        ["bonus", "As a bonus action"],
        ["reaction", "As a reaction"],
        ["hit", "On a hit"],
        ["whenHit", "When hit"],
        ["crit", "On a critical hit"],
        ["always", "Always on"],
      ].map(([v, l]) => h("option", { value: v, selected: v === "action" }, l)),
    );
    const count = h("input", { class: "text-input number-input", type: "number", value: "1", min: "0" });
    const per = h(
      "select",
      { class: "text-input" },
      [
        ["long rest", "per long rest"],
        ["short rest", "per short rest"],
        ["day", "per day"],
        ["", "no limit"],
      ].map(([v, l]) => h("option", { value: v, selected: v === "long rest" }, l)),
    );
    const ok = h("button", { class: "button primary" }, "Add");
    const accept = () => {
      const n = Number(count.value);
      answer = { activation: { when: [when.value], join: "any" }, uses: per.value || n ? { count: Number.isFinite(n) ? n : 1, per: per.value } : null };
      d.close();
    };
    ok.addEventListener("click", accept);
    d.el.addEventListener("keydown", (e) => e.key === "Enter" && (e.preventDefault(), accept()));
    d.body.append(
      h("p", { class: "muted" }, "A spell on an item needs to know when it works and how often. Press Enter to use these."),
      h("label", { class: "field-label" }, "When"),
      when,
      h("label", { class: "field-label spaced" }, "How often"),
      h("div", { class: "inline" }, count, per),
    );
    d.footer.append(h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"), ok);
    ok.focus();
  });
}

// ---------- A brick's own editor (the library original) ----------

const BRICK_LABELS: Record<string, string> = { attack: "Attack", spell: "Spell", trait: "Trait", effect: "Effect", damage: "Damage", immunity: "Immunity", abilityBonus: "Ability bonus", armor: "Armour" };

export function brickEditor(view: NodeView, choices: Choices, ctx: PlaceCtx, onRemove: () => void) {
  const ro = view.readOnly;
  const ed = new FieldMaker(view, ctx);
  const type = String(view.fields.type ?? "trait");
  const nameInput = h("input", { class: "title-input", value: view.name, "data-key": "f-name", "aria-label": "Name", disabled: ro, maxlength: 200 });
  nameInput.addEventListener("change", () => void ed.save(() => api.rename(view.id, nameInput.value)));
  nameInput.addEventListener("keydown", (e) => e.key === "Enter" && nameInput.blur());
  const fields: HTMLElement[] = [];
  if (type === "attack" || type === "abilityBonus") fields.push(ed.row("Ability", "ability", ed.linkSelect("ability", choices.abilities, "No ability")));
  if (type === "attack" || type === "damage" || type === "spell") {
    fields.push(ed.row("Damage dice", "dice", ed.text("dice", "For example 1d6")));
    fields.push(ed.row("Damage type", "damageType", ed.text("damageType", "For example slashing, or fire")));
  }
  if (type === "effect" || type === "immunity") fields.push(ed.row("Condition", "condition", ed.linkSelect("condition", choices.conditions, "No condition")));
  if (type === "abilityBonus") fields.push(ed.row("Amount", "amount", ed.number("amount")));
  if (type === "armor") fields.push(ed.row("Armour bonus", "bonus", ed.number("bonus")));
  if (type === "trait" || type === "spell" || type === "effect") fields.push(ed.row("What it does", "wording", ed.text("wording", type === "trait" ? "For example: advantage on attacks when an ally is nearby" : "In a few words, for the rulebook")));
  const textBox = h("textarea", { class: "text-input rules-text", "data-key": "f-text", rows: 4, disabled: ro, placeholder: "Notes or the full description." }, view.text);
  textBox.addEventListener("change", () => void ed.save(() => api.setText(view.id, textBox.value)));
  return h(
    "section",
    { class: "panel editor", "data-scroll": "editor" },
    h(
      "div",
      { class: "editor-inner" },
      h(
        "div",
        { class: "editor-head" },
        h("div", { class: "title-row" }, nameInput, ed.pencil("name"), ro ? null : h("button", { class: "icon-button", title: "Delete (it goes to the recycle bin)", "aria-label": `Delete ${view.name}`, onClick: onRemove }, svg(ICONS.trash))),
        h(
          "div",
          { class: "chips" },
          h("span", { class: "chip" }, `Library brick · ${BRICK_LABELS[type] ?? "Brick"}`),
          view.fromBelow ? h("span", { class: "chip muted" }, svg(ICONS.layers), "From the system") : null,
        ),
      ),
      h("p", { class: "summary" }, view.summary),
      h("p", { class: "muted small" }, "This is the original. Changing it changes every sheet that uses it, except values a sheet changed for itself."),
      h("div", { class: "fields" }, fields),
      h("div", { class: "field" }, h("div", { class: "field-label" }, "Description", ed.pencil("text")), textBox),
      h(
        "div",
        { class: "used-by" },
        h("div", { class: "field-label" }, "Used by"),
        view.usedBy.length ? h("ul", { class: "link-list" }, view.usedBy.map((u) => h("li", null, h("button", { class: "link", onClick: () => ctx.select(u.id) }, u.name)))) : h("p", { class: "muted small" }, "No sheet uses it yet. Drag it onto one."),
      ),
    ),
  );
}
