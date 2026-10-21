// The Beings and Items tabs: the open sheet in the middle and the Codex on the right, plus the pieces
// the item and being sheets share (brick cards, the score row, the level table).

import type { AttachmentView, BeingKind, Choices, NodeView } from "../app/backend.ts";
import { api } from "./api.ts";
import { attempt } from "./common.ts";
import { notice } from "./dialogs.ts";
import { h, svg } from "./dom.ts";
import { FieldMaker } from "./fields.ts";
import { ICONS } from "./icons.ts";
import { openDrill } from "./drill-dialog.ts";
import { DRAG_TYPE, brickEditor, drop } from "./library-panel.ts";
import { NODE_DRAG, codexPanel } from "./codex-panel.ts";
import { itemSheet } from "./item-sheet.ts";
import { beingSheet } from "./being-sheet.ts";
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
export async function sheetPanels(ctx: PlaceCtx, _which: "beings" | "items"): Promise<{ list: HTMLElement; editor: HTMLElement }> {
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
  let editor: HTMLElement;
  if (!open) editor = await startScreen(ctx);
  else if (open.kind === "brick") editor = brickEditor(open, c, ctx, () => void remove(open.id, ctx));
  else if (open.kind === "item") editor = await itemSheet(open, categories ?? [], c, ctx);
  else editor = await beingSheet(open, categories ?? [], c, ctx);
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

// ---------- Pieces the item and being sheets share ----------

/** A brick on a sheet: what it does in plain words, where it came from, and a remove button. */
export function brickCard(view: NodeView, a: AttachmentView, ctx: PlaceCtx) {
  const own = !a.from;
  return h(
    "div",
    {
      class: `brick-card clickable${a.missing ? " broken" : ""}${own ? "" : " inherited"}`,
      "data-key": `card-${a.aid}`,
      // Ctrl+D over a brick on a sheet makes a variant of the brick itself.
      "data-node": a.brickId && !a.missing ? a.brickId : null,
      tabindex: 0,
      title: own ? "Click to change it on this sheet only. Drop a brick here to put it inside." : `Comes from ${a.from!.name}`,
      onClick: (ev: MouseEvent) => {
        if ((ev.target as HTMLElement).closest("button") || ev.altKey) return;
        void openDrill(view, a.aid, ctx);
      },
      onKeydown: (ev: KeyboardEvent) => ev.key === "Enter" && ev.target === ev.currentTarget && void openDrill(view, a.aid, ctx),
      // Dropping a brick onto a card nests it inside: it happens only when this one does.
      onDragover: (ev: DragEvent) => {
        if (!own || view.readOnly || !(ev.dataTransfer?.types.includes(DRAG_TYPE) || (a.type === "choice" && ev.dataTransfer?.types.includes(NODE_DRAG)))) return;
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
        (ev.currentTarget as HTMLElement).classList.remove("drop-over");
        const bricks = JSON.parse(ev.dataTransfer!.getData(DRAG_TYPE) || "[]") as string[];
        // Dropped on a Choices box, things become its options (anything in the Codex can be one).
        if (a.type === "choice") {
          const nodes = (JSON.parse(ev.dataTransfer!.getData(NODE_DRAG) || "{}") as { ids?: string[] }).ids ?? bricks;
          void (async () => {
            if (nodes.length && (await attempt(() => api.addChoiceOptions(view.id, a.aid, nodes))) !== undefined) notice(`Added ${nodes.length === 1 ? "an option" : `${nodes.length} options`} to the choice.`, "green", { label: "Undo", run: async () => (await attempt(() => api.undo()), await ctx.refresh()) }, 6000);
            await ctx.refresh();
          })();
          return;
        }
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
export function levelTablePanel(view: NodeView, ctx: PlaceCtx): HTMLElement {
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
export function scoreRow(view: NodeView, choices: Choices, ed: FieldMaker) {
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
