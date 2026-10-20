// Inside an open world or system: the tab bar, the list, editor and flag panels, undo and redo,
// and World settings.

import type { FlagView, PlaceView } from "../app/backend.ts";
import type { Place } from "../app/settings.ts";
import { api } from "./api.ts";
import { app, attempt, brand, iconButton, nav, typingIn } from "./common.ts";
import { ask, notice, openDialog } from "./dialogs.ts";
import { h, svg } from "./dom.ts";
import { ICONS } from "./icons.ts";
import { rulesPanels } from "./rules-tab.ts";

const TABS = ["Rules", "Beings", "Items", "Lore", "Rulebook"] as const;
type Tab = (typeof TABS)[number];

/** What is open right now, or null on the home screen. */
export let current: PlaceView | null = null;
let tab: Tab = "Rules";
/** The node open in the editor, per tab. */
const selected: Partial<Record<Tab, string | null>> = {};

export interface PlaceCtx {
  view: PlaceView;
  selected: string | null;
  select: (id: string | null) => void;
  /** Redraws after a change. */
  refresh: () => Promise<void>;
}

export async function openPlace(place: Place, mode: "normal" | "read-only" | "take-over" = "normal", name?: string) {
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
  tab = "Rules";
  for (const t of TABS) selected[t] = null;
  await renderPlace();
  if (res.view.recovered) notice("Recovered after an unexpected close.", "blue", undefined, 0);
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
  };
  const isWorld = view.type === "world";
  const tabs = h(
    "nav",
    { class: "tabs", role: "tablist" },
    TABS.map((t) => h("button", { class: `tab${t === tab ? " active" : ""}`, role: "tab", "aria-selected": t === tab ? "true" : "false", onClick: () => ((tab = t), void renderPlace()) }, t)),
  );
  const top = h(
    "header",
    { class: "topbar place" },
    brand(),
    h("div", { class: "place-title" }, h("span", { class: "place-name" }, view.name), h("span", { class: "muted small" }, isWorld ? `World · ${view.systemName}` : "System")),
    tabs,
    h(
      "nav",
      { class: "top-actions" },
      iconButton(ICONS.undo, "Undo", () => void undo(), { iconOnly: true, title: "Undo (Ctrl+Z)", disabled: view.readOnly }),
      iconButton(ICONS.redo, "Redo", () => void redo(), { iconOnly: true, title: "Redo (Ctrl+Y)", disabled: view.readOnly }),
      iconButton(ICONS.home, "Home", () => void goHome()),
      iconButton(ICONS.gear, isWorld ? "World settings" : "System settings", () => void placeSettings(view)),
    ),
  );
  const banner = view.readOnly ? h("div", { class: "banner" }, h("strong", null, "Read-only. "), view.readOnlyReason ?? "", " Nothing you do here is saved.") : null;

  let list: HTMLElement;
  let editor: HTMLElement;
  if (tab === "Rules") ({ list, editor } = await rulesPanels(ctx));
  else ({ list, editor } = comingSoon(tab, view));
  const flags = (await attempt(() => api.flags())) ?? [];
  if (current !== view) return; // went home while loading

  const workspace = h("div", { class: "workspace" }, list, editor, flagPanel(flags, ctx));
  app.replaceChildren(top, ...(banner ? [banner] : []), workspace);

  for (const [key, top] of scroll) {
    const el = document.querySelector<HTMLElement>(`[data-scroll="${CSS.escape(key)}"]`);
    if (el) el.scrollTop = top;
  }
  // A box that just opened (such as a new rule's name) takes the cursor.
  const auto = document.querySelector<HTMLElement>("[data-autofocus]");
  if (auto) auto.focus();
  else if (focusKey) {
    const el = document.querySelector<HTMLElement>(`[data-key="${CSS.escape(focusKey)}"]`);
    el?.focus();
    if (caret !== null && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.type !== "number") el.setSelectionRange(caret, caret);
  }
}

