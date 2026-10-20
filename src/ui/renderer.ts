// The app window: the home screen with its two shelves, the New system and New world pop-ups,
// the recycle bin, settings, and the full-screen view of an open world or system.

import type { HomeData, PlaceView, RecycledInfo, SystemCard, WorldCard } from "../app/backend.ts";
import type { Place } from "../app/settings.ts";
import { count, whenLabel } from "../app/words.ts";
import { AppError, api, pictureUrl } from "./api.ts";
import { ask, notice, openDialog } from "./dialogs.ts";
import { h, svg } from "./dom.ts";
import { ICONS, LOGO } from "./icons.ts";

const app = document.getElementById("app")!;
let current: PlaceView | null = null;
/** The last thing deleted from the home screen, so Ctrl+Z can put it back. */
let lastDeleted: RecycledInfo | null = null;
let logo: SVGElement | null = null;

// ---------- Save indicator ----------

window.dm.onEvent((e) => {
  if (e.type === "saved") pulseLogo();
  else if (e.type === "saveFailed") notice(`Couldn't save just now (${e.message}). Your changes are kept and saving will try again.`, "yellow");
  else if (e.type === "readOnly") {
    if (current) {
      current.readOnly = true;
      current.readOnlyReason = e.reason;
      renderPlace(current);
    }
    notice(`${e.reason} It is now read-only here.`, "blue", undefined, 0);
  }
});

function pulseLogo() {
  if (!logo) return;
  logo.classList.remove("pulse");
  void (logo as unknown as HTMLElement).getBoundingClientRect();
  logo.classList.add("pulse");
}

function brand(): HTMLElement {
  logo = svg(LOGO);
  return h("div", { class: "brand", title: "The logo glows each time your work is saved" }, logo, h("span", { class: "brand-name" }, "DM in a Pocket"));
}

function iconButton(icon: string, label: string, onClick: () => void, opts: { disabled?: boolean; title?: string; badge?: number } = {}) {
  return h(
    "button",
    { class: "top-button", disabled: !!opts.disabled, title: opts.title ?? label, onClick },
    svg(icon),
    h("span", null, label),
    opts.badge ? h("span", { class: "count-badge", "aria-label": `${opts.badge} in the bin` }, opts.badge) : null,
  );
}

/** Runs an action and shows any problem as a red notice instead of failing quietly. */
async function attempt<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    notice(e instanceof AppError || e instanceof Error ? e.message : String(e), "red");
    return undefined;
  }
}

// ---------- Home screen ----------

async function showHome(highlight?: string) {
  current = null;
  const home = await attempt(() => api.home());
  if (!home) return;
  renderHome(home, highlight);
}

function renderHome(home: HomeData, highlight?: string) {
  const canCreateWorld = home.systems.length > 0;
  const top = h(
    "header",
    { class: "topbar" },
    brand(),
    h(
      "nav",
      { class: "top-actions" },
      iconButton(ICONS.import, "Import", () => {}, { disabled: true, title: "Import (open a world or system file) is coming with sharing, after first playable" }),
      iconButton(ICONS.bin, "Recycle bin", () => void showRecycleBin(), { badge: home.binCount }),
      iconButton(ICONS.gear, "Settings", () => void showSettings()),
    ),
  );

  const systems = shelf(
    "Systems",
    "The rules. One system can power many worlds.",
    h("button", { class: "button primary", onClick: () => void newSystem(home) }, svg(ICONS.plus), "New system"),
    home.systems.map((s) => systemCard(s, s.id === highlight)),
    "No systems yet. Every world needs a system, so start with New system.",
  );
  const newWorldButton = h("button", { class: "button primary", disabled: !canCreateWorld, onClick: () => void newWorld(home) }, svg(ICONS.plus), "New world");
  const worlds = shelf(
    "Worlds",
    "The setting: lore, places, creatures and characters.",
    // A disabled button shows no hover hint, so the hint sits on a wrapper around it.
    h("span", { class: "hint-wrap", title: canCreateWorld ? "" : "Create a system first." }, newWorldButton),
    home.worlds.map((w) => worldCard(w, w.id === highlight)),
    canCreateWorld ? "No worlds yet. Make one with New world." : "No worlds yet. Create a system first, then make a world with it.",
  );

  app.replaceChildren(top, h("main", { class: "home" }, systems, worlds), h("footer", { class: "home-footer" }, "Main folder: ", h("button", { class: "link", title: "Show in File Explorer", onClick: () => void window.dm.showFolder() }, home.folder)));
  if (highlight) (app.querySelector(`[data-id="${CSS.escape(highlight)}"]`) as HTMLElement | null)?.focus();
}

