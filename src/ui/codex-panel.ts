// The Codex on the right of the world screen: everything in the game sorted into sections, like
// Foundry's compendiums. Open a section, find, sort and filter; drag things onto the sheet to add
// them; drag them onto another section (or use Move to) to refile them.

import type { CodexEntry, CodexKey, CodexSection } from "../app/backend.ts";
import { CODEX_SECTIONS } from "../app/codex-lists.ts";
import { api } from "./api.ts";
import { attempt } from "./common.ts";
import { notice } from "./dialogs.ts";
import { h } from "./dom.ts";
import { DRAG_TYPE } from "./library-panel.ts";
import type { PlaceCtx } from "./place.ts";
import { pinThing } from "./floating-pins.ts";

/** Dragging things themselves (to refile them), as opposed to bricks to attach. */
export const NODE_DRAG = "application/x-dm-nodes";

type Sort = "az" | "cost" | "cr";
type Show = "all" | "mine" | "template" | "others";

const state: { open: CodexKey | null; find: string; sort: Sort; show: Show } = { open: null, find: "", sort: "az", show: "all" };
/** Entries picked with Ctrl-click and Shift-click, to drag several at once. */
const picked = new Set<string>();
let anchor: string | null = null;

/** Opens a section of the Codex (from a sheet's "pick one" link, for example). */
export function showCodexSection(key: CodexKey | null) {
  if (state.open !== key) state.find = "";
  state.open = key;
}

/** A clear link that opens the Codex on the right to the kind of bricks that can go here ("Open Traits and features in the Codex"). */
export function codexLink(key: CodexKey | null, ctx: PlaceCtx): HTMLElement {
  const title = key ? CODEX_SECTIONS.find((c) => c.key === key)?.title : null;
  return h("button", { class: "link codex-link", title: "Opens the Codex on the right so you can drag or pick from it", onClick: () => (showCodexSection(key), void ctx.refresh()) }, title ? `open ${title} in the Codex` : "open the Codex", " →");
}

export function codexOpen(): CodexKey | null {
  return state.open;
}

let lastCtx: PlaceCtx | null = null;
let autoOpen = true;

/** Touching a part of a sheet that takes things from the Codex (traits, attacks, spells...) opens that list. */
function followWork(e: Event) {
  if (!autoOpen || !lastCtx) return;
  const key = (e.target as HTMLElement | null)?.closest?.<HTMLElement>("[data-codex]")?.dataset.codex as CodexKey | undefined;
  if (!key || key === state.open) return;
  const old = document.querySelector<HTMLElement>(".side-list.codex");
  if (!old) return; // this tab has no Codex on the side
  showCodexSection(key);
  const ctx = lastCtx;
  // Only the side list is redrawn, so a box you're typing in keeps the cursor.
  void codexPanel(ctx).then((fresh) => {
    fresh.classList.add("side-list");
    document.querySelector(".side-list.codex")?.replaceWith(fresh);
  });
}
document.addEventListener("pointerdown", followWork, true);
document.addEventListener("focusin", followWork, true);

