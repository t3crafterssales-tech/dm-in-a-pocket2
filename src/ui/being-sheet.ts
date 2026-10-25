// Monsters, NPCs, characters, races and classes in the feel-pass pattern: the same top as an item
// (picture, name, description), their key numbers as steppers and chips, attacks and traits added
// from the Codex, and the same How it prints box and More.

import type { CategoryOption, Choices, NodeView, QuickView } from "../app/backend.ts";
import { CHALLENGES, CODEX_SECTIONS, HIT_DICE } from "../app/codex-lists.ts";
import type { CodexKey } from "../app/codex-lists.ts";
import { api, pictureUrl } from "./api.ts";
import { hintsFor } from "../app/piclib.ts";
import { choosePicture } from "./picture-chooser.ts";
import { attempt } from "./common.ts";
import { notice, openDialog } from "./dialogs.ts";
import { h, svg } from "./dom.ts";
import { FieldMaker } from "./fields.ts";
import { ICONS } from "./icons.ts";
import { codexLink, showCodexSection } from "./codex-panel.ts";
import { description, ownCopy, printsBox, sheetFrame, variantOf } from "./item-sheet.ts";
import { chips, stepper } from "./pickers.ts";
import type { PlaceCtx } from "./place.ts";
import { brickCard, levelTablePanel, removeNode, scoreRow } from "./sheets-tab.ts";

const SIZES = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"];
const SPEEDS = ["20 ft.", "25 ft.", "30 ft.", "35 ft.", "40 ft."];
const moreOpen = new Set<string>();

/** Which Codex section a sheet section's "pick one" opens. */
const CODEX_FOR: Record<string, CodexKey> = {
  "Attacks and actions": "attacks",
  "Traits and features": "traits",
  Traits: "traits",
  Features: "traits",
  Spells: "spells",
  Gear: "gear",
  "Ability bonuses": "traits",
  Languages: "traits",
  Proficiencies: "traits",
};

