// The app window: the home screen with its two shelves, the New system and New world pop-ups,
// the recycle bin and settings. The open world or system is in place.ts.

import type { HomeData, ModuleCard, RecycledInfo, SystemCard, WorldCard } from "../app/backend.ts";
import { count, whenLabel } from "../app/words.ts";
import { api, pictureUrl } from "./api.ts";
import { choosePicture } from "./picture-chooser.ts";
import { app, attempt, brand, iconButton, nav, pulseLogo, typingIn } from "./common.ts";
import { ask, notice, openDialog } from "./dialogs.ts";
import { h, svg } from "./dom.ts";
import { ICONS } from "./icons.ts";
import { aiSettings } from "./ai-panel.ts";
import { becameReadOnly, current, leavePlace, openAt, openPlace, redrawForPlayers, renderPlace } from "./place.ts";
import { pulseFromPlayer } from "./tools/map-tool.ts";
import { drawSteps, maybeWelcome, setWelcomeHost, showHelp } from "./welcome.ts";
import { applyLook } from "./look.ts";
import { TEXT_SIZES, THEMES } from "../app/themes.ts";

/** The last thing deleted from the home screen, so Ctrl+Z can put it back. */
let lastDeleted: RecycledInfo | null = null;

window.dm.onEvent((e) => {
  if (e.type === "saved") pulseLogo();
  else if (e.type === "saveFailed") notice(`Couldn't save just now (${e.message}). Your changes are kept and saving will try again.`, "yellow");
  else if (e.type === "readOnly") {
    becameReadOnly(e.reason);
    notice(`${e.reason} It is now read-only here.`, "blue", undefined, 0);
  } else if (e.type === "aiFlags") {
    if (e.found) notice(`Live AI checking found ${e.found === 1 ? "a problem" : `${e.found} problems`} with what you just changed. See the flag panel.`, "blue", undefined, 6000);
    if (current) void renderPlace();
  } else if (e.type === "aiNotice") notice(e.message, "blue", undefined, 8000);
  else if (e.type === "table" || e.type === "players") tableChanged(e.type);
  else if (e.type === "point") pulseFromPlayer(e.x, e.y, e.color);
});

/** Players did something (or joined): the screen redraws, at most a few times a second. */
let tableTimer: number | null = null;
let tableWhat: "table" | "players" = "players";
function tableChanged(what: "table" | "players") {
  if (what === "table") tableWhat = "table";
  if (tableTimer !== null) return;
  tableTimer = window.setTimeout(() => {
    tableTimer = null;
    redrawForPlayers(tableWhat);
    tableWhat = "players";
  }, 250);
}

// ---------- Home screen ----------

async function showHome(highlight?: string, glow?: string) {
  leavePlace();
  const home = await attempt(() => api.home());
  if (!home) return;
  renderHome(home, highlight);
  if (glow === "new-system") app.querySelector(".new-system")?.classList.add("glow");
  void drawSteps();
}

