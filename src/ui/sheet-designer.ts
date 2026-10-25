// The sheet designer (version 2.6): the character's groups as cards on a twelve-column page.
// Drag a card to move it (the others slide out of the way), drag its right edge to make it wider
// or narrower, and use the collapsible panel on the right to choose what prints: unticked lines
// become blank boxes to write in, or vanish when "hide" is on. Every change is saved at once as
// the character's own layout, one undoable step each.

import type { CharacterView, SheetDesign, SheetGroup, SheetLayout, SheetLine } from "../app/backend.ts";
import { GRID, MIN_SPAN, hideLines, moveGroup, resizeGroup, tickLines } from "../app/sheetdesign.ts";
import { api } from "./api.ts";
import { attempt } from "./common.ts";
import { notice, openDialog } from "./dialogs.ts";
import { h } from "./dom.ts";
import type { PlaceCtx } from "./place.ts";

/** The character whose sheet is being designed, if any. */
let designing: string | null = null;
export const isDesigning = (id: string) => designing === id;
export const startDesigning = (id: string) => (designing = id);
export const stopDesigning = () => (designing = null);

const GROUP_DRAG = "application/x-dmip-sheet-group";
let panelOpen = true;

export async function designerPanel(v: CharacterView, design: SheetDesign, ctx: PlaceCtx): Promise<HTMLElement> {
  const ro = ctx.view.readOnly;
  const layout = design.layout;
  const byId = new Map(design.groups.map((g) => [g.id, g]));
  const change = async (next: SheetLayout) => {
    if (ro) return;
    if ((await attempt(() => api.setSheetLayout(v.id, next))) !== undefined) await ctx.refresh();
  };

  // ---------- The page: group cards ----------
  const grid = h("div", { class: "designer-grid", "aria-label": "The sheet" });
  const cards = layout.groups.filter((g) => byId.has(g.id));
  cards.forEach((g, index) => {
    const group = byId.get(g.id)!;
    const card = h("div", { class: "designer-card", draggable: !ro, "data-group": g.id, style: `--span:${g.span}` });
    const small = (label: string, title: string, run: () => void, disabled = false) => h("button", { class: "icon-button tiny", title, "aria-label": `${title}: ${group.title}`, disabled: ro || disabled, onClick: run }, label);
    card.append(
      h(
        "div",
        { class: "designer-card-head" },
        h("span", { class: "designer-grip", "aria-hidden": "true" }, "⠿"),
        h("strong", null, group.title),
        h("span", { class: "grow" }),
        small("↑", "Move earlier", () => void change(moveGroup(layout, g.id, index - 1)), index === 0),
        small("↓", "Move later", () => void change(moveGroup(layout, g.id, index + 1)), index === cards.length - 1),
        small("◀", "Narrower", () => void change(resizeGroup(layout, g.id, g.span - 1)), g.span <= MIN_SPAN),
        small("▶", "Wider", () => void change(resizeGroup(layout, g.id, g.span + 1)), g.span >= GRID),
      ),
      h("ul", { class: "designer-lines" }, group.lines.slice(0, 5).map((l) => h("li", { class: layout.unticked.includes(l.key) ? "off" : "" }, l.label)), group.lines.length > 5 ? h("li", { class: "muted" }, `and ${group.lines.length - 5} more`) : null),
      h("div", { class: "designer-width muted tiny" }, `${g.span} of ${GRID}`),
    );
    if (!ro) {
      const handle = h("div", { class: "designer-resize", title: "Drag to make it wider or narrower", role: "separator", "aria-orientation": "vertical" });
      handle.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        handle.setPointerCapture(e.pointerId);
        const col = grid.clientWidth / GRID;
        const startX = e.clientX;
        let span = g.span;
        const move = (m: PointerEvent) => {
          span = Math.min(GRID, Math.max(MIN_SPAN, Math.round(g.span + (m.clientX - startX) / col)));
          card.style.setProperty("--span", String(span));
          (card.querySelector(".designer-width") as HTMLElement).textContent = `${span} of ${GRID}`;
        };
        const up = () => {
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", up);
          if (span !== g.span) void change(resizeGroup(layout, g.id, span));
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", up);
      });
      card.appendChild(handle);
      card.addEventListener("dragstart", (e) => {
        e.dataTransfer?.setData(GROUP_DRAG, g.id);
        e.dataTransfer!.effectAllowed = "move";
        card.classList.add("dragging");
      });
      card.addEventListener("dragend", () => card.classList.remove("dragging"));
      card.addEventListener("dragover", (e) => {
        if (!e.dataTransfer?.types.includes(GROUP_DRAG)) return;
        e.preventDefault();
        card.classList.add("drop-over");
      });
      card.addEventListener("dragleave", () => card.classList.remove("drop-over"));
      card.addEventListener("drop", (e) => {
        const from = e.dataTransfer?.getData(GROUP_DRAG);
        card.classList.remove("drop-over");
        if (!from || from === g.id) return;
        e.preventDefault();
        void change(moveGroup(layout, from, index));
      });
    }
    grid.appendChild(card);
  });

  // ---------- What prints ----------
  const lineBox = (l: SheetLine) => {
    const on = !layout.unticked.includes(l.key);
    const tick = h("input", { type: "checkbox", checked: on, disabled: ro, "aria-label": `Print ${l.label}` });
    tick.addEventListener("change", () => void change(tickLines(layout, [l.key], tick.checked)));
    const hide = on
      ? null
      : (() => {
          const b = h("input", { type: "checkbox", checked: layout.hidden.includes(l.key), disabled: ro, "aria-label": `Hide ${l.label} completely` });
          b.addEventListener("change", () => void change(hideLines(layout, [l.key], b.checked)));
          return h("label", { class: "check tiny hide-switch", title: "Leave it off the paper completely, instead of a blank box to write in" }, b, "hide");
        })();
    return h("li", { class: "print-line" }, h("label", { class: "check grow" }, tick, l.label, !on ? h("span", { class: "muted tiny" }, layout.hidden.includes(l.key) ? " (not on the paper)" : " (blank to write in)") : null), hide);
  };
  const groupBox = (g: SheetGroup) => {
    const keys = g.lines.map((l) => l.key);
    const ticked = keys.filter((k) => !layout.unticked.includes(k)).length;
    const all = h("input", { type: "checkbox", checked: ticked === keys.length, disabled: ro, "aria-label": `Print all of ${g.title}` });
    all.indeterminate = ticked > 0 && ticked < keys.length;
    all.addEventListener("change", () => void change(tickLines(layout, keys, all.checked)));
    return h("li", { class: "print-group" }, h("label", { class: "check" }, all, h("strong", null, g.title)), h("ul", { class: "print-lines" }, g.lines.map(lineBox)));
  };
  const pencil = design.groups.flatMap((g) => g.lines.filter((l) => l.pencil));
  const allKeys = design.groups.flatMap((g) => g.lines.map((l) => l.key));
  const panel = h(
    "details",
    { class: "print-panel", open: panelOpen },
    h("summary", null, "What prints"),
    h(
      "div",
      { class: "print-panel-body" },
      h("p", { class: "muted small" }, "Unticked lines print blank, with room to write in pencil. Tick \"hide\" to leave one off the paper completely. This only changes the paper; everything stays with the character."),
      h("div", { class: "inline" }, h("button", { class: "button plain small-button", disabled: ro, onClick: () => void change(tickLines(layout, allKeys, true)) }, "Check all"), h("button", { class: "button plain small-button", disabled: ro, onClick: () => void change(tickLines(layout, allKeys, false)) }, "Uncheck all")),
      pencil.length ? h("div", { class: "print-pencil" }, h("div", { class: "field-label spaced" }, "Often kept in pencil"), h("ul", { class: "print-lines" }, pencil.map(lineBox))) : null,
      h("ul", { class: "print-groups" }, design.groups.map(groupBox)),
    ),
  );
  panel.addEventListener("toggle", () => (panelOpen = panel.open));

  // ---------- The bar along the top ----------
  const saved = (await attempt(() => api.sheetLayouts())) ?? [];
  const useSaved = h("select", { class: "text-input select", "aria-label": "Use a saved layout", disabled: ro || !saved.length }, h("option", { value: "" }, saved.length ? "Use a saved layout…" : "No saved layouts yet"), saved.map((l) => h("option", { value: l.id }, `${l.name}${l.isDefault ? " (the default)" : ""}`)));
  useSaved.addEventListener("change", async () => {
    if (useSaved.value && (await attempt(() => api.useSheetLayout(v.id, useSaved.value))) !== undefined) await ctx.refresh();
  });
  const source = design.source.kind === "own" ? "This sheet's own layout" : design.source.kind === "codex" ? `The layout "${design.source.name}"` : design.source.kind === "system" ? `The default layout "${design.source.name}"` : "The plain layout";
  const request = { type: "sheet" as const, character: v.id };
  const bar = h(
    "div",
    { class: "designer-bar" },
    h("button", { class: "button primary", onClick: () => (stopDesigning(), void ctx.refresh()) }, "Done"),
    h("span", { class: "muted small" }, source),
    h("span", { class: "grow" }),
    useSaved,
    ro || (design.source.kind !== "own" && design.source.kind !== "codex") ? null : h("button", { class: "button plain small-button", title: "Go back to the layout the game gives everyone", onClick: async () => (await attempt(() => api.setSheetLayout(v.id, null))) !== undefined && (await ctx.refresh()) }, "Use the system's"),
    ro ? null : h("button", { class: "button plain small-button", onClick: () => void saveLayout(layout, ctx.view.type === "system") }, "Save this layout…"),
    h("button", { class: "button plain small-button", onClick: () => void preview(request, v.name) }, "Preview"),
    h("button", { class: "button plain small-button", onClick: () => void window.dm.bookPrint(request).then((r) => !r.ok && notice(r.message, "red")) }, "Print…"),
    h("button", {
      class: "button plain small-button",
      onClick: async () => {
        const r = await window.dm.bookPdf(request);
        if (!r.ok) return notice(r.message, "red");
        if (r.value) notice(`Saved ${String(r.value).split(/[\\/]/).pop()}.`, "green", { label: "Open it", run: () => void window.dm.openPdf(String(r.value)) }, 9000);
      },
    }, "Save as PDF…"),
  );

  return h(
    "section",
    { class: "panel editor designer", "data-scroll": "designer" },
    h("div", { class: "pad" }, h("div", { class: "eyebrow" }, "Design the sheet"), h("h2", { class: "sheet-title" }, v.name), h("p", { class: "muted small" }, "Drag a group to move it, or drag its right edge to make it wider or narrower. The same layout is used on screen and on paper.")),
    bar,
    h("div", { class: "designer-body" }, grid, panel),
  );
}