export async function beingSheet(view: NodeView, categories: CategoryOption[], choices: Choices, ctx: PlaceCtx): Promise<HTMLElement> {
  const [q, preview] = await Promise.all([attempt(() => api.quick(view.id)), attempt(() => api.printPreview(view.id))]);
  const quick: QuickView = q ?? { pattern: "being", section: "monsters", attack: null, armour: null, armourTypes: [], materials: [], coins: [], damageTypes: [], standardText: null };
  const ed = new FieldMaker(view, ctx);
  const starter = view.source === "template";
  const locked = view.readOnly || starter;
  const save = (fn: () => Promise<unknown>) => void ed.save(fn);
  const kind = String(view.fields.beingKind ?? "monster");
  const section = CODEX_SECTIONS.find((s) => s.key === quick.section);
  const setField = (k: string, v: string | number) => save(() => api.setField(view.id, k, v));
  const num = (k: string) => (typeof view.fields[k] === "number" ? (view.fields[k] as number) : null);

  const pic = h(
    "button",
    { class: `portrait${view.picture ? "" : " empty"}`, disabled: locked, title: view.picture ? "Change the picture" : "Add a picture", "aria-label": "Picture" },
    view.picture ? h("img", { src: pictureUrl(view.picture), alt: "" }) : [h("span", { class: "portrait-icon", "aria-hidden": "true" }, section?.icon ?? "🐉"), h("span", null, "Add picture")],
  );
  pic.addEventListener("click", async () => {
    const id = await choosePicture({ hints: hintsFor(view.name, section?.one ?? "", kind) });
    if (id) save(() => api.setPicture(view.id, id));
  });
  const name = h("input", { class: "sheet-name", value: view.name, "data-key": "f-name", "aria-label": "Name", disabled: locked, maxlength: 200 });
  name.addEventListener("change", () => name.value.trim() && save(() => api.rename(view.id, name.value)));
  name.addEventListener("keydown", (e) => e.key === "Enter" && name.blur());
  const tags = h(
    "div",
    { class: "sheet-tags" },
    section ? h("span", { class: "tag accent" }, `${section.icon} ${section.one[0]!.toUpperCase()}${section.one.slice(1)}`) : null,
    view.parent ? h("span", { class: "tag" }, `${kind === "class" ? "Subclass of" : kind === "race" ? "Subrace of" : "Variant of"} `, h("button", { class: "link", onClick: () => ctx.select(view.parent!.id) }, view.parent.name)) : null,
    starter ? h("span", { class: "tag" }, "From the starter") : view.source === "others" ? h("span", { class: "tag" }, view.author ? `By ${view.author}` : "From others") : h("span", { class: "tag" }, "Made by you"),
    view.template ? h("span", { class: "tag" }, "Template") : null,
  );
  const head = h("div", { class: "sheet-top" }, pic, h("div", { class: "sheet-top-text" }, name, description(view, quick, locked, ed), tags));

  // ---------- Key numbers ----------
  const rows: HTMLElement[] = [];
  const row = (label: string, ...control: (HTMLElement | null)[]) => rows.push(h("div", { class: "quick-row" }, h("div", { class: "quick-label" }, label, ed.pencil(keyOf(label))), h("div", { class: "quick-control" }, control)));
  if (kind === "monster" || kind === "npc") {
    const cr = String(view.fields.cr ?? "");
    const sel = h("select", { class: "text-input select pick-select", "aria-label": "Challenge", "data-key": "q-cr", disabled: locked }, cr && !CHALLENGES.includes(cr) ? h("option", { value: cr, selected: true }, cr) : null, cr ? null : h("option", { value: "", selected: true }, "Not set"), CHALLENGES.map((c) => h("option", { value: c, selected: c === cr }, c)));
    sel.addEventListener("change", () => setField("cr", sel.value));
    row("Challenge", sel);
  }
  if (kind === "character") row("Level", stepper(num("level"), (n) => setField("level", Math.min(20, Math.max(1, n))), { label: "Level", key: "q-level", min: 1, disabled: locked }));
  if (kind === "monster" || kind === "npc" || kind === "character") {
    row("Hit points", stepper(num("hp"), (n) => setField("hp", n), { label: "Hit points", key: "q-hp", disabled: locked }));
    row("Armour", stepper(num("ac"), (n) => setField("ac", n), { label: "Armour", key: "q-ac", disabled: locked }));
  }
  if (kind === "race") row("Size", chips(SIZES, String(view.fields.size ?? ""), (v) => setField("size", v), { disabled: locked, label: "Size" }));
  if (kind !== "class") row("Speed", chips(SPEEDS, String(view.fields.speed ?? ""), (v) => setField("speed", v), { disabled: locked, other: "Speed, such as 30 ft., fly 60 ft.", label: "Speed" }));
  if (kind === "class") {
    row("Hit die", chips(HIT_DICE, String(view.fields.hitDie ?? ""), (v) => setField("hitDie", v), { disabled: locked, other: "Another die, such as d4 or 2d6", label: "Hit die" }));
    row("Levels", stepper(num("maxLevel") ?? 20, (n) => setField("maxLevel", Math.min(30, Math.max(1, n))), { label: "Levels", key: "q-levels", min: 1, disabled: locked }));
  }
  const scores = view.sheet?.scores ? h("div", { class: "quick-scores" }, h("div", { class: "quick-label" }, "Ability scores"), scoreRow(view, choices, ed)) : null;
  const quickBox = h("div", { class: "quick" }, rows, scores);

  // ---------- What it can do: attacks, traits, spells, gear ----------
  const bySection = new Map<string, typeof view.attachments>();
  for (const a of view.attachments) bySection.set(a.section, [...(bySection.get(a.section) ?? []), a]);
  const sheetSections = [...(view.sheet?.sections ?? []), ...[...bySection.keys()].filter((s) => !view.sheet?.sections.includes(s))];
  const parts = h(
    "div",
    { class: "being-parts" },
    view.levels ? levelTablePanel(view, ctx) : null,
    sheetSections.map((s) =>
      h(
        "div",
        { class: "more-section", "data-codex": CODEX_FOR[s] ?? null },
        h("div", { class: "section-h" }, s),
        s === "Choices" ? choicesHint(view, locked, ctx) : null,
        (bySection.get(s) ?? []).map((a) => brickCard(view, a, ctx)),
        locked || s === "Choices"
          ? null
          : h("div", { class: "drop-zone" }, "Drag from the Codex, or ", codexLink(CODEX_FOR[s] ?? null, ctx)),
      ),
    ),
  );

  const prints = printsBox(preview ?? null);

  const category = h(
    "select",
    { class: "text-input select", "data-key": "f-category", disabled: locked, "aria-label": "Filed under" },
    h("option", { value: "", selected: !view.categoryId }, "Uncategorized"),
    categories.map((c) => h("option", { value: c.id, selected: c.id === view.categoryId }, `${"   ".repeat(c.depth)}${c.name}`)),
  );
  category.addEventListener("change", () => save(() => api.setCategory(view.id, category.value || null)));
  const more = h(
    "details",
    { class: "sheet-more", open: moreOpen.has(view.id) },
    h("summary", null, "More: filing, used by, template"),
    h(
      "div",
      { class: "more-inner" },
      h("div", { class: "more-section" }, h("div", { class: "section-h" }, "Filed under"), category),
      h("div", { class: "more-section" }, h("div", { class: "section-h" }, "Used by"), view.usedBy.length ? h("ul", { class: "link-list" }, view.usedBy.map((u) => h("li", null, h("button", { class: "link", onClick: () => ctx.select(u.id) }, u.name)))) : h("p", { class: "muted small" }, "Nothing uses it yet.")),
      locked
        ? null
        : h(
            "div",
            { class: "more-section" },
            h("button", { class: "link small", onClick: () => save(() => api.setTemplate(view.id, !view.template)) }, view.template ? "Make it real" : "Make it a template"),
            view.parent ? [" · ", h("button", { class: "link small", onClick: () => save(() => api.detach(view.id)) }, "Detach from its parent")] : null,
          ),
    ),
  );
  more.addEventListener("toggle", () => (more.open ? moreOpen.add(view.id) : moreOpen.delete(view.id)));

  const actions = h(
    "div",
    { class: "sheet-actions" },
    starter && !view.readOnly
      ? h("button", { class: "button primary", onClick: () => void ownCopy(view, ctx) }, "Make my own copy")
      : view.readOnly
        ? null
        : [
            h("button", { class: "button plain", onClick: () => void ownCopy(view, ctx) }, "Make another like it"),
            h("button", { class: "button plain", title: kind === "class" ? "A subclass that keeps following this class (Ctrl+D)" : "A child copy that keeps following this one (Ctrl+D)", onClick: () => void variantOf(view.id, ctx) }, kind === "class" ? "Make a subclass" : kind === "race" ? "Make a subrace" : "Make a variant"),
          ],
    view.readOnly ? null : h("button", { class: "button plain danger-text", onClick: () => void removeNode(view.id, ctx) }, svg(ICONS.trash), "Delete"),
  );
  const banner = starter && !view.readOnly ? h("div", { class: "starter-banner" }, h("span", null, `This is the starter's ${view.name}. Make your own copy to change it; the starter stays as it is.`), h("button", { class: "button primary small-button", onClick: () => void ownCopy(view, ctx) }, "Make my own copy")) : null;
  return sheetFrame(view, ctx, locked, [banner, head, quickBox, parts, prints, more, actions]);
}

