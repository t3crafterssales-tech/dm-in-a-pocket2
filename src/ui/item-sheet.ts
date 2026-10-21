// The item sheet in the feel-pass pattern (the battle axe): picture, name and description first,
// then the few things you'd change as pickers, a live "How it prints in the rulebook" box, and
// everything else folded under More. Starter content is changed through "Make my own copy".

import type { CategoryOption, Choices, NodeView, QuickView } from "../app/backend.ts";
import { CODEX_SECTIONS, DICE_CHOICES, HANDLING } from "../app/codex-lists.ts";
import { api, pictureUrl } from "./api.ts";
import { attempt } from "./common.ts";
import { notice } from "./dialogs.ts";
import { openEditSystem } from "./edit-system.ts";
import { h, svg } from "./dom.ts";
import { FieldMaker } from "./fields.ts";
import { ICONS } from "./icons.ts";
import { openEditParent } from "./edit-parent.ts";
import { DRAG_TYPE, drop } from "./library-panel.ts";
import { showCodexSection } from "./codex-panel.ts";
import { addSelect, chips, parseCost, stepper, weightIn, weightText } from "./pickers.ts";
import type { PlaceCtx } from "./place.ts";
import { brickCard, removeNode } from "./sheets-tab.ts";

/** Whether More is open, per sheet, so a redraw after a change keeps it open. */
const moreOpen = new Set<string>();

