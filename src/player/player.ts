// The player's screen (version 2.5): what a player sees in their own browser after typing their
// PIN. Phone first, works on a laptop too. Talks to the DM's app over the home network (lan.ts):
// it fetches its state, redraws when the table changes, and sends what the player does.

import type { ChatLine, MapView, PlayerCard, PlayerState, ShownView } from "../app/backend.ts";
import { h } from "../ui/dom.ts";
import { mapSvg, marksSvg } from "../ui/map-render.ts";
import type { Mark } from "../ui/map-render.ts";

type State = PlayerState & { mapView: MapView | null; shownMaps: Record<string, MapView> };
type Tab = "table" | "sheet" | "chat" | "map" | "journal" | "party" | "rules";

const app = document.getElementById("app")!;
let pin = "";
let state: State | null = null;
let tab: Tab = "table";
let events: EventSource | null = null;
let lastOrder: string[] = [];
let wasMyTurn = false;
let draft = "";
let ic = false;
let whisperTo: string[] = [];
let rollSee: "public" | "dm" | "blind" = "public";
let formula = "1d20";
let notesDraft: string | null = null;
let lookup = "";
let lookupHits: { title: string; group: string; stats: string | null; paragraphs: string[] }[] = [];
let openShown: string | null = null;
let unread = 0;
let lastChat = "";

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      // Private windows: the PIN is simply asked again next time.
    }
  },
  del: (k: string) => {
    try {
      localStorage.removeItem(k);
    } catch {
      // Nothing to forget.
    }
  },
};

async function call<T>(path: string, body?: unknown): Promise<{ ok: boolean; value?: T; message?: string; name?: string }> {
  try {
    const r = await fetch(path, body === undefined ? { cache: "no-store" } : { method: "POST", body: JSON.stringify(body) });
    return await r.json();
  } catch {
    return { ok: false, message: "Can't reach the DM's computer. Is it on the same Wi-Fi?" };
  }
}

const pic = (id: string | null) => (id ? `/pic/${encodeURIComponent(id)}?pin=${pin}` : "");

