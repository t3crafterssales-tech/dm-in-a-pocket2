// The first time (version 2.6): the welcome screen, the sample valley, a short guided tour, the
// first steps checklist in a corner, one small tip the first time each tab or tool opens, and the
// Help menu that brings any of them back.

import { api } from "./api.ts";
import { app, attempt } from "./common.ts";
import { notice, openDialog } from "./dialogs.ts";
import { h, svg } from "./dom.ts";
import { ICONS } from "./icons.ts";

type FirstTime = Awaited<ReturnType<typeof api.firstTime>>;

export interface WelcomeHost {
  /** Opens a module (or world) by id. */
  openPlace: (type: "world" | "module" | "system", id: string) => Promise<void>;
  /** Back to the home screen, with one button glowing if asked. */
  home: (glow?: string) => Promise<void>;
}

let host: WelcomeHost | null = null;
export function setWelcomeHost(h_: WelcomeHost) {
  host = h_;
}

// ---------- The welcome screen ----------

/** Shows the welcome if this computer hasn't seen it. Returns true if it is showing. */
export async function maybeWelcome(): Promise<boolean> {
  const ft = await attempt(() => api.firstTime());
  if (!ft || ft.welcomed) return false;
  showWelcome();
  return true;
}

export function showWelcome() {
  const done = async () => void (await attempt(() => api.setFirstTime({ welcomed: true })));
  const big = (icon: string, title: string, line: string, run: () => Promise<void>, primary = false) => h("button", { class: `welcome-choice${primary ? " primary" : ""}`, onClick: () => void run() }, h("span", { class: "welcome-icon" }, icon), h("strong", null, title), h("span", { class: "muted small" }, line));
  app.replaceChildren(
    h(
      "main",
      { class: "welcome" },
      h("div", { class: "welcome-logo" }, "🎲"),
      h("h1", null, "Welcome to DM in a Pocket"),
      h("p", { class: "welcome-lead" }, "Build any tabletop game, then run it. Everything stays on this computer: no account, nothing to sign up for."),
      h(
        "div",
        { class: "welcome-choices" },
        big("🧭", "Show me around", "Opens a small sample adventure and points out the main parts, six stops.", async () => {
          await done();
          await openSample(true);
        }, true),
        big("🏞️", "Open the sample", "A fantasy valley with a town, a mill, a cave and a short adventure to poke at.", async () => {
          await done();
          await openSample(false);
        }),
        big("⚡", "I know what I'm doing", "Straight to the home screen to make your first game system.", async () => {
          await done();
          await host?.home("new-system");
        }),
      ),
      h("p", { class: "muted small" }, "You can come back to any of these from Help (the ? at the top)."),
    ),
  );
}

async function openSample(tour: boolean) {
  if (tour) document.body.classList.add("touring");
  const ft = await attempt(() => api.firstTime());
  if (!ft?.sample.module) app.replaceChildren(h("main", { class: "welcome" }, h("div", { class: "welcome-logo spin" }, "🎲"), h("h2", null, "Making the sample valley…"), h("p", { class: "muted" }, "A town, a mill, a cave and a short adventure. This takes a few seconds the first time.")));
  const s = await attempt(() => api.makeSample());
  if (!s) return;
  await host?.openPlace("module", s.module);
  if (tour) setTimeout(() => startTour(), 600);
}

// ---------- The guided tour ----------

const STOPS: { find: string; title: string; text: string }[] = [
  { find: ".tabs", title: "The tabs", text: "Everything in this adventure, sorted: the Adventure's encounters, the Party, Maps, Rules, Beings, Items, Lore, the Journal and the Rulebook you can print." },
  { find: ".side-list", title: "The Codex", text: "Everything in your game, ready to use. Drag things from here onto a sheet, an encounter or a map. Copy anything and make it your own." },
  { find: ".new-button", title: "New", text: "Make something new: a weapon, a monster, a spell. Start from something ready-made or start blank." },
  { find: ".flag-strip", title: "Flags", text: "The app checks your work as you build: red is broken, yellow looks off. They never stop you saving." },
  { find: ".ai-panel", title: "The AI (optional)", text: "Ask for changes in plain words. It always shows you first, and nothing happens until you accept. Everything works without it." },
  { find: "button[aria-label=\"DM's table\"]", title: "The DM's table", text: "Run a game night: initiative, dice, the clock, the journal and players joining on their own phones." },
];