function shelf(title: string, blurb: string, action: HTMLElement, cards: HTMLElement[], empty: string) {
  return h(
    "section",
    { class: "shelf", "aria-label": title },
    h("div", { class: "shelf-head" }, h("div", null, h("h2", null, title), h("p", { class: "muted" }, blurb)), action),
    cards.length ? h("div", { class: "cards" }, cards) : h("div", { class: "shelf-empty" }, empty),
  );
}

function picture(id: string | null, name: string, kind: "system" | "world") {
  if (id) return h("div", { class: "card-picture" }, h("img", { src: pictureUrl(id), alt: "", draggable: false }));
  return h("div", { class: `card-picture placeholder ${kind}` }, svg(kind === "system" ? ICONS.book : ICONS.globe), h("span", { class: "initial" }, name.slice(0, 1).toUpperCase()));
}

function card(opts: { id: string; name: string; kind: "system" | "world"; picture: HTMLElement; meta: (HTMLElement | string)[]; highlight: boolean; onOpen: () => void; onDelete: () => void }) {
  const el = h(
    "div",
    {
      class: `card${opts.highlight ? " new" : ""}`,
      tabindex: 0,
      role: "button",
      "data-id": opts.id,
      title: `Double-click to open ${opts.name}`,
      "aria-label": `${opts.name}. Double-click or press Enter to open.`,
      onDblclick: opts.onOpen,
      onKeydown: (e: KeyboardEvent) => {
        if (e.key === "Enter") opts.onOpen();
        if (e.key === "Delete") opts.onDelete();
      },
    },
    opts.picture,
    h(
      "div",
      { class: "card-body" },
      h("div", { class: "card-name" }, opts.name),
      h("div", { class: "card-meta" }, opts.meta),
      h(
        "button",
        {
          class: "icon-button card-delete",
          title: `Delete ${opts.name}`,
          "aria-label": `Delete ${opts.name}`,
          onClick: (e: MouseEvent) => (e.stopPropagation(), opts.onDelete()),
          onDblclick: (e: MouseEvent) => e.stopPropagation(),
        },
        svg(ICONS.trash),
      ),
    ),
  );
  return el;
}

function systemCard(s: SystemCard, highlight: boolean) {
  const meta = [h("span", null, s.usedBy ? `Used by ${count(s.usedBy, "world")}` : "Not used by any worlds yet")];
  if (s.variantOf) meta.push(h("span", { class: "muted" }, `Variant of ${s.variantOf}`));
  return card({ id: s.id, name: s.name, kind: "system", picture: picture(s.picture, s.name, "system"), meta, highlight, onOpen: () => void openPlace({ type: "system", id: s.id }, "normal", s.name), onDelete: () => void deleteSystem(s) });
}

function worldCard(w: WorldCard, highlight: boolean) {
  const pic = picture(w.picture, w.name, "world");
  pic.appendChild(h("span", { class: "system-chip" }, w.systemName));
  if (w.red || w.yellow) {
    const parts = [w.red ? h("span", { class: "dot red" }, `${w.red} red`) : null, w.red && w.yellow ? " · " : null, w.yellow ? h("span", { class: "dot yellow" }, `${w.yellow} yellow`) : null];
    pic.appendChild(h("span", { class: "flag-badge", title: "Flags to look at inside this world" }, parts));
  }
  return card({ id: w.id, name: w.name, kind: "world", picture: pic, meta: [], highlight, onOpen: () => void openPlace({ type: "world", id: w.id }, "normal", w.name), onDelete: () => void deleteWorld(w) });
}

// ---------- New system and New world (short, strictly linear pop-ups) ----------

interface Step {
  title: string;
  render: (next: () => void) => { body: HTMLElement[]; valid: () => boolean; focus?: HTMLElement; optional?: boolean };
}