function comingSoon(t: Tab, view: PlaceView) {
  const coming: Record<Tab, string> = {
    Rules: "",
    Beings: "Monsters, NPCs, characters, races and classes, with the library, are the next step of this milestone.",
    Items: "Items and the library are the next step of this milestone.",
    Lore: "Lore pages, places and factions come after first playable.",
    Rulebook: "Printing a rulebook from your world comes in milestone 6.",
  };
  return {
    list: h("aside", { class: "panel list-panel", "aria-label": "List" }, h("div", { class: "panel-head" }, t), h("p", { class: "muted small pad" }, "Nothing here yet.")),
    editor: h("section", { class: "panel editor" }, h("div", { class: "empty-editor" }, h("h2", null, view.name), h("p", { class: "muted" }, coming[t]))),
  };
}

function flagPanel(flags: FlagView[], ctx: PlaceCtx) {
  const red = flags.filter((f) => f.color === "red").length;
  const yellow = flags.length - red;
  const counter = flags.length ? [red ? `${red} red` : "", yellow ? `${yellow} yellow` : ""].filter(Boolean).join(" · ") : "";
  return h(
    "aside",
    { class: "panel flag-panel", "aria-label": "Flags", "data-scroll": "flags" },
    h("div", { class: "panel-head" }, "Flags", counter ? h("span", { class: "muted small head-count" }, counter) : null),
    flags.length
      ? h(
          "ul",
          { class: "flag-list" },
          flags.map((f) =>
            h(
              "li",
              {
                class: `flag ${f.color}`,
                tabindex: 0,
                title: f.nodes.length ? "Click to open the first thing it affects" : "",
                onClick: () => f.nodes[0] && ctx.select(f.nodes[0]),
                onKeydown: (e: KeyboardEvent) => e.key === "Enter" && f.nodes[0] && ctx.select(f.nodes[0]),
              },
              h("div", { class: "flag-title" }, f.title),
              f.detail ? h("div", { class: "muted small" }, f.detail) : null,
            ),
          ),
        )
      : h("p", { class: "muted small pad" }, "No flags. Everything checks out."),
  );
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

document.addEventListener("keydown", (e) => {
  if (!current || document.querySelector(".overlay") || typingIn(e)) return;
  if (!(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  if (k === "z" && !e.shiftKey) {
    e.preventDefault();
    void undo();
  } else if (k === "y" || (k === "z" && e.shiftKey)) {
    e.preventDefault();
    void redo();
  }
});

// ---------- Home and settings ----------

async function goHome() {
  const id = current?.id;
  await attempt(() => api.goHome());
  current = null;
  await nav.home(id);
}

async function placeSettings(view: PlaceView) {
  const d = openDialog(view.type === "world" ? "World settings" : "System settings", { wide: true });
  const backups = view.type === "world" ? ((await attempt(() => api.backups())) ?? []) : [];
  d.body.append(
    h("dl", { class: "facts" }, h("dt", null, "Name"), h("dd", null, view.name), ...(view.type === "world" ? [h("dt", null, "Game system"), h("dd", null, view.systemName ?? "")] : [])),
    h("p", { class: "muted small" }, "Renaming, the card picture and copying a world arrive here in later milestones."),
  );
  if (view.type === "world") {
    d.body.append(h("h3", null, "Backups"), h("p", { class: "muted" }, "Kept automatically: one a day for the last week and one a week for the last month. Restoring one first takes a snapshot of how the world is now, so a restore can be undone."));
    if (!backups.length) d.body.append(h("p", { class: "muted small" }, "No backups yet. The first one is made the first time the world is opened each day."));
    else
      d.body.append(
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
                      d.close();
                      notice(`Restored the backup from ${b.label.toLowerCase()}. A snapshot of before was saved first.`, "green");
                      await renderPlace();
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
  d.footer.append(h("span", { class: "spacer" }), h("button", { class: "button primary", onClick: () => d.close() }, "Done"));
}