export async function itemSheet(view: NodeView, categories: CategoryOption[], _choices: Choices, ctx: PlaceCtx): Promise<HTMLElement> {
  const [q, preview, settings] = await Promise.all([attempt(() => api.quick(view.id)), attempt(() => api.printPreview(view.id)), attempt(() => api.settings())]);
  const quick: QuickView = q ?? { pattern: "gear", section: "gear", attack: null, armour: null, armourTypes: [], materials: [], coins: ["gp"], damageTypes: [], standardText: null };
  const units = settings?.units ?? "lb";
  const ed = new FieldMaker(view, ctx);
  const starter = view.source === "template";
  const locked = view.readOnly || starter;
  const save = (fn: () => Promise<unknown>) => void ed.save(fn);
  const section = CODEX_SECTIONS.find((s) => s.key === quick.section);

  // ---------- Top: picture, name, description ----------
  const pic = h(
    "button",
    { class: `portrait${view.picture ? "" : " empty"}`, disabled: locked, title: view.picture ? "Change the picture" : "Add a picture", "aria-label": "Picture" },
    view.picture ? h("img", { src: pictureUrl(view.picture), alt: "" }) : [h("span", { class: "portrait-icon", "aria-hidden": "true" }, section?.icon ?? "📦"), h("span", null, "Add picture")],
  );
  pic.addEventListener("click", async () => {
    const id = await attempt(() => api.pickPicture());
    if (id) save(() => api.setPicture(view.id, id));
  });
  const name = h("input", { class: "sheet-name", value: view.name, "data-key": "f-name", "aria-label": "Name", disabled: locked, maxlength: 200 });
  name.addEventListener("change", () => name.value.trim() && save(() => api.rename(view.id, name.value)));
  name.addEventListener("keydown", (e) => e.key === "Enter" && name.blur());

  const tags = h(
    "div",
    { class: "sheet-tags" },
    section ? h("span", { class: "tag accent" }, `${section.icon} ${section.one[0]!.toUpperCase()}${section.one.slice(1)}`) : null,
    view.parent ? h("span", { class: "tag" }, "Variant of ", h("button", { class: "link", onClick: () => ctx.select(view.parent!.id) }, view.parent.name)) : null,
    starter ? h("span", { class: "tag" }, "From the starter") : view.source === "others" ? h("span", { class: "tag" }, view.author ? `By ${view.author}` : "From others") : h("span", { class: "tag" }, "Made by you"),
    view.fromBelow ? h("span", { class: "tag", title: `From underneath. Changes you make here stay in this ${ctx.view.type}.` }, svg(ICONS.layers), ctx.view.type === "module" && ctx.view.worldName ? "From the world" : "From the system") : null,
    view.fromBelow && !locked && ctx.view.type !== "system" ? h("button", { class: "link small", title: "Change the version underneath, and choose which places get it", onClick: () => void openEditSystem(view.id, ctx) }, ctx.view.type === "module" && ctx.view.worldName ? "Edit in the world" : "Edit in the system") : null,
    view.template ? h("span", { class: "tag", title: "A parent that holds shared parts. It stays out of the lists and the rulebook." }, "Template") : null,
  );

  const head = h("div", { class: "sheet-top" }, pic, h("div", { class: "sheet-top-text" }, name, description(view, quick, locked, ed), tags));

  // ---------- The few things you'd change, as pickers ----------
  const rows: HTMLElement[] = [];
  const row = (label: string, ...control: (HTMLElement | null)[]) => rows.push(h("div", { class: "quick-row" }, h("div", { class: "quick-label" }, label), h("div", { class: "quick-control" }, control)));

  if (quick.pattern === "weapon") {
    const a = quick.attack;
    if (a) {
      const can = a.own && !locked;
      const set = (k: string, v: string) => save(() => api.editAttachment(view.id, a.aid, { overrides: { [k]: v } }));
      const types = addSelect(quick.damageTypes, a.damageType, (v) => set("damageType", v.toLowerCase()), { add: "Add a damage type", label: "Damage type", key: "q-dtype", disabled: !can });
      row("Damage", chips(DICE_CHOICES.slice(1), a.dice, (v) => set("dice", v), { disabled: !can, other: "Other dice, such as 3d6 or 1d8+2", label: "Damage dice" }), types, a.own || locked ? null : inheritedNote(view, a.from, ctx));
    } else row("Damage", h("span", { class: "muted" }, "No attack yet. "), locked ? null : h("button", { class: "link", onClick: () => (showCodexSection("attacks"), void ctx.refresh()) }, "Add one from the Codex"));
    row("How it's held", chips(HANDLING, String(view.fields.handling ?? ""), (v) => save(() => api.setField(view.id, "handling", v)), { disabled: locked, label: "How it's held" }));
  }
  if (quick.pattern === "armour") {
    const cat = categories.find((c) => c.id === view.categoryId);
    if (quick.armourTypes.length) row("Type", chips(quick.armourTypes.map((t) => t.name), quick.armourTypes.find((t) => t.id === view.categoryId)?.name ?? (cat?.name ?? ""), (v) => save(() => api.setCategory(view.id, quick.armourTypes.find((t) => t.name === v)!.id)), { disabled: locked, label: "Armour type" }));
    const a = quick.armour;
    if (a) row(cat?.name === "Shields" ? "Adds to armour" : "Armour bonus", stepper(a.bonus, (n) => save(() => api.editAttachment(view.id, a.aid, { overrides: { bonus: n } })), { label: "Armour", key: "q-armour", disabled: locked || !a.own }), a.own || locked ? null : inheritedNote(view, a.from, ctx));
  }
  if (quick.pattern === "weapon" || quick.pattern === "armour" || quick.pattern === "gear") {
    row("Material", addSelect(quick.materials, String(view.fields.material ?? ""), (v) => save(() => api.setField(view.id, "material", v)), { add: "Add a material", label: "Material", key: "q-material", disabled: locked, none: "Not set" }));
    const w = weightIn(view.fields.weight, units);
    row(
      "Weight",
      stepper(w, (n) => save(() => api.setField(view.id, "weight", weightText(n, units))), { label: "Weight", key: "q-weight", disabled: locked, step: 1 }),
      h(
        "span",
        { class: "unit-switch", role: "group", "aria-label": "Units" },
        (["lb", "kg"] as const).map((u) => h("button", { class: u === units ? "on" : "", "aria-pressed": u === units ? "true" : "false", title: u === "lb" ? "Pounds" : "Kilograms", onClick: async () => (await attempt(() => api.setUnits(u)), await ctx.refresh()) }, u)),
      ),
    );
    const c = parseCost(view.fields.cost);
    const setCost = (amount: number, coin: string) => save(() => api.setField(view.id, "cost", `${amount} ${coin}`));
    row(
      "Cost",
      stepper(c?.amount ?? null, (n) => setCost(n, c?.unit || quick.coins.find((x) => x === "gp") || quick.coins[0] || "gp"), { label: "Cost", key: "q-cost", disabled: locked }),
      addSelect(quick.coins, c?.unit ?? "", (v) => setCost(c?.amount ?? 1, v), { add: "Add a coin", label: "Coin", key: "q-coin", disabled: locked, none: "Coin" }),
    );
  }

  const quickBox = rows.length ? h("div", { class: "quick" }, rows) : null;

  // ---------- How it prints ----------
  const prints = printsBox(preview ?? null);

  // ---------- More: everything else ----------
  const more = h("details", { class: "sheet-more", open: moreOpen.has(view.id) }, h("summary", null, "More: enchantments, properties, attacks, filing"), moreBody(view, categories, quick, locked, ed, ctx));
  more.addEventListener("toggle", () => (more.open ? moreOpen.add(view.id) : moreOpen.delete(view.id)));

  // ---------- What you can do with it ----------
  const actions = h(
    "div",
    { class: "sheet-actions" },
    starter && !view.readOnly
      ? h("button", { class: "button primary", onClick: () => void ownCopy(view, ctx) }, "Make my own copy")
      : view.readOnly
        ? null
        : [
            h("button", { class: "button plain", title: "A new copy of this one that goes its own way", onClick: () => void ownCopy(view, ctx) }, "Make another like it"),
            h("button", { class: "button plain", title: "A child copy that keeps following this one (Ctrl+D)", onClick: () => void variantOf(view.id, ctx) }, "Make a variant"),
          ],
    view.readOnly ? null : h("button", { class: "button plain danger-text", title: "It goes to the recycle bin", onClick: () => void removeNode(view.id, ctx) }, svg(ICONS.trash), "Delete"),
  );

  const banner = starter && !view.readOnly ? h("div", { class: "starter-banner" }, h("span", null, `This is the starter's ${view.name}. Make your own copy to change it; the starter stays as it is.`), h("button", { class: "button primary small-button", onClick: () => void ownCopy(view, ctx) }, "Make my own copy")) : null;

  return sheetFrame(view, ctx, locked, [banner, head, quickBox, prints, more, actions]);
}