function toast(text: string, kind: "red" | "blue" | "green" = "blue") {
  const t = h("div", { class: `toast ${kind}`, role: "status" }, text);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

async function act(action: Record<string, unknown>): Promise<unknown> {
  const r = await call<unknown>(`/act?pin=${pin}`, { action });
  if (!r.ok) {
    toast(r.message ?? "That didn't work.", "red");
    return undefined;
  }
  await refresh();
  return r.value;
}

// ---------- Joining ----------

function joinScreen(message = "") {
  events?.close();
  events = null;
  const box = h("input", { class: "pin-box", inputmode: "numeric", autocomplete: "one-time-code", maxlength: "5", placeholder: "•••••", "aria-label": "Your PIN" });
  const go = async () => {
    const r = await call<unknown>("/join", { pin: box.value.trim() });
    if (!r.ok) return joinScreen(r.message ?? "That PIN isn't right.");
    pin = box.value.trim();
    store.set("dmip-pin", pin);
    await start();
  };
  box.addEventListener("keydown", (e) => e.key === "Enter" && void go());
  box.addEventListener("input", () => box.value.replace(/\D/g, "").length === 5 && void go());
  app.replaceChildren(
    h(
      "main",
      { class: "join" },
      h("div", { class: "logo" }, "🎲"),
      h("h1", null, "Join the table"),
      h("p", { class: "muted" }, "Type the five-digit PIN your DM gave you."),
      box,
      message ? h("p", { class: "error" }, message) : null,
      h("button", { class: "button primary big", onClick: () => void go() }, "Join"),
      h("p", { class: "muted small" }, "The DM sees everything said here, whispers too."),
    ),
  );
  box.focus();
}

async function start() {
  await refresh();
  if (!state) return;
  listen();
}

function listen() {
  events?.close();
  events = new EventSource(`/events?pin=${pin}`);
  events.onmessage = () => void refresh();
  events.addEventListener("point", (e) => {
    const p = JSON.parse((e as MessageEvent).data) as { x: number; y: number; color: string; who: string };
    pulse(p.x, p.y, p.color);
  });
  events.addEventListener("closed", () => {
    events?.close();
    events = null;
    closedScreen();
  });
  events.onerror = () => document.body.classList.add("offline");
  events.onopen = () => document.body.classList.remove("offline");
}

function closedScreen() {
  app.replaceChildren(
    h(
      "main",
      { class: "join" },
      h("div", { class: "logo" }, "🌙"),
      h("h1", null, "The table has closed"),
      h("p", { class: "muted" }, "The DM closed the door, or gave you a new PIN."),
      h("button", { class: "button primary big", onClick: () => void start() }, "Try again"),
      h("button", { class: "button plain", onClick: () => (store.del("dmip-pin"), joinScreen()) }, "Use another PIN"),
    ),
  );
}

// ---------- Drawing ----------

async function refresh() {
  const r = await call<State>(`/state?pin=${pin}`);
  if (!r.ok || !r.value) {
    if (r.message?.includes("PIN")) {
      store.del("dmip-pin");
      return joinScreen(r.message);
    }
    document.body.classList.add("offline");
    return;
  }
  document.body.classList.remove("offline");
  const prev = state;
  state = r.value;
  // Things newly shown pop up.
  const seen = new Set((store.get(`dmip-seen-${pin}`) ?? "").split(",").filter(Boolean));
  const first = !store.get(`dmip-seen-${pin}`);
  const fresh = state.shown.filter((x) => !seen.has(x.id));
  store.set(`dmip-seen-${pin}`, state.shown.map((x) => x.id).join(",") || "-");
  if (!first && fresh.length) popUp(fresh[fresh.length - 1]!);
  // My turn: the sheet pops up if the DM set it, and the phone buzzes.
  const myTurn = !!state.initiative?.myTurn;
  if (myTurn && !wasMyTurn) {
    if (state.initiative?.popSheet) tab = "sheet";
    try {
      navigator.vibrate?.(200);
    } catch {
      // Not every browser can buzz.
    }
  }
  wasMyTurn = myTurn;
  const newest = state.chat.at(-1)?.id ?? "";
  if (prev && newest !== lastChat && tab !== "chat") unread++;
  lastChat = newest;
  draw();
}

function draw() {
  if (!state) return;
  const s = state;
  const scroll = [...document.querySelectorAll<HTMLElement>("[data-scroll]")].map((el) => [el.dataset.scroll!, el.scrollTop] as const);
  const focus = (document.activeElement as HTMLElement | null)?.dataset?.key ?? null;
  const tabs: [Tab, string, string][] = [
    ["table", "Table", "🎲"],
    ["sheet", "Sheet", "🧙"],
    ["chat", unread ? `Chat (${unread})` : "Chat", "💬"],
    ...(s.mapView ? ([["map", "Map", "🗺️"]] as [Tab, string, string][]) : []),
    ["journal", "Journal", "📓"],
    ...(s.others.length ? ([["party", "Party", "👥"]] as [Tab, string, string][]) : []),
    ...(s.can.codex !== "hidden" ? ([["rules", "Rules", "📖"]] as [Tab, string, string][]) : []),
  ];
  if (!tabs.some((t) => t[0] === tab)) tab = "table";
  if (tab === "chat") unread = 0;
  const top = h(
    "header",
    { class: "top" },
    h("div", { class: "who" }, h("span", { class: "dot", style: `background:${s.me.color}` }), h("strong", null, s.me.name), s.character ? h("span", { class: "muted" }, ` · ${s.character.name}`) : null),
    h("div", { class: "where muted small" }, s.place, s.session ? ` · ${s.session.clock}` : ""),
  );
  const nav = h(
    "nav",
    { class: "tabs" },
    tabs.map(([k, label, icon]) => h("button", { class: `tab${tab === k ? " on" : ""}`, onClick: () => ((tab = k), draw()) }, h("span", { class: "tab-icon" }, icon), h("span", null, label))),
  );
  const body = { table: tableTab, sheet: sheetTab, chat: chatTab, map: mapTab, journal: journalTab, party: partyTab, rules: rulesTab }[tab](s);
  app.replaceChildren(top, h("main", { class: `body tab-${tab}`, "data-scroll": `body-${tab}` }, body), nav);
  for (const [k, t] of scroll) {
    const el = document.querySelector<HTMLElement>(`[data-scroll="${k}"]`);
    if (el) el.scrollTop = t;
  }
  if (focus) document.querySelector<HTMLElement>(`[data-key="${focus}"]`)?.focus();
  const list = document.querySelector<HTMLElement>(".chat-list");
  if (list) list.scrollTop = list.scrollHeight;
}

// ---------- Table: the session and the initiative order ----------

function tableTab(s: State): HTMLElement {
  const out: (HTMLElement | null)[] = [];
  if (!s.session) out.push(h("section", { class: "card" }, h("h2", null, "Waiting for the game"), h("p", { class: "muted" }, "The DM hasn't begun tonight's session yet. Your sheet and the chat work already.")));
  else {
    if (s.session.lastTime) out.push(h("section", { class: "card last-time" }, h("h3", null, "Last time…"), ...s.session.lastTime.split(/\n+/).map((p) => h("p", null, p))));
    const ini = s.initiative;
    if (!ini) out.push(h("section", { class: "card" }, h("h2", null, s.session.title), h("p", { class: "muted" }, "No fight going. Chat, roll and look at what the DM shows you.")));
    else {
      const ids = ini.order.map((c) => c.id);
      const arrived = new Set(ids.filter((id) => lastOrder.length && !lastOrder.includes(id)));
      lastOrder = ids;
      out.push(
        h(
          "section",
          { class: "card" },
          h("div", { class: "row" }, h("h2", null, "Initiative"), h("span", { class: "tag" }, `Round ${ini.round}`)),
          h("ol", { class: "order" }, ini.order.map((c) => card(c, arrived.has(c.id)))),
          ini.canEndTurn ? h("button", { class: "button primary big", onClick: () => void act({ type: "endTurn" }) }, "End my turn") : ini.canAdvance ? h("button", { class: "button plain", onClick: () => void act({ type: "endTurn" }) }, "Next turn") : null,
          ini.myTurn ? h("p", { class: "your-turn" }, "It's your turn!") : null,
        ),
      );
    }
  }
  out.push(diceCard(s));
  if (s.tables.length)
    out.push(
      h(
        "section",
        { class: "card" },
        h("h3", null, "Roll tables"),
        h("div", { class: "chips" }, s.tables.map((t) => h("button", { class: "chip", onClick: () => void act({ type: "rollTable", table: t.id }) }, t.name))),
      ),
    );
  return h("div", { class: "stack" }, out);
}

function card(c: PlayerCard, arrived: boolean): HTMLElement {
  return h(
    "li",
    { class: `turn kind-${c.kind}${c.now ? " now" : ""}${c.mine ? " mine" : ""}${arrived ? " squeeze" : ""}` },
    c.picture ? h("img", { class: "face", src: pic(c.picture), alt: "" }) : h("span", { class: "face blank" }, c.kind === "monster" ? "🐺" : c.kind === "event" ? "⏳" : "🧙"),
    h("span", { class: "turn-name" }, c.name, c.note ? h("span", { class: "muted small" }, ` ${c.note}`) : null),
    h("span", { class: "conds" }, c.conditions.map((x) => h("span", { class: "cond", title: x.name, style: `background:${x.color}` }, x.symbol))),
    c.health ? h("span", { class: `health h-${c.health.replace(/\s+/g, "-")}` }, c.health) : null,
  );
}

function diceCard(s: State): HTMLElement {
  const box = h("input", { class: "text", value: formula, "aria-label": "What to roll", "data-key": "formula", inputmode: "text" });
  box.addEventListener("input", () => (formula = box.value));
  const roll = (f: string, mode: "normal" | "advantage" | "disadvantage" = "normal") => void act({ type: "roll", formula: f, mode, see: rollSee });
  const see = h("select", { class: "text", "aria-label": "Who sees it" }, h("option", { value: "public", selected: rollSee === "public" }, "Everyone sees"), h("option", { value: "dm", selected: rollSee === "dm" }, "Only the DM"), h("option", { value: "blind", selected: rollSee === "blind" }, "Blind (DM only, not me)"));
  see.addEventListener("change", () => (rollSee = see.value as typeof rollSee));
  const last = [...s.chat].reverse().find((l) => l.kind === "roll" && l.from === s.me.id);
  return h(
    "section",
    { class: "card" },
    h("h3", null, "Dice"),
    h("div", { class: "dice" }, ["d20", "d12", "d10", "d8", "d6", "d4", "d100"].map((d) => h("button", { class: "die", onClick: () => roll(`1${d}`) }, d))),
    h("div", { class: "row" }, box, h("button", { class: "button primary", onClick: () => roll(formula) }, "Roll")),
    h("div", { class: "row" }, h("button", { class: "button plain grow", onClick: () => roll(formula, "advantage") }, "Advantage"), h("button", { class: "button plain grow", onClick: () => roll(formula, "disadvantage") }, "Disadvantage")),
    h("div", { class: "row" }, see),
    last ? h("p", { class: "last-roll" }, "Your last roll: ", h("strong", null, Number.isNaN(last.roll?.total) || last.roll?.total === null ? "?" : String(last.roll?.total ?? last.text)), h("span", { class: "muted small" }, ` ${last.roll?.formula ?? ""}`)) : null,
  );
}

// ---------- My character ----------

function sheetTab(s: State): HTMLElement {
  const v = s.character;
  if (!v) return h("section", { class: "card" }, h("h2", null, "No character yet"), h("p", { class: "muted" }, "Ask the DM to link you to your character in the Party tab."));
  const hp = v.hpNow ?? v.hp ?? 0;
  const setHp = (n: number) => void act({ type: "hp", value: n });
  return h(
    "div",
    { class: "stack" },
    h(
      "section",
      { class: "card sheet-head" },
      v.picture ? h("img", { class: "portrait", src: pic(v.picture), alt: "" }) : null,
      h("div", null, h("h2", null, v.name), h("p", { class: "muted" }, [v.race?.name, v.class?.name, `level ${v.level}`].filter(Boolean).join(" · "))),
    ),
    h(
      "section",
      { class: "card" },
      h("h3", null, "Hit points"),
      h("div", { class: "hp" }, h("button", { class: "round", "aria-label": "Take 1 damage", onClick: () => setHp(hp - 1) }, "−"), h("span", { class: "hp-now" }, String(hp), h("span", { class: "muted" }, ` / ${v.hp ?? "?"}`)), h("button", { class: "round", "aria-label": "Heal 1", onClick: () => setHp(hp + 1) }, "+")),
      h("div", { class: "row" }, ...[-10, -5, 5, 10].map((n) => h("button", { class: "button plain small-b", onClick: () => setHp(hp + n) }, n > 0 ? `+${n}` : String(n)))),
      h("div", { class: "facts" }, fact("Armour", v.ac ?? "–"), fact("Speed", v.speed || "–"), fact("Experience", v.xp), fact("Money", v.gold || "–")),
    ),
    v.scores.length ? h("section", { class: "card" }, h("h3", null, "Abilities"), h("div", { class: "scores" }, v.scores.map((x) => h("button", { class: "score", title: `Roll ${x.name}`, onClick: () => void act({ type: "roll", formula: `1d20${x.bonus === null ? "" : x.bonus >= 0 ? `+${x.bonus}` : String(x.bonus)}`, label: x.name, see: rollSee }) }, h("span", { class: "score-label" }, x.label || x.name), h("span", { class: "score-bonus" }, x.bonus === null ? "–" : x.bonus >= 0 ? `+${x.bonus}` : String(x.bonus)), h("span", { class: "muted small" }, x.score ?? ""))))) : null,
    v.trackers.length
      ? h(
          "section",
          { class: "card" },
          h("h3", null, "Trackers"),
          v.trackers.map((t) =>
            h(
              "div",
              { class: "tracker" },
              h("span", { class: "tracker-name" }, t.name),
              t.max <= 12
                ? h("span", { class: "boxes" }, Array.from({ length: t.max }, (_, i) => h("button", { class: `box${i < t.value ? " on" : ""}`, "aria-label": `${t.name} ${i + 1}`, onClick: () => void act({ type: "tracker", tracker: t.id, value: i < t.value ? i : i + 1 }) })))
                : h("span", { class: "row" }, h("button", { class: "round small", onClick: () => void act({ type: "tracker", tracker: t.id, value: t.value - 1 }) }, "−"), h("strong", null, `${t.value} / ${t.max}`), h("button", { class: "round small", onClick: () => void act({ type: "tracker", tracker: t.id, value: t.value + 1 }) }, "+")),
            ),
          ),
        )
      : null,
    v.features.length ? h("section", { class: "card" }, h("h3", null, "Features"), v.features.map((f) => h("details", { class: "feature" }, h("summary", null, f.name, h("span", { class: "muted small" }, ` ${f.from}`)), h("p", null, f.sentence)))) : null,
    v.gear.length ? h("section", { class: "card" }, h("h3", null, "Gear"), h("ul", { class: "gear" }, v.gear.map((g) => h("li", null, g.picture ? h("img", { class: "gear-pic", src: pic(g.picture), alt: "" }) : null, g.name)))) : null,
    v.appearance.some((a) => a.value) ? h("section", { class: "card" }, h("h3", null, "Appearance"), h("div", { class: "facts" }, v.appearance.filter((a) => a.value).map((a) => fact(a.label, a.value)))) : null,
  );
}

const fact = (label: string, value: string | number) => h("div", { class: "fact" }, h("span", { class: "muted small" }, label), h("strong", null, String(value)));

// ---------- Chat and whispers ----------

function chatLine(l: ChatLine, me: string): HTMLElement {
  const total = l.roll ? (Number.isNaN(l.roll.total) || l.roll.total === null ? "?" : String(l.roll.total)) : null;
  const label = l.roll ? l.text.replace(/:?\s*[\d?]+\s*$/, "") : "";
  return h(
    "li",
    { class: `line kind-${l.kind}${l.ic ? " ic" : ""}${l.from === me ? " me" : ""}`, style: `--who:${l.color}` },
    h("span", { class: "line-who" }, l.who),
    l.kind === "whisper" ? h("span", { class: "muted small" }, ` whispers to ${l.to.join(", ")}`) : null,
    l.roll
      ? h("span", { class: "line-roll" }, label ? ` ${label}: ` : " rolled ", h("strong", { class: "total" }, total), h("span", { class: "muted small" }, ` ${l.roll.formula}${l.see === "dm" ? " · DM only" : l.see === "blind" ? " · blind" : ""}`), h("div", { class: "muted small" }, l.roll.breakdown))
      : h("span", { class: "line-text" }, " ", l.text),
  );
}

function chatTab(s: State): HTMLElement {
  const box = h("input", { class: "text", value: draft, placeholder: whisperTo.length ? `Whisper to ${whisperTo.join(", ")}…` : ic ? "Say it in character…" : "Talk to the table…", "aria-label": "Message", "data-key": "chat" });
  box.addEventListener("input", () => (draft = box.value));
  const send = async () => {
    const text = box.value.trim();
    if (!text) return;
    const r = /^\/r(?:oll)?\s+(.+)$/i.exec(text);
    draft = "";
    if (r) await act({ type: "roll", formula: r[1], see: rollSee });
    else await act({ type: "chat", text, ic, to: whisperTo });
  };
  box.addEventListener("keydown", (e) => e.key === "Enter" && void send());
  const icBox = h("input", { type: "checkbox", checked: ic });
  icBox.addEventListener("change", () => ((ic = icBox.checked), draw()));
  return h(
    "div",
    { class: "chat" },
    h("ol", { class: "chat-list" }, s.chat.length ? s.chat.map((l) => chatLine(l, s.me.id)) : [h("li", { class: "muted" }, "Messages and rolls show here. Type /r 1d20+3 to roll.")]),
    h(
      "div",
      { class: "chat-bar" },
      h(
        "div",
        { class: "chips" },
        h("span", { class: "muted small" }, "To:"),
        h("button", { class: `chip${whisperTo.length ? "" : " on"}`, onClick: () => ((whisperTo = []), draw()) }, "Everyone"),
        s.people.map((p) => h("button", { class: `chip${whisperTo.includes(p.name) ? " on" : ""}`, onClick: () => ((whisperTo = whisperTo.includes(p.name) ? whisperTo.filter((x) => x !== p.name) : [...whisperTo, p.name]), draw()) }, p.online ? h("span", { class: "online" }) : null, p.name)),
      ),
      h("div", { class: "row" }, box, h("button", { class: "button primary", onClick: () => void send() }, "Send")),
      h("label", { class: "check small" }, icBox, " In character"),
      h("p", { class: "muted tiny" }, "The DM sees everything said here, whispers too."),
    ),
  );
}

// ---------- The shown map ----------

let mapZoom = 1;

function mapTab(s: State): HTMLElement {
  const v = s.mapView;
  if (!v) return h("section", { class: "card" }, h("p", { class: "muted" }, "No map showing right now."));
  return h("div", { class: "stack" }, mapBoard(v, (s.map?.marks ?? []) as Mark[], s.can.pointer === "change"));
}

function mapBoard(v: MapView, marks: Mark[], canPoint: boolean): HTMLElement {
  const board = h("div", { class: "map-board", style: `width:${Math.round(mapZoom * 100)}%` });
  board.innerHTML = mapSvg(v, { pictureHref: v.picture ? pic(v.picture) : null, show: { grid: true, pins: true, labels: true, drawing: true, dm: false } });
  const svgEl = board.querySelector("svg")!;
  svgEl.removeAttribute("width");
  svgEl.removeAttribute("height");
  const layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
  layer.innerHTML = marksSvg(marks);
  layer.setAttribute("class", "marks");
  svgEl.appendChild(layer);
  svgEl.setAttribute("data-map", v.id);
  if (canPoint)
    svgEl.addEventListener("click", (e) => {
      const r = svgEl.getBoundingClientRect();
      void act({ type: "point", x: ((e.clientX - r.left) / r.width) * v.width, y: ((e.clientY - r.top) / r.height) * v.height });
    });
  return h(
    "section",
    { class: "card map-card" },
    h("div", { class: "row" }, h("h3", null, v.name), h("span", { class: "spacer" }), h("button", { class: "button plain small-b", onClick: () => ((mapZoom = Math.max(1, mapZoom - 0.5)), draw()) }, "−"), h("button", { class: "button plain small-b", onClick: () => ((mapZoom = Math.min(4, mapZoom + 0.5)), draw()) }, "+")),
    h("div", { class: "map-scroll", "data-scroll": "map" }, board),
    canPoint ? h("p", { class: "muted small" }, "Tap the map to point at something; everyone sees a pulse.") : null,
  );
}

function pulse(x: number, y: number, color: string) {
  const svgEl = document.querySelector<SVGSVGElement>("svg[data-map]");
  if (!svgEl) return;
  const vb = svgEl.viewBox.baseVal;
  const r = Math.max(vb.width, vb.height) / 40;
  const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  c.setAttribute("cx", String(x));
  c.setAttribute("cy", String(y));
  c.setAttribute("r", String(r));
  c.setAttribute("class", "pulse");
  c.setAttribute("stroke", color);
  c.setAttribute("stroke-width", String(r / 4));
  svgEl.appendChild(c);
  setTimeout(() => c.remove(), 1600);
}

// ---------- Journal: what the DM showed me, and my own notes ----------

function shownBody(x: ShownView, s: State): HTMLElement {
  const m = x.kind === "map" ? s.shownMaps[x.node] : null;
  return h(
    "div",
    { class: "shown-body" },
    m ? mapBoard(m, [], false) : x.picture ? h("img", { class: "shown-pic", src: pic(x.picture), alt: "" }) : null,
    x.stats ? h("p", { class: "stats" }, x.stats) : null,
    x.paragraphs.map((p) => h("p", null, p)),
  );
}

function journalTab(s: State): HTMLElement {
  const notes = h("textarea", { class: "text notes", rows: "8", placeholder: "Your own notes: names, clues, what you owe the innkeeper…", "aria-label": "My notes", "data-key": "notes" });
  notes.value = notesDraft ?? s.me.notes;
  let timer: ReturnType<typeof setTimeout> | null = null;
  notes.addEventListener("input", () => {
    notesDraft = notes.value;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void call(`/act?pin=${pin}`, { action: { type: "notes", text: notes.value } }).then(() => (notesDraft = null)), 800);
  });
  const shown = [...s.shown].reverse();
  return h(
    "div",
    { class: "stack" },
    h(
      "section",
      { class: "card" },
      h("h2", null, "Shown to you"),
      shown.length
        ? h(
            "ul",
            { class: "shown-list" },
            shown.map((x) =>
              h(
                "li",
                null,
                h("button", { class: "link", onClick: () => ((openShown = openShown === x.id ? null : x.id), draw()) }, x.title),
                h("span", { class: "muted small" }, ` ${new Date(x.time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`),
                openShown === x.id ? shownBody(x, s) : null,
              ),
            ),
          )
        : h("p", { class: "muted" }, "Handouts, maps and pictures the DM shows you are kept here."),
    ),
    h("section", { class: "card" }, h("h2", null, "My notes"), notes, h("p", { class: "muted tiny" }, "Saved as you type. The DM can read them too.")),
  );
}