function wizard(title: string, steps: Step[], finishLabel: string, finish: () => Promise<boolean>) {
  const d = openDialog(title);
  let index = 0;
  let refreshCurrent = () => {};
  d.body.addEventListener("input", () => refreshCurrent());
  d.body.addEventListener("change", () => refreshCurrent());
  const show = () => {
    const step = steps[index]!;
    const nextButton = h("button", { class: "button primary" }, index === steps.length - 1 ? finishLabel : "Next");
    const refresh = () => {
      nextButton.disabled = !content.valid();
    };
    const go = async () => {
      if (!content.valid()) return;
      if (index < steps.length - 1) {
        index++;
        show();
      } else {
        nextButton.disabled = true;
        if (!(await finish())) refresh();
      }
    };
    const content = step.render(() => void go());
    nextButton.addEventListener("click", () => void go());
    const progress = h(
      "ol",
      { class: "steps" },
      steps.map((s, i) => h("li", { class: i === index ? "current" : i < index ? "done" : "" }, h("span", { class: "step-number" }, i + 1), s.title)),
    );
    d.body.replaceChildren(progress, ...content.body);
    refreshCurrent = refresh;
    d.footer.replaceChildren(
      index > 0 ? h("button", { class: "button plain", onClick: () => (index--, show()) }, "Back") : h("span"),
      h("span", { class: "spacer" }),
      h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"),
      nextButton,
    );
    refresh();
    (content.focus ?? nextButton).focus();
  };
  show();
  return d;
}

function nameStep(state: { name: string }, label: string, example: string): Step {
  return {
    title: "Name",
    render: (next) => {
      const input = h("input", { class: "text-input", type: "text", value: state.name, maxlength: 200, placeholder: example, "aria-label": label });
      input.addEventListener("input", () => (state.name = input.value));
      input.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        // Without this the same key press also clicks the next step's button and skips a step.
        e.preventDefault();
        next();
      });
      return { body: [h("label", { class: "field-label" }, label), input, h("p", { class: "muted small" }, "Required. Even a single letter is fine; you can change it later.")], valid: () => state.name.trim().length > 0, focus: input };
    },
  };
}

function pictureStep(state: { picture: string | null }): Step {
  return {
    title: "Picture",
    render: () => {
      const preview = h("div", { class: "picture-preview" });
      const removeButton = h("button", { class: "button plain", onClick: () => ((state.picture = null), draw()) }, "Remove");
      const draw = () => {
        preview.replaceChildren(state.picture ? h("img", { src: pictureUrl(state.picture), alt: "Chosen picture" }) : h("div", { class: "picture-empty" }, svg(ICONS.image), h("span", null, "No picture")));
        removeButton.hidden = !state.picture;
      };
      draw();
      const choose = h(
        "button",
        {
          class: "button plain",
          onClick: async () => {
            const id = await attempt(() => api.pickPicture());
            if (id) {
              state.picture = id;
              draw();
            }
          },
        },
        svg(ICONS.image),
        "Choose picture…",
      );
      return { body: [h("label", { class: "field-label" }, "Picture for the card"), preview, h("div", { class: "row" }, choose, removeButton), h("p", { class: "muted small" }, "Optional. Skip it and a placeholder is used until you add one.")], valid: () => true, optional: true };
    },
  };
}

async function newSystem(home: HomeData) {
  const state = { name: "", picture: null as string | null, start: "" };
  const d = wizard(
    "New system",
    [
      nameStep(state, "What is the system called?", "For example: My d20"),
      pictureStep(state),
      {
        title: "Starting point",
        render: () => {
          const select = h(
            "select",
            { class: "text-input", "aria-label": "Starting point" },
            h("option", { value: "", disabled: true, selected: !state.start }, "Choose a starting point…"),
            home.startingPoints.map((p) => h("option", { value: p.id, disabled: !p.ready, selected: state.start === p.id }, p.ready ? p.label : `${p.label} (${p.note})`)),
          );
          select.addEventListener("change", () => (state.start = select.value));
          return { body: [h("label", { class: "field-label" }, "Start from"), select, h("p", { class: "muted small" }, "Required. From scratch starts with an empty Rules tab.")], valid: () => !!state.start, focus: select };
        },
      },
    ],
    "Create system",
    async () => {
      const id = await attempt(() => api.createSystem({ name: state.name, picture: state.picture, start: state.start as "scratch" }));
      if (!id) return false;
      d.close();
      notice(`${state.name.trim()} is on the Systems shelf.`, "green");
      await showHome(id);
      return true;
    },
  );
}

