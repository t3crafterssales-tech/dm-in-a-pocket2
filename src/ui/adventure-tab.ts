// The Adventure tab of a module (version 2): the module's encounters in a tree like File Explorer
// on the right (or the Codex, one click away), and the open encounter or the module's front page
// in the middle. Drag in the tree to reorder or to put one encounter inside another; drag from the
// Codex onto an encounter to add monsters, treasure, handouts or ready-made encounters.

import type { EncounterNode, NodeView } from "../app/backend.ts";
import { api, pictureUrl } from "./api.ts";
import { attempt } from "./common.ts";
import { ask, notice } from "./dialogs.ts";
import { h, svg } from "./dom.ts";
import { FieldMaker } from "./fields.ts";
import { ICONS } from "./icons.ts";
import { DRAG_TYPE } from "./library-panel.ts";
import { NODE_DRAG, codexPanel } from "./codex-panel.ts";
import { askText, stepper } from "./pickers.ts";
import type { PlaceCtx } from "./place.ts";

const TREE_DRAG = "application/x-dm-encounters";

/** The right column shows the tree or the Codex. */
let side: "tree" | "codex" = "tree";
/** Encounters whose insides are folded away in the tree. */
const folded = new Set<string>();
/** Encounters picked with Ctrl-click and Shift-click, to move together. */
const picked = new Set<string>();
let anchor: string | null = null;

export async function adventurePanels(ctx: PlaceCtx): Promise<{ list: HTMLElement; editor: HTMLElement }> {
  const [tree, pageId] = await Promise.all([attempt(() => api.encounterTree()), attempt(() => api.modulePage())]);
  const all = flat(tree ?? []);
  let view: NodeView | null = null;
  if (ctx.selected) {
    view = (await attempt(() => api.node(ctx.selected!))) ?? null;
    if (view && view.kind !== "encounter" && view.id !== pageId) view = null;
  }
  const editor = view?.kind === "encounter" ? await encounterEditor(view, all, ctx) : await frontPage(pageId ?? null, tree ?? [], ctx);
  const switcher = h(
    "div",
    { class: "switch", role: "tablist", "aria-label": "Show" },
    h("button", { class: `switch-button${side === "tree" ? " active" : ""}`, role: "tab", "aria-selected": side === "tree" ? "true" : "false", onClick: () => ((side = "tree"), void ctx.refresh()) }, "Encounters"),
    h("button", { class: `switch-button${side === "codex" ? " active" : ""}`, role: "tab", "aria-selected": side === "codex" ? "true" : "false", onClick: () => ((side = "codex"), void ctx.refresh()) }, "Codex"),
  );
  const list = side === "codex" ? h("div", { class: "codex adventure-side" }, h("div", { class: "pad tight" }, switcher), await codexPanel(ctx)) : treePanel(tree ?? [], all, switcher, ctx);
  return { list, editor };
}

function flat(tree: EncounterNode[]): EncounterNode[] {
  return tree.flatMap((e) => [e, ...flat(e.children)]);
}

// ---------- The tree ----------

function treePanel(tree: EncounterNode[], all: EncounterNode[], switcher: HTMLElement, ctx: PlaceCtx): HTMLElement {
  const ro = ctx.view.readOnly;
  for (const id of [...picked]) if (!all.some((e) => e.id === id)) picked.delete(id);
  const visible: EncounterNode[] = [];
  const rows = (list: EncounterNode[]): HTMLElement[] =>
    list.flatMap((e) => {
      visible.push(e);
      return [row(e, all, visible, ctx), ...(folded.has(e.id) ? [] : rows(e.children))];
    });
  const body = tree.length ? rows(tree) : [h("p", { class: "muted small pad" }, ro ? "No encounters." : "No encounters yet. Add one, or drag a ready-made one in from the Codex.")];
  return h(
    "aside",
    { class: "panel list-panel encounter-tree", "aria-label": "Encounters", "data-scroll": "encounter-tree" },
    h(
      "div",
      { class: "panel-head" },
      switcher,
      ro ? null : h("button", { class: "button primary small-button head-button", onClick: () => void addEncounter(null, ctx) }, svg(ICONS.plus), "Encounter"),
    ),
    h("button", { class: `tree-row front-row${ctx.selected === null ? " selected" : ""}`, onClick: () => ctx.select(null) }, svg(ICONS.scroll), h("span", { class: "tree-name" }, "Front page")),
    // Dropping on the empty space at the end moves things to the top level, at the end.
    h("div", { class: "tree-rows", ...dropZone(null, null, ctx) }, body),
    h("p", { class: "codex-hint" }, "Drag to reorder. Drop onto an encounter to put it inside. Ctrl-click or Shift-click to pick several."),
  );
}