export async function codexPanel(ctx: PlaceCtx): Promise<HTMLElement> {
  lastCtx = ctx;
  autoOpen = (await attempt(() => api.settings()))?.autoCodex !== false;
  const sections = (await attempt(() => api.codex())) ?? [];
  const head = h(
    "div",
    { class: "codex-head" },
    h("h2", null, "Codex"),
    state.open ? h("button", { class: "button plain small-button", onClick: () => (showCodexSection(null), void ctx.refresh()) }, "All sections") : null,
  );
  if (!state.open)
    return h(
      "div",
      { class: "codex" },
      head,
      h("p", { class: "codex-hint" }, "Everything in your game, sorted into sections. Open one, then drag what you need onto your sheet."),
      h(
        "div",
        { class: "codex-sections", "data-scroll": "codex-home" },
        sections
          .filter((s) => s.entries.length || s.key !== "templates")
          .map((s) =>
            h(
              "button",
              { class: "codex-section", ...sectionDrop(s, ctx), onClick: () => (showCodexSection(s.key), void ctx.refresh()) },
              h("span", { class: "codex-icon", "aria-hidden": "true" }, s.icon),
              h("span", { class: "codex-section-text" }, h("b", null, s.title), h("small", null, s.entries.length ? `${s.entries.length}${s.mine ? ` · ${s.mine} yours` : ""}` : "None yet")),
            ),
          ),
      ),
    );

  const s = sections.find((x) => x.key === state.open) ?? sections[0]!;
  const sortable = s.key === "monsters" || s.key === "npcs" ? "cr" : ["weapons", "armour", "gear", "magic"].includes(s.key) ? "cost" : null;
  if (state.sort !== "az" && state.sort !== sortable) state.sort = "az";
  const find = h("input", { class: "text-input small-input codex-find", type: "search", placeholder: `Find in ${s.title.toLowerCase()}…`, value: state.find, "data-key": "codex-find", "aria-label": "Find" });
  find.addEventListener("input", () => ((state.find = find.value), void ctx.refresh()));
  const sort = h(
    "select",
    { class: "text-input select small-select", "aria-label": "Sort", title: "Sort" },
    h("option", { value: "az", selected: state.sort === "az" }, "A to Z"),
    sortable === "cost" ? h("option", { value: "cost", selected: state.sort === "cost" }, "Cost") : null,
    sortable === "cr" ? h("option", { value: "cr", selected: state.sort === "cr" }, "Challenge") : null,
  );
  sort.addEventListener("change", () => ((state.sort = sort.value as Sort), void ctx.refresh()));
  const show = h(
    "select",
    { class: "text-input select small-select", "aria-label": "Show", title: "Show everything, or only what you made, what came with the starter, or what came from other people" },
    (
      [
        ["all", "Everything"],
        ["mine", "Made by me"],
        ["template", "Starter only"],
        ["others", "From others"],
      ] as const
    ).map(([v, l]) => h("option", { value: v, selected: state.show === v }, l)),
  );
  show.addEventListener("change", () => ((state.show = show.value as Show), void ctx.refresh()));

  const q = state.find.trim().toLowerCase();
  const list = s.entries
    .filter((e) => (state.show === "all" || e.source === state.show) && (!q || e.name.toLowerCase().includes(q) || e.sub.toLowerCase().includes(q)))
    .sort((a, b) => (state.sort === "cost" ? (a.cost ?? Infinity) - (b.cost ?? Infinity) : state.sort === "cr" ? (a.cr ?? Infinity) - (b.cr ?? Infinity) : 0) || a.name.localeCompare(b.name));
  for (const id of [...picked]) if (!list.some((e) => e.id === id)) picked.delete(id);
  // Long sections show the first few hundred; Find narrows them down.
  const shown = list.slice(0, 300);
  return h(
    "div",
    { class: "codex" },
    head,
    h(
      "div",
      { class: "codex-pills", role: "tablist", "aria-label": "Sections" },
      sections
        .filter((x) => x.entries.length || x.key === s.key)
        .map((x) =>
          h(
            "button",
            { class: `codex-pill${x.key === s.key ? " on" : ""}`, role: "tab", "aria-selected": x.key === s.key ? "true" : "false", title: x.title, ...sectionDrop(x, ctx), onClick: () => (showCodexSection(x.key), void ctx.refresh()) },
            h("span", { "aria-hidden": "true" }, x.icon),
            ` ${x.title}`,
          ),
        ),
    ),
    h("div", { class: "codex-view" }, find, sortable ? sort : null, show),
    h(
      "div",
      { class: "codex-entries", "data-scroll": `codex-${s.key}` },
      shown.length ? shown.map((e) => entry(e, s, sections, shown, ctx)) : h("p", { class: "muted small pad" }, s.entries.length ? "Nothing matches." : `No ${s.title.toLowerCase()} yet. Use + New to make one.`),
      list.length > shown.length ? h("p", { class: "muted small pad" }, `${list.length - shown.length} more. Type in Find to narrow it down.`) : null,
    ),
    h("p", { class: "codex-hint" }, s.moveTo.length ? "Drag onto your sheet to add it. Drag onto a section above to move it there." : "Drag onto your sheet to add it."),
  );
}