async function recentRow(home: HomeData): Promise<HTMLElement | null> {
  const known = new Set([...home.systems, ...home.worlds, ...home.modules].map((p) => p.id));
  const items = ((await attempt(() => api.recentThings())) ?? []).filter((r) => known.has(r.placeId)).slice(0, 6);
  if (!items.length) return null;
  return h(
    "section",
    { class: "shelf recent-row", "aria-label": "Pick up where you left off" },
    h("div", { class: "shelf-head" }, h("div", null, h("h2", null, "Pick up where you left off"), h("p", { class: "muted" }, "The last things you opened. One click takes you straight back."))),
    h("div", { class: "recent-chips" }, items.map((r) => h("button", { class: "recent-chip", title: `${r.name} in ${r.placeName}`, onClick: () => void openAt({ type: r.placeType, id: r.placeId }, r.nodeId, r.placeName) }, h("strong", null, r.name), h("span", { class: "muted small" }, `${r.tab} · ${r.placeName}`)))),
  );
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
      iconButton(ICONS.import, "Import", () => void importFile(), { title: "Import a world or system file someone sent you" }),
      iconButton(ICONS.help, "Help", () => void showHelp(), { title: "Help: the tour, the sample, tips and first steps" }),
      iconButton(ICONS.bin, "Recycle bin", () => void showRecycleBin(), { badge: home.binCount }),
      iconButton(ICONS.gear, "Settings", () => void showSettings()),
    ),
  );

  const systems = shelf(
    "Systems",
    "The rules. One system can power many worlds.",
    h("button", { class: "button primary new-system", onClick: () => void newSystem(home) }, svg(ICONS.plus), "New system"),
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

  const canCreateModule = home.systems.length > 0;
  const newModuleButton = h("button", { class: "button primary", disabled: !canCreateModule, onClick: () => void newModule(home) }, svg(ICONS.plus), "New module");
  const modules = shelf(
    "Modules",
    "The adventures: encounters, read-aloud text, monsters and maps, ready to run.",
    h("span", { class: "hint-wrap", title: canCreateModule ? "" : "Create a system first." }, newModuleButton),
    home.modules.map((m) => moduleCard(m, m.id === highlight)),
    canCreateModule ? "No modules yet. Make an adventure with New module." : "No modules yet. Create a system first; a module is built on a world or a system.",
  );

  const main = h("main", { class: "home" }, systems, worlds, modules);
  app.replaceChildren(top, main, h("footer", { class: "home-footer" }, "Main folder: ", h("button", { class: "link", title: "Show in File Explorer", onClick: () => void window.dm.showFolder() }, home.folder)));
  void recentRow(home).then((row) => row && main.isConnected && main.prepend(row));
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

function picture(id: string | null, name: string, kind: "system" | "world" | "module") {
  if (id) return h("div", { class: "card-picture" }, h("img", { src: pictureUrl(id), alt: "", draggable: false }));
  return h("div", { class: `card-picture placeholder ${kind}` }, svg(kind === "system" ? ICONS.book : kind === "module" ? ICONS.scroll : ICONS.globe), h("span", { class: "initial" }, name.slice(0, 1).toUpperCase()));
}

function card(opts: { id: string; name: string; kind: "system" | "world" | "module"; picture: HTMLElement; meta: (HTMLElement | string)[]; highlight: boolean; onOpen: () => void; onDelete: () => void }) {
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

function moduleCard(m: ModuleCard, highlight: boolean) {
  const pic = picture(m.picture, m.name, "module");
  pic.appendChild(h("span", { class: "system-chip" }, m.builtOn));
  const meta: HTMLElement[] = [h("span", { class: "muted" }, m.baseType === "world" ? "World module" : "Setting-free module")];
  if (m.baseType === "system")
    meta.push(
      h(
        "button",
        { class: "link small", title: "Copy this adventure into one of your worlds on the same system, so it can use that world's towns and characters", onClick: (e: MouseEvent) => (e.stopPropagation(), void placeInWorld(m)), onDblclick: (e: MouseEvent) => e.stopPropagation() },
        "Place in a world…",
      ),
    );
  return card({ id: m.id, name: m.name, kind: "module", picture: pic, meta, highlight, onOpen: () => void openPlace({ type: "module", id: m.id }, "normal", m.name), onDelete: () => void deleteModule(m) });
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

function nameStep(state: { name: string }, label: string, example: string, extra?: HTMLElement): Step {
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
      return { body: [h("label", { class: "field-label" }, label), input, h("p", { class: "muted small" }, "Required. Even a single letter is fine; you can change it later."), ...(extra ? [extra] : [])], valid: () => state.name.trim().length > 0, focus: input };
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
            const id = await choosePicture();
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
  const friend = h(
    "div",
    { class: "import-friend" },
    h("p", { class: "small" }, h("strong", null, "Got a system from a friend? "), "Import it instead of making a new one. It arrives as its own copy with their name on it, and nothing you have is touched."),
    h("button", { class: "button plain", onClick: () => (d.close(), void importFile()) }, svg(ICONS.import), "Import a friend's system"),
  );
  const d = wizard(
    "New system",
    [
      nameStep(state, "What is the system called?", "For example: My d20", friend),
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
          return { body: [h("label", { class: "field-label" }, "Start from"), select, h("p", { class: "muted small" }, "Required. Pick the kind of game it feels like. Each starter is yours to change. Bare bones starts with nothing.")], valid: () => !!state.start, focus: select };
        },
      },
    ],
    "Create system",
    async () => {
      const id = await attempt(() => api.createSystem({ name: state.name, picture: state.picture, start: state.start as "scratch" }));
      if (!id) return false;
      d.close();
      notice(`${state.name.trim()} is on the Systems shelf.`, "green");
      // A new system opens straight away. One from scratch is offered Quick start first (skippable).
      await openPlace({ type: "system", id }, "normal", state.name.trim(), state.start === "scratch" ? "quickstart" : undefined);
      return true;
    },
  );
}

async function newWorld(home: HomeData, systemId = "") {
  const state = { name: "", picture: null as string | null, systemId };
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
      // A new world opens straight away (backlog 4).
      await openPlace({ type: "world", id }, "normal", state.name.trim());
      return true;
    },
  );
}

