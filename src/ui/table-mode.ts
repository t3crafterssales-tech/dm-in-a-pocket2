// Table mode: a read-only reading view for running a game from the app. Tabs Rules, Monsters,
// Items and Tables; a search box; up to three entries side by side (Ctrl-click opens one beside
// the others, like a new browser tab); stars; and rolling on roll tables. Nothing can be edited
// here, so nothing changes by accident mid-game. Edit goes back to the normal workspace.

import type { PlaceView } from "../app/backend.ts";
import type { TableEntry, TableModeView, TableTab } from "../app/tablemode.ts";
import { api, pictureUrl } from "./api.ts";
import { app, attempt, brand, iconButton } from "./common.ts";
import { h, svg } from "./dom.ts";
import { ICONS } from "./icons.ts";

const MAX_PANELS = 3;

interface State {
  placeId: string;
  tab: TableTab;
  search: string;
  starredOnly: boolean;
  /** The entries open side by side, left to right. */
  panels: string[];
  /** The panel a plain click replaces. */
  active: number;
  rolls: Map<string, { roll: number; text: string }>;
  data: TableModeView | null;
}

let state: State | null = null;

export function tableModeState(placeId: string): State {
  if (!state || state.placeId !== placeId) state = { placeId, tab: "rules", search: "", starredOnly: false, panels: [], active: 0, rolls: new Map(), data: null };
  return state;
}

/** What a search matches: the name, the numbers line and the words. */
function matches(e: TableEntry, words: string[]): boolean {
  if (!words.length) return true;
  const text = [e.title, e.stats ?? "", ...e.paragraphs, ...(e.table?.rows.map((r) => `${r.text} ${r.result?.name ?? ""}`) ?? [])].join(" ").toLowerCase();
  return words.every((w) => text.includes(w));
}