let tourAt = -1;
let tourLayer: HTMLElement | null = null;

export function startTour() {
  document.body.classList.add("touring");
  tourAt = 0;
  drawTour();
}

function endTour() {
  document.body.classList.remove("touring");
  tourAt = -1;
  tourLayer?.remove();
  tourLayer = null;
  void attempt(() => api.setFirstTime({ welcomed: true }));
}

function drawTour() {
  tourLayer?.remove();
  if (tourAt < 0 || tourAt >= STOPS.length) return endTour();
  const stop = STOPS[tourAt]!;
  const el = document.querySelector<HTMLElement>(stop.find);
  if (!el) {
    // That part isn't on this screen: skip to the next stop.
    tourAt++;
    return drawTour();
  }
  const r = el.getBoundingClientRect();
  const pad = 6;
  const spot = h("div", { class: "tour-spot", style: `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px` });
  const below = r.bottom + 200 < window.innerHeight;
  const left = Math.max(12, Math.min(window.innerWidth - 352, r.left + r.width / 2 - 170));
  const top = below ? r.bottom + 14 : Math.max(12, r.top - 190);
  const bubble = h(
    "div",
    { class: `tour-bubble${below ? " below" : " above"}`, style: `left:${left}px;top:${top}px`, role: "dialog", "aria-label": stop.title },
    h("div", { class: "muted tiny" }, `${tourAt + 1} of ${STOPS.length}`),
    h("strong", null, stop.title),
    h("p", null, stop.text),
    h(
      "div",
      { class: "inline" },
      h("button", { class: "link small", onClick: endTour }, "Skip the tour"),
      h("span", { class: "grow" }),
      tourAt > 0 ? h("button", { class: "button plain small-button", onClick: () => ((tourAt = Math.max(0, tourAt - 1)), drawTour()) }, "Back") : null,
      h("button", { class: "button primary small-button", onClick: () => (tourAt++, drawTour()) }, tourAt === STOPS.length - 1 ? "Done" : "Next"),
    ),
  );
  tourLayer = h("div", { class: "tour-layer" }, spot, bubble);
  document.body.appendChild(tourLayer);
}

window.addEventListener("resize", () => tourAt >= 0 && drawTour());
window.addEventListener("keydown", (e) => {
  if (tourAt < 0) return;
  if (e.key === "Escape") endTour();
  else if (e.key === "ArrowRight" || e.key === "Enter") (tourAt++, drawTour());
  else if (e.key === "ArrowLeft") ((tourAt = Math.max(0, tourAt - 1)), drawTour());
});

// ---------- The first steps checklist ----------

const STEPS: { key: string; label: string; hint: string }[] = [
  { key: "monster", label: "Make your first monster", hint: "New → Monster, or copy one from the Codex" },
  { key: "weapon", label: "Copy a starter weapon and change it", hint: "Codex → Weapons → Make my own copy" },
  { key: "roll", label: "Roll on a table", hint: "Lore tab → a roll table → Roll" },
  { key: "print", label: "Print a page", hint: "Rulebook tab → Save as PDF" },
];

let stepsLayer: HTMLElement | null = null;

/** The checklist in a corner; ticks itself off and goes away when done or closed. */
export async function drawSteps() {
  const ft = await attempt(() => api.firstTime());
  stepsLayer?.remove();
  stepsLayer = null;
  if (!ft || ft.stepsClosed || !ft.welcomed) return;
  const done = new Set(ft.stepsDone);
  if (STEPS.every((s) => done.has(s.key))) {
    await attempt(() => api.setFirstTime({ stepsClosed: true }));
    notice("First steps all done. You're a DM in a Pocket now!", "green", undefined, 6000);
    return;
  }
  stepsLayer = h(
    "aside",
    { class: "steps-card", "aria-label": "First steps" },
    h("div", { class: "inline" }, h("strong", null, "First steps"), h("span", { class: "grow" }), h("button", { class: "icon-button tiny", title: "Close the checklist (Help brings it back)", "aria-label": "Close", onClick: () => void attempt(() => api.setFirstTime({ stepsClosed: true })).then(drawSteps) }, svg(ICONS.close))),
    h("ul", null, STEPS.map((s) => h("li", { class: done.has(s.key) ? "done" : "", title: s.hint }, h("span", { class: "step-tick" }, done.has(s.key) ? "✓" : ""), s.label))),
  );
  document.body.appendChild(stepsLayer);
}

