// Inside an open world or system: the tab bar, the list, editor and flag panels, undo and redo,
// and World settings.

import { drawSteps, showHelp, tipOnce } from "./welcome.ts";
import type { PlaceView } from "../app/backend.ts";
import type { SearchHit } from "../app/search.ts";
import type { Place } from "../app/settings.ts";
import { api } from "./api.ts";
import { app, attempt, brand, iconButton, nav, typingIn } from "./common.ts";
import { ask, notice, openDialog } from "./dialogs.ts";
import { h, svg } from "./dom.ts";
import { ICONS } from "./icons.ts";
import { flagStrip, showNodeBin } from "./flag-panel.ts";
import { startOver } from "./start-screen.ts";
import { separateCopy, variantOf } from "./item-sheet.ts";
import { showHistory } from "./history-dialog.ts";
import { lorePanels } from "./lore-tab.ts";
import { adventurePanels } from "./adventure-tab.ts";
import { partyPanels } from "./party-tab.ts";
import { mapsPanels } from "./maps-tab.ts";
import { journalPanels } from "./journal-tab.ts";
import { drawDesk, leaveDesk } from "./desk.ts";
import { forgetReference } from "./tools/reference.ts";
import { clearPins, drawPins, pinThing } from "./floating-pins.ts";
import { macroBuilder } from "./tools/dice.ts";
import { showQuickStart } from "./quickstart-dialog.ts";
import { rulebookPanels } from "./rulebook-tab.ts";
import { changelogCard } from "./changelog-card.ts";
import { rulesPanels } from "./rules-tab.ts";
import { sheetPanels } from "./sheets-tab.ts";
import { arrange, layoutDialog, loadLayout } from "./layout.ts";
import { aiOn, draftWithAi, noteAi, showAiSettings } from "./ai-panel.ts";
import { Trail } from "../app/trail.ts";
import { focusTableSearch, forgetTableData } from "./table-mode.ts";
import { aiPanel } from "./ai-panel.ts";

const TABS = ["Adventure", "Party", "Maps", "Rules", "Beings", "Items", "Lore", "Journal", "Rulebook"] as const;
type Tab = (typeof TABS)[number];

/** The tabs a place shows: a module (version 2) starts with its Adventure tab. */
function tabsOf(view: PlaceView): readonly Tab[] {
  return view.type === "module" ? TABS : TABS.filter((t) => t !== "Adventure");
}

/** What is open right now, or null on the home screen. */
export let current: PlaceView | null = null;
let tab: Tab = "Rules";
/** True while the world is shown in Table mode, the read-only reading view for running a game. */
let tableMode = false;
/** The node open in the editor, per tab. */
const selected: Partial<Record<Tab, string | null>> = {};
/** Where the person has been in this place, for Back and Forward. It moves the view only. */
const trail = new Trail();

/** Back or forward one step along the trail. Never an undo: nothing in the work changes. */
async function walk(dir: "back" | "forward") {
  if (!current || tableMode) return;
  for (;;) {
    const spot = dir === "back" ? trail.back() : trail.forward();
    if (!spot) return void notice(dir === "back" ? "Nowhere further back." : "Nowhere further forward.", "blue", undefined, 2000);
    if (spot.sel && !(await attempt(() => api.node(spot.sel!)))) {
      trail.drop(spot.sel);
      continue;
    }
    if (!tabsOf(current).includes(spot.tab as Tab)) continue;
    tab = spot.tab as Tab;
    selected[tab] = spot.sel;
    if (!spot.sel && (tab === "Beings" || tab === "Items")) startOver();
    return void (await renderPlace());
  }
}

/** Open a place on the tab and sheet it was left on, if they are still there. */
async function resume(view: PlaceView) {
  const w = await attempt(() => api.whereWas(view.id));
  if (!w || !tabsOf(view).includes(w.tab as Tab)) return;
  tab = w.tab as Tab;
  if (w.node && (await attempt(() => api.node(w.node!)))) selected[tab] = w.node;
}

export interface PlaceCtx {
  view: PlaceView;
  selected: string | null;
  select: (id: string | null) => void;
  /** Redraws after a change. */
  refresh: () => Promise<void>;
  /** Goes to a tab, on its start screen. */
  go: (tab: string) => void;
  /** Opens anything by its id, switching to the tab it lives in. */
  open: (id: string, opts?: { focusName?: boolean }) => Promise<void>;
}

/** Which tab a kind of node lives in. Bricks open where you are if that's Beings or Items. */
function tabFor(kind: string): Tab {
  if (kind === "item") return "Items";
  if (kind === "being") return "Beings";
  if (kind === "brick") return tab === "Beings" || tab === "Items" ? tab : "Items";
  if (kind === "lore" || kind === "table") return "Lore";
  if (kind === "map") return "Maps";
  if (kind === "journal") return "Journal";
  if (kind === "encounter") return current?.type === "module" ? "Adventure" : "Beings";
  return "Rules";
}

