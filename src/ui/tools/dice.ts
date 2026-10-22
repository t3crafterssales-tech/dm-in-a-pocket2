// The dice tray (version 2). Click dice to add them (d4 four times is 4d4), add a bonus, roll.
// Typing a formula works too. Advantage and disadvantage, six colours, who sees it (public,
// private, DM only, blind), saved rolls (macros) that follow whoever they're for, the characters'
// own attacks, and a deck of cards. Every roll goes to the chat with its breakdown.

import type { ChatLine, Macro, MacroBlock } from "../../app/backend.ts";
import { api } from "../api.ts";
import { attempt } from "../common.ts";
import { notice, openDialog } from "../dialogs.ts";
import { h, svg } from "../dom.ts";
import { ICONS } from "../icons.ts";
import type { DeskCtx } from "./registry.ts";

const DICE = [4, 6, 8, 10, 12, 20, 100];
export const DICE_COLOURS = ["#b93a2e", "#2f6fb0", "#3c8a4a", "#b8860b", "#7b3fa0", "#1f1b16"];
const pool = new Map<number, number>();
let bonus = 0;
let mode: "normal" | "advantage" | "disadvantage" = "normal";
let typed = "";
let lastLine: ChatLine | null = null;

function formulaFromPool(): string {
  const parts = DICE.filter((d) => pool.get(d)).map((d) => `${pool.get(d)}d${d}`);
  if (bonus) parts.push(`${bonus < 0 ? "- " : "+ "}${Math.abs(bonus)}`);
  return parts.join(" + ").replace(/\+ -/g, "-").replace(/\+ \+/g, "+");
}

function opt<T>(ctx: DeskCtx, key: string, d: T): T {
  const v = ctx.settings("dice")[key];
  return (v === undefined ? d : v) as T;
}

/** Rolls and posts to the chat, with the tray's colour and who-sees-it. Used by other tools too. */
export async function rollAndPost(ctx: DeskCtx, formula: string, label: string, m: "normal" | "advantage" | "disadvantage" = "normal"): Promise<ChatLine | null> {
  const line = await attempt(() => api.rollDice({ formula, mode: m, who: opt(ctx, "name", "DM"), color: opt(ctx, "color", DICE_COLOURS[0]!), see: opt(ctx, "see", "public") as ChatLine["see"], label }));
  if (line) {
    lastLine = line;
    notice(`${label ? `${label}: ` : ""}${line.roll?.total} (${line.roll?.breakdown})`, "blue", undefined, 5000);
  }
  return line ?? null;
}

