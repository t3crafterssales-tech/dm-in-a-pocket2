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
import { openEditSystem } from "./edit-system.ts";
import { offerRestore } from "./flag-panel.ts";
import type { PlaceCtx } from "./place.ts";
import { newNameBox } from "./rules-tab.ts";
import { DAMAGE_TYPES, DICE_CHOICES } from "../app/codex-lists.ts";
import { addSelect, chips, stepper } from "./pickers.ts";

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
export async function libraryPanel(ctx: PlaceCtx, targets: () => { ids: string[]; names: string }, which: "beings" | "items"): Promise<HTMLElement> {
  // The Templates group shows this tab's templates (being templates in Beings, item ones in Items).
  const sections = ((await attempt(() => api.library())) ?? []).map((s) => (s.type === "template" ? { ...s, entries: s.entries.filter((e) => e.note === (which === "items" ? "Item template" : "Being template")) } : s));
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
        ctx.view.readOnly || s.type === "item" || s.type === "template" ? null : h("button", { class: "icon-button small", title: `New ${s.title.toLowerCase()} brick`, "aria-label": `New brick in ${s.title}`, onClick: () => ((adding = s.type), collapsed.delete(s.type), void ctx.refresh()) }, svg(ICONS.plus)),
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
            draggable: ctx.view.readOnly || e.type === "template" ? "false" : "true",
            "data-key": `lib-${e.id}`,
            title: `${e.note}\nDouble-click to open the original.`,
            // Templates are opened, not added to sheets (sheets become variants of them instead).
            onClick: (ev: MouseEvent) => (e.type === "template" ? ctx.select(e.id) : select(e.id, ev, visible, ctx)),
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
      !s.entries.length && adding !== s.type
        ? h("li", { class: "empty muted small" }, s.type === "item" ? "Items made in the Items tab can be carried as gear." : s.type === "template" ? "None yet. Tick \"Make it a template\" when making one, or use Make template on a sheet." : "None yet.")
        : null,
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
  if (!(await offerRestore(name, "brick", ctx))) return ctx.refresh();
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
  const starter = view.source === "template";
  const ro = view.readOnly || starter;
  const ed = new FieldMaker(view, ctx);
  const type = String(view.fields.type ?? "trait");
  const set = (k: string, v: unknown) => void ed.save(() => api.setField(view.id, k, v as never));
  const name = h("input", { class: "sheet-name", value: view.name, "data-key": "f-name", "aria-label": "Name", disabled: ro, maxlength: 200 });
  name.addEventListener("change", () => name.value.trim() && void ed.save(() => api.rename(view.id, name.value)));
  name.addEventListener("keydown", (e) => e.key === "Enter" && name.blur());

  // The few things you'd change, as pickers.
  const rows: HTMLElement[] = [];
  const row = (label: string, key: string, ...control: (HTMLElement | null)[]) => rows.push(h("div", { class: "quick-row" }, h("div", { class: "quick-label" }, label, ed.pencil(key)), h("div", { class: "quick-control" }, control)));
  const str = (k: string) => (typeof view.fields[k] === "string" ? (view.fields[k] as string) : "");
  if (type === "spell") {
    const lvl = typeof view.fields.spellLevel === "number" ? (view.fields.spellLevel as number) : null;
    row("Level", "spellLevel", chips(["Cantrip", "1", "2", "3", "4", "5", "6", "7", "8", "9"], lvl === null ? "" : lvl === 0 ? "Cantrip" : String(lvl), (v) => set("spellLevel", v === "Cantrip" ? 0 : Number(v)), { disabled: ro, label: "Spell level" }));
    row("School", "school", chips(SCHOOLS, str("school"), (v) => set("school", v), { disabled: ro, other: "Another school of magic", label: "School" }));
  }
  if (type === "attack" || type === "abilityBonus") rows.push(ed.row("Ability", "ability", ed.linkSelect("ability", choices.abilities, "No ability")));
  if (type === "attack" || type === "damage" || type === "spell") {
    row("Damage", "dice", chips(DICE_CHOICES.slice(1), str("dice"), (v) => set("dice", v), { disabled: ro, other: "Other dice, such as 3d6 or 8d6", label: "Damage dice" }), addSelect(DAMAGE_TYPES, str("damageType"), (v) => set("damageType", v.toLowerCase()), { add: "Add a damage type", label: "Damage type", key: "q-dtype", disabled: ro, none: type === "spell" ? "No damage" : "Choose…" }));
  }
  if (type === "effect" || type === "immunity") rows.push(ed.row("Condition", "condition", ed.linkSelect("condition", choices.conditions, "No condition")));
  if (type === "abilityBonus") row("Amount", "amount", stepper(typeof view.fields.amount === "number" ? (view.fields.amount as number) : 1, (n) => set("amount", n), { label: "Amount", key: "q-amount", min: -10, disabled: ro }));
  if (type === "armor") row("Armour bonus", "bonus", stepper(typeof view.fields.bonus === "number" ? (view.fields.bonus as number) : 1, (n) => set("bonus", n), { label: "Armour bonus", key: "q-bonus", disabled: ro }));
  if (type === "trait" || type === "spell" || type === "effect") rows.push(ed.row("What it does, in a few words", "wording", ed.text("wording", type === "trait" ? "For example: advantage on attacks when an ally is nearby" : "In a few words, for the rulebook")));
  for (const el of rows) el.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select").forEach((x) => ro && (x.disabled = true));

  const textBox = h("textarea", { class: "text-input desc-box", "data-key": "f-text", rows: 4, disabled: ro, placeholder: "The full description, as the rulebook prints it." }, view.text);
  textBox.addEventListener("change", () => void ed.save(() => api.setText(view.id, textBox.value)));
  const copy = async () => {
    const id = await attempt(() => api.makeOwnCopy(view.id));
    if (id) await ctx.open(id, { focusName: true });
  };
  return h(
    "section",
    { class: "panel editor", "data-scroll": "editor" },
    h(
      "div",
      { class: "sheet" },
      starter && !view.readOnly ? h("div", { class: "starter-banner" }, h("span", null, `This is the starter's ${view.name}. Make your own copy to change it; the starter stays as it is.`), h("button", { class: "button primary small-button", onClick: () => void copy() }, "Make my own copy")) : null,
      name,
      h(
        "div",
        { class: "sheet-tags" },
        h("span", { class: "tag accent" }, BRICK_LABELS[type] ?? "Brick"),
        starter ? h("span", { class: "tag" }, "From the starter") : h("span", { class: "tag" }, "Made by you"),
        view.fromBelow && !view.readOnly && ctx.view.type !== "system" && !starter ? h("button", { class: "link small", title: "Change the version underneath, and choose which places get it", onClick: () => void openEditSystem(view.id, ctx) }, ctx.view.type === "module" && ctx.view.worldName ? "Edit in the world" : "Edit in the system") : null,
      ),
      h("p", { class: "summary" }, view.summary),
      rows.length ? h("div", { class: "quick" }, rows) : null,
      h("div", { class: "field" }, h("div", { class: "field-label" }, "Description", ed.pencil("text")), textBox),
      h("p", { class: "muted small" }, "This is the original. Changing it changes every sheet that uses it, except values a sheet changed for itself."),
      h(
        "div",
        { class: "used-by" },
        h("div", { class: "field-label" }, "Used by"),
        view.usedBy.length ? h("ul", { class: "link-list" }, view.usedBy.map((u) => h("li", null, h("button", { class: "link", onClick: () => ctx.select(u.id) }, u.name)))) : h("p", { class: "muted small" }, "No sheet uses it yet. Drag it onto one from the Codex."),
      ),
      view.readOnly
        ? null
        : h(
            "div",
            { class: "sheet-actions" },
            starter ? h("button", { class: "button primary", onClick: () => void copy() }, "Make my own copy") : h("button", { class: "button plain", onClick: () => void copy() }, "Make another like it"),
            h("button", { class: "button plain danger-text", title: "It goes to the recycle bin", onClick: onRemove }, svg(ICONS.trash), "Delete"),
          ),
    ),
  );
}

const SCHOOLS = ["Abjuration", "Conjuration", "Divination", "Enchantment", "Evocation", "Illusion", "Necromancy", "Transmutation"];