async function newWorld(home: HomeData) {
  const state = { name: "", picture: null as string | null, systemId: "" };
  const d = wizard(
    "New world",
    [
      nameStep(state, "What is the world called?", "For example: Greyhollow"),
      pictureStep(state),
      {
        title: "Game system",
        render: () => {
          const select = h(
            "select",
            { class: "text-input", "aria-label": "Game system" },
            h("option", { value: "", disabled: true, selected: !state.systemId }, "Choose a game system…"),
            home.systems.map((s) => h("option", { value: s.id, selected: state.systemId === s.id }, s.name)),
          );
          select.addEventListener("change", () => (state.systemId = select.value));
          return { body: [h("label", { class: "field-label" }, "Which system does this world use?"), select, h("p", { class: "muted small" }, "Required. The world's rules come from this system; changes you make inside the world stay in the world.")], valid: () => !!state.systemId, focus: select };
        },
      },
    ],
    "Create world",
    async () => {
      const id = await attempt(() => api.createWorld({ name: state.name, picture: state.picture, systemId: state.systemId }));
      if (!id) return false;
      d.close();
      notice(`${state.name.trim()} is on the Worlds shelf.`, "green");
      await showHome(id);
      return true;
    },
  );
}

// ---------- Deleting, the recycle bin and undo ----------

async function deleteWorld(w: WorldCard) {
  const ok = await ask(`Delete ${w.name}?`, [`${w.name} goes to the recycle bin. You can restore it from there until you empty the bin.`], [
    { label: "Cancel", value: false },
    { label: "Move to recycle bin", value: true, kind: "danger" },
  ]);
  if (!ok) return;
  const entry = await attempt(() => api.deleteWorld(w.id));
  if (entry) deleted(entry);
}

async function deleteSystem(s: SystemCard) {
  const dep = await attempt(() => api.systemDependents(s.id));
  if (!dep) return;
  let ok: boolean | null;
  if (!dep.worlds.length && !dep.systems.length) {
    ok = await ask(`Delete ${s.name}?`, [`${s.name} goes to the recycle bin. You can restore it from there until you empty the bin.`], [
      { label: "Cancel", value: false },
      { label: "Move to recycle bin", value: true, kind: "danger" },
    ]);
  } else {
    const lines: (string | Node)[] = [];
    if (dep.worlds.length) lines.push(h("p", null, h("strong", null, `${count(dep.worlds.length, "world")} ${dep.worlds.length === 1 ? "uses" : "use"} this system: `), dep.worlds.join(", ")));
    if (dep.systems.length) lines.push(h("p", null, h("strong", null, `${count(dep.systems.length, "system")} ${dep.systems.length === 1 ? "is" : "are"} built on it: `), dep.systems.join(", ")));
    lines.push("Deleting them too sends everything to the recycle bin together, and restoring brings them back together.");
    ok = await ask(`Delete ${s.name}?`, lines, [
      { label: "Cancel", value: false },
      { label: "Move them to another system", value: false, disabled: true, title: "Coming later, with copying a world into a different system" },
      { label: "Delete them too", value: true, kind: "danger" },
    ]);
  }
  if (!ok) return;
  const entry = await attempt(() => api.deleteSystem(s.id));
  if (entry) deleted(entry);
}

function deleted(entry: RecycledInfo) {
  lastDeleted = entry;
  const extra = entry.kind === "system" && entry.worlds.length ? ` and ${count(entry.worlds.length, "world")}` : "";
  notice(`${entry.name}${extra} moved to the recycle bin.`, "blue", { label: "Undo", run: () => void undoDelete() });
  void showHome();
}

