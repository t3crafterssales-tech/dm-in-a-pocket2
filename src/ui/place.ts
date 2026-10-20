// Inside an open world or system: the tab bar, the list, editor and flag panels, undo and redo,
// and World settings.

import type { PlaceView } from "../app/backend.ts";
import type { Place } from "../app/settings.ts";
import { api } from "./api.ts";
import { app, attempt, brand, iconButton, nav, typingIn } from "./common.ts";
import { ask, notice, openDialog } from "./dialogs.ts";
import { h, svg } from "./dom.ts";
import { ICONS } from "./icons.ts";
import { flagPanel, showNodeBin } from "./flag-panel.ts";
import { showHistory } from "./history-dialog.ts";
import { lorePanels } from "./lore-tab.ts";
import { showQuickStart } from "./quickstart-dialog.ts";
import { rulebookPanels } from "./rulebook-tab.ts";
import { rulesPanels } from "./rules-tab.ts";
import { sheetPanels } from "./sheets-tab.ts";
import { drawTableMode, focusTableSearch, forgetTableData } from "./table-mode.ts";

const TABS = ["Rules", "Beings", "Items", "Lore", "Rulebook"] as const;
type Tab = (typeof TABS)[number];

/** What is open right now, or null on the home screen. */
export let current: PlaceView | null = null;
let tab: Tab = "Rules";
/** True while the world is shown in Table mode, the read-only reading view for running a game. */
let tableMode = false;
/** The node open in the editor, per tab. */
const selected: Partial<Record<Tab, string | null>> = {};

export interface PlaceCtx {
  view: PlaceView;
  selected: string | null;
  select: (id: string | null) => void;
  /** Redraws after a change. */
  refresh: () => Promise<void>;
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
  tab = "Rules";
  tableMode = false;
  for (const t of TABS) selected[t] = null;
  await renderPlace();
  if (res.view.recovered) notice("Recovered after an unexpected close.", "blue", undefined, 0);
  if (then === "quickstart") await showQuickStart(() => renderPlace());
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
  if (tableMode) return drawTableMode(view, () => ((tableMode = false), forgetTableData(), void renderPlace()), () => void goHome());
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
      iconButton(ICONS.dice, "Table mode", () => ((tableMode = true), void renderPlace()), { title: "Table mode: read and roll while you run a game, with nothing to change by accident" }),
      iconButton(ICONS.undo, "Undo", () => void undo(), { iconOnly: true, title: "Undo (Ctrl+Z)", disabled: view.readOnly }),
      iconButton(ICONS.redo, "Redo", () => void redo(), { iconOnly: true, title: "Redo (Ctrl+Y)", disabled: view.readOnly }),
      iconButton(ICONS.clock, "History", () => void showHistory(ctx), { iconOnly: true, title: "History: every change, and rolling back to any of them" }),
      iconButton(ICONS.bin, "Recycle bin", () => void showNodeBin(ctx), { iconOnly: true, title: "Recycle bin: restore deleted things" }),
      iconButton(ICONS.home, "Home", () => void goHome()),
      iconButton(ICONS.gear, isWorld ? "World settings" : "System settings", () => void placeSettings(view)),
    ),
  );
  const banner = view.readOnly ? h("div", { class: "banner" }, h("strong", null, "Read-only. "), view.readOnlyReason ?? "", " Nothing you do here is saved.") : null;

  let list: HTMLElement;
  let editor: HTMLElement;
  if (tab === "Rules") ({ list, editor } = await rulesPanels(ctx));
  else if (tab === "Beings") ({ list, editor } = await sheetPanels(ctx, "beings"));
  else if (tab === "Items") ({ list, editor } = await sheetPanels(ctx, "items"));
  else if (tab === "Rulebook") ({ list, editor } = await rulebookPanels(ctx));
  else if (tab === "Lore") ({ list, editor } = await lorePanels(ctx));
  else ({ list, editor } = comingSoon(tab, view));
  const flags = await flagPanel(ctx);
  if (current !== view) return; // went home while loading

  const workspace = h("div", { class: "workspace" }, list, editor, flags);
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
  if (!current || document.querySelector(".overlay")) return;
  if (!(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  if (tableMode) {
    // Nothing to undo in a read-only view; Ctrl+F finds things.
    if (k === "f" && focusTableSearch()) e.preventDefault();
    return;
  }
  if (typingIn(e)) return;
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
  const isWorld = view.type === "world";
  const d = openDialog(isWorld ? "World settings" : "System settings", { wide: true, onClose: () => void renderPlace() });
  const draw = async () => {
    const parts: HTMLElement[] = [
      h("dl", { class: "facts" }, h("dt", null, "Name"), h("dd", null, view.name), ...(isWorld ? [h("dt", null, "Game system"), h("dd", null, view.systemName ?? "")] : [])),
      h("p", { class: "muted small" }, "Renaming and the card picture arrive here in a later milestone."),
    ];

    // Share: a copy to send. Always the world, its system and its pictures; never your settings.
    const history = h("input", { type: "checkbox" });
    const snaps = h("input", { type: "checkbox" });
    parts.push(
      h("h3", null, isWorld ? "Share this world" : "Share this system"),
      h("p", { class: "muted" }, isWorld ? "Saves one file to email, put on a USB stick or send any way you like. It always carries the world, its system and its pictures; never your settings." : "Saves one file with this system (and any system it is built on) to send to someone."),
      h("label", { class: "check" }, history, "Include undo history"),
      isWorld ? h("label", { class: "check" }, snaps, "Include snapshots") : h("span"),
      h(
        "div",
        { class: "row" },
        h(
          "button",
          {
            class: "button plain",
            onClick: async () => {
              const path = await attempt(() => api.share({ history: history.checked, snapshots: snaps.checked }));
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