/** "How it prints in the rulebook": the rulebook's own entry, folded when it is long. */
export function printsBox(preview: { title: string; stats: string | null; paragraphs: string[] } | null): HTMLElement | null {
  if (!preview) return null;
  const long = preview.paragraphs.join(" ").length > 700;
  const body = h("div", { class: `prints-body${long ? " clamped" : ""}` }, preview.paragraphs.map((p) => h("p", null, p)));
  const toggle = long ? h("button", { class: "link small" }, "Show all") : null;
  toggle?.addEventListener("click", () => (toggle.textContent = body.classList.toggle("clamped") ? "Show all" : "Show less"));
  return h("div", { class: "prints" }, h("div", { class: "eyebrow" }, "How it prints in the rulebook"), h("h3", null, preview.title), preview.stats ? h("div", { class: "prints-stats" }, preview.stats) : null, body, toggle);
}

/** The panel around a sheet: drops from the Codex land here, and Alt-click edits the parent. */
export function sheetFrame(view: NodeView, ctx: PlaceCtx, locked: boolean, children: (HTMLElement | null)[]): HTMLElement {
  const panel: HTMLElement = h(
    "section",
    {
      class: "panel editor sheet-drop",
      "data-scroll": "editor",
      onClick: (ev: MouseEvent) => {
        if (ev.altKey && view.parent && !view.readOnly) (ev.preventDefault(), void openEditParent(view, ctx));
      },
      onDragover: (ev: DragEvent) => {
        if (!ev.dataTransfer?.types.includes(DRAG_TYPE) || locked) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = "copy";
        panel.classList.add("drop-over");
      },
      onDragleave: (ev: DragEvent) => {
        if (!panel.contains(ev.relatedTarget as Node)) panel.classList.remove("drop-over");
      },
      onDrop: (ev: DragEvent) => {
        panel.classList.remove("drop-over");
        if (locked) return;
        const bricks = JSON.parse(ev.dataTransfer?.getData(DRAG_TYPE) || "[]") as string[];
        if (!bricks.length) return;
        ev.preventDefault();
        moreOpen.add(view.id);
        void drop([view.id], bricks, ctx);
      },
    },
    h("div", { class: "sheet" }, children),
  );
  if (locked && view.source === "template" && !view.readOnly)
    panel.addEventListener("drop", () => notice("Make your own copy first, so the starter stays as it is.", "blue", undefined, 5000));
  return panel;
}