export async function diceTool(ctx: DeskCtx): Promise<HTMLElement> {
  const color = opt(ctx, "color", DICE_COLOURS[0]!);
  const animate = opt(ctx, "animate", true);
  const speed = opt(ctx, "speed", 2);
  const formula = typed || formulaFromPool();
  const box = h("input", { class: "text-input dice-formula", value: formula, placeholder: "Click dice, or type 2d6 + 3", "aria-label": "Roll", "data-key": "dice-formula" });
  box.addEventListener("input", () => (typed = box.value));
  const result = h("div", { class: "dice-result", style: `--die:${color}` }, lastLine?.roll ? [h("div", { class: "dice-total" }, String(lastLine.roll.total)), h("div", { class: "muted small" }, lastLine.roll.breakdown)] : h("span", { class: "muted small" }, "Roll something."));
  const doRoll = async () => {
    const f = box.value.trim();
    if (!f) return notice("Click some dice first, or type a roll such as 2d6 + 3.", "blue", undefined, 4000);
    if (animate) {
      const total = result.querySelector(".dice-total") ?? result.appendChild(h("div", { class: "dice-total" }, ""));
      const until = Date.now() + 250 * speed;
      while (Date.now() < until) {
        total.textContent = String(1 + Math.floor(Math.random() * 20));
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    const line = await rollAndPost(ctx, f, "", mode);
    if (line) {
      pool.clear();
      bonus = 0;
      typed = "";
      mode = "normal";
      await ctx.refresh();
    }
  };
  box.addEventListener("keydown", (e) => e.key === "Enter" && void doRoll());

  const diceRow = h(
    "div",
    { class: "dice-row" },
    DICE.map((d) =>
      h(
        "button",
        {
          class: "die",
          style: `--die:${color}`,
          title: `Add a d${d} (right-click to take one away)`,
          onClick: () => (pool.set(d, (pool.get(d) ?? 0) + 1), (typed = ""), void ctx.refresh()),
          onContextmenu: (e: MouseEvent) => (e.preventDefault(), pool.set(d, Math.max(0, (pool.get(d) ?? 0) - 1)), (typed = ""), void ctx.refresh()),
        },
        `d${d}`,
        pool.get(d) ? h("span", { class: "die-count" }, String(pool.get(d))) : null,
      ),
    ),
    h("button", { class: "die coin", title: "Flip a coin", onClick: () => void rollAndPost(ctx, "coin", "Coin").then(() => ctx.refresh()) }, "🪙"),
  );
  const bonusRow = h(
    "div",
    { class: "inline" },
    h("button", { class: "stepper-button", onClick: () => ((bonus -= 1), (typed = ""), void ctx.refresh()) }, "−"),
    h("span", { class: "dice-bonus" }, `${bonus >= 0 ? "+" : ""}${bonus}`),
    h("button", { class: "stepper-button", onClick: () => ((bonus += 1), (typed = ""), void ctx.refresh()) }, "+"),
    h("button", { class: `pick-chip${mode === "advantage" ? " on" : ""}`, title: "Roll twice, keep the higher", onClick: () => ((mode = mode === "advantage" ? "normal" : "advantage"), void ctx.refresh()) }, "Advantage"),
    h("button", { class: `pick-chip${mode === "disadvantage" ? " on" : ""}`, title: "Roll twice, keep the lower", onClick: () => ((mode = mode === "disadvantage" ? "normal" : "disadvantage"), void ctx.refresh()) }, "Disadvantage"),
    h("button", { class: "link small", onClick: () => (pool.clear(), (bonus = 0), (typed = ""), (mode = "normal"), void ctx.refresh()) }, "Clear"),
  );
  const see = h(
    "select",
    { class: "text-input select small-select", "aria-label": "Who sees it", title: "Who sees the roll" },
    [
      ["public", "Everyone sees it"],
      ["private", "Just me"],
      ["dm", "DM only"],
      ["blind", "Blind (only the DM sees the result)"],
    ].map(([v, l]) => h("option", { value: v, selected: opt(ctx, "see", "public") === v }, l)),
  );
  see.addEventListener("change", () => void ctx.setSettings("dice", { see: see.value }));

  // Saved rolls: macros, and each character's own attacks.
  const macros = (await attempt(() => api.macros())) ?? [];
  const s = ctx.data.session;
  const live = ctx.data.order.filter((c) => !c.delayed);
  const turnChar = s?.combat.active ? live[s.combat.turn] : null;
  const whoFor = async (m: Macro): Promise<string[]> => {
    if (m.who === "everyone") return s?.present ?? ctx.data.roster.map((c) => c.id);
    if (m.who === "turn") return turnChar?.kind === "character" && turnChar.ref ? [turnChar.ref] : [];
    if (m.who === "pick") return pickCharacters(ctx, m.name);
    return [];
  };
  const runSaved = async (m: Macro & { words: string }) => {
    const who = await whoFor(m);
    if (m.who === "pick" && !who.length) return;
    const results = await attempt(() => api.runMacro(m.id, {}, who));
    if (!results) return;
    for (const r of results) {
      const verdict = r.pass === null ? "" : r.pass ? " · Pass" : " · Fail";
      await attempt(() => api.postChat({ kind: "roll", who: r.who || opt(ctx, "name", "DM"), color: opt(ctx, "color", DICE_COLOURS[0]!), see: m.see, to: [], text: `${m.name}: ${r.result.total}${verdict}`, roll: { formula: r.formula, total: r.result.total, breakdown: r.result.breakdown, natural: r.result.natural }, ic: false }));
    }
    notice(results.map((r) => `${r.who || m.name}: ${r.result.total}${r.pass === null ? "" : r.pass ? " pass" : " fail"}`).join(", "), "blue", undefined, 7000);
    await ctx.refresh();
  };
  const savedList = h(
    "div",
    { class: "saved-rolls" },
    macros.map((m) =>
      h(
        "div",
        { class: "saved-roll" },
        h("button", { class: "pick-chip", title: `${m.words}${m.who === "turn" ? ", for whoever's turn it is" : m.who === "everyone" ? ", for everyone at the table" : m.who === "pick" ? ", for who you pick" : ""}`, onClick: () => void runSaved(m) }, m.name),
        h("button", { class: "link tiny", title: "Change", onClick: () => void macroBuilder(ctx, m) }, "✎"),
      ),
    ),
    h("button", { class: "link small", onClick: () => void macroBuilder(ctx, null) }, "+ Saved roll"),
  );
  const attacks = ctx.data.order.filter((c) => c.kind === "character" && c.attacks.length);
  const attackList = attacks.length
    ? h(
        "div",
        { class: "saved-rolls" },
        attacks.flatMap((c) => c.attacks.map((a) => h("button", { class: "pick-chip", title: `${a.toHit} to hit, ${a.damage}`, onClick: () => void rollAndPost(ctx, a.toHit, `${c.name}: ${a.name} to hit`).then(() => (a.damage ? rollAndPost(ctx, a.damage, `${c.name}: ${a.name} damage`) : null)).then(() => ctx.refresh()) }, `${c.name}: ${a.name}`))),
      )
    : null;

  // A standard deck of cards: draw and shuffle.
  const deck = (opt<number[] | null>(ctx, "deck", null) ?? Array.from({ length: 52 }, (_, i) => i)).slice();
  const draw = async () => {
    if (!deck.length) return notice("The deck is empty. Shuffle it.", "blue", undefined, 3000);
    const i = Math.floor(Math.random() * deck.length);
    const card = deck.splice(i, 1)[0]!;
    const name = `${["Ace", "2", "3", "4", "5", "6", "7", "8", "9", "10", "Jack", "Queen", "King"][card % 13]} of ${["Spades", "Hearts", "Diamonds", "Clubs"][Math.floor(card / 13)]}`;
    await attempt(() => api.postChat({ kind: "note", who: opt(ctx, "name", "DM"), color: opt(ctx, "color", DICE_COLOURS[0]!), see: opt(ctx, "see", "public") as ChatLine["see"], to: [], text: `drew the ${name}`, roll: null, ic: false }));
    notice(`Drew the ${name}.`, "blue", undefined, 4000);
    await ctx.setSettings("dice", { deck });
  };

  return h(
    "div",
    { class: "dice-tool" },
    diceRow,
    bonusRow,
    h("div", { class: "inline" }, box, h("button", { class: "button primary", style: `background:${color};border-color:${color}`, onClick: () => void doRoll() }, svg(ICONS.dice), "Roll")),
    result,
    h("div", { class: "inline small" }, see),
    h("div", { class: "field-label spaced" }, "Saved rolls"),
    savedList,
    attackList ? h("div", null, h("div", { class: "field-label spaced" }, "Attacks"), attackList) : null,
    h("div", { class: "field-label spaced" }, `Cards (${deck.length} left)`),
    h("div", { class: "inline" }, h("button", { class: "button plain small-button", onClick: () => void draw() }, "Draw a card"), h("button", { class: "button plain small-button", onClick: () => void ctx.setSettings("dice", { deck: null }) }, "Shuffle")),
  );
}

async function pickCharacters(ctx: DeskCtx, title: string): Promise<string[]> {
  return new Promise((resolve) => {
    const picked = new Set<string>();
    let done = false;
    const d = openDialog(`${title}: for whom?`, { onClose: () => !done && resolve([]) });
    const people = ctx.data.session?.present.length ? ctx.data.roster.filter((c) => ctx.data.session!.present.includes(c.id)) : ctx.data.roster;
    const draw = () => d.body.replaceChildren(h("div", { class: "pick-chips" }, people.map((c) => h("button", { class: `pick-chip${picked.has(c.id) ? " on" : ""}`, onClick: () => (picked.has(c.id) ? picked.delete(c.id) : picked.add(c.id), draw()) }, c.name))));
    draw();
    d.footer.replaceChildren(h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"), h("button", { class: "button primary", onClick: () => ((done = true), d.close(), resolve([...picked])) }, "Roll"));
  });
}

/** The macro builder: blocks, never code. Dice, a stat from the sheet, a number, and a number to beat. */
export async function macroBuilder(ctx: DeskCtx | null, m: Macro | null) {
  const abilities = (await attempt(() => api.choices()))?.abilities ?? [];
  const blocks: MacroBlock[] = m ? m.blocks.map((b) => ({ ...b })) : [{ type: "dice", op: "+", dice: "1d20" }];
  const d = openDialog(m ? `Saved roll: ${m.name}` : "New saved roll", { wide: true });
  const name = h("input", { class: "text-input", value: m?.name ?? "", placeholder: "Constitution save (DC 13)", "aria-label": "Name" });
  const against = h("input", { class: "text-input score-input", inputmode: "numeric", value: m?.against === null || m?.against === undefined ? "" : String(m.against), placeholder: "—", "aria-label": "Against" });
  const who = h("select", { class: "text-input select", "aria-label": "Who it rolls for" }, [
    ["me", "Just a roll (nobody in particular)"],
    ["turn", "Whoever's turn it is"],
    ["everyone", "Everyone at the table at once"],
    ["pick", "Who I pick"],
  ].map(([v, l]) => h("option", { value: v, selected: (m?.who ?? "me") === v }, l)));
  const see = h("select", { class: "text-input select", "aria-label": "Who sees it" }, [
    ["public", "Everyone sees it"],
    ["private", "Just me"],
    ["dm", "DM only"],
    ["blind", "Blind"],
  ].map(([v, l]) => h("option", { value: v, selected: (m?.see ?? "public") === v }, l)));
  const draw = () => {
    const rows = blocks.map((b, i) => {
      const op = h("select", { class: "text-input select small-select", "aria-label": "Plus or minus" }, h("option", { value: "+", selected: b.op === "+" }, "+"), h("option", { value: "-", selected: b.op === "-" }, "−"));
      op.addEventListener("change", () => (b.op = op.value as "+" | "-"));
      let body: HTMLElement;
      if (b.type === "dice") {
        const dice = h("select", { class: "text-input select small-select", "aria-label": "Dice" }, ["1d4", "1d6", "1d8", "1d10", "1d12", "1d20", "2d6", "2d20 keep 1", "1d100"].map((x) => h("option", { value: x, selected: b.dice === x }, x)));
        dice.addEventListener("change", () => (b.dice = dice.value));
        body = dice;
      } else if (b.type === "stat") {
        const ab = h("select", { class: "text-input select small-select", "aria-label": "Ability" }, abilities.map((a) => h("option", { value: a.id, selected: b.ability === a.id }, a.name)));
        if (!b.ability && abilities[0]) b.ability = abilities[0].id;
        ab.addEventListener("change", () => (b.ability = ab.value));
        const use = h("select", { class: "text-input select small-select", "aria-label": "Bonus or score" }, h("option", { value: "bonus", selected: b.use !== "score" }, "bonus"), h("option", { value: "score", selected: b.use === "score" }, "score"));
        use.addEventListener("change", () => (b.use = use.value as "bonus" | "score"));
        body = h("span", { class: "inline" }, ab, use, h("span", { class: "muted tiny" }, "from the sheet of whoever it's for"));
      } else {
        const n = h("input", { class: "text-input score-input", inputmode: "numeric", value: String(b.value ?? 0), "aria-label": "Number" });
        n.addEventListener("change", () => (b.value = Number(n.value) || 0));
        body = n;
      }
      return h("div", { class: "macro-block" }, i ? op : h("span", { class: "macro-first" }), body, h("button", { class: "icon-button", title: "Remove", onClick: () => (blocks.splice(i, 1), draw()) }, svg(ICONS.close)));
    });
    d.body.replaceChildren(
      h("label", { class: "field-label" }, "Name"),
      name,
      h("label", { class: "field-label spaced" }, "The roll, in blocks"),
      ...rows,
      h(
        "div",
        { class: "inline" },
        h("button", { class: "link small", onClick: () => (blocks.push({ type: "dice", op: "+", dice: "1d6" }), draw()) }, "+ Dice"),
        h("button", { class: "link small", onClick: () => (blocks.push({ type: "stat", op: "+", ability: abilities[0]?.id ?? null, use: "bonus" }), draw()) }, "+ A stat"),
        h("button", { class: "link small", onClick: () => (blocks.push({ type: "number", op: "+", value: 2 }), draw()) }, "+ A number"),
      ),
      h("div", { class: "inline spaced" }, h("span", { class: "field-label" }, "Meet or beat (for Pass or Fail)"), against),
      h("div", { class: "inline spaced" }, h("span", { class: "field-label" }, "Rolls for"), who),
      h("div", { class: "inline spaced" }, h("span", { class: "field-label" }, "Who sees it"), see),
    );
  };
  draw();
  const save = h("button", { class: "button primary" }, "Save");
  save.addEventListener("click", async () => {
    const input = { name: name.value || "Saved roll", blocks, against: against.value.trim() ? Number(against.value) : null, who: who.value as Macro["who"], see: see.value as Macro["see"] };
    if ((await attempt(() => api.saveMacro(m?.id ?? null, input))) === undefined) return;
    d.close();
    if (ctx) await ctx.refresh();
  });
  d.footer.replaceChildren(h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"), save);
  name.focus();
}

export async function diceGear(ctx: DeskCtx) {
  const d = openDialog("Dice tray settings");
  const cur = ctx.settings("dice");
  const name = h("input", { class: "text-input", value: String(cur.name ?? "DM"), "aria-label": "Your name in the chat" });
  name.addEventListener("change", () => void ctx.setSettings("dice", { name: name.value.trim() || "DM" }));
  const anim = h("input", { type: "checkbox", checked: cur.animate !== false });
  anim.addEventListener("change", () => void ctx.setSettings("dice", { animate: anim.checked }));
  const speed = h("input", { type: "range", min: "1", max: "4", value: String(cur.speed ?? 2), "aria-label": "Roll speed" });
  speed.addEventListener("change", () => void ctx.setSettings("dice", { speed: Number(speed.value) }));
  d.body.replaceChildren(
    h("label", { class: "field-label" }, "Your name in the chat"),
    name,
    h("label", { class: "field-label spaced" }, "Your dice colour"),
    h("div", { class: "swatches" }, DICE_COLOURS.map((c) => h("button", { class: `swatch${(cur.color ?? DICE_COLOURS[0]) === c ? " on" : ""}`, style: `background:${c}`, "aria-label": `Colour ${c}`, onClick: () => void ctx.setSettings("dice", { color: c }).then(() => d.close()) }))),
    h("label", { class: "check spaced" }, anim, "Roll animation"),
    h("label", { class: "inline small" }, "Fast", speed, "Slow"),
    h("p", { class: "muted small" }, "Turning the animation off shows results at once, for groups that like speed. 3D dice come later."),
  );
  d.footer.replaceChildren(h("button", { class: "button primary", onClick: () => d.close() }, "Done"));
}
