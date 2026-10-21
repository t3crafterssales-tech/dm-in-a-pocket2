// The Beings and Items tabs: a list on the left (variants indented under their parents) and the
// open sheet in the middle, with its header numbers, ability scores and sections.

import type { AttachmentView, BeingKind, CategoryOption, Choices, NodeView } from "../app/backend.ts";
import { api, pictureUrl } from "./api.ts";
import { attempt } from "./common.ts";
import { notice, openDialog } from "./dialogs.ts";
import { h, svg } from "./dom.ts";
import { FieldMaker } from "./fields.ts";
import { ICONS } from "./icons.ts";
import { openDrill } from "./drill-dialog.ts";
import { openEditParent } from "./edit-parent.ts";
import { openEditSystem } from "./edit-system.ts";
import { DRAG_TYPE, brickEditor, drop } from "./library-panel.ts";
import { codexPanel } from "./codex-panel.ts";
import { itemSheet } from "./item-sheet.ts";
import { startScreen } from "./start-screen.ts";
import type { PlaceCtx } from "./place.ts";

export const BEING_TABS: { id: BeingKind; label: string; plural: string }[] = [
  { id: "character", label: "Character", plural: "Characters" },
  { id: "class", label: "Class", plural: "Classes" },
  { id: "race", label: "Race", plural: "Races" },
  { id: "monster", label: "Monster", plural: "Monsters" },
  { id: "npc", label: "NPC", plural: "NPCs" },
];

/**
 * The Beings and Items tabs: the open sheet in the middle and the Codex on the right (the left-hand
 * list is gone, milestone 11). With nothing open, the middle shows "What do you want to make?".
 */
export async function sheetPanels(ctx: PlaceCtx, which: "beings" | "items"): Promise<{ list: HTMLElement; editor: HTMLElement }> {
  const [categories, choices] = await Promise.all([attempt(() => api.categories()), attempt(() => api.choices())]);
  let view: NodeView | null = null;
  if (ctx.selected) {
    try {
      view = await api.node(ctx.selected);
      if (view.kind !== "being" && view.kind !== "item" && view.kind !== "brick") view = null;
    } catch {
      view = null;
    }
  }
  const c = choices ?? { abilities: [], conditions: [], resources: [] };
  const list = await codexPanel(ctx);
  const open = view;
  const targets = () => (open && open.kind !== "brick" ? { ids: [open.id], names: open.name } : { ids: [] as string[], names: "" });
  let editor: HTMLElement;
  if (!open) editor = await startScreen(ctx);
  else if (open.kind === "brick") editor = brickEditor(open, c, ctx, () => void remove(open.id, ctx));
  else if (open.kind === "item") editor = await itemSheet(open, categories ?? [], c, ctx);
  else editor = sheetEditor(open, which, categories ?? [], c, ctx, targets);
  return { list, editor };
}