function row(e: EncounterNode, all: EncounterNode[], visible: EncounterNode[], ctx: PlaceCtx): HTMLElement {
  const ro = ctx.view.readOnly;
  const el: HTMLElement = h(
    "div",
    {
      class: `tree-row${e.id === ctx.selected ? " selected" : ""}${picked.has(e.id) && picked.size > 1 ? " picked" : ""}`,
      style: `padding-left: ${10 + e.depth * 18}px`,
      tabindex: 0,
      draggable: ro ? "false" : "true",
      "data-key": `enc-${e.id}`,
      "data-node": e.id,
      onClick: (ev: MouseEvent) => {
        if ((ev.target as HTMLElement).closest(".fold")) return;
        if (ev.ctrlKey || ev.metaKey) {
          picked.has(e.id) ? picked.delete(e.id) : picked.add(e.id);
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
        picked.add(e.id);
        anchor = e.id;
        ctx.select(e.id);
      },
      onKeydown: (ev: KeyboardEvent) => {
        if (ev.key === "Enter") ctx.select(e.id);
        if (ev.key === "Delete" && !ro) void removeEncounter(e, ctx);
      },
      onDragstart: (ev: DragEvent) => {
        if (!picked.has(e.id)) (picked.clear(), picked.add(e.id));
        ev.dataTransfer!.setData(TREE_DRAG, JSON.stringify([...picked]));
        ev.dataTransfer!.effectAllowed = "move";
      },
      onDragover: (ev: DragEvent) => {
        const types = ev.dataTransfer?.types ?? [];
        if (ro || !(types.includes(TREE_DRAG) || types.includes(NODE_DRAG))) return;
        ev.preventDefault();
        ev.stopPropagation();
        el.classList.remove("drop-before", "drop-after", "drop-inside");
        el.classList.add(`drop-${where(ev, el)}`);
      },
      onDragleave: () => el.classList.remove("drop-before", "drop-after", "drop-inside"),
      onDrop: (ev: DragEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        const pos = where(ev, el);
        el.classList.remove("drop-before", "drop-after", "drop-inside");
        // Where it lands: inside this one, or beside it (before it, or before the next one at its level).
        const siblings = all.filter((x) => x.inside === e.inside);
        const next = siblings[siblings.findIndex((x) => x.id === e.id) + 1]?.id ?? null;
        const inside = pos === "inside" ? e.id : e.inside;
        const before = pos === "inside" ? null : pos === "before" ? e.id : next;
        void dropped(ev, inside, before, ctx);
      },
    },
    e.children.length
      ? h("button", { class: `fold${folded.has(e.id) ? "" : " open"}`, "aria-label": folded.has(e.id) ? "Show what's inside" : "Fold away what's inside", onClick: () => ((folded.has(e.id) ? folded.delete(e.id) : folded.add(e.id)), void ctx.refresh()) }, svg(ICONS.chevron))
      : h("span", { class: "fold-space" }),
    h("span", { class: "tree-number" }, e.number),
    h("span", { class: "tree-name" }, e.name),
    e.creatures ? h("span", { class: "item-label", title: "Creatures in it" }, String(e.creatures)) : null,
  );
  return el;
}

/** Top quarter: before it; bottom quarter: after it; the middle: inside it. */
function where(ev: DragEvent, el: HTMLElement): "before" | "after" | "inside" {
  const r = el.getBoundingClientRect();
  const y = ev.clientY - r.top;
  return y < r.height * 0.25 ? "before" : y > r.height * 0.75 ? "after" : "inside";
}

function dropZone(inside: string | null, before: string | null, ctx: PlaceCtx) {
  return {
    onDragover: (ev: DragEvent) => {
      const types = ev.dataTransfer?.types ?? [];
      if (ctx.view.readOnly || !(types.includes(TREE_DRAG) || types.includes(NODE_DRAG))) return;
      ev.preventDefault();
    },
    onDrop: (ev: DragEvent) => {
      ev.preventDefault();
      void dropped(ev, inside, before, ctx);
    },
  };
}

/** Something dropped in the tree: encounters being moved, or ready-made ones from the Codex. */
async function dropped(ev: DragEvent, inside: string | null, before: string | null, ctx: PlaceCtx) {
  const moving = JSON.parse(ev.dataTransfer?.getData(TREE_DRAG) || "[]") as string[];
  if (moving.length) {
    if ((await attempt(() => api.moveEncounters(moving, inside, before))) !== undefined) {
      notice(`Moved ${moving.length === 1 ? "it" : `${moving.length} encounters`}. The numbers have updated.`, "green", { label: "Undo", run: async () => (await attempt(() => api.undo()), await ctx.refresh()) }, 5000);
    }
    return ctx.refresh();
  }
  const fromCodex = (JSON.parse(ev.dataTransfer?.getData(NODE_DRAG) || "{}") as { ids?: string[]; from?: string }).ids ?? [];
  if (!fromCodex.length) return;
  const placed: string[] = [];
  for (const id of fromCodex) {
    const v = await attempt(() => api.node(id));
    if (v?.kind === "encounter") {
      const made = await attempt(() => api.placeEncounter(id, inside));
      if (made) placed.push(made);
    } else if (inside && v) await attempt(() => api.addToEncounter(inside, [id]));
  }
  if (placed.length && before) await attempt(() => api.moveEncounters(placed, inside, before));
  await ctx.refresh();
}

async function addEncounter(inside: string | null, ctx: PlaceCtx) {
  const name = await askText(inside ? "New encounter inside" : "New encounter", "", "Name", "For example: Goblin ambush, The well, Room 1. Everything goes inside encounters: a tavern evening, a fight, a dungeon room.");
  if (!name) return;
  const id = await attempt(() => api.addEncounter(name, inside));
  if (id) {
    if (inside) folded.delete(inside);
    ctx.select(id);
  }
}

async function removeEncounter(e: EncounterNode, ctx: PlaceCtx) {
  const r = await attempt(() => api.deleteEncounter(e.id));
  if (!r) return;
  notice(e.children.length ? `${r.label}. What was inside it moved up a level. It's in the recycle bin.` : `${r.label}. It's in the recycle bin.`, "blue", { label: "Undo", run: async () => (await attempt(() => api.undo()), ctx.select(e.id)) });
  ctx.select(null);
}

// ---------- The front page ----------

async function frontPage(pageId: string | null, tree: EncounterNode[], ctx: PlaceCtx): Promise<HTMLElement> {
  const page = pageId ? await attempt(() => api.node(pageId)) : null;
  const ro = ctx.view.readOnly;
  const count = flat(tree).length;
  const inner: (HTMLElement | null)[] = [h("div", { class: "eyebrow" }, "Module"), h("h1", null, ctx.view.name), h("p", { class: "muted" }, ctx.view.worldName ? `In ${ctx.view.worldName} · ${ctx.view.systemName}` : `Setting-free · ${ctx.view.systemName} · fits any world`)];
  if (page) {
    const ed = new FieldMaker(page, ctx);
    const num = (k: string, d: number) => (typeof page.fields[k] === "number" ? (page.fields[k] as number) : d);
    const levels = h("input", { class: "text-input", value: String(page.fields.levels ?? ""), placeholder: "For example: 1 to 3", "data-key": "mp-levels", disabled: ro, "aria-label": "Character levels" });
    levels.addEventListener("change", () => void ed.save(() => api.setField(page.id, "levels", levels.value)));
    const hook = h("textarea", { class: "text-input desc-box", rows: 5, "data-key": "f-text", disabled: ro, placeholder: "The hook: what's going on, and why the heroes get involved." }, page.text);
    hook.addEventListener("change", () => void ed.save(() => api.setText(page.id, hook.value)));
    inner.push(
      h(
        "div",
        { class: "quick" },
        h("div", { class: "quick-row" }, h("div", { class: "quick-label" }, "For levels"), h("div", { class: "quick-control" }, levels)),
        h("div", { class: "quick-row" }, h("div", { class: "quick-label" }, "Party size"), h("div", { class: "quick-control" }, stepper(num("partySize", 4), (n) => void ed.save(() => api.setField(page.id, "partySize", Math.max(1, n))), { label: "Party size", key: "mp-party", min: 1, disabled: ro }))),
        h("div", { class: "quick-row" }, h("div", { class: "quick-label" }, "About how many sessions"), h("div", { class: "quick-control" }, stepper(num("sessions", 1), (n) => void ed.save(() => api.setField(page.id, "sessions", Math.max(1, n))), { label: "Sessions", key: "mp-sessions", min: 1, disabled: ro }))),
      ),
      h("div", { class: "field" }, h("div", { class: "field-label" }, "The hook"), hook),
    );
  }
  inner.push(
    h("div", { class: "field" }, h("div", { class: "field-label" }, "Encounters"), h("p", { class: "muted" }, count ? `${count} encounter${count === 1 ? "" : "s"}. Pick one in the tree on the right to open it.` : "None yet. Use + Encounter on the right, or open the Codex and drag in a ready-made one.")),
    ro ? null : h("div", { class: "sheet-actions" }, h("button", { class: "button primary", onClick: () => void addEncounter(null, ctx) }, svg(ICONS.plus), "Add an encounter")),
  );
  return h("section", { class: "panel editor", "data-scroll": "editor" }, h("div", { class: "sheet" }, inner));
}

// ---------- One encounter ----------

async function encounterEditor(view: NodeView, all: EncounterNode[], ctx: PlaceCtx): Promise<HTMLElement> {
  const ro = view.readOnly;
  const ed = new FieldMaker(view, ctx);
  const me = all.find((e) => e.id === view.id);
  const onMaps = (await attempt(() => api.mapsShowing(view.id))) ?? [];
  const save = (fn: () => Promise<unknown>) => void ed.save(fn);
  const list = (k: string) => (Array.isArray(view.fields[k]) ? (view.fields[k] as unknown[]) : []);
  const linkId = (v: unknown) => (v && typeof v === "object" && typeof (v as { link?: unknown }).link === "string" ? (v as { link: string }).link : null);
  const nameOf = (id: string | null) => (id ? (view.names[id] ?? `[missing: ${view.missing[id] ?? "removed"}]`) : "");

  const name = h("input", { class: "sheet-name", value: view.name, "data-key": "f-name", "aria-label": "Name", disabled: ro, maxlength: 200 });
  name.addEventListener("change", () => name.value.trim() && save(() => api.rename(view.id, name.value)));
  name.addEventListener("keydown", (e) => e.key === "Enter" && name.blur());
  const pic = h(
    "button",
    { class: `portrait${view.picture ? "" : " empty"}`, disabled: ro, title: view.picture ? "Change the picture" : "Add a picture", "aria-label": "Picture" },
    view.picture ? h("img", { src: pictureUrl(view.picture), alt: "" }) : [h("span", { class: "portrait-icon", "aria-hidden": "true" }, "🗺️"), h("span", null, "Add picture")],
  );
  pic.addEventListener("click", async () => {
    const id = await attempt(() => api.pickPicture());
    if (id) save(() => api.setPicture(view.id, id));
  });
  const parent = me?.inside ? all.find((x) => x.id === me.inside) : null;

  const readAloud = h("textarea", { class: "text-input read-aloud", rows: 4, "data-key": "f-readAloud", disabled: ro, placeholder: "What you read out to the players when they get here." }, String(view.fields.readAloud ?? ""));
  readAloud.addEventListener("change", () => save(() => api.setField(view.id, "readAloud", readAloud.value)));
  const notes = h("textarea", { class: "text-input desc-box", rows: 4, "data-key": "f-text", disabled: ro, placeholder: "What's really going on: who's lying, what the trap does, what happens if…" }, view.text);
  notes.addEventListener("change", () => save(() => api.setText(view.id, notes.value)));

  // Creatures, with how many of each.
  const creatures = list("creatures") as { being?: unknown; count?: unknown }[];
  const creatureRows = creatures.map((c, i) => {
    const id = linkId(c.being);
    const count = typeof c.count === "number" ? c.count : 1;
    const setCount = (n: number) => {
      const next = creatures.map((x, j) => (j === i ? { ...x, count: n } : x)).filter((x) => (typeof x.count === "number" ? x.count : 1) > 0);
      save(() => api.setField(view.id, "creatures", next as never));
    };
    return h(
      "div",
      { class: `enc-item${id && !view.names[id] ? " broken" : ""}` },
      h("span", { class: "enc-icon", "aria-hidden": "true" }, "🐉"),
      id && view.names[id] ? h("button", { class: "link-plain enc-name", onClick: () => void ctx.open(id) }, nameOf(id)) : h("span", { class: "enc-name" }, nameOf(id)),
      stepper(count, setCount, { label: `How many ${nameOf(id)}`, key: `cr-${i}`, min: 0, disabled: ro }),
      ro ? null : h("button", { class: "icon-button small", "aria-label": `Remove ${nameOf(id)}`, onClick: () => setCount(0) }, svg(ICONS.close)),
    );
  });
  const linkRows = (key: "treasure" | "handouts", icon: string) =>
    list(key).map((v, i) => {
      const id = linkId(v);
      return h(
        "div",
        { class: `enc-item${id && !view.names[id] ? " broken" : ""}` },
        h("span", { class: "enc-icon", "aria-hidden": "true" }, icon),
        id && view.names[id] ? h("button", { class: "link-plain enc-name", onClick: () => void ctx.open(id) }, nameOf(id)) : h("span", { class: "enc-name" }, nameOf(id)),
        ro ? null : h("button", { class: "icon-button small", "aria-label": `Remove ${nameOf(id)}`, onClick: () => save(() => api.setField(view.id, key, list(key).filter((_, j) => j !== i) as never)) }, svg(ICONS.close)),
      );
    });
  // Leads to: a drop-down of the module's other encounters.
  const leads = list("leadsTo").map((v) => linkId(v));
  const leadSelect = h(
    "select",
    { class: "text-input select pick-select", disabled: ro, "aria-label": "Leads to" },
    h("option", { value: "" }, "+ Leads to…"),
    all.filter((x) => x.id !== view.id && !leads.includes(x.id)).map((x) => h("option", { value: x.id }, `${x.number} ${x.name}`)),
  );
  leadSelect.addEventListener("change", () => leadSelect.value && save(() => api.setField(view.id, "leadsTo", [...list("leadsTo"), { link: leadSelect.value }] as never)));
  const leadRows = list("leadsTo").map((v, i) => {
    const id = linkId(v);
    const target = all.find((x) => x.id === id);
    return h(
      "div",
      { class: "enc-item" },
      h("span", { class: "enc-icon", "aria-hidden": "true" }, "➜"),
      target ? h("button", { class: "link-plain enc-name", onClick: () => ctx.select(target.id) }, `${target.number} ${target.name}`) : h("span", { class: "enc-name" }, nameOf(id)),
      ro ? null : h("button", { class: "icon-button small", "aria-label": "Remove this link", onClick: () => save(() => api.setField(view.id, "leadsTo", list("leadsTo").filter((_, j) => j !== i) as never)) }, svg(ICONS.close)),
    );
  });

  const section = (title: string, rows: HTMLElement[], hint: string, extra: HTMLElement | null = null) =>
    h("div", { class: "more-section" }, h("div", { class: "section-h" }, title), rows, extra, ro ? null : h("div", { class: "drop-zone" }, hint));

  const panel: HTMLElement = h(
    "section",
    {
      class: "panel editor sheet-drop",
      "data-scroll": "editor",
      onDragover: (ev: DragEvent) => {
        const types = ev.dataTransfer?.types ?? [];
        if (ro || !(types.includes(NODE_DRAG) || types.includes(DRAG_TYPE))) return;
        ev.preventDefault();
        panel.classList.add("drop-over");
      },
      onDragleave: (ev: DragEvent) => {
        if (!panel.contains(ev.relatedTarget as Node)) panel.classList.remove("drop-over");
      },
      onDrop: (ev: DragEvent) => {
        ev.preventDefault();
        panel.classList.remove("drop-over");
        void (async () => {
          const ids = (JSON.parse(ev.dataTransfer?.getData(NODE_DRAG) || "{}") as { ids?: string[] }).ids ?? (JSON.parse(ev.dataTransfer?.getData(DRAG_TYPE) || "[]") as string[]);
          const ready: string[] = [];
          const rest: string[] = [];
          for (const id of ids) ((await attempt(() => api.node(id)))?.kind === "encounter" ? ready : rest).push(id);
          for (const id of ready) await attempt(() => api.placeEncounter(id, view.id));
          if (rest.length) {
            const r = await attempt(() => api.addToEncounter(view.id, rest));
            if (r) notice(`${r.label}.`, "green", { label: "Undo", run: async () => (await attempt(() => api.undo()), await ctx.refresh()) }, 5000);
          }
          await ctx.refresh();
        })();
      },
    },
    h(
      "div",
      { class: "sheet" },
      h(
        "div",
        { class: "sheet-top" },
        pic,
        h(
          "div",
          { class: "sheet-top-text" },
          h("div", { class: "eyebrow" }, `Encounter ${me?.number ?? ""}`),
          name,
          h("div", { class: "sheet-tags" }, parent ? h("span", { class: "tag" }, "Inside ", h("button", { class: "link", onClick: () => ctx.select(parent.id) }, `${parent.number} ${parent.name}`)) : h("span", { class: "tag" }, "Top level"), me?.children.length ? h("span", { class: "tag" }, `${me.children.length} inside it`) : null, ...onMaps.map((m) => h("span", { class: "tag" }, svg(ICONS.map), "On the map ", h("button", { class: "link", onClick: () => void ctx.open(m.id) }, m.name)))),
        ),
      ),
      h("div", { class: "field" }, h("div", { class: "field-label" }, "Read aloud"), readAloud),
      h("div", { class: "field" }, h("div", { class: "field-label" }, "What's really going on"), notes),
      section("Creatures", creatureRows, "Drag monsters and NPCs here from the Codex."),
      section("Treasure", linkRows("treasure", "💰"), "Drag items here from the Codex."),
      section("Handouts", linkRows("handouts", "📜"), "Drag lore pages or roll tables here from the Codex."),
      section("Leads to", leadRows, "Pick another encounter this one leads to.", ro ? null : leadSelect),
      ro
        ? null
        : h(
            "div",
            { class: "sheet-actions" },
            h("button", { class: "button plain", onClick: () => void addEncounter(view.id, ctx) }, svg(ICONS.plus), "Add an encounter inside"),
            h(
              "button",
              {
                class: "button plain",
                title: "Keep a ready-made copy in the Codex's Encounters section, to use again",
                onClick: async () => {
                  if (await attempt(() => api.saveEncounterToCodex(view.id))) notice(`${view.name} is saved in the Codex under Encounters.`, "green", undefined, 5000);
                  await ctx.refresh();
                },
              },
              "Save to the Codex",
            ),
            h(
              "button",
              {
                class: "button plain danger-text",
                onClick: async () => {
                  if (me?.children.length) {
                    const ok = await ask(`Delete ${view.name}?`, [`The ${me.children.length === 1 ? "encounter" : `${me.children.length} encounters`} inside it will move up a level, in its place. ${view.name} goes to the recycle bin.`], [
                      { label: "Cancel", value: false },
                      { label: "Delete", value: true, kind: "danger" },
                    ]);
                    if (!ok) return;
                  }
                  if (me) await removeEncounter(me, ctx);
                },
              },
              svg(ICONS.trash),
              "Delete",
            ),
          ),
    ),
  );
  return panel;
}
