// The initiative tracker (version 2). Follows the game's core check. Drag monsters in from the
// Codex (How many? Separately or as a group?), drag cards to change the order, click a card to
// damage or heal it, give conditions (pick several cards with Ctrl or Shift to give them all the
// same one), and click an attack to roll it. Monsters can join hidden until revealed.

import type { CardView, ConditionOn } from "../../app/backend.ts";
import { api, pictureUrl } from "../api.ts";
import { attempt } from "../common.ts";
import { notice, openDialog } from "../dialogs.ts";
import { h, svg } from "../dom.ts";
import { ICONS } from "../icons.ts";
import { DRAG_TYPE } from "../library-panel.ts";
import { NODE_DRAG } from "../codex-panel.ts";
import type { DeskCtx } from "./registry.ts";
import { rollAndPost } from "./dice.ts";

const CARD_DRAG = "application/x-dm-card";
const picked = new Set<string>();

function setting<T>(ctx: DeskCtx, key: string, d: T): T {
  const v = ctx.settings("initiative")[key];
  return (v === undefined ? d : v) as T;
}

export async function initiativeTool(ctx: DeskCtx): Promise<HTMLElement> {
  const s = ctx.data.session;
  const ro = ctx.view.readOnly;
  if (!s) return h("div", { class: "pad" }, h("p", { class: "muted" }, "Begin a session (at the top) to run fights here."));
  const order = ctx.data.order;
  for (const id of [...picked]) if (!order.some((c) => c.id === id)) picked.delete(id);
  const live = order.filter((c) => !c.delayed);
  const current = s.combat.active ? live[s.combat.turn] : null;
  const style = setting(ctx, "style", "list");
  const showPlayer = setting(ctx, "names", "character") === "player";

  const head = h(
    "div",
    { class: "init-head" },
    s.combat.active ? h("span", { class: "init-round" }, `Round ${s.combat.round}`) : h("span", { class: "muted" }, "No fight going."),
    h("span", { class: "grow" }),
    !ro && !s.combat.active
      ? h("button", { class: "button primary small-button", title: "The party at the table joins; the current encounter's creatures drop in (hidden until you reveal them, if the gear says so)", onClick: () => void start(ctx) }, svg(ICONS.sword), "Start fight")
      : null,
    !ro && s.combat.active ? h("button", { class: "button primary small-button", title: "Next turn (anyone with permission can press it)", onClick: () => void next(ctx) }, "Next turn ▸") : null,
    !ro && s.combat.active && order.some((c) => c.hidden) ? h("button", { class: "button plain small-button", onClick: async () => (await attempt(() => api.revealAll())) && ctx.refresh() }, svg(ICONS.eye), "Reveal all") : null,
    !ro && s.combat.active && order.some((c) => c.kind === "monster" && c.members.every((m) => m.defeated)) ? h("button", { class: "button plain small-button", onClick: async () => (await attempt(() => api.clearDefeated())) && ctx.refresh() }, "Clear defeated") : null,
    !ro && s.combat.active ? h("button", { class: "button plain small-button", onClick: async () => (await attempt(() => api.endFight())) !== undefined && (notice("The fight is over and in the log.", "green", undefined, 4000), await ctx.refresh()) }, "End fight") : null,
  );

  const tools = !ro
    ? h(
        "div",
        { class: "init-tools" },
        h("button", { class: "link small", onClick: () => void addEventCard(ctx) }, "+ Event card"),
        picked.size ? h("button", { class: "link small", onClick: () => void conditionDialog(ctx, [...picked].map((id) => ({ combatant: id, member: null }))) }, `Give ${picked.size} picked a condition`) : null,
        picked.size ? h("button", { class: "link small", onClick: () => (picked.clear(), void ctx.refresh()) }, "Unpick") : null,
        h("span", { class: "muted tiny" }, "Drag monsters in from the Codex. Ctrl-click cards to pick several."),
      )
    : null;

  const cards = order.length ? order.map((c, i) => card(c, c === current, i, ctx, showPlayer)) : [h("p", { class: "muted small pad" }, "Nobody in the order yet. Start fight, or drag monsters in from the Codex.")];
  const list = h("div", { class: `init-list${style === "carousel" ? " carousel" : ""}` }, cards);
  const body = h("div", { class: "init-tool" }, head, tools, list);

  // Dropping monsters (or characters) from the Codex: How many? Separately or as a group?
  body.addEventListener("dragover", (e) => {
    const types = e.dataTransfer?.types ?? [];
    if (ro || !(types.includes(NODE_DRAG) || types.includes(DRAG_TYPE))) return;
    e.preventDefault();
    body.classList.add("drop-over");
  });
  body.addEventListener("dragleave", (e) => !body.contains(e.relatedTarget as Node) && body.classList.remove("drop-over"));
  body.addEventListener("drop", (e) => {
    body.classList.remove("drop-over");
    if (e.dataTransfer?.types.includes(CARD_DRAG)) return;
    const ids = (JSON.parse(e.dataTransfer?.getData(NODE_DRAG) || "{}") as { ids?: string[] }).ids ?? (JSON.parse(e.dataTransfer?.getData(DRAG_TYPE) || "[]") as string[]);
    if (!ids.length) return;
    e.preventDefault();
    void (async () => {
      for (const id of ids) await howMany(id, ctx);
      await ctx.refresh();
    })();
  });
  return body;
}