export async function removeNode(id: string, ctx: PlaceCtx) {
  return remove(id, ctx);
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
        view.source === "others" ? h("span", { class: "chip others-chip", title: "Made by someone else and imported" }, view.author ? `By ${view.author}` : "From others") : null,
        view.source === "template" ? h("span", { class: "chip muted", title: "Came with the starter this system began from" }, "From the starter") : null,
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
        view.fromBelow && !ro && ctx.view.type === "world" ? h("button", { class: "link small", title: "Change the system's version, and choose which worlds get it", onClick: () => void openEditSystem(view.id, ctx) }, "Edit in the system") : null,
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

  const scores = sheet.scores
    ? h(
        "div",
        null,
        scoreRow(view, choices, ed),
        view.pointBuy
          ? h(
              "p",
              { class: `small point-buy${view.pointBuy.spent > view.pointBuy.points || view.pointBuy.problems.length ? " over" : ""}` },
              `${view.pointBuy.rule}: ${view.pointBuy.spent} of ${view.pointBuy.points} points spent`,
              view.pointBuy.spent < view.pointBuy.points ? `, ${view.pointBuy.points - view.pointBuy.spent} left` : view.pointBuy.spent > view.pointBuy.points ? `, ${view.pointBuy.spent - view.pointBuy.points} too many` : "",
              view.pointBuy.problems.length ? `. ${view.pointBuy.problems.join("; ")}.` : ".",
            )
          : null,
      )
    : view.levels
      ? levelTablePanel(view, ctx)
      : null;
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
export function brickCard(view: NodeView, a: AttachmentView, ctx: PlaceCtx) {
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

const FEATURE_DRAG = "application/x-dm-feature";

/**
 * A class's level table: drag bricks from the Library onto a row to add them at that level, or
 * drag a feature from one row to another. Features dropped elsewhere on the sheet wait at the
 * bottom until they are given a level.
 */
function levelTablePanel(view: NodeView, ctx: PlaceCtx): HTMLElement {
  const t = view.levels!;
  const ro = view.readOnly;
  const done = async (r: { label: string } | undefined) => {
    if (r) notice(`${r.label}.`, "green", { label: "Undo", run: async () => (await attempt(() => api.undo()), await ctx.refresh()) }, 5000);
    await ctx.refresh();
  };
  const dropZone = (level: number | null) => ({
    onDragover: (ev: DragEvent) => {
      const types = ev.dataTransfer?.types ?? [];
      if (ro || !(types.includes(DRAG_TYPE) || types.includes(FEATURE_DRAG))) return;
      ev.preventDefault();
      ev.stopPropagation();
      (ev.currentTarget as HTMLElement).classList.add("drop-over");
    },
    onDragleave: (ev: DragEvent) => (ev.currentTarget as HTMLElement).classList.remove("drop-over"),
    onDrop: (ev: DragEvent) => {
      if (ro) return;
      ev.preventDefault();
      ev.stopPropagation();
      (ev.currentTarget as HTMLElement).classList.remove("drop-over");
      document.querySelector(".sheet-drop")?.classList.remove("drop-over");
      const feature = ev.dataTransfer!.getData(FEATURE_DRAG);
      if (feature) return void attempt(() => api.setFeatureLevel(view.id, feature, level)).then(done);
      const bricks = JSON.parse(ev.dataTransfer!.getData(DRAG_TYPE) || "[]") as string[];
      if (!bricks.length) return;
      if (level === null) return void drop([view.id], bricks, ctx);
      void attempt(() => api.attachAtLevel(view.id, bricks, level)).then(done);
    },
  });
  const chip = (f: NonNullable<NodeView["levels"]>["unplaced"][number]) =>
    h(
      "span",
      {
        class: `chip level-feature${f.from ? " inherited" : ""}`,
        draggable: ro ? "false" : "true",
        title: `${f.sentence}${f.from ? ` (from ${f.from})` : ""}${ro ? "" : " Drag it to another level."}`,
        onDragstart: (ev: DragEvent) => ev.dataTransfer?.setData(FEATURE_DRAG, f.aid),
      },
      f.name,
    );
  return h(
    "div",
    { class: "level-table" },
    h("div", { class: "sheet-section-title" }, "Level table", h("span", { class: "muted small" }, ro ? "" : " Drag bricks from the Library onto a level, or drag a feature to another level.")),
    h(
      "ol",
      { class: "level-rows" },
      t.rows.map((r) => h("li", { class: `level-row${r.features.length ? "" : " empty"}`, ...dropZone(r.level) }, h("span", { class: "level-num" }, `Level ${r.level}`), h("span", { class: "level-features" }, r.features.length ? r.features.map(chip) : h("span", { class: "muted small" }, "—")))),
    ),
    t.unplaced.length ? h("div", { class: "level-row unplaced", ...dropZone(null) }, h("span", { class: "level-num" }, "No level yet"), h("span", { class: "level-features" }, t.unplaced.map(chip))) : null,
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