/** After making a copy, its name box takes the cursor with the name selected, ready to type over. */
let focusName = false;

async function openNode(id: string, opts: { focusName?: boolean } = {}) {
  const n = await attempt(() => api.node(id));
  if (!n || !current) return;
  // A macro opens in its builder; a game night opens its journal page.
  if (n.kind === "macro") {
    const m = (await attempt(() => api.macros()))?.find((x) => x.id === id) ?? null;
    return void macroBuilder(null, m);
  }
  tab = n.kind === "being" && n.fields.beingKind === "character" && !n.template ? "Party" : tabFor(n.kind);
  selected[tab] = id;
  focusName = !!opts.focusName;
  await renderPlace();
}

function goTab(t: string) {
  if (!current || !tabsOf(current).includes(t as Tab)) return;
  tab = t as Tab;
  selected[tab] = null;
  if (tab === "Beings" || tab === "Items") startOver();
  void renderPlace();
}

/** "+ New": the start screen, "What do you want to make?". */
function newThing() {
  if (!current) return;
  if (tab !== "Beings" && tab !== "Items") tab = "Items";
  selected[tab] = null;
  startOver();
  void renderPlace();
}

export async function openPlace(place: Place, mode: "normal" | "read-only" | "take-over" = "normal", name?: string, then?: "quickstart") {
  const res = await attempt(() => api.open(place, mode));
  if (!res) {
    await nav.home();
    return;
  }
  if (res.status === "in-use") {
    const choice = await ask(`${name ?? "This world"} is open on another computer`, [`It is open on ${res.machine} right now. Two copies must never save over each other.`, "Take over closes it on the other computer first; it switches to read-only there within a few seconds."], [
      { label: "Cancel", value: null },
      { label: "Open read-only", value: "read-only" as const },
      { label: "Take over", value: "take-over" as const, kind: "primary" },
    ]);
    if (choice) await openPlace(place, choice, name);
    return;
  }
  current = res.view;
  tab = res.view.type === "module" ? "Adventure" : "Rules";
  tableMode = false;
  search = null;
  for (const t of TABS) selected[t] = null;
  trail.reset();
  await resume(res.view);
  await renderPlace();
  if (res.view.recovered) notice("Recovered after an unexpected close.", "blue", undefined, 0);
  if (then === "quickstart") await showQuickStart(() => renderPlace());
}

/** Opens a place and goes straight to something in it (the Home screen's Recent row). */
export async function openAt(place: Place, nodeId: string, name?: string) {
  await openPlace(place, "normal", name);
  if (current && current.id === place.id) await openNode(nodeId);
}

export function leavePlace() {
  current = null;
}

/** Called when another computer takes over the open world. */
export function becameReadOnly(reason: string) {
  if (!current) return;
  current.readOnly = true;
  current.readOnlyReason = reason;
  void renderPlace();
}

let rendering: Promise<void> | null = null;
let again = false;

/** Redraws the whole open world or system, keeping the cursor where it was. */
/** Players did something: redraw the table (or the Party tab, for the green dots), never a sheet mid-edit. */
export function redrawForPlayers(what: "table" | "players") {
  if (!current) return;
  const typing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;
  if (tableMode || (what === "players" && tab === "Party" && !typing)) void renderPlace();
}

export async function renderPlace(): Promise<void> {
  // Several changes in a row redraw once, in order.
  if (rendering) {
    again = true;
    return rendering;
  }
  rendering = (async () => {
    do {
      again = false;
      await draw();
    } while (again);
  })();
  try {
    await rendering;
  } finally {
    rendering = null;
  }
}