function hpWords(hp: number | null, max: number | null): string {
  if (hp === null || !max) return "";
  if (hp <= 0) return "down";
  const r = hp / max;
  return r >= 1 ? "unhurt" : r > 0.5 ? "hurt" : r > 0.25 ? "bloodied" : "nearly down";
}

function card(c: CardView, now: boolean, index: number, ctx: DeskCtx, showPlayer: boolean): HTMLElement {
  const ro = ctx.view.readOnly;
  const glance = setting<string[]>(ctx, "glance", ["hp", "ac"]);
  const allDown = c.kind === "monster" && c.members.length > 0 && c.members.every((m) => m.defeated);
  const hp = c.kind === "character" ? c.hpNow : c.members.length === 1 ? c.members[0]!.hp : null;
  const max = c.kind === "character" ? c.hpMax : c.members.length === 1 ? c.members[0]!.maxHp : null;
  const conds = c.kind === "character" ? c.charConditions : c.members.length === 1 ? c.members[0]!.conditions : [];
  const name = c.kind === "character" && showPlayer && c.player ? c.player : c.name;
  const el = h(
    "div",
    {
      class: `init-card kind-${c.kind}${now ? " now" : ""}${c.hidden ? " hidden-card" : ""}${allDown ? " defeated" : ""}${c.delayed ? " delayed" : ""}${picked.has(c.id) ? " picked" : ""}`,
      draggable: ro ? "false" : "true",
      "data-card": c.id,
      onClick: (e: MouseEvent) => {
        if (!(e.ctrlKey || e.shiftKey || e.metaKey)) return;
        picked.has(c.id) ? picked.delete(c.id) : picked.add(c.id);
        void ctx.refresh();
      },
    },
    h("div", { class: "init-num", title: c.rolled ? `Rolled: ${c.rolled}` : "Initiative" }, c.kind === "event" ? "⏱" : String(Math.round(c.init * 10) / 10)),
    c.picture ? h("img", { class: "init-pic", src: pictureUrl(c.picture), alt: "" }) : h("span", { class: "init-pic letter" }, c.kind === "event" ? "!" : c.name.slice(0, 1)),
    h(
      "div",
      { class: "init-main" },
      h(
        "div",
        { class: "init-name" },
        c.ref ? h("button", { class: "link", onClick: () => void ctx.peek(c.ref!) }, name) : h("span", null, name),
        c.hidden ? h("span", { class: "tag", title: "Players can't see this card yet" }, "hidden") : null,
        c.delayed ? h("span", { class: "tag" }, "delayed") : null,
        ...conds.map((x) => badge(x, ctx, c.kind === "character" ? { character: c.ref! } : { combatant: c.id, member: c.members[0]?.id })),
      ),
      c.kind === "event" ? h("div", { class: "small" }, c.note) : null,
      c.kind !== "event"
        ? h(
            "div",
            { class: "init-glance" },
            glance.includes("hp") && hp !== null ? h("span", { class: "glance hp", title: hpWords(hp, max) }, h("strong", null, String(hp)), max !== null ? `/${max}` : "", " HP") : null,
            Object.entries(c.glance).map(([k, v]) => h("span", { class: "glance" }, `${k} ${v}`)),
          )
        : null,
      c.members.length > 1
        ? h(
            "div",
            { class: "init-members" },
            c.members.map((m) =>
              h(
                "div",
                { class: `init-member${m.defeated ? " defeated" : ""}` },
                h("span", null, m.name),
                h("span", { class: "small" }, `${m.hp ?? "?"}/${m.maxHp ?? "?"}`),
                ...m.conditions.map((x) => badge(x, ctx, { combatant: c.id, member: m.id })),
                ro ? null : hpBox(ctx, c.id, m.id),
              ),
            ),
          )
        : null,
      now && c.attacks.length && !ro ? h("div", { class: "init-attacks" }, c.attacks.map((a) => h("button", { class: "pick-chip", title: `${a.toHit} to hit${a.damage ? `, ${a.damage} damage` : ""}`, onClick: () => void attack(c, a, ctx) }, a.name))) : null,
    ),
    ro
      ? null
      : h(
          "div",
          { class: "init-actions" },
          c.kind !== "event" && c.members.length <= 1 ? hpBox(ctx, c.id, c.members[0]?.id ?? null) : null,
          c.kind !== "event" ? h("button", { class: "icon-button", title: "Give a condition", onClick: () => void conditionDialog(ctx, [{ combatant: c.id, member: null }]) }, "＋") : null,
          c.hidden ? h("button", { class: "icon-button", title: "Reveal to players", onClick: async () => (await attempt(() => api.setCombatant(c.id, { hidden: false }))) && ctx.refresh() }, svg(ICONS.eye)) : null,
          h("button", { class: "icon-button", title: c.delayed ? "Jump back in" : "Delay: set this card aside until they jump back in", onClick: async () => (await attempt(() => api.setCombatant(c.id, { delayed: !c.delayed }))) && ctx.refresh() }, c.delayed ? "↩" : "⏸"),
          h("button", { class: "icon-button", title: "Take out of the fight", onClick: async () => (await attempt(() => api.setCombatant(c.id, null))) && ctx.refresh() }, svg(ICONS.close)),
        ),
  );
  // Drag a card to where it acts.
  el.addEventListener("dragstart", (e) => {
    e.dataTransfer!.setData(CARD_DRAG, c.id);
    e.dataTransfer!.effectAllowed = "move";
  });
  el.addEventListener("dragover", (e) => {
    if (!e.dataTransfer?.types.includes(CARD_DRAG)) return;
    e.preventDefault();
    el.classList.add("drop-before");
  });
  el.addEventListener("dragleave", () => el.classList.remove("drop-before"));
  el.addEventListener("drop", (e) => {
    el.classList.remove("drop-before");
    const id = e.dataTransfer?.getData(CARD_DRAG);
    if (!id || id === c.id) return;
    e.preventDefault();
    e.stopPropagation();
    void (async () => (await attempt(() => api.moveInOrder(id, c.id))) && ctx.refresh())();
  });
  void index;
  return el;
}