/** New module: name, picture, then what it is built on (a world, or just a system). */
async function newModule(home: HomeData) {
  const state = { name: "", picture: null as string | null, baseId: "" };
  const d = wizard(
    "New module",
    [
      nameStep(state, "What is the adventure called?", "For example: The Mill on Ash Creek"),
      pictureStep(state),
      {
        title: "Built on",
        render: () => {
          const select = h(
            "select",
            { class: "text-input", "aria-label": "Built on" },
            h("option", { value: "", disabled: true, selected: !state.baseId }, "Choose a world, or just a system…"),
            home.worlds.length ? h("optgroup", { label: "A world (uses its places, people and history)" }, home.worlds.map((w) => h("option", { value: w.id, selected: state.baseId === w.id }, `${w.name} (${w.systemName})`))) : null,
            h("optgroup", { label: "Just a system (setting-free: fits any world)" }, home.systems.map((s) => h("option", { value: s.id, selected: state.baseId === s.id }, s.name))),
          );
          select.addEventListener("change", () => (state.baseId = select.value));
          return {
            body: [
              h("label", { class: "field-label" }, "What is it built on?"),
              select,
              h("p", { class: "muted small" }, "A world module can use that world's towns, villains and history. A setting-free module uses only the system's rules and monsters, so it fits any world, and can be placed in one later. This can't be changed once the module is made."),
            ],
            valid: () => !!state.baseId,
            focus: select,
          };
        },
      },
    ],
    "Create module",
    async () => {
      const id = await attempt(() => api.createModule({ name: state.name, picture: state.picture, baseId: state.baseId }));
      if (!id) return false;
      d.close();
      notice(`${state.name.trim()} is on the Modules shelf.`, "green");
      await openPlace({ type: "module", id }, "normal", state.name.trim());
      return true;
    },
  );
}