export async function drawTableMode(view: PlaceView, exit: () => void, goHome: () => void): Promise<void> {
  const s = tableModeState(view.id);
  const focusKey = (document.activeElement as HTMLElement | null)?.dataset?.key ?? null;
  const caret = document.activeElement instanceof HTMLInputElement ? document.activeElement.selectionStart : null;
  const scroll = [...document.querySelectorAll<HTMLElement>("[data-scroll]")].map((el) => [el.dataset.scroll!, el.scrollTop] as const);
  if (!s.data) s.data = (await attempt(() => api.tableMode())) ?? { tabs: [] };
  const data = s.data;
  const redraw = () => void drawTableMode(view, exit, goHome);
  const all = new Map(data.tabs.flatMap((t) => t.entries.map((e) => [e.id, { entry: e, tab: t.id }] as const)));
  s.panels = s.panels.filter((id) => all.has(id));
  s.active = Math.min(s.active, Math.max(0, s.panels.length - 1));

  /** Opens an entry: in the active panel, or beside the others with Ctrl-click. */
  const open = (id: string, beside: boolean) => {
    const at = s.panels.indexOf(id);
    if (at >= 0) s.active = at;
    else if (beside || !s.panels.length) {
      if (s.panels.length >= MAX_PANELS) s.panels.shift();
      s.panels.push(id);
      s.active = s.panels.length - 1;
    } else s.panels[s.active] = id;
    redraw();
  };
  const star = async (id: string) => {
    await attempt(() => api.toggleFavourite(id));
    s.data = null;
    redraw();
  };
  const roll = async (id: string) => {
    const r = await attempt(() => api.rollTable(id));
    if (!r) return;
    s.rolls.set(id, { roll: r.roll, text: [r.text, r.result?.name].filter(Boolean).join(": ") || "No row for that number." });
    redraw();
  };

  // The top bar: the four tabs, then Edit and Home.
  const tabs = h(
    "nav",
    { class: "tabs", role: "tablist" },
    data.tabs.map((t) => h("button", { class: `tab${t.id === s.tab ? " active" : ""}`, role: "tab", "aria-selected": t.id === s.tab ? "true" : "false", onClick: () => ((s.tab = t.id), redraw()) }, t.title)),
  );
  const top = h(
    "header",
    { class: "topbar place table-mode" },
    brand(),
    h("div", { class: "place-title" }, h("span", { class: "place-name" }, view.name), h("span", { class: "muted small" }, "Table mode · read-only")),
    tabs,
    h("nav", { class: "top-actions" }, iconButton(ICONS.pencil, "Edit", exit, { title: "Back to editing this world" }), iconButton(ICONS.home, "Home", goHome)),
  );

  // The list on the left, with the search box.
  const words = s.search.toLowerCase().split(/\s+/).filter(Boolean);
  const tab = data.tabs.find((t) => t.id === s.tab) ?? data.tabs[0];
  const shown = (tab?.entries ?? []).filter((e) => matches(e, words) && (!s.starredOnly || e.favourite));
  const search = h("input", { class: "text-input", type: "search", placeholder: "Search", value: s.search, "data-key": "table-search", "aria-label": "Search" });
  search.addEventListener("input", () => {
    s.search = search.value;
    redraw();
  });
  search.addEventListener("keydown", (e) => {
    // Enter opens the first match.
    if (e.key === "Enter" && shown[0]) open(shown[0].id, e.ctrlKey || e.metaKey);
  });
  const starredBox = h("input", { type: "checkbox", checked: s.starredOnly });
  starredBox.addEventListener("change", () => ((s.starredOnly = starredBox.checked), redraw()));
  const elsewhere = words.length
    ? data.tabs.filter((t) => t.id !== s.tab).map((t) => ({ t, n: t.entries.filter((e) => matches(e, words) && (!s.starredOnly || e.favourite)).length })).filter((x) => x.n)
    : [];

  const groups: HTMLElement[] = [];
  let lastGroup = "";
  let ul: HTMLElement | null = null;
  for (const e of shown) {
    if (e.group !== lastGroup || !ul) {
      lastGroup = e.group;
      ul = h("ul", { class: "items table-items" });
      groups.push(h("div", { class: "section" }, h("div", { class: "table-group" }, e.group), ul));
    }
    const row = h(
      "li",
      { class: `item depth-${Math.min(e.depth, 4)}${s.panels.includes(e.id) ? " selected" : ""}`, title: "Click to read. Ctrl-click opens it beside the others." },
      h("button", { class: `star-button${e.favourite ? " on" : ""}`, title: e.favourite ? "Unstar" : "Star", "aria-label": e.favourite ? `Unstar ${e.title}` : `Star ${e.title}`, onClick: (ev: Event) => (ev.stopPropagation(), void star(e.id)) }, svg(ICONS.star)),
      h("span", { class: "item-name" }, e.title),
    );
    row.addEventListener("click", (ev) => open(e.id, ev.ctrlKey || ev.metaKey));
    ul.appendChild(row);
  }
  const list = h(
    "aside",
    { class: "panel list-panel", "aria-label": "Contents", "data-scroll": `table-list-${s.tab}` },
    h("div", { class: "panel-head table-search" }, search, h("label", { class: "check small" }, starredBox, "Starred only")),
    elsewhere.length ? h("p", { class: "muted small pad" }, "Also in ", elsewhere.map((x, i) => [i ? ", " : "", h("a", { href: "#", onClick: (ev: Event) => (ev.preventDefault(), (s.tab = x.t.id), redraw()) }, `${x.t.title} (${x.n})`)])) : null,
    groups.length ? groups : h("p", { class: "muted small pad" }, words.length ? "Nothing matches that search." : s.starredOnly ? "Nothing starred here yet. Click a star to keep something handy." : "Nothing here yet."),
  );

  // The reading panels.
  const card = (id: string, i: number) => {
    const { entry: e } = all.get(id)!;
    const close = h("button", { class: "icon-button", title: "Close", "aria-label": `Close ${e.title}`, onClick: (ev: Event) => (ev.stopPropagation(), s.panels.splice(i, 1), redraw()) }, svg(ICONS.close));
    const rolled = s.rolls.get(id);
    const body: (HTMLElement | null)[] = [
      e.picture ? h("img", { class: "reading-picture", src: pictureUrl(e.picture), alt: "" }) : null,
      e.stats ? h("div", { class: "reading-stats" }, e.stats) : null,
      ...e.paragraphs.map((p) => h("p", null, p)),
    ];
    if (e.table) {
      body.push(
        h(
          "div",
          { class: "roll-line" },
          h("button", { class: "button primary", disabled: !e.table.canRoll, onClick: () => void roll(id) }, `Roll ${e.table.die}`),
          rolled ? h("strong", { class: "roll-result", "aria-live": "polite" }, `Rolled ${rolled.roll}: ${rolled.text}`) : null,
        ),
        h(
          "table",
          { class: "compare roll-table" },
          h("thead", null, h("tr", null, h("th", null, e.table.die), h("th", null, "Result"))),
          h(
            "tbody",
            null,
            e.table.rows.map((r) => {
              const [from, to] = r.range.split("-").map(Number);
              const hit = rolled && rolled.roll >= from! && rolled.roll <= (to ?? from)!;
              const target = r.result && all.has(r.result.id) ? r.result : null;
              return h(
                "tr",
                { class: hit ? "hit" : "" },
                h("td", null, r.range),
                h("td", null, r.text, r.text && r.result ? ": " : "", target ? h("a", { href: "#", onClick: (ev: MouseEvent) => (ev.preventDefault(), open(target.id, ev.ctrlKey || ev.metaKey)) }, target.name) : (r.result?.name ?? "")),
              );
            }),
          ),
        ),
      );
    }
    if (e.mentions.length)
      body.push(
        h(
          "p",
          { class: "reading-see" },
          "See ",
          e.mentions.map((m, j) => [j ? (j === e.mentions.length - 1 ? " and " : ", ") : "", h("a", { href: "#", title: "Ctrl-click opens it beside this one", onClick: (ev: MouseEvent) => (ev.preventDefault(), (s.active = i), open(m.id, ev.ctrlKey || ev.metaKey)) }, m.name)]),
          ".",
        ),
      );
    const c = h(
      "article",
      { class: `panel reading${i === s.active && s.panels.length > 1 ? " active" : ""}`, "data-scroll": `reading-${id}` },
      h(
        "div",
        { class: "panel-head" },
        h("button", { class: `star-button${e.favourite ? " on" : ""}`, title: e.favourite ? "Unstar" : "Star", "aria-label": e.favourite ? `Unstar ${e.title}` : `Star ${e.title}`, onClick: () => void star(id) }, svg(ICONS.star)),
        h("h2", { class: "reading-title" }, e.title),
        h("span", { class: "muted small" }, e.group),
        close,
      ),
      h("div", { class: "reading-body" }, body),
    );
    c.addEventListener("mousedown", () => {
      if (s.active !== i) {
        s.active = i;
        c.parentElement?.querySelectorAll(".reading").forEach((x, j) => x.classList.toggle("active", j === i && s.panels.length > 1));
      }
    });
    return c;
  };
  const reading = s.panels.length
    ? h("div", { class: `reading-row panels-${s.panels.length}` }, s.panels.map(card))
    : h("section", { class: "panel editor" }, h("div", { class: "empty-editor" }, h("h2", null, "Table mode"), h("p", { class: "muted" }, "Pick something on the left to read it. Ctrl-click opens it beside the one already open, so a monster and a condition can sit side by side."), h("p", { class: "muted" }, "Nothing can be changed here. Edit goes back to the workspace.")));

  app.replaceChildren(top, h("div", { class: "workspace table-workspace" }, list, reading));
  for (const [key, y] of scroll) {
    const el = document.querySelector<HTMLElement>(`[data-scroll="${CSS.escape(key)}"]`);
    if (el) el.scrollTop = y;
  }
  if (focusKey) {
    const el = document.querySelector<HTMLInputElement>(`[data-key="${CSS.escape(focusKey)}"]`);
    el?.focus();
    if (el && caret !== null) el.setSelectionRange(caret, caret);
  }
}

/** Ctrl+F jumps to the search box. */
export function focusTableSearch(): boolean {
  const el = document.querySelector<HTMLInputElement>('[data-key="table-search"]');
  if (!el) return false;
  el.focus();
  el.select();
  return true;
}

/** Called when leaving Table mode, so it reopens fresh next time but keeps what was open. */
export function forgetTableData() {
  if (state) state.data = null;
}