async function draw() {
  const view = current;
  if (!view) return;
  if (tableMode) void tipOnce("desk");
  if (tableMode) return drawDesk(view, () => ((tableMode = false), leaveDesk(), forgetTableData(), forgetReference(), void renderPlace()), () => void goHome());
  const focusKey = (document.activeElement as HTMLElement | null)?.dataset?.key ?? null;
  const caret = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement ? document.activeElement.selectionStart : null;
  const scroll = [...document.querySelectorAll<HTMLElement>("[data-scroll]")].map((el) => [el.dataset.scroll!, el.scrollTop] as const);

  const ctx: PlaceCtx = {
    view,
    selected: selected[tab] ?? null,
    select: (id) => {
      selected[tab] = id;
      void renderPlace();
    },
    refresh: () => renderPlace(),
    go: (t) => goTab(t),
    open: (id, opts) => openNode(id, opts),
  };
  noteAi(await attempt(() => api.aiStatus()));
  const draftStart: Partial<Record<Tab, string>> = { Rules: "Create a rule for this game: ", Beings: "Create a monster that fits this world: ", Items: "Create an item that fits this world: ", Lore: "Create a place, faction or lore page that fits this world: " };
  const isWorld = view.type === "world";
  const tabs = h(
    "nav",
    { class: "tabs", role: "tablist" },
    tabsOf(view).map((t) => h("button", { class: `tab${t === tab ? " active" : ""}`, role: "tab", "aria-selected": t === tab ? "true" : "false", onClick: () => ((tab = t), void renderPlace()) }, t)),
  );
  const top = h(
    "header",
    { class: "topbar place" },
    brand(),
    h("div", { class: "place-title" }, h("span", { class: "place-name" }, view.name), h("span", { class: "muted small" }, view.type === "module" ? `Module · ${view.worldName ? `${view.worldName} · ` : ""}${view.systemName}` : isWorld ? `World · ${view.systemName}` : "System")),
    tabs,
    searchBox(),
    h(
      "nav",
      { class: "top-actions" },
      view.readOnly ? null : h("button", { class: "button primary new-button", title: "Make something new: a weapon, a monster, a spell…", onClick: () => newThing() }, svg(ICONS.plus), "New"),
      aiOn() && !view.readOnly && draftStart[tab] ? iconButton(ICONS.spark, "Draft with AI", () => draftWithAi(ctx, draftStart[tab]!), { title: "Describe what you want and let the AI draft it for you to preview. Nothing is made until you accept." }) : null,
      iconButton(ICONS.dice, "DM's table", () => ((tableMode = true), void renderPlace()), { title: "The DM's table: run a game night with initiative, dice, the clock, the journal and more" }),
      iconButton(ICONS.layout, "Layout", () => void layoutDialog(() => void renderPlace()), { iconOnly: true, title: "Panel layout: Builder, Game night, Writer, Dual monitor, or your own" }),
      iconButton(ICONS.back, "Back", () => void walk("back"), { iconOnly: true, big: true, title: "Back to where you were (A, or Alt+Left). This only moves your view; it never undoes anything.", disabled: !trail.canBack }),
      iconButton(ICONS.forward, "Forward", () => void walk("forward"), { iconOnly: true, big: true, title: "Forward again (S, or Alt+Right)", disabled: !trail.canForward }),
      iconButton(ICONS.undo, "Undo", () => void undo(), { iconOnly: true, title: "Undo (Ctrl+Z)", disabled: view.readOnly }),
      iconButton(ICONS.redo, "Redo", () => void redo(), { iconOnly: true, title: "Redo (Ctrl+Y)", disabled: view.readOnly }),
      iconButton(ICONS.clock, "History", () => void showHistory(ctx), { iconOnly: true, title: "History: every change, and rolling back to any of them" }),
      iconButton(ICONS.bin, "Recycle bin", () => void showNodeBin(ctx), { iconOnly: true, title: "Recycle bin: restore deleted things" }),
      iconButton(ICONS.help, "Help", () => void showHelp(), { iconOnly: true, title: "Help: the tour, the sample, tips and first steps" }),
      iconButton(ICONS.home, "Home", () => void goHome()),
      iconButton(ICONS.gear, view.type === "module" ? "Module settings" : isWorld ? "World settings" : "System settings", () => void placeSettings(view)),
    ),
  );
  const banner = view.readOnly ? h("div", { class: "banner" }, h("strong", null, "Read-only. "), view.readOnlyReason ?? "", " Nothing you do here is saved.") : null;

  let list: HTMLElement;
  let editor: HTMLElement;
  if (tab === "Adventure") ({ list, editor } = await adventurePanels(ctx));
  else if (tab === "Party") ({ list, editor } = await partyPanels(ctx));
  else if (tab === "Maps") ({ list, editor } = await mapsPanels(ctx));
  else if (tab === "Journal") ({ list, editor } = await journalPanels(ctx));
  else if (tab === "Rules") ({ list, editor } = await rulesPanels(ctx));
  else if (tab === "Beings") ({ list, editor } = await sheetPanels(ctx, "beings"));
  else if (tab === "Items") ({ list, editor } = await sheetPanels(ctx, "items"));
  else if (tab === "Rulebook") ({ list, editor } = await rulebookPanels(ctx));
  else if (tab === "Lore") ({ list, editor } = await lorePanels(ctx));
  else ({ list, editor } = comingSoon(tab, view));
  const changes = await changelogCard(view.id, () => renderPlace());
  const flags = await flagStrip(ctx);
  const selectedName = ctx.selected ? ((await api.node(ctx.selected).catch(() => null))?.name ?? null) : null;
  const aiStatus = await attempt(() => api.aiStatus());
  noteAi(aiStatus);
  // With no key saved the AI is simply not on screen; the key lives in Settings.
  const ai = aiStatus?.hasKey ? await aiPanel(ctx, selectedName) : null;
  if (current !== view) return; // went home while loading
  // Remember where this is: for Back and Forward, for Recent, and for reopening here next time.
  trail.record({ tab, sel: ctx.selected });
  void attempt(() => api.rememberWhere(view.id, { tab, node: ctx.selected }));
  if (ctx.selected && selectedName && lastNoted !== `${view.id}:${ctx.selected}`) {
    lastNoted = `${view.id}:${ctx.selected}`;
    void attempt(() => api.noteRecent({ placeType: view.type, placeId: view.id, placeName: view.name, nodeId: ctx.selected!, name: selectedName, tab }));
  }
  const crumbs = breadcrumb(view, selectedName, ctx);

  // Two columns: what you're making in the middle, the Codex (or the tab's list) on the right with
  // the flag strip at its foot.
  list.classList.add("side-list");
  await loadLayout();
  const { workspace, ai: aiFrame } = arrange({ editor, codex: list, flags, ai, refresh: () => void renderPlace() });
  app.replaceChildren(top, crumbs, ...(banner ? [banner] : []), ...(changes ? [changes] : []), workspace, ...(aiFrame ? [aiFrame] : []));
  void drawPins(view, { open: (x) => void openNode(x) });
  void drawSteps();
  void tipOnce(tab);

  for (const [key, top] of scroll) {
    const el = document.querySelector<HTMLElement>(`[data-scroll="${CSS.escape(key)}"]`);
    if (el) el.scrollTop = top;
  }
  // A box that just opened (such as a new rule's name) takes the cursor.
  const auto = document.querySelector<HTMLElement>("[data-autofocus]");
  const nameBox = focusName ? document.querySelector<HTMLInputElement>(".sheet-name:not([disabled]), .title-input:not([disabled])") : null;
  focusName = false;
  if (nameBox) (nameBox.focus(), nameBox.select());
  else if (auto) auto.focus();
  else if (focusKey) {
    const el = document.querySelector<HTMLElement>(`[data-key="${CSS.escape(focusKey)}"]`);
    el?.focus();
    if (caret !== null && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.type !== "number") el.setSelectionRange(caret, caret);
  }
}