// ---------- Tips on first use ----------

const TIPS: Record<string, string> = {
  Adventure: "An adventure is a list of encounters. Drag monsters, treasure and handouts from the Codex into one; drag encounters to put one inside another.",
  Party: "Every character ever played in this world lives here. Open the whole party to give players their PINs.",
  Maps: "Draw rooms, walls and stamps; drag anything from the Codex onto the map to pin it. Clicking a pin opens it.",
  Rules: "The rules of your game. Change one here and everything that uses it changes too.",
  Beings: "Monsters, NPCs, races and classes. Start from a ready-made one in the Codex and change only what's different.",
  Items: "Weapons, armour, gear and magic items. A variant (Flaming Sword) keeps following its parent (Sword) unless you change that part.",
  Lore: "Places, factions and roll tables. Roll tables can roll on each other.",
  Journal: "Your private notebook. Each game night gets its own page by itself. Players never see it unless you show them.",
  Rulebook: "Print or save your game as a book: a player's guide, a monster book or the adventure booklet.",
  desk: "The DM's table: drag tools by their title bars to arrange them, + Tool adds more. Begin session to start the night.",
};

let tipBox: HTMLElement | null = null;

/** One small tip the first time a tab or tool opens (never again, unless Help resets them). */
export async function tipOnce(key: string) {
  const text = TIPS[key];
  if (!text) return;
  const ft = await attempt(() => api.firstTime());
  if (!ft || !ft.tips || !ft.welcomed || ft.tipsSeen.includes(key) || document.body.classList.contains("touring")) return;
  await attempt(() => api.setFirstTime({ tipSeen: key }));
  tipBox?.remove();
  tipBox = h(
    "div",
    { class: "tip-box", role: "status" },
    h("span", { class: "tip-icon" }, "💡"),
    h("div", null, h("p", null, text), h("div", { class: "inline" }, h("button", { class: "button primary small-button", onClick: () => tipBox?.remove() }, "Got it"), h("button", { class: "link small", onClick: () => void attempt(() => api.setFirstTime({ tips: false })).then(() => tipBox?.remove()) }, "Don't show tips"))),
  );
  document.body.appendChild(tipBox);
}

// ---------- Help ----------

export async function showHelp() {
  const ft: FirstTime | undefined = await attempt(() => api.firstTime());
  const d = openDialog("Help");
  const item = (icon: string, title: string, line: string, run: () => void | Promise<void>) => h("button", { class: "help-item", onClick: () => (d.close(), void run()) }, h("span", { class: "help-icon" }, icon), h("span", null, h("strong", null, title), h("span", { class: "muted small" }, line)));
  d.body.replaceChildren(
    h(
      "div",
      { class: "help-list" },
      item("🧭", "Take the tour", "Six stops round the main screen (opens the sample if nothing is open).", async () => {
        if (document.querySelector(".tabs")) startTour();
        else await openSample(true);
      }),
      item("🏞️", ft?.sample.module ? "Open the sample" : "Bring back the sample", "The small fantasy valley and its adventure.", () => openSample(false)),
      item("✅", "Show the first steps", "The checklist in the corner.", async () => {
        await attempt(() => api.setFirstTime({ stepsClosed: false }));
        await drawSteps();
      }),
      item("💡", "Show tips again", "One small tip the first time each tab or tool opens.", async () => {
        await attempt(() => api.setFirstTime({ tips: true, resetTips: true }));
        notice("Tips are back on.", "green", undefined, 3000);
      }),
      item("👋", "The welcome screen", "Where you started.", () => showWelcome()),
    ),
    h("p", { class: "muted small" }, "Short how-to videos will be linked here later."),
  );
  d.footer.replaceChildren(h("button", { class: "button primary", onClick: () => d.close() }, "Close"));
}