function keyOf(label: string): string {
  return ({ Challenge: "cr", Level: "level", "Hit points": "hp", Armour: "ac", Size: "size", Speed: "speed", "Hit die": "hitDie", Levels: "maxLevel" } as Record<string, string>)[label] ?? label;
}

/** Backlog 8: what a Choices box is for, and "+ Add a choice". */
function choicesHint(view: NodeView, locked: boolean, ctx: PlaceCtx): HTMLElement {
  return h(
    "div",
    { class: "choices-hint" },
    h("p", { class: "muted small" }, "A Choices box lets a player pick from a few options when they take this, such as one fighting style from Archery, Defense or Dueling. Make the box, then drag the options onto it from the Codex, or ", codexLink("traits", ctx), "."),
    locked ? null : h("button", { class: "button plain small-button", onClick: () => void addChoice(view, ctx) }, svg(ICONS.plus), "Add a choice"),
  );
}

function addChoice(view: NodeView, ctx: PlaceCtx) {
  const d = openDialog("Add a choice");
  const label = h("input", { class: "text-input", placeholder: "For example: fighting style", maxlength: 120, "aria-label": "What is chosen" });
  let pick = 1;
  const pickBox = h("div");
  const drawPick = () => pickBox.replaceChildren(stepper(pick, (n) => ((pick = Math.max(1, n)), drawPick()), { label: "How many", key: "choice-pick", min: 1 }));
  drawPick();
  const ok = h("button", { class: "button primary" }, "Add");
  const accept = async () => {
    if (!label.value.trim()) return label.focus();
    const id = await attempt(() => api.addChoice(view.id, { label: label.value, pick, options: [] }));
    if (!id) return;
    d.close();
    notice("Now drag the options onto the new Choices box from the Codex.", "blue", undefined, 7000);
    showCodexSection(view.fields.beingKind === "class" ? "traits" : "traits");
    await ctx.refresh();
  };
  ok.addEventListener("click", () => void accept());
  label.addEventListener("keydown", (e) => e.key === "Enter" && (e.preventDefault(), void accept()));
  d.body.append(h("label", { class: "field-label" }, "What is chosen?"), label, h("label", { class: "field-label spaced" }, "How many can they pick?"), pickBox);
  d.footer.append(h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"), ok);
  label.focus();
}
