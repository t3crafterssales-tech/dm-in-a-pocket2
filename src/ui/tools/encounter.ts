// The encounter tool (version 2): the encounter the group is at. Its read-aloud text big enough
// to read out, what's really going on, its creatures (Start fight drops them into initiative),
// treasure, handouts and where it leads. Starred encounters for tonight sit at the top.

import { api } from "../api.ts";
import { attempt } from "../common.ts";
import { h, svg } from "../dom.ts";
import { ICONS } from "../icons.ts";
import type { DeskCtx } from "./registry.ts";

const linkId = (v: unknown) => (v && typeof v === "object" && typeof (v as { link?: unknown }).link === "string" ? (v as { link: string }).link : null);

export async function encounterTool(ctx: DeskCtx): Promise<HTMLElement> {
  const s = ctx.data.session;
  const list = ctx.data.encounters;
  if (!list.length) return h("div", { class: "pad" }, h("p", { class: "muted small" }, ctx.view.type === "module" ? "This module has no encounters yet. Add them in the Adventure tab." : "Encounters belong to modules. Open a module to run an adventure; here, use the other tools freely."));
  const current = s?.encounter ?? list[0]!.id;
  const starred = new Set(s?.starred ?? []);
  const pick = h(
    "select",
    { class: "text-input select", "aria-label": "Encounter", disabled: !s || ctx.view.readOnly },
    [...list.filter((e) => starred.has(e.id)), ...list.filter((e) => !starred.has(e.id))].map((e) => h("option", { value: e.id, selected: e.id === current }, `${starred.has(e.id) ? "★ " : ""}${e.number} ${e.name}`)),
  );
  pick.addEventListener("change", async () => ((await attempt(() => api.setSession({ encounter: pick.value }))) && (await ctx.refresh())));
  const v = await attempt(() => api.node(current));
  if (!v) return h("div", { class: "pad" }, pick);
  const f = v.fields as Record<string, unknown>;
  const names = async (key: string) => {
    const ids = (Array.isArray(f[key]) ? (f[key] as unknown[]) : []).map(linkId).filter((x): x is string => !!x);
    const out: { id: string; name: string }[] = [];
    for (const id of ids) {
      const n = await attempt(() => api.node(id));
      if (n) out.push({ id, name: n.name });
    }
    return out;
  };
  const creatures: { id: string; name: string; count: number }[] = [];
  for (const c of Array.isArray(f.creatures) ? (f.creatures as { being?: unknown; count?: number }[]) : []) {
    const id = linkId(c.being);
    const n = id ? await attempt(() => api.node(id)) : null;
    if (id && n) creatures.push({ id, name: n.name, count: c.count ?? 1 });
  }
  const [treasure, handouts, leads] = await Promise.all([names("treasure"), names("handouts"), names("leadsTo")]);
  const chip = (x: { id: string; name: string }, extra = "") => h("button", { class: "pick-chip", onClick: () => void ctx.peek(x.id) }, `${x.name}${extra}`);
  const read = typeof f.readAloud === "string" ? f.readAloud : "";
  const number = list.find((e) => e.id === current)?.number ?? "";
  return h(
    "div",
    { class: "encounter-tool" },
    h("div", { class: "inline" }, pick),
    h("h3", { class: "enc-title" }, `${number} ${v.name}`),
    read ? h("div", { class: "read-aloud-box" }, read.split(/\n+/).map((p) => h("p", null, p))) : h("p", { class: "muted small" }, "No read-aloud text."),
    v.text ? h("details", { class: "fold-out", open: true }, h("summary", null, "What's really going on"), v.text.split(/\n+/).map((p) => h("p", { class: "small" }, p))) : null,
    creatures.length
      ? h(
          "div",
          null,
          h("div", { class: "field-label" }, "Creatures"),
          h("div", { class: "pick-chips" }, creatures.map((c) => chip(c, c.count > 1 ? ` ×${c.count}` : ""))),
          s && !ctx.view.readOnly && !s.combat.active ? h("button", { class: "button primary small-button spaced", onClick: async () => ((await attempt(() => api.startFight({ encounter: current, hidden: (ctx.settings("initiative").joinHidden as boolean | undefined) ?? true, groupFrom: (ctx.settings("initiative").groupFrom as number | undefined) ?? 5 }))) !== undefined && (await ctx.refresh())) }, svg(ICONS.sword), "Start fight") : null,
        )
      : null,
    treasure.length ? h("div", null, h("div", { class: "field-label" }, "Treasure"), h("div", { class: "pick-chips" }, treasure.map((x) => chip(x)))) : null,
    handouts.length ? h("div", null, h("div", { class: "field-label" }, "Handouts"), h("div", { class: "pick-chips" }, handouts.map((x) => chip(x)))) : null,
    leads.length
      ? h(
          "div",
          null,
          h("div", { class: "field-label" }, "Leads to"),
          h("div", { class: "pick-chips" }, leads.map((x) => h("button", { class: "pick-chip", disabled: !s || ctx.view.readOnly, title: "Go there", onClick: async () => ((await attempt(() => api.setSession({ encounter: x.id }))) && (await ctx.refresh())) }, `→ ${list.find((e) => e.id === x.id)?.number ?? ""} ${x.name}`))),
        )
      : null,
    s && !ctx.view.readOnly
      ? h("button", { class: "link small spaced", onClick: async () => ((await attempt(() => api.setSession({ starred: starred.has(current) ? [...starred].filter((x) => x !== current) : [...starred, current] }))) && (await ctx.refresh())) }, starred.has(current) ? "☆ Unstar" : "★ Star for tonight")
      : null,
  );
}