function popUp(x: ShownView) {
  if (!state) return;
  const close = () => wrap.remove();
  const wrap = h(
    "div",
    { class: "popup-wrap", onClick: (e: MouseEvent) => e.target === wrap && close() },
    h("div", { class: "popup" }, h("div", { class: "row" }, h("h2", null, x.title), h("span", { class: "spacer" }), h("button", { class: "button plain", onClick: close }, "Close")), shownBody(x, state), h("p", { class: "muted tiny" }, "Kept in your Journal.")),
  );
  document.body.appendChild(wrap);
}

// ---------- The party and the rules ----------

function partyTab(s: State): HTMLElement {
  return h(
    "div",
    { class: "stack" },
    s.others.map((o) => h("section", { class: "card party-card" }, o.picture ? h("img", { class: "face", src: pic(o.picture), alt: "" }) : h("span", { class: "face blank" }, "🧙"), h("div", null, h("strong", null, o.name), h("div", { class: "muted small" }, [o.player && `played by ${o.player}`, o.className && `${o.className} ${o.level}`].filter(Boolean).join(" · "))), o.health ? h("span", { class: "health" }, o.health) : null)),
  );
}

function rulesTab(_s: State): HTMLElement {
  const box = h("input", { class: "text", type: "search", value: lookup, placeholder: "Find a rule, spell or item…", "aria-label": "Find", "data-key": "lookup" });
  let timer: ReturnType<typeof setTimeout> | null = null;
  box.addEventListener("input", () => {
    lookup = box.value;
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      const r = await call<typeof lookupHits>(`/act?pin=${pin}`, { action: { type: "lookup", query: lookup } });
      lookupHits = r.ok ? (r.value ?? []) : [];
      draw();
    }, 300);
  });
  return h(
    "div",
    { class: "stack" },
    h("section", { class: "card" }, box),
    lookupHits.map((e) => h("details", { class: "card rule" }, h("summary", null, h("strong", null, e.title), h("span", { class: "muted small" }, ` ${e.group}`)), e.stats ? h("p", { class: "stats" }, e.stats) : null, e.paragraphs.map((p) => h("p", null, p)))),
    lookup && !lookupHits.length ? h("p", { class: "muted pad" }, "Nothing matches yet.") : null,
  );
}

// ---------- Start ----------

const fromLink = new URLSearchParams(location.search).get("pin");
if (fromLink && /^\d{5}$/.test(fromLink)) {
  store.set("dmip-pin", fromLink);
  history.replaceState(null, "", location.pathname);
}
pin = store.get("dmip-pin") ?? "";
if (pin) void start();
else joinScreen();