let lastNoted = "";

/** "Home › Greyhollow › Beings › Goblin": every part but the last takes you there. */
function breadcrumb(view: PlaceView, sheetName: string | null, ctx: PlaceCtx): HTMLElement {
  const link = (text: string, run: () => void, title: string) => h("button", { class: "crumb-link", title, onClick: run }, text);
  const sep = () => h("span", { class: "crumb-sep", "aria-hidden": "true" }, "›");
  const parts: (HTMLElement | string)[] = [link("Home", () => void goHome(), "Back to the home screen")];
  const first = tabsOf(view)[0]!;
  parts.push(sep(), tab === first && !ctx.selected ? h("span", { class: "crumb-here" }, view.name) : link(view.name, () => ((tab = first), (selected[tab] = null), void renderPlace()), `Go to ${view.name}'s ${first} tab`));
  parts.push(sep(), ctx.selected ? link(tab, () => ((selected[tab] = null), tab === "Beings" || tab === "Items" ? startOver() : null, void renderPlace()), `Back to the ${tab} start`) : h("span", { class: "crumb-here" }, tab));
  if (ctx.selected && sheetName) parts.push(sep(), h("span", { class: "crumb-here", "aria-current": "page" }, sheetName));
  const canMake = !view.readOnly && ctx.selected && (tab === "Beings" || tab === "Items");
  return h(
    "nav",
    { class: "crumbs", "aria-label": "You are here" },
    parts,
    h("span", { class: "spacer" }),
    canMake ? h("button", { class: "button plain small-button", title: `Back to "What do you want to make?" in ${tab}`, onClick: () => newThing() }, svg(ICONS.plus), "Start something new") : null,
  );
}

function comingSoon(t: Tab, view: PlaceView) {
  const coming: Record<Tab, string> = {
    Adventure: "",
    Party: "",
    Maps: "",
    Journal: "",
    Rules: "",
    Beings: "",
    Items: "",
    Lore: "Lore pages, places and factions come after first playable.",
    Rulebook: "Printing a rulebook from your world comes in milestone 6.",
  };
  return {
    list: h("aside", { class: "panel list-panel", "aria-label": "List" }, h("div", { class: "panel-head" }, t), h("p", { class: "muted small pad" }, "Nothing here yet.")),
    editor: h("section", { class: "panel editor" }, h("div", { class: "empty-editor" }, h("h2", null, view.name), h("p", { class: "muted" }, coming[t]))),
  };
}

// ---------- Search (Ctrl+F) ----------

/**
 * The search box is made once per open world and kept across redraws, so typing is never
 * interrupted: only its own list of results changes as you type.
 */
let search: { el: HTMLElement; input: HTMLInputElement; reset: () => void } | null = null;