async function undoDelete() {
  const entry = lastDeleted;
  lastDeleted = null;
  if (!entry) return;
  const ok = await attempt(() => api.restore(entry.id));
  if (ok) {
    notice(`${entry.name} is back.`, "green");
    await showHome(entry.kind === "world" ? entry.worlds[0]?.id : entry.systems[0]?.id);
  }
}

async function showRecycleBin() {
  const d = openDialog("Recycle bin", { wide: true, onClose: () => void showHome() });
  const draw = async () => {
    const entries = await attempt(() => api.recycleBin());
    if (!entries) return;
    if (!entries.length) {
      d.body.replaceChildren(h("p", { class: "muted" }, "The recycle bin is empty."));
      d.footer.replaceChildren(h("button", { class: "button primary", onClick: () => d.close() }, "Close"));
      return;
    }
    const now = Date.now();
    d.body.replaceChildren(
      h("p", { class: "muted" }, "Deleted worlds and systems stay here until you empty the bin. Restoring puts them back on the shelf with everything they had."),
      h(
        "ul",
        { class: "bin-list" },
        entries.map((e) => {
          const what = e.kind === "world" ? "World" : e.worlds.length ? `System, with ${count(e.worlds.length, "world")}` : "System";
          const also = [...e.systems.filter((s) => e.kind !== "system" || s.name !== e.name).map((s) => s.name), ...(e.kind === "system" ? e.worlds.map((w) => w.name) : [])];
          return h(
            "li",
            null,
            svg(e.kind === "world" ? ICONS.globe : ICONS.book),
            h("div", { class: "bin-text" }, h("div", { class: "bin-name" }, e.name), h("div", { class: "muted small" }, `${what} · deleted ${whenLabel(e.time, now).toLowerCase()}`, also.length ? ` · ${also.join(", ")}` : "")),
            h(
              "button",
              {
                class: "button plain",
                onClick: async () => {
                  if (await attempt(() => api.restore(e.id))) {
                    notice(`${e.name} is back.`, "green");
                    if (lastDeleted?.id === e.id) lastDeleted = null;
                    void draw();
                  }
                },
              },
              "Restore",
            ),
          );
        }),
      ),
    );
    d.footer.replaceChildren(
      h(
        "button",
        {
          class: "button danger",
          onClick: async () => {
            const ok = await ask("Empty the recycle bin?", [`This permanently deletes ${count(entries.length, "thing")} in the bin, with their backups and snapshots. This is the only action in the app that can't be undone.`], [
              { label: "Cancel", value: false },
              { label: "Empty recycle bin", value: true, kind: "danger" },
            ]);
            if (!ok) return;
            await attempt(() => api.emptyBin());
            lastDeleted = null;
            void draw();
          },
        },
        "Empty recycle bin",
      ),
      h("span", { class: "spacer" }),
      h("button", { class: "button primary", onClick: () => d.close() }, "Close"),
    );
  };
  await draw();
}

// ---------- Settings ----------

async function showSettings() {
  const d = openDialog("Settings", { wide: true, onClose: () => void showHome() });
  const draw = async () => {
    const s = await attempt(() => api.settings());
    if (!s) return;
    d.body.replaceChildren(
      h("h3", null, "Where files are saved"),
      h("p", { class: "muted" }, "The main folder holds your Systems and Worlds folders, like a Steam library. Point it at a OneDrive or Dropbox folder to use the same worlds on more than one computer, no account needed."),
      h("div", { class: "folder-box" }, svg(ICONS.folder), h("span", { class: "folder-path" }, s.folder), s.isDefault ? h("span", { class: "muted small" }, "(default)") : null),
      h(
        "div",
        { class: "row" },
        h(
          "button",
          {
            class: "button plain",
            onClick: async () => {
              if (await attempt(() => api.chooseFolder())) void draw();
            },
          },
          "Change…",
        ),
        h("button", { class: "button plain", onClick: () => void window.dm.showFolder() }, "Show in File Explorer"),
        s.isDefault
          ? null
          : h(
              "button",
              {
                class: "button plain",
                onClick: async () => {
                  if (await attempt(() => api.useDefaultFolder())) void draw();
                },
              },
              "Use the default",
            ),
      ),
      h("p", { class: "muted small" }, "Changing the folder doesn't move anything; the home screen shows whatever is in the folder you pick."),
      h("h3", null, "AI"),
      h("p", { class: "muted" }, "Your Claude API key, the cost warning and live checking will be set here once the AI is added. Everything works by hand without it."),
    );
    d.footer.replaceChildren(h("span", { class: "spacer" }), h("button", { class: "button primary", onClick: () => d.close() }, "Done"));
  };
  await draw();
}