function badge(x: ConditionOn, ctx: DeskCtx, where: { character?: string; combatant?: string; member?: string }): HTMLElement {
  const cond = ctx.data.conditions.find((c) => c.id === x.condition);
  const left = x.left !== null && x.unit !== "removed" && x.unit !== "save" ? `${Math.round(x.left * 10) / 10} ${x.unit === "rounds" ? (x.left === 1 ? "round" : "rounds") : x.unit}` : x.unit === "save" ? "until they save" : "";
  const tip = [`${cond?.name ?? "A condition"}${x.counter !== null ? ` ${x.counter}` : ""}`, x.source ? `from ${x.source}` : "", left ? `${left} left` : "", cond?.text ?? ""].filter(Boolean).join(" · ");
  const b = h("button", { class: "cond-badge", style: `--c:${cond?.color ?? "#8a4b2a"}`, title: tip }, h("span", null, cond?.symbol ?? "●"), x.counter !== null ? h("span", { class: "cond-count" }, String(x.counter)) : null, left ? h("span", { class: "cond-left" }, left.split(" ")[0]) : null);
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    if (ctx.view.readOnly) return;
    const d = openDialog(cond?.name ?? "Condition");
    const act = async (change: { counter?: number; left?: number } | null) => {
      if ((await attempt(() => api.changeCondition(where, x.id, change))) !== undefined) {
        d.close();
        await ctx.refresh();
      }
    };
    d.body.replaceChildren(h("p", { class: "small" }, cond?.text ?? ""), h("p", { class: "muted small" }, tip));
    d.footer.replaceChildren(
      x.counter !== null ? h("button", { class: "button plain", onClick: () => void act({ counter: x.counter! - 1 }) }, "− 1") : h("span"),
      x.counter !== null ? h("button", { class: "button plain", onClick: () => void act({ counter: x.counter! + 1 }) }, "+ 1") : h("span"),
      h("span", { class: "grow" }),
      h("button", { class: "button primary", onClick: () => void act(null) }, "Remove"),
    );
  });
  return b;
}

