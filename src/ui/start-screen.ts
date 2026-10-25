// "What do you want to make?": the first step for anything new. Big tiles, then ready-made starting
// points from the Codex ("Start from Battleaxe") or Start blank. Copying from the Codex reaches the
// same sheet.

import type { CodexEntry, CodexKey, CodexSection } from "../app/backend.ts";
import { api } from "./api.ts";
import { attempt } from "./common.ts";
import { notice } from "./dialogs.ts";
import { h, svg } from "./dom.ts";
import { ICONS } from "./icons.ts";
import { aiOn, draftWithAi } from "./ai-panel.ts";
import type { PlaceCtx } from "./place.ts";
import { askText } from "./pickers.ts";

const TILES: { key: CodexKey; title: string; hint: string }[] = [
  { key: "weapons", title: "Weapon", hint: "Swords, axes, bows" },
  { key: "armour", title: "Armour", hint: "Armour and shields" },
  { key: "gear", title: "Gear", hint: "Lanterns, rope, tools" },
  { key: "magic", title: "Magic item", hint: "Potions, rings, wands" },
  { key: "monsters", title: "Monster", hint: "Goblins to dragons" },
  { key: "npcs", title: "NPC", hint: "Innkeepers and villains" },
  { key: "races", title: "Race", hint: "Elves, dwarves, your own" },
  { key: "classes", title: "Class", hint: "Fighter, wizard, your own" },
  { key: "spells", title: "Spell", hint: "Cantrips to wish" },
  { key: "enchantments", title: "Enchantment", hint: "Flaming, frost, glowing" },
  { key: "attacks", title: "Attack", hint: "Bites, claws, weapon swings" },
  { key: "traits", title: "Trait", hint: "Darkvision, pack tactics…" },
];

/** null shows the tiles; a section shows its starting points. */
let picking: CodexKey | null = null;
let find = "";

export function startOver() {
  picking = null;
  find = "";
}

export async function startScreen(ctx: PlaceCtx, extra: HTMLElement | null = null): Promise<HTMLElement> {
  const sections = (await attempt(() => api.codex())) ?? [];
  const body = picking ? pickScreen(sections.find((s) => s.key === picking)!, ctx) : tiles(sections, ctx);
  return h("section", { class: "panel editor", "data-scroll": "start" }, h("div", { class: "start" }, body, extra));
}

function tiles(sections: CodexSection[], ctx: PlaceCtx): HTMLElement {
  const ro = ctx.view.readOnly;
  const recent = sections
    .flatMap((s) => s.entries.filter((e) => e.source === "mine").map((e) => ({ e, s })))
    .slice(-8)
    .reverse();
  return h(
    "div",
    null,
    h("h1", null, "What do you want to make?"),
    h("p", { class: "muted" }, ro ? "This is read-only, so nothing can be made here. Browse the Codex on the right." : "Pick one and start from something ready-made, or start blank. Or browse the Codex on the right and copy anything you like."),
    h(
      "div",
      { class: "tiles" },
      TILES.map((t) => {
        const s = sections.find((x) => x.key === t.key);
        return h("button", { class: "tile", disabled: ro, onClick: () => ((picking = t.key), (find = ""), void ctx.refresh()) }, h("span", { class: "tile-icon", "aria-hidden": "true" }, s?.icon ?? "📦"), h("b", null, t.title), h("span", null, t.hint));
      }),
    ),
    aiOn() && !ro ? h("p", null, h("button", { class: "button plain", title: "Describe it and let the AI draft a few versions to pick from", onClick: () => draftWithAi(ctx, "Create a monster that fits this world: ") }, svg(ICONS.spark), "Or describe it and let the AI draft it…")) : null,
    recent.length
      ? h(
          "div",
          { class: "recent" },
          h("h2", null, "Made by you"),
          h(
            "div",
            { class: "recent-list" },
            recent.map(({ e, s }) => h("button", { class: "pill", onClick: () => void ctx.open(e.id) }, `${s.icon} ${e.name}`)),
          ),
        )
      : null,
  );
}

function pickScreen(s: CodexSection, ctx: PlaceCtx): HTMLElement {
  const tile = TILES.find((t) => t.key === s.key)!;
  const q = find.trim().toLowerCase();
  // Starting points: the starter's own, then yours, so "Start from Battleaxe" is at the top.
  const all = s.entries.filter((e) => !q || e.name.toLowerCase().includes(q));
  const starters = all.filter((e) => e.source !== "mine");
  const mine = all.filter((e) => e.source === "mine");
  const shown = [...starters, ...mine].slice(0, 400);
  const box = h("input", { class: "text-input start-find", type: "search", placeholder: `Find a ${tile.title.toLowerCase()} to start from…`, value: find, "data-key": "start-find", "aria-label": "Find" });
  box.addEventListener("input", () => ((find = box.value), void ctx.refresh()));
  return h(
    "div",
    { class: "pick" },
    h("button", { class: "link", onClick: () => ((picking = null), void ctx.refresh()) }, "← Back"),
    h("h1", null, `New ${tile.title.toLowerCase()}`),
    h("p", { class: "muted" }, "Start from one of these and change what you like. Nothing you change touches the original."),
    s.entries.length > 12 ? box : null,
    h(
      "div",
      { class: "start-cards" },
      h("button", { class: "start-card blank", onClick: () => void blank(s, tile.title, ctx) }, h("span", { class: "tile-icon", "aria-hidden": "true" }, "➕"), h("span", null, h("b", null, "Start blank"), h("small", null, "Sensible defaults, change everything"))),
      shown.map((e) => card(e, s, ctx)),
    ),
    all.length > shown.length ? h("p", { class: "muted small" }, `${all.length - shown.length} more. Type in Find to narrow it down.`) : null,
  );
}

function card(e: CodexEntry, s: CodexSection, ctx: PlaceCtx) {
  return h(
    "button",
    {
      class: "start-card",
      title: `Start from ${e.name}`,
      onClick: async () => {
        const id = await attempt(() => api.makeOwnCopy(e.id));
        if (!id) return;
        startOver();
        notice(`Made your own ${e.name}. Change anything you like.`, "green", { label: "Undo", run: async () => (await attempt(() => api.undo()), await ctx.refresh()) }, 6000);
        await ctx.open(id, { focusName: true });
      },
    },
    h("span", { class: "tile-icon", "aria-hidden": "true" }, s.icon),
    h("span", null, h("b", null, e.name), e.sub ? h("small", null, e.sub) : null),
  );
}

async function blank(s: CodexSection, title: string, ctx: PlaceCtx) {
  const name = await askText(`New ${title.toLowerCase()}`, "", "Name");
  if (!name) return;
  const id = await attempt(() => api.newInSection(s.key, name));
  if (!id) return;
  startOver();
  await ctx.open(id);
}