function searchBox(): HTMLElement {
  if (search) return search.el;
  let hits: SearchHit[] = [];
  let total = 0;
  let at = 0;
  let seq = 0;
  const input = h("input", { class: "text-input search-input", type: "search", placeholder: "Search everything (Ctrl+F)", "aria-label": "Search everything" });
  const list = h("div", { class: "search-results", role: "listbox", hidden: true });
  const go = (hit: SearchHit | undefined) => {
    if (!hit) return;
    list.hidden = true;
    input.blur();
    tab = hit.tab;
    selected[tab] = hit.id;
    void renderPlace();
  };
  /** What was opened lately in this place, shown when the box is empty. */
  let recents: SearchHit[] = [];
  const loadRecents = async () => {
    const all = (await attempt(() => api.recentThings())) ?? [];
    recents = all.filter((r) => r.placeId === current?.id).map((r) => ({ id: r.nodeId, name: r.name, what: "Recent", tab: r.tab as SearchHit["tab"], snippet: null }));
  };
  const show = () => {
    const q = input.value.trim();
    if (q.length < 2) {
      list.hidden = !recents.length || !!q;
      list.replaceChildren(h("p", { class: "muted small pad" }, "Recent"), ...recents.map((hit) => h("button", { class: "search-hit", role: "option", onMousedown: (e: MouseEvent) => (e.preventDefault(), go(hit)) }, h("span", { class: "search-name" }, hit.name), h("span", { class: "muted small" }, ` ${hit.tab}`))));
      return;
    }
    list.hidden = false;
    list.replaceChildren(
      ...(hits.length
        ? hits.map((hit, i) =>
            h(
              "button",
              { class: `search-hit${i === at ? " active" : ""}`, role: "option", onMousedown: (e: MouseEvent) => (e.preventDefault(), go(hit)) },
              h("span", { class: "search-name" }, hit.name),
              h("span", { class: "muted small" }, ` ${hit.what} · ${hit.tab}`),
              hit.snippet ? h("span", { class: "search-snippet muted small" }, hit.snippet) : null,
            ),
          )
        : [h("p", { class: "muted small pad" }, "Nothing matches.")]),
      ...(total > hits.length ? [h("p", { class: "muted small pad" }, `${total - hits.length} more: type more to narrow it down.`)] : []),
    );
    list.querySelector(".search-hit.active")?.scrollIntoView({ block: "nearest" });
  };
  input.addEventListener("input", () => {
    const q = input.value;
    const mine = ++seq;
    void (async () => {
      const r = q.trim().length >= 2 ? await attempt(() => api.search(q)) : { hits: [], total: 0 };
      if (mine !== seq || !r) return;
      hits = r.hits;
      total = r.total;
      at = 0;
      show();
    })();
  });
  input.addEventListener("focus", () => void loadRecents().then(() => show()));
  input.addEventListener("blur", () => setTimeout(() => (list.hidden = true), 150));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      at = Math.max(0, Math.min(hits.length - 1, at + (e.key === "ArrowDown" ? 1 : -1)));
      show();
    } else if (e.key === "Enter") go(hits[at]);
    else if (e.key === "Escape") {
      input.value = "";
      hits = [];
      list.hidden = true;
      input.blur();
    }
  });
  const el = h("div", { class: "search-box" }, input, list);
  search = { el, input, reset: () => ((input.value = ""), (hits = []), (list.hidden = true)) };
  return el;
}

// ---------- Undo and redo ----------

async function undo() {
  if (!current || current.readOnly) return;
  const r = await attempt(() => api.undo());
  if (r === null) notice("Nothing to undo.", "blue", undefined, 3000);
  else if (r) notice(`Undid: ${r.label}`, "blue", { label: "Redo", run: () => void redo() }, 5000);
  await renderPlace();
}

async function redo() {
  if (!current || current.readOnly) return;
  const r = await attempt(() => api.redo());
  if (r === null) notice("Nothing to redo.", "blue", undefined, 3000);
  else if (r) notice(`Redid: ${r.label}`, "blue", undefined, 4000);
  await renderPlace();
}

/** What the mouse is over, for Ctrl+D. */
let hovered: string | null = null;
document.addEventListener("mouseover", (e) => {
  hovered = (e.target as HTMLElement).closest?.<HTMLElement>("[data-node]")?.dataset.node ?? null;
});