function hpBox(ctx: DeskCtx, combatant: string, member: string | null): HTMLElement {
  const box = h("input", { class: "hp-input", inputmode: "numeric", placeholder: "±", title: "Type damage and press Enter (or a minus number to heal)", "aria-label": "Damage" });
  const apply = async (heal: boolean) => {
    const n = Number(box.value);
    if (!box.value.trim() || !Number.isFinite(n)) return;
    const r = await attempt(() => api.damage(combatant, member, heal ? -Math.abs(n) : n));
    if (r) notice(r, "blue", undefined, 3000);
    await ctx.refresh();
  };
  box.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void apply(false);
  });
  return h("div", { class: "hp-box", onClick: (e: MouseEvent) => e.stopPropagation() }, box, h("button", { class: "mini", title: "Damage", onClick: () => void apply(false) }, "−"), h("button", { class: "mini", title: "Heal", onClick: () => void apply(true) }, "+"));
}

async function attack(c: CardView, a: CardView["attacks"][number], ctx: DeskCtx) {
  const hit = await rollAndPost(ctx, a.toHit, `${c.name}: ${a.name} to hit`);
  if (!hit || !a.damage) return;
  const dmg = await rollAndPost(ctx, a.damage, `${c.name}: ${a.name} damage`);
  if (!dmg?.roll) return;
  const targets = ctx.data.order.filter((x) => x.id !== c.id && x.kind !== "event");
  if (!targets.length) return;
  const d = openDialog(`Put ${dmg.roll.total} damage on…`);
  d.body.replaceChildren(
    h("p", { class: "muted small" }, `To hit: ${hit.roll?.total} (${hit.roll?.breakdown}). Damage: ${dmg.roll.total} (${dmg.roll.breakdown}).`),
    h(
      "div",
      { class: "pick-chips" },
      targets.flatMap((t) => (t.members.length > 1 ? t.members.filter((m) => !m.defeated).map((m) => ({ t, m })) : [{ t, m: t.members[0] ?? null }])).map(({ t, m }) =>
        h(
          "button",
          {
            class: "pick-chip",
            onClick: async () => {
              const r = await attempt(() => api.damage(t.id, m?.id ?? null, dmg.roll!.total));
              d.close();
              if (r) notice(r, "blue", undefined, 3000);
              await ctx.refresh();
            },
          },
          m && t.members.length > 1 ? m.name : t.name,
        ),
      ),
    ),
  );
  d.footer.replaceChildren(h("button", { class: "button plain", onClick: () => d.close() }, "It missed"));
}

async function start(ctx: DeskCtx) {
  const s = ctx.data.session!;
  const r = await attempt(() => api.startFight({ encounter: s.encounter, hidden: setting(ctx, "joinHidden", true), groupFrom: setting(ctx, "groupFrom", 5) }));
  if (r !== undefined) await ctx.refresh();
}

async function next(ctx: DeskCtx) {
  const r = await attempt(() => api.nextTurn({ rerollEachRound: setting(ctx, "reroll", false) }));
  if (r?.fired.length) notice(`Ran out: ${r.fired.join(", ")}.`, "yellow", undefined, 6000);
  await ctx.refresh();
  // The current card scrolls into view, and the one whose turn it is pops up its sheet if asked.
  document.querySelector(".init-card.now")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  if (setting(ctx, "popSheet", false)) {
    const now = document.querySelector<HTMLElement>(".init-card.now .init-name .link");
    now?.click();
  }
}