/** A setting-free module copied into a world; the original stays, to be placed again. */
async function placeInWorld(m: ModuleCard) {
  const worlds = (await attempt(() => api.placeChoices(m.id))) ?? [];
  if (!worlds.length) return notice(`There are no worlds on that system yet. Make one with New world, then place ${m.name} in it.`, "blue", undefined, 8000);
  const d = openDialog(`Place ${m.name} in a world`);
  const pick = h("select", { class: "text-input", "aria-label": "World" }, worlds.map((w) => h("option", { value: w.id }, w.name)));
  const go = h("button", { class: "button primary" }, "Place it");
  go.addEventListener("click", async () => {
    go.disabled = true;
    const id = await attempt(() => api.placeModule(m.id, pick.value));
    d.close();
    if (id) {
      notice(`${m.name} is now in ${worlds.find((w) => w.id === pick.value)?.name}. The setting-free original is still on the shelf.`, "green", undefined, 7000);
      await nav.home(id);
    }
  });
  d.body.replaceChildren(
    h("p", { class: "muted" }, `A copy of ${m.name} is made inside the world you pick, so it can use that world's towns, characters and lore. The original stays setting-free and can be placed in other worlds too. The game system stays the same.`),
    h("label", { class: "field-label" }, "World"),
    pick,
  );
  d.footer.replaceChildren(h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"), go);
}

async function deleteModule(m: ModuleCard) {
  const ok = await ask(`Delete ${m.name}?`, [`${m.name} goes to the recycle bin. You can restore it from there until you empty the bin. Its world and system are not touched.`], [
    { label: "Cancel", value: false },
    { label: "Move to recycle bin", value: true, kind: "danger" },
  ]);
  if (!ok) return;
  const entry = await attempt(() => api.deleteModule(m.id));
  if (entry) deleted(entry);
}

// ---------- Deleting, the recycle bin and undo ----------

async function deleteWorld(w: WorldCard) {
  const mods = (await attempt(() => api.worldModules(w.id))) ?? [];
  const lines: (string | Node)[] = [`${w.name} goes to the recycle bin. You can restore it from there until you empty the bin.`];
  if (mods.length) lines.push(h("p", null, h("strong", null, `${count(mods.length, "module")} ${mods.length === 1 ? "is" : "are"} built on it and ${mods.length === 1 ? "goes" : "go"} with it: `), mods.join(", ")));
  const ok = await ask(`Delete ${w.name}?`, lines, [
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
  if (!dep.worlds.length && !dep.systems.length && !dep.modules.length) {
    ok = await ask(`Delete ${s.name}?`, [`${s.name} goes to the recycle bin. You can restore it from there until you empty the bin.`], [
      { label: "Cancel", value: false },
      { label: "Move to recycle bin", value: true, kind: "danger" },
    ]);
  } else {
    const lines: (string | Node)[] = [];
    if (dep.worlds.length) lines.push(h("p", null, h("strong", null, `${count(dep.worlds.length, "world")} ${dep.worlds.length === 1 ? "uses" : "use"} this system: `), dep.worlds.join(", ")));
    if (dep.systems.length) lines.push(h("p", null, h("strong", null, `${count(dep.systems.length, "system")} ${dep.systems.length === 1 ? "is" : "are"} built on it: `), dep.systems.join(", ")));
    if (dep.modules.length) lines.push(h("p", null, h("strong", null, `${count(dep.modules.length, "module")} ${dep.modules.length === 1 ? "is" : "are"} built on them: `), dep.modules.join(", ")));
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
  const mods = entry.kind !== "module" ? (entry.modules?.length ?? 0) : 0;
  const extra = [entry.kind === "system" && entry.worlds.length ? count(entry.worlds.length, "world") : "", mods ? count(mods, "module") : ""].filter(Boolean).join(" and ");
  const extraText = extra ? ` and ${extra}` : "";
  notice(`${entry.name}${extraText} moved to the recycle bin.`, "blue", { label: "Undo", run: () => void undoDelete() });
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
      h("p", { class: "muted" }, "Deleted worlds, modules and systems stay here until you empty the bin. Restoring puts them back on the shelf with everything they had."),
      h(
        "ul",
        { class: "bin-list" },
        entries.map((e) => {
          const mods = e.kind === "module" ? [] : (e.modules ?? []);
          const what = e.kind === "module" ? "Module" : e.kind === "world" ? (mods.length ? `World, with ${count(mods.length, "module")}` : "World") : e.worlds.length ? `System, with ${count(e.worlds.length, "world")}` : "System";
          const also = [...e.systems.filter((s) => e.kind !== "system" || s.name !== e.name).map((s) => s.name), ...(e.kind === "system" ? e.worlds.map((w) => w.name) : []), ...mods.map((m) => m.name)];
          return h(
            "li",
            null,
            svg(e.kind === "world" ? ICONS.globe : e.kind === "module" ? ICONS.scroll : ICONS.book),
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

// ---------- Import ----------

/** Importing never overwrites: the result says what arrived and what was shared. */
async function importFile() {
  const r = await attempt(() => api.importFile());
  if (!r) return;
  const what = r.type === "world" ? "Worlds" : "Systems";
  const notes = [r.newSystems.length && r.type === "world" ? `Its system came along: ${r.newSystems.join(", ")}.` : "", r.sharedSystems.length ? `It uses your ${r.sharedSystems.join(", ")}, which is identical.` : ""].filter(Boolean).join(" ");
  notice(`${r.name} is on the ${what} shelf. ${notes}`.trim(), "green", undefined, 10000);
  await showHome(r.id);
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
      h("h3", null, "Your name"),
      h("p", { class: "muted" }, "Optional, and no account is needed. It goes on every world, system and thing you make, and on the rulebook's Created by line. Things others made keep their maker's name."),
      (() => {
        const input = h("input", { class: "text-input", value: s.author ?? "", placeholder: "For example: Jeff", maxlength: 120, "aria-label": "Your name" });
        input.addEventListener("change", async () => {
          if (await attempt(() => api.setAuthor(input.value))) notice(input.value.trim() ? `Things you make now say they were made by ${input.value.trim()}.` : "Your name was cleared.", "green", undefined, 4000);
        });
        return input;
      })(),
      h("h3", null, "Look"),
      h("p", { class: "muted" }, "Pick a theme and a text size. They change only what you see on screen; printed pages and PDFs are always black on white."),
      lookSettings(s, () => void draw()),
      h("h3", null, "Pictures"),
      (() => {
        const box = h("input", { type: "checkbox", checked: s.autoPictures });
        box.addEventListener("change", async () => {
          await attempt(() => api.setAutoPictures(box.checked));
          notice(box.checked ? "New things will get a fitting picture from the library." : "New things will start with no picture.", "green", undefined, 3500);
        });
        return h("label", { class: "inline" }, box, "Add pictures automatically to new things (when the library has one that fits)");
      })(),
      h("h3", null, "Codex"),
      (() => {
        const box = h("input", { type: "checkbox", checked: s.autoCodex });
        box.addEventListener("change", async () => {
          await attempt(() => api.setAutoCodex(box.checked));
          notice(box.checked ? "The Codex will open the list that fits what you're working on." : "The Codex will stay on the list you picked.", "green", undefined, 3500);
        });
        return h("label", { class: "inline" }, box, "Open the Codex list that fits what I'm working on (for example, Traits when I click in a monster's traits)");
      })(),
      h("h3", null, "Keyboard"),
      (() => {
        const box = h("input", { type: "checkbox", checked: s.letterKeys });
        box.addEventListener("change", async () => {
          await attempt(() => api.setLetterKeys(box.checked));
          notice(box.checked ? "Letter shortcuts are on when you're not typing." : "Letter shortcuts are off. Alt+Left and Alt+Right still work.", "green", undefined, 3500);
        });
        return h("label", { class: "inline" }, box, "Letter shortcuts: A back, S forward, Q tuck a window away, W close it, E bring it back, Z and X step through windows (only when you're not typing in a box)");
      })(),
      h("h3", null, "AI"),
      aiSettings(() => void draw()),
    );
    d.footer.replaceChildren(h("span", { class: "spacer" }), h("button", { class: "button primary", onClick: () => d.close() }, "Done"));
  };
  await draw();
}

/** Theme swatches and the Small, Normal, Large text size. Each applies at once, so the choice is seen live. */
function lookSettings(s: { theme: string; textSize: string }, redraw: () => void): HTMLElement {
  const pick = async (theme: string, size: string) => {
    applyLook(theme, size);
    await attempt(async () => {
      if (theme !== s.theme) await api.setTheme(theme);
      if (size !== s.textSize) await api.setTextSize(size);
    });
    redraw();
  };
  return h(
    "div",
    { class: "look-settings" },
    h(
      "div",
      { class: "theme-swatches", role: "radiogroup", "aria-label": "Theme" },
      THEMES.map((t) =>
        h(
          "button",
          { class: `theme-swatch${t.id === s.theme ? " on" : ""}`, role: "radio", "aria-checked": t.id === s.theme ? "true" : "false", title: t.name, onClick: () => void pick(t.id, s.textSize) },
          h("span", { class: "swatch-dot", style: `background:linear-gradient(135deg, ${t.background} 50%, ${t.accent} 50%);border-color:${t.border}` }),
          h("span", null, t.name),
        ),
      ),
    ),
    h(
      "div",
      { class: "switch", role: "radiogroup", "aria-label": "Text size" },
      TEXT_SIZES.map((z) => h("button", { class: `switch-button${z.id === s.textSize ? " active" : ""}`, role: "radio", "aria-checked": z.id === s.textSize ? "true" : "false", onClick: () => void pick(s.theme, z.id) }, z.name)),
    ),
  );
}

// ---------- Keyboard ----------

document.addEventListener("keydown", (e) => {
  if (document.querySelector(".overlay") || typingIn(e)) return;
  if (!current && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && lastDeleted) {
    e.preventDefault();
    void undoDelete();
  }
});

// ---------- Start ----------

async function start() {
  setWelcomeHost({
    openPlace: (type, id) => openPlace({ type, id }),
    home: (glow) => showHome(undefined, glow),
  });
  const look = await attempt(() => api.settings());
  if (look) applyLook(look.theme, look.textSize);
  const s = await attempt(() => api.startup());
  if (s?.resume) await openPlace(s.resume);
  else if (!(await maybeWelcome())) await showHome();
}

nav.home = showHome;
nav.newWorldWith = async (systemId) => {
  await showHome();
  const home = await attempt(() => api.home());
  if (home) void newWorld(home, systemId);
};
void start();