// Back and Forward from the keyboard (Alt+Left and Alt+Right) and from a mouse's side buttons.
document.addEventListener("keydown", (e) => {
  if (!current || document.querySelector(".overlay") || !e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    e.preventDefault();
    void walk(e.key === "ArrowLeft" ? "back" : "forward");
  }
});
// Plain letters (A back, S forward) work only when no text box is active; Esc leaves a box.
document.addEventListener("keydown", (e) => {
  if (!current) return;
  const t = e.target as HTMLElement | null;
  const typing = !!t && (t.matches?.("input, textarea, select") || t.isContentEditable);
  if (e.key === "Escape" && typing && !document.querySelector(".overlay")) {
    t!.blur();
    return;
  }
  if (typing || document.querySelector(".overlay") || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  const k = e.key.toLowerCase();
  if (k !== "a" && k !== "s") return;
  void api.settings().then((s) => {
    if (s.letterKeys === false || !current) return;
    void walk(k === "a" ? "back" : "forward");
  });
});
document.addEventListener("mouseup", (e) => {
  if (!current || document.querySelector(".overlay") || (e.button !== 3 && e.button !== 4)) return;
  e.preventDefault();
  void walk(e.button === 3 ? "back" : "forward");
});

document.addEventListener("keydown", (e) => {
  if (!current || document.querySelector(".overlay")) return;
  if (e.key === "?" && !typingIn(e) && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    showShortcuts();
    return;
  }
  if (!(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  if (tableMode) {
    // At the DM's table: Ctrl+Z undoes the last table step; Ctrl+F finds things in the reference.
    if (k === "f" && focusTableSearch()) e.preventDefault();
    if (k === "z" && !typingIn(e) && !current.readOnly) {
      e.preventDefault();
      void attempt(() => api.undo()).then(() => renderPlace());
    }
    return;
  }
  if (k === "f") {
    if (search) (e.preventDefault(), search.input.focus(), search.input.select());
    return;
  }
  if (k === "n" && !e.shiftKey && !current.readOnly) {
    e.preventDefault();
    newThing();
    return;
  }
  if (typingIn(e)) return;
  if (k === "p" && e.shiftKey) {
    // Pin what the mouse is over (or the open sheet) to the screen. Ctrl+P stays Print.
    e.preventDefault();
    const id = hovered ?? selected[tab] ?? null;
    if (id) void pinThing(id);
    else notice("Point at something in the Codex, or open it, then press Ctrl+Shift+P to pin it to the screen.", "blue", undefined, 5000);
    return;
  }
  if (k === "d" && !current.readOnly) {
    // Like Blender: Ctrl+D is a connected copy (a variant that keeps following the original);
    // Ctrl+Shift+D is a separate copy (your own copy that goes its own way).
    e.preventDefault();
    const id = hovered ?? (tab === "Beings" || tab === "Items" ? (selected[tab] ?? null) : null);
    const ctx: PlaceCtx = { view: current, selected: selected[tab] ?? null, select: (x) => ((selected[tab] = x), void renderPlace()), refresh: () => renderPlace(), go: (t) => goTab(t), open: (x, o) => openNode(x, o) };
    if (!id) notice(`Point at something in the Codex, or open a sheet, then press ${e.shiftKey ? "Ctrl+Shift+D to make your own copy" : "Ctrl+D to make a variant"} of it.`, "blue", undefined, 5000);
    else if (e.shiftKey) void separateCopy(id, ctx);
    else void variantOf(id, ctx);
    return;
  }
  if (k === "z" && !e.shiftKey) {
    e.preventDefault();
    void undo();
  } else if (k === "y" || (k === "z" && e.shiftKey)) {
    e.preventDefault();
    void redo();
  }
});

/** "?": every shortcut, in plain words. They follow Word and Windows wherever they can. */
function showShortcuts() {
  const d = openDialog("Keyboard shortcuts");
  const rows: [string, string][] = [
    ["Ctrl+N", "Make something new"],
    ["Ctrl+D", "Connected copy: a variant of what the mouse is over (or the open sheet) that keeps following it"],
    ["Ctrl+Shift+D", "Separate copy: your own copy that goes its own way (on a map: a pin's look without its link)"],
    ["Ctrl+Shift+P", "Pin what the mouse is over to the screen, as a card that stays while you work"],
    ["Ctrl+Z", "Undo"],
    ["Ctrl+Y", "Redo (Ctrl+Shift+Z works too)"],
    ["Ctrl+F", "Search everything"],
    ["Ctrl+C, Ctrl+V", "Copy and paste text, as in Word"],
    ["Ctrl-click, Shift-click", "Pick several things in the Codex to drag together"],
    ["Alt-click", "Edit the parent of the sheet you are on"],
    ["Delete", "Delete what is picked in a list (it goes to the recycle bin)"],
    ["A, S", "Back and Forward through where you have been (when you are not typing in a box)"],
    ["Alt+Left, Alt+Right", "Back and Forward, even from a box"],
    ["Escape", "Close a pop-up, or leave a text box so the letter shortcuts work"],
    ["?", "This list"],
  ];
  d.body.append(h("table", { class: "shortcuts" }, rows.map(([k, v]) => h("tr", null, h("td", null, h("kbd", null, k)), h("td", null, v)))));
  d.footer.append(h("button", { class: "button primary", onClick: () => d.close() }, "Close"));
}

// ---------- Home and settings ----------

async function goHome() {
  const id = current?.id;
  clearPins();
  leaveDesk();
  tableMode = false;
  await attempt(() => api.goHome());
  current = null;
  await nav.home(id);
}

async function placeSettings(view: PlaceView) {
  // Worlds and modules have the same settings (share, snapshots, backups); systems fewer.
  const isWorld = view.type !== "system";
  const word = view.type;
  const d = openDialog(view.type === "module" ? "Module settings" : isWorld ? "World settings" : "System settings", { wide: true, onClose: () => void renderPlace() });
  const draw = async () => {
    const parts: HTMLElement[] = [
      h("dl", { class: "facts" }, h("dt", null, "Name"), h("dd", null, view.name), ...(view.worldName ? [h("dt", null, "World"), h("dd", null, view.worldName)] : []), ...(isWorld ? [h("dt", null, "Game system"), h("dd", null, view.systemName ?? "")] : [])),
      h("p", { class: "muted small" }, "Renaming and the card picture arrive here in a later milestone."),
    ];

    parts.push(
      h("h3", null, "AI (optional)"),
      h("p", { class: "muted" }, "Your Claude key, the model and the cost warning live here. With no key saved, the AI stays out of sight and everything else works as normal."),
      h("button", { class: "button", onClick: () => void showAiSettings(() => void draw()) }, "AI settings…"),
    );

    // Share: a copy to send. Always the world, its system and its pictures; never your settings.
    const history = h("input", { type: "checkbox" });
    const snaps = h("input", { type: "checkbox" });
    const chat = h("input", { type: "checkbox" });
    const journal = h("input", { type: "checkbox" });
    parts.push(
      h("h3", null, `Share this ${word}`),
      h("p", { class: "muted" }, view.type === "module" ? "Saves one file to email, put on a USB stick or send any way you like. It always carries the module, its world and system, and its pictures; never your settings or your API key." : isWorld ? "Saves one file to email, put on a USB stick or send any way you like. It always carries the world, its system, its pictures and its World Notes; never your settings or your API key." : "Saves one file with this system (and any system it is built on) to send to someone."),
      h("label", { class: "check" }, history, "Include undo history"),
      isWorld ? h("label", { class: "check" }, snaps, "Include snapshots") : h("span"),
      h("label", { class: "check" }, chat, "Include the AI chat"),
      isWorld ? h("label", { class: "check" }, journal, "Include my journal and game nights (private unless ticked)") : h("span"),
      h(
        "div",
        { class: "row" },
        h(
          "button",
          {
            class: "button plain",
            onClick: async () => {
              const path = await attempt(() => api.share({ history: history.checked, snapshots: snaps.checked, chat: chat.checked, journal: journal.checked }));
              if (path) notice(`Saved ${path.split(/[\\/]/).pop()}. Send it to anyone with DM in a Pocket; they use Import on their home screen.`, "green", undefined, 10000);
            },
          },
          "Share…",
        ),
      ),
    );

    // Checks: each kind of yellow warning can be switched off or made stricter.
    const checks = await attempt(() => api.checkSettings());
    if (checks) {
      const names: Record<string, [string, string]> = {
        balance: ["Balance", "damage or hit points far off for a challenge rating"],
        economy: ["Economy", "a weaker item that costs more than a stronger one in its category"],
        filing: ["Filing", "a weapon with no attack, a creature filed as an item, duplicate names, empty sheets"],
        lore: ["Lore consistency", "found only by the AI's Check for errors: things that contradict the world or each other"],
      };
      parts.push(
        h("h3", null, "Checks"),
        h("p", { class: "muted" }, "The free checks that raise yellow flags. Normal is always measured against this system's own content. Red flags (broken links and your world rules) can't be switched off, only ignored one by one."),
        h(
          "ul",
          { class: "check-settings" },
          (Object.keys(names) as (keyof typeof checks)[]).map((k) => {
            const on = h("input", { type: "checkbox", checked: checks[k].on, disabled: view.readOnly });
            on.addEventListener("change", async () => (await attempt(() => api.setCheck(k, { on: on.checked })), await draw()));
            const level = h("input", { type: "range", min: "0", max: "2", step: "1", value: String(["relaxed", "normal", "strict"].indexOf(checks[k].level)), disabled: view.readOnly || !checks[k].on, "aria-label": `${names[k]![0]} sensitivity` });
            level.addEventListener("change", async () => (await attempt(() => api.setCheck(k, { level: (["relaxed", "normal", "strict"] as const)[Number(level.value)] })), await draw()));
            return h(
              "li",
              null,
              h("label", { class: "check" }, on, h("strong", null, names[k]![0])),
              h("span", { class: "muted small grow" }, names[k]![1]),
              h("span", { class: "slider" }, h("span", { class: "muted tiny" }, "Relaxed"), level, h("span", { class: "muted tiny" }, "Strict")),
            );
          }),
        ),
      );
    }

    if (isWorld) {
      // Snapshots: named save points, kept until deleted.
      const snapshots = await attempt(() => api.snapshots());
      const name = h("input", { class: "text-input", placeholder: "Name it, for example: before I removed Strength", maxlength: 200, disabled: view.readOnly });
      const take = h("button", { class: "button plain", disabled: view.readOnly }, "Take snapshot");
      const doTake = async () => {
        if ((await attempt(() => api.takeSnapshot(name.value))) !== undefined) {
          notice(`Snapshot "${name.value.trim()}" saved.`, "green", undefined, 4000);
          await draw();
        }
      };
      take.addEventListener("click", () => void doTake());
      name.addEventListener("keydown", (e) => e.key === "Enter" && void doTake());
      const kb = Math.max(1, Math.round((snapshots?.bytes ?? 0) / 1024));
      parts.push(
        h("h3", null, "Snapshots"),
        h("p", { class: "muted" }, "Save points you name yourself. They hold the world and its system together and are kept until you delete them. Restoring one takes a snapshot of how things are now first, so a restore can be undone."),
        h("div", { class: "inline" }, name, take),
        snapshots?.list.length
          ? h(
              "ul",
              { class: "bin-list" },
              snapshots.list.map((x) =>
                h(
                  "li",
                  null,
                  svg(ICONS.clock),
                  h("div", { class: "bin-text" }, h("div", { class: "bin-name" }, x.name), h("div", { class: "muted small" }, `${x.label}, ${new Date(x.time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}${x.auto ? " · taken by the app" : ""}`)),
                  h(
                    "button",
                    {
                      class: "button plain",
                      disabled: view.readOnly,
                      onClick: async () => {
                        const ok = await ask(`Restore "${x.name}"?`, ["The world and its system go back to how they were then. A snapshot of how they are now is taken first, so nothing is lost."], [
                          { label: "Cancel", value: false },
                          { label: "Restore", value: true, kind: "primary" },
                        ]);
                        if (ok && (await attempt(() => api.restoreSnapshot(x.id)))) {
                          notice(`Restored "${x.name}". A snapshot of before was taken first.`, "green", undefined, 6000);
                          await draw();
                        }
                      },
                    },
                    "Restore",
                  ),
                  h(
                    "button",
                    {
                      class: "icon-button",
                      title: "Delete this snapshot",
                      "aria-label": `Delete snapshot ${x.name}`,
                      onClick: async () => {
                        const ok = await ask(`Delete the snapshot "${x.name}"?`, ["The world itself isn't changed. The snapshot can't be brought back."], [
                          { label: "Cancel", value: false },
                          { label: "Delete snapshot", value: true, kind: "danger" },
                        ]);
                        if (ok && (await attempt(() => api.deleteSnapshot(x.id)))) await draw();
                      },
                    },
                    svg(ICONS.trash),
                  ),
                ),
              ),
            )
          : h("p", { class: "muted small" }, "No snapshots yet."),
        h(
          "div",
          { class: "inline" },
          h("span", { class: "muted small" }, `History (backups and snapshots) uses about ${kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`}. Pictures are stored once and shared, never copied into each one.`),
          snapshots?.list.some((x) => x.auto)
            ? h(
                "button",
                {
                  class: "link small",
                  title: "Removes the snapshots the app took by itself before restores; yours are kept",
                  onClick: async () => {
                    const n = await attempt(() => api.cleanUpSnapshots());
                    if (n !== undefined) notice(`Cleaned up ${n} snapshot${n === 1 ? "" : "s"} the app had taken.`, "green", undefined, 4000);
                    await draw();
                  },
                },
                "Clean up",
              )
            : null,
        ),
      );

      // Backups.
      const backups = (await attempt(() => api.backups())) ?? [];
      parts.push(h("h3", null, "Backups"), h("p", { class: "muted" }, "Kept automatically: one a day for the last week and one a week for the last month. Restoring one first takes a snapshot of how the world is now, so a restore can be undone."));
      if (!backups.length) parts.push(h("p", { class: "muted small" }, "No backups yet. The first one is made the first time the world is opened each day."));
      else
        parts.push(
          h(
            "ul",
            { class: "bin-list" },
            backups.map((b) =>
              h(
                "li",
                null,
                svg(ICONS.folder),
                h("div", { class: "bin-text" }, h("div", { class: "bin-name" }, b.label), h("div", { class: "muted small" }, new Date(b.time).toLocaleDateString())),
                h(
                  "button",
                  {
                    class: "button plain",
                    disabled: view.readOnly,
                    onClick: async () => {
                      const ok = await ask(`Restore the backup from ${b.label.toLowerCase()}?`, ["The world goes back to how it was then. A snapshot of how it is now is taken first, so nothing is lost."], [
                        { label: "Cancel", value: false },
                        { label: "Restore", value: true, kind: "primary" },
                      ]);
                      if (!ok) return;
                      if ((await attempt(() => api.restoreBackup(b.file))) !== undefined) {
                        notice(`Restored the backup from ${b.label.toLowerCase()}. A snapshot of before was saved first.`, "green");
                        await draw();
                      }
                    },
                  },
                  "Restore",
                ),
              ),
            ),
          ),
        );
    }
    d.body.replaceChildren(...parts);
  };
  await draw();
  d.footer.append(h("span", { class: "spacer" }), h("button", { class: "button primary", onClick: () => d.close() }, "Done"));
}