// ---------- Inside a world or system ----------

const TABS = ["Rules", "Creatures", "Items", "Lore", "Rulebook"] as const;
let tab: (typeof TABS)[number] = "Rules";

async function openPlace(place: Place, mode: "normal" | "read-only" | "take-over" = "normal", name?: string) {
  const res = await attempt(() => api.open(place, mode));
  if (!res) {
    await showHome();
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
  renderPlace(res.view);
  if (res.view.recovered) notice("Recovered after an unexpected close.", "blue", undefined, 0);
}

function renderPlace(view: PlaceView) {
  const isWorld = view.type === "world";
  const tabs = h(
    "nav",
    { class: "tabs", role: "tablist" },
    TABS.map((t) => h("button", { class: `tab${t === tab ? " active" : ""}`, role: "tab", "aria-selected": t === tab ? "true" : "false", onClick: () => ((tab = t), renderPlace(view)) }, t)),
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
      iconButton(ICONS.home, "Home", () => void goHome()),
      iconButton(ICONS.gear, isWorld ? "World settings" : "System settings", () => void placeSettings(view)),
    ),
  );
  const banner = view.readOnly ? h("div", { class: "banner" }, h("strong", null, "Read-only. "), view.readOnlyReason ?? "", " Nothing you do here is saved.") : null;
  const coming: Record<(typeof TABS)[number], string> = {
    Rules: "The Rules tab (core check, abilities, resources, skills, conditions and free-text rules) is the next milestone.",
    Creatures: "Monsters, NPCs, characters, races and classes, with the library, come with the Rules tab.",
    Items: "Items and the library come with the Rules tab.",
    Lore: "Lore pages, places and factions come after first playable.",
    Rulebook: "Printing a rulebook from your world comes in milestone 6.",
  };
  const workspace = h(
    "div",
    { class: "workspace" },
    h("aside", { class: "panel list-panel", "aria-label": "List" }, h("div", { class: "panel-head" }, tab), h("p", { class: "muted small pad" }, "Nothing here yet.")),
    h("section", { class: "panel editor" }, h("div", { class: "empty-editor" }, h("h2", null, view.name), h("p", { class: "muted" }, coming[tab]), h("p", { class: "muted small" }, "Your work saves itself constantly; the logo in the top-left corner glows each time it does."))),
    h("aside", { class: "panel flag-panel", "aria-label": "Flags" }, h("div", { class: "panel-head" }, "Flags"), h("p", { class: "muted small pad" }, "No flags. Everything checks out.")),
  );
  app.replaceChildren(top, ...(banner ? [banner] : []), workspace);
}

async function goHome() {
  await attempt(() => api.goHome());
  await showHome(current?.id);
}

async function placeSettings(view: PlaceView) {
  const d = openDialog(view.type === "world" ? "World settings" : "System settings", { wide: true });
  const backups = view.type === "world" ? ((await attempt(() => api.backups())) ?? []) : [];
  d.body.append(
    h("dl", { class: "facts" }, h("dt", null, "Name"), h("dd", null, view.name), ...(view.type === "world" ? [h("dt", null, "Game system"), h("dd", null, view.systemName ?? "")] : [])),
    h("p", { class: "muted small" }, "Renaming, the card picture and copying a world arrive here with the next milestones."),
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

// ---------- Keyboard ----------

document.addEventListener("keydown", (e) => {
  if (document.querySelector(".overlay")) return;
  const target = e.target as HTMLElement;
  if (target.matches("input, textarea, select")) return;
  if (!current && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && lastDeleted) {
    e.preventDefault();
    void undoDelete();
  }
});

// ---------- Start ----------

async function start() {
  const s = await attempt(() => api.startup());
  if (s?.resume) await openPlace(s.resume);
  else await showHome();
}

void start();