/** The description: the standard one with "Write my own", or your own with "Back to the standard". */
export function description(view: NodeView, quick: QuickView, locked: boolean, ed: FieldMaker): HTMLElement {
  const standard = quick.standardText;
  if (locked) return view.text ? longText(view.text, "std-line") : h("p", { class: "std-line muted" }, "No description.");
  const usingStandard = !!standard && view.text === standard && (!view.parent || !view.own.includes("text"));
  if (usingStandard && !writing.has(view.id))
    return h(
      "div",
      { class: "std" },
      h("span", { class: "std-tag" }, "Standard description"),
      longText(standard),
      h("div", { class: "row tight" }, h("button", { class: "link", onClick: () => (writing.add(view.id), void ed.save(async () => {})) }, "Write my own"), h("span", { class: "muted small" }, "or leave it. This is what prints.")),
    );
  const box = h("textarea", { class: "text-input desc-box", rows: 3, "data-key": "f-text", placeholder: "A few words about it: what it looks like, where it comes from…", "aria-label": "Description", "data-autofocus": writing.has(view.id) ? "" : null }, view.text);
  writing.delete(view.id);
  box.addEventListener("change", () => void ed.save(() => api.setText(view.id, box.value)));
  return h(
    "div",
    null,
    box,
    standard && view.text !== standard
      ? h("button", { class: "link small", onClick: () => void ed.save(() => (view.parent && view.own.includes("text") ? api.useParentValue(view.id, "text") : api.setText(view.id, standard))) }, "Back to the standard description")
      : null,
  );
}
const writing = new Set<string>();

/** Long text (a class's whole description) shows its first few lines, with Show all. */
function longText(text: string, cls = ""): HTMLElement {
  const lines = text.split(/\n+/).filter(Boolean);
  const p = h("div", { class: `long-text ${cls}${text.length > 320 ? " clamped" : ""}` }, lines.map((l) => h("p", null, l)));
  if (text.length <= 320) return p;
  const more = h("button", { class: "link small" }, "Show all");
  more.addEventListener("click", () => {
    const open = p.classList.toggle("clamped");
    more.textContent = open ? "Show all" : "Show less";
  });
  return h("div", null, p, more);
}

function inheritedNote(view: NodeView, from: string | null, ctx: PlaceCtx): HTMLElement {
  return h("span", { class: "muted small inherited-note" }, `Comes from ${from ?? "its parent"}. `, view.parent ? h("button", { class: "link small", onClick: () => void openEditParent(view, ctx) }, "Edit parent") : null);
}