function entry(e: CodexEntry, s: CodexSection, sections: CodexSection[], visible: CodexEntry[], ctx: PlaceCtx): HTMLElement {
  const ro = ctx.view.readOnly;
  const move = s.moveTo.length && !ro
    ? (() => {
        const sel = h(
          "select",
          { class: "codex-move", title: "Move to another section", "aria-label": `Move ${e.name} to` },
          h("option", { value: "" }, "Move to…"),
          s.moveTo.map((k) => h("option", { value: k }, sections.find((x) => x.key === k)?.title ?? k)),
        );
        sel.addEventListener("click", (ev) => ev.stopPropagation());
        sel.addEventListener("change", () => sel.value && void refile([e.id], sel.value as CodexKey, sections, ctx));
        return sel;
      })()
    : null;
  return h(
    "div",
    {
      class: `codex-entry${e.id === ctx.selected ? " open" : ""}${picked.has(e.id) ? " picked" : ""}`,
      tabindex: 0,
      draggable: ro ? "false" : "true",
      "data-key": `cx-${e.id}`,
      "data-node": e.id,
      title: "Click to open. Drag onto a sheet to add it. Ctrl-click or Shift-click to pick several.",
      onClick: (ev: MouseEvent) => {
        if ((ev.target as HTMLElement).closest("select")) return;
        if (ev.ctrlKey || ev.metaKey) {
          if (picked.has(e.id)) picked.delete(e.id);
          else picked.add(e.id);
          anchor = e.id;
          return void ctx.refresh();
        }
        if (ev.shiftKey && anchor) {
          const a = visible.findIndex((x) => x.id === anchor);
          const b = visible.findIndex((x) => x.id === e.id);
          if (a >= 0 && b >= 0) for (const x of visible.slice(Math.min(a, b), Math.max(a, b) + 1)) picked.add(x.id);
          return void ctx.refresh();
        }
        picked.clear();
        anchor = e.id;
        void ctx.open(e.id);
      },
      onKeydown: (ev: KeyboardEvent) => ev.key === "Enter" && void ctx.open(e.id),
      onDragstart: (ev: DragEvent) => {
        if (!picked.has(e.id)) {
          picked.clear();
          picked.add(e.id);
        }
        const ids = [...picked];
        const attachable = ids.filter((id) => visible.find((x) => x.id === id)?.attachable ?? id === e.id);
        if (attachable.length) ev.dataTransfer!.setData(DRAG_TYPE, JSON.stringify(attachable));
        ev.dataTransfer!.setData(NODE_DRAG, JSON.stringify({ ids, from: s.key }));
        ev.dataTransfer!.effectAllowed = "copyMove";
        document.body.classList.add("dragging-bricks");
      },
      onDragend: () => document.body.classList.remove("dragging-bricks"),
    },
    h("span", { class: "codex-icon small", "aria-hidden": "true" }, s.icon),
    h(
      "span",
      { class: "codex-entry-text" },
      h("b", null, e.name, e.source === "mine" ? h("span", { class: "mine-tag" }, "Yours") : e.source === "others" ? h("span", { class: "mine-tag others" }, "From others") : null),
      e.sub ? h("small", null, e.sub) : null,
    ),
    h("button", { class: "codex-pin", title: "Pin it to the screen (Ctrl+Shift+P)", "aria-label": `Pin ${e.name}`, onClick: (ev: MouseEvent) => (ev.stopPropagation(), void pinThing(e.id)) }, "📌"),
    move,
  );
}

/** A section button takes things dragged from another section, and refiles them there. */
function sectionDrop(s: CodexSection, ctx: PlaceCtx) {
  return {
    onDragover: (ev: DragEvent) => {
      if (ctx.view.readOnly || !ev.dataTransfer?.types.includes(NODE_DRAG)) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "move";
      (ev.currentTarget as HTMLElement).classList.add("drop-over");
    },
    onDragleave: (ev: DragEvent) => (ev.currentTarget as HTMLElement).classList.remove("drop-over"),
    onDrop: (ev: DragEvent) => {
      ev.preventDefault();
      (ev.currentTarget as HTMLElement).classList.remove("drop-over");
      const data = JSON.parse(ev.dataTransfer!.getData(NODE_DRAG) || "{}") as { ids?: string[]; from?: CodexKey };
      if (!data.ids?.length || data.from === s.key) return;
      void (async () => {
        const all = (await attempt(() => api.codex())) ?? [];
        await refile(data.ids!, s.key, all, ctx);
      })();
    },
  };
}

async function refile(ids: string[], to: CodexKey, sections: CodexSection[], ctx: PlaceCtx) {
  const title = sections.find((x) => x.key === to)?.title ?? to;
  if ((await attempt(() => api.refile(ids, to))) !== undefined) {
    picked.clear();
    notice(`${ids.length === 1 ? "Moved it" : `Moved ${ids.length} things`} to ${title}.`, "green", { label: "Undo", run: async () => (await attempt(() => api.undo()), await ctx.refresh()) }, 6000);
  }
  await ctx.refresh();
}