async function saveLayout(layout: SheetLayout, inSystem: boolean) {
  const d = openDialog("Save this layout");
  const name = h("input", { class: "text-input", placeholder: "Inventory first", "aria-label": "Layout name", maxlength: 120 });
  const everyone = h("input", { type: "checkbox" });
  d.body.replaceChildren(
    h("label", { class: "field-label" }, "Name"),
    name,
    h("label", { class: "check spaced" }, everyone, inSystem ? "Make it the default sheet for every character in this game" : "Make it the default sheet for characters in this world"),
    h("p", { class: "muted small" }, "It is kept in the Codex under Sheet layouts, so other characters, worlds and games can use it. A character who rearranges their own sheet keeps their own."),
  );
  const ok = h("button", { class: "button primary" }, "Save");
  ok.addEventListener("click", async () => {
    if (!name.value.trim()) return name.focus();
    if ((await attempt(() => api.saveSheetLayout(name.value, layout, everyone.checked))) !== undefined) {
      d.close();
      notice(`Saved the layout ${name.value.trim()} in the Codex.`, "green", undefined, 4000);
    }
  });
  d.footer.replaceChildren(h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"), ok);
  name.focus();
}

/** The paper, exactly as it will print, in the book page's frame. */
async function preview(request: { type: "sheet"; character: string }, title: string) {
  const d = openDialog(`${title} on paper`, { wide: true });
  const data = await attempt(() => api.book(request));
  const frame = h("iframe", { class: "book-frame", src: "book.html", title: "Sheet preview" });
  frame.addEventListener("load", () => frame.contentWindow?.postMessage({ type: "book", data, zoom: 0.62 }, "*"));
  d.body.replaceChildren(frame);
  d.footer.replaceChildren(h("button", { class: "button primary", onClick: () => d.close() }, "Close"));
}
