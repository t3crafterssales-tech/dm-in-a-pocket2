// The party at the table (version 2): each character at a glance (hit points, armour, conditions,
// trackers like Inspiration with the Award button). Drop loot from the Codex onto a card to give
// it to that character.

import type { CharacterView } from "../../app/backend.ts";
import { api, pictureUrl } from "../api.ts";
import { attempt } from "../common.ts";
import { notice } from "../dialogs.ts";
import { h } from "../dom.ts";
import { DRAG_TYPE } from "../library-panel.ts";
import { NODE_DRAG } from "../codex-panel.ts";
import type { DeskCtx } from "./registry.ts";
import { conditionDialog } from "./initiative.ts";

export async function partyTool(ctx: DeskCtx): Promise<HTMLElement> {
  const ids = ctx.data.session?.present.length ? ctx.data.session.present : ctx.data.roster.map((c) => c.id);
  const views: CharacterView[] = [];
  for (const id of ids) {
    const v = await attempt(() => api.characterView(id));
    if (v) views.push(v);
  }
  if (!views.length) return h("div", { class: "pad" }, h("p", { class: "muted small" }, "No characters yet. Make them in the Party tab."));
  return h("div", { class: "party-tool" }, views.map((v) => card(v, ctx)), h("p", { class: "muted tiny" }, "Drop items from the Codex onto a character to give them loot."));
}

function card(v: CharacterView, ctx: DeskCtx): HTMLElement {
  const ro = ctx.view.readOnly;
  const card_ = ctx.data.order.find((c) => c.ref === v.id);
  const conds = card_?.charConditions ?? [];
  const el = h(
    "div",
    { class: "party-mini" },
    v.picture ? h("img", { class: "roster-pic", src: pictureUrl(v.picture), alt: "" }) : h("span", { class: "roster-pic empty" }, v.name.slice(0, 1)),
    h(
      "div",
      { class: "party-mini-main" },
      h("div", null, h("button", { class: "link", onClick: () => void ctx.peek(v.id) }, h("strong", null, v.name)), v.player ? h("span", { class: "muted tiny" }, ` ${v.player}`) : null),
      h("div", { class: "small" }, `HP ${v.hpNow ?? "?"}/${v.hp ?? "?"}`, v.ac !== null ? ` · AC ${v.ac}` : "", ` · ${v.class?.name ?? "Level"} ${v.level}`),
      conds.length ? h("div", { class: "inline" }, conds.map((x) => {
        const c = ctx.data.conditions.find((y) => y.id === x.condition);
        return h("span", { class: "cond-badge", style: `--c:${c?.color ?? "#8a4b2a"}`, title: c?.name ?? "" }, c?.symbol ?? "●");
      })) : null,
      v.trackers.length
        ? h(
            "div",
            { class: "inline tiny" },
            v.trackers.map((t) => h("span", { class: "tracker-chip" }, `${t.name} ${t.value}/${t.max}`, t.refill === "award" && !ro ? h("button", { class: "link tiny", onClick: async () => ((await attempt(() => api.award(v.id, t.id))) === false ? notice(`${v.name} already has all the ${t.name} they can hold.`, "blue", undefined, 3000) : (await attempt(() => api.postChat({ kind: "note", who: "DM", color: "#b93a2e", see: "public", to: [], text: `awarded ${v.name} ${t.name}`, roll: null, ic: false })), await ctx.refresh())) }, " Award") : null)),
          )
        : null,
    ),
    ro || !card_ ? null : h("button", { class: "icon-button", title: "Give a condition", onClick: () => void conditionDialog(ctx, [{ combatant: card_.id, member: null }]) }, "＋"),
  );
  el.addEventListener("dragover", (e) => {
    const types = e.dataTransfer?.types ?? [];
    if (ro || !(types.includes(NODE_DRAG) || types.includes(DRAG_TYPE))) return;
    e.preventDefault();
    el.classList.add("drop-over");
  });
  el.addEventListener("dragleave", () => el.classList.remove("drop-over"));
  el.addEventListener("drop", (e) => {
    el.classList.remove("drop-over");
    const ids = (JSON.parse(e.dataTransfer?.getData(NODE_DRAG) || "{}") as { ids?: string[] }).ids ?? (JSON.parse(e.dataTransfer?.getData(DRAG_TYPE) || "[]") as string[]);
    if (!ids.length) return;
    e.preventDefault();
    e.stopPropagation();
    void (async () => {
      if ((await attempt(() => api.attach({ targets: [v.id], bricks: ids }))) === undefined) return;
      if (ctx.data.session) await attempt(() => api.addLog("reward", `${v.name} got ${ids.length === 1 ? "an item" : `${ids.length} things`}.`));
      notice(`Given to ${v.name}.`, "green", undefined, 3000);
      await ctx.refresh();
    })();
  });
  return el;
}