/** Dragging a monster in: How many? Separately or as a group? Hidden? */
async function howMany(id: string, ctx: DeskCtx) {
  const n = await attempt(() => api.node(id));
  if (!n || n.kind !== "being") return notice("Only monsters, NPCs and characters can join a fight.", "blue", undefined, 4000);
  if (n.fields.beingKind === "character") {
    await attempt(() => api.addToFight(id, { count: 1, group: false, hidden: false }));
    return;
  }
  await new Promise<void>((resolve) => {
    const d = openDialog(`Add ${n.name}`, { onClose: () => resolve() });
    const count = h("input", { class: "text-input score-input", inputmode: "numeric", value: "1", "aria-label": "How many" });
    const group = h("select", { class: "text-input select", "aria-label": "How they act" }, h("option", { value: "separate" }, `Separately (${n.name} 1, ${n.name} 2…, each rolling)`), h("option", { value: "group" }, "As a group (one card, one roll, each with its own hit points)"));
    const hidden = h("input", { type: "checkbox", checked: setting(ctx, "joinHidden", true) });
    d.body.replaceChildren(h("label", { class: "field-label" }, "How many?"), count, h("label", { class: "field-label spaced" }, "How they act"), group, h("label", { class: "check spaced" }, hidden, "Hidden from players until revealed"));
    const ok = h("button", { class: "button primary" }, "Add");
    ok.addEventListener("click", async () => {
      await attempt(() => api.addToFight(id, { count: Math.max(1, Number(count.value) || 1), group: group.value === "group", hidden: hidden.checked }));
      d.close();
    });
    count.addEventListener("keydown", (e) => e.key === "Enter" && ok.click());
    d.footer.replaceChildren(h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"), ok);
    count.focus();
    count.select();
  });
}

async function addEventCard(ctx: DeskCtx) {
  const d = openDialog("Event card");
  const name = h("input", { class: "text-input", placeholder: "Lair action", "aria-label": "Name" });
  const init = h("input", { class: "text-input score-input", inputmode: "numeric", value: "20", "aria-label": "At initiative" });
  const note = h("input", { class: "text-input", placeholder: "The ceiling drips acid", "aria-label": "Reminder" });
  d.body.replaceChildren(h("p", { class: "muted small" }, "A card with no creature, at a set spot in the order. Its reminder shows when its turn comes."), h("label", { class: "field-label" }, "Name"), name, h("label", { class: "field-label spaced" }, "At initiative"), init, h("label", { class: "field-label spaced" }, "Reminder"), note);
  const ok = h("button", { class: "button primary" }, "Add");
  ok.addEventListener("click", async () => {
    if ((await attempt(() => api.addEvent(name.value || "Event", Number(init.value) || 0, note.value))) !== undefined) {
      d.close();
      await ctx.refresh();
    }
  });
  d.footer.replaceChildren(h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"), ok);
  name.focus();
}

/** Puts a condition on one or more cards, with how long it lasts and an optional counter. */
export async function conditionDialog(ctx: DeskCtx, targets: { combatant: string; member: string | null }[]) {
  const d = openDialog(targets.length === 1 ? "Give a condition" : `Give ${targets.length} cards a condition`);
  let chosen = ctx.data.conditions[0]?.id ?? "";
  const unit = h("select", { class: "text-input select", "aria-label": "Lasts" }, h("option", { value: "removed" }, "Until removed"), h("option", { value: "rounds" }, "Rounds"), h("option", { value: "minutes" }, "Minutes"), h("option", { value: "hours" }, "Hours"), h("option", { value: "save" }, "Until they save"));
  const left = h("input", { class: "text-input score-input", inputmode: "numeric", value: "1", "aria-label": "How long" });
  const counter = h("input", { class: "text-input score-input", inputmode: "numeric", placeholder: "—", "aria-label": "Counter" });
  const source = h("input", { class: "text-input", placeholder: "the ghoul's claws", "aria-label": "From" });
  const draw = () =>
    d.body.replaceChildren(
      h("div", { class: "pick-chips cond-picks" }, ctx.data.conditions.map((c) => h("button", { class: `pick-chip${c.id === chosen ? " on" : ""}`, title: c.text, onClick: () => ((chosen = c.id), draw()) }, h("span", { style: `color:${c.color}` }, c.symbol), " ", c.name))),
      h("div", { class: "inline spaced" }, h("span", { class: "field-label" }, "Lasts"), unit, left),
      h("div", { class: "inline spaced" }, h("span", { class: "field-label" }, "Counter (poison 3, Exhaustion 2)"), counter),
      h("div", { class: "inline spaced" }, h("span", { class: "field-label" }, "From"), source),
    );
  draw();
  const ok = h("button", { class: "button primary" }, "Give");
  ok.addEventListener("click", async () => {
    if (!chosen) return;
    const u = unit.value as ConditionOn["unit"];
    const c = { condition: chosen, left: u === "removed" || u === "save" ? null : Math.max(0, Number(left.value) || 1), unit: u, counter: counter.value.trim() ? Number(counter.value) || 0 : null, source: source.value.trim() };
    if ((await attempt(() => api.addCondition(targets, c))) !== undefined) {
      picked.clear();
      d.close();
      await ctx.refresh();
    }
  });
  d.footer.replaceChildren(h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"), ok);
}

export async function initiativeGear(ctx: DeskCtx) {
  const d = openDialog("Initiative settings", { wide: true });
  const cur = ctx.settings("initiative");
  const abilities = (await attempt(() => api.choices()))?.abilities ?? [];
  const glance = new Set<string>((cur.glance as string[] | undefined) ?? ["hp", "ac"]);
  const tick = (label: string, key: string, d0: boolean) => {
    const b = h("input", { type: "checkbox", checked: (cur[key] as boolean | undefined) ?? d0 });
    b.addEventListener("change", () => void ctx.setSettings("initiative", { [key]: b.checked }));
    return h("label", { class: "check" }, b, label);
  };
  const style = h("select", { class: "text-input select", "aria-label": "Style" }, h("option", { value: "list", selected: cur.style !== "carousel" }, "List: cards in a column"), h("option", { value: "carousel", selected: cur.style === "carousel" }, "Carousel: across the top, whoever's turn it is in the middle"));
  style.addEventListener("change", () => void ctx.setSettings("initiative", { style: style.value }));
  const names = h("select", { class: "text-input select", "aria-label": "Names" }, h("option", { value: "character", selected: cur.names !== "player" }, "Character names"), h("option", { value: "player", selected: cur.names === "player" }, "Player names"));
  names.addEventListener("change", () => void ctx.setSettings("initiative", { names: names.value }));
  const groupFrom = h("input", { class: "text-input score-input", inputmode: "numeric", value: String((cur.groupFrom as number | undefined) ?? 5), "aria-label": "Group from" });
  groupFrom.addEventListener("change", () => void ctx.setSettings("initiative", { groupFrom: Math.max(2, Number(groupFrom.value) || 5) }));
  const glanceBoxes = [{ id: "hp", name: "Hit points" }, { id: "ac", name: "Armour" }, ...abilities.map((a) => ({ id: a.id, name: `${a.label ?? a.name} save` }))].map((g) => {
    const b = h("input", { type: "checkbox", checked: glance.has(g.id) });
    b.addEventListener("change", () => {
      b.checked ? glance.add(g.id) : glance.delete(g.id);
      void ctx.setSettings("initiative", { glance: [...glance] });
    });
    return h("label", { class: "check" }, b, g.name);
  });
  const comboName = h("input", { class: "text-input", placeholder: "Gauntlet: Dex saves", "aria-label": "Combination name" });
  d.body.replaceChildren(
    h("h3", null, "Rolling"),
    tick("Re-roll every round (otherwise roll once at the start)", "reroll", false),
    tick("Monsters join hidden until revealed", "joinHidden", true),
    h("div", { class: "inline" }, h("span", null, "Creatures from an encounter join as one group card from"), groupFrom, h("span", null, "of a kind")),
    h("h3", null, "Looks"),
    style,
    names,
    tick("Pop up the sheet of whoever's turn it is", "popSheet", false),
    h("h3", null, "A glance beside each name"),
    h("div", { class: "glance-ticks" }, glanceBoxes),
    h("div", { class: "inline spaced" }, comboName, h("button", { class: "button plain", onClick: () => comboName.value.trim() && void ctx.setMeta({ glances: [...ctx.meta.glances.filter((g) => g.name !== comboName.value.trim()), { name: comboName.value.trim(), fields: [...glance] }] }) }, "Save this combination")),
    ctx.meta.glances.length ? h("div", { class: "pick-chips" }, ctx.meta.glances.map((g) => h("button", { class: "pick-chip", onClick: () => void ctx.setSettings("initiative", { glance: g.fields }).then(() => d.close()) }, g.name))) : h("span"),
  );
  d.footer.replaceChildren(h("button", { class: "button primary", onClick: () => d.close() }, "Done"));
}