function moreBody(view: NodeView, categories: CategoryOption[], quick: QuickView, locked: boolean, ed: FieldMaker, ctx: PlaceCtx): HTMLElement {
  const sheet = view.sheet;
  const bySection = new Map<string, typeof view.attachments>();
  for (const a of view.attachments) bySection.set(a.section, [...(bySection.get(a.section) ?? []), a]);
  const sections = [...(sheet?.sections ?? []), ...[...bySection.keys()].filter((s) => !sheet?.sections.includes(s))];
  const codexFor: Record<string, Parameters<typeof showCodexSection>[0]> = { Attacks: "attacks", Enchantments: "enchantments", Properties: "traits" };
  const category = h(
    "select",
    { class: "text-input select", "data-key": "f-category", disabled: locked, "aria-label": "Filed under" },
    h("option", { value: "", selected: !view.categoryId }, "Uncategorized"),
    categories.filter((c) => c.role !== "creature" && c.role !== "race" && c.role !== "class").map((c) => h("option", { value: c.id, selected: c.id === view.categoryId }, `${"   ".repeat(c.depth)}${c.name}`)),
  );
  category.addEventListener("change", () => void ed.save(() => api.setCategory(view.id, category.value || null)));
  return h(
    "div",
    { class: "more-inner" },
    sections.map((s) =>
      h(
        "div",
        { class: "more-section" },
        h("div", { class: "section-h" }, s),
        (bySection.get(s) ?? []).map((a) => brickCard(view, a, ctx)),
        locked
          ? (bySection.get(s)?.length ? null : h("p", { class: "muted small" }, "Nothing here."))
          : h("div", { class: "drop-zone" }, `Drag ${s === "Enchantments" ? "an enchantment" : s === "Attacks" ? "an attack" : "a brick"} here from the Codex, or `, h("button", { class: "link", onClick: () => (showCodexSection(codexFor[s] ?? null), void ctx.refresh()) }, "pick one")),
      ),
    ),
    h("div", { class: "more-section" }, h("div", { class: "section-h" }, "Filed under"), category, quick.pattern !== "gear" ? null : h("p", { class: "muted small" }, "Filing it under Weapon or Armour gives it that sheet's pickers.")),
    h(
      "div",
      { class: "more-section" },
      h("div", { class: "section-h" }, "Used by"),
      view.usedBy.length ? h("ul", { class: "link-list" }, view.usedBy.map((u) => h("li", null, h("button", { class: "link", onClick: () => ctx.select(u.id) }, u.name)))) : h("p", { class: "muted small" }, "Nothing carries it yet."),
    ),
    locked
      ? null
      : h(
          "div",
          { class: "more-section" },
          h("button", { class: "link small", title: view.template ? "Make it a real thing that shows in the lists and the rulebook" : "Make it a parent that holds shared parts for other sheets", onClick: () => void ed.save(() => api.setTemplate(view.id, !view.template)) }, view.template ? "Make it a real item" : "Make it a template"),
          view.parent ? [" · ", h("button", { class: "link small", title: "Make it a fully independent copy", onClick: () => void ed.save(() => api.detach(view.id)) }, "Detach from its parent")] : null,
        ),
  );
}

/** "Make my own copy": opens the copy with its name ready to type over. */
export async function ownCopy(view: NodeView, ctx: PlaceCtx) {
  const id = await attempt(() => api.makeOwnCopy(view.id));
  if (!id) return;
  notice(`Made your own ${view.name}. Change anything you like; the original stays as it is.`, "green", { label: "Undo", run: async () => (await attempt(() => api.undo()), ctx.select(view.id)) }, 6000);
  focusName = true;
  await ctx.open(id);
}

/** Ctrl+Shift+D: a separate copy of anything in the Codex, by its id. */
export async function separateCopy(id: string, ctx: PlaceCtx) {
  const made = await attempt(() => api.makeOwnCopy(id));
  if (!made) return;
  notice("Made your own copy. It goes its own way; the original stays as it is.", "green", { label: "Undo", run: async () => (await attempt(() => api.undo()), ctx.select(id)) }, 6000);
  await ctx.open(made, { focusName: true });
}

/** Ctrl+D: a child copy that keeps following the original. */
export async function variantOf(id: string, ctx: PlaceCtx) {
  const made = await attempt(() => api.makeVariant(id));
  if (!made) return;
  notice("Made a variant. It keeps following the original, except what you change on it.", "green", { label: "Undo", run: async () => (await attempt(() => api.undo()), ctx.select(id)) }, 6000);
  focusName = true;
  await ctx.open(made);
}

/** After making a copy, the name box takes the cursor with the name selected, ready to type over. */
let focusName = false;
export function takeNameFocus() {
  if (!focusName) return;
  focusName = false;
  const el = document.querySelector<HTMLInputElement>(".sheet-name");
  if (el && !el.disabled) {
    el.focus();
    el.select();
  }
}
