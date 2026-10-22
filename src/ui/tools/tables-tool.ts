// Roll tables at the table (version 2): roll live, with the result in the chat. Results can do
// things: a monster joins initiative (How many?), an item goes to a character, anything can be
// opened. A row can roll on another table. Once-only rows are crossed out until reset.

import { api } from "../api.ts";
import { attempt } from "../common.ts";
import { notice, openDialog } from "../dialogs.ts";
import { h, svg } from "../dom.ts";
import { ICONS } from "../icons.ts";
import { askText } from "../pickers.ts";
import type { DeskCtx } from "./registry.ts";

let find = "";
let last: { table: string; roll: number; text: string; result: { id: string; name: string; kind: string } | null; chain: string } | null = null;

export async function tablesTool(ctx: DeskCtx): Promise<HTMLElement> {
  const tables = ((await attempt(() => api.codex())) ?? []).find((s) => s.key === "tables")?.entries ?? [];
  const box = h("input", { class: "text-input", type: "search", value: find, placeholder: "Find a table…", "aria-label": "Find a table", "data-key": "tables-find" });
  box.addEventListener("input", () => {
    find = box.value;
    void ctx.refresh();
  });
  const shown = tables.filter((t) => t.name.toLowerCase().includes(find.trim().toLowerCase()));
  const roll = async (id: string, name: string) => {
    const r = await attempt(() => api.rollTable(id));
    if (!r) return;
    last = { table: name, roll: r.roll, text: r.text, result: r.result, chain: r.chain };
    const words = [r.text, r.result?.name, r.chain].filter(Boolean).join(" → ");
    await attempt(() => api.postChat({ kind: "roll", who: (ctx.settings("dice").name as string | undefined) ?? "DM", color: (ctx.settings("dice").color as string | undefined) ?? "#b93a2e", see: ((ctx.settings("dice").see as string | undefined) ?? "public") as "public", to: [], text: `${name}: ${words || "nothing"}`, roll: { formula: "table", total: r.roll, breakdown: `rolled ${r.roll}`, natural: null }, ic: false }));
    if (ctx.data.session && !ctx.view.readOnly) await attempt(() => api.addLog("roll", `Rolled on ${name}: ${words}`));
    await ctx.refresh();
  };
  const result = last
    ? h(
        "div",
        { class: "table-result" },
        h("div", { class: "muted small" }, `${last.table}: rolled ${last.roll}`),
        h("div", { class: "table-result-text" }, last.text || "Nothing on that number."),
        last.result ? h("div", { class: "inline" }, h("button", { class: "link", onClick: () => void ctx.peek(last!.result!.id) }, last.result.name), ...actions(last.result, ctx)) : null,
        last.chain ? h("div", { class: "small" }, "→ ", last.chain) : null,
      )
    : null;
  return h(
    "div",
    { class: "tables-tool" },
    box,
    result,
    shown.length
      ? h(
          "ul",
          { class: "table-list" },
          shown.map((t) =>
            h(
              "li",
              null,
              h("button", { class: "button plain small-button", onClick: () => void roll(t.id, t.name) }, svg(ICONS.dice), "Roll"),
              h("button", { class: "link", onClick: () => void ctx.peek(t.id) }, t.name),
              h("span", { class: "muted tiny" }, t.sub),
              ctx.view.readOnly ? null : h("button", { class: "link tiny", title: "Bring back crossed-out once-only rows", onClick: async () => ((await attempt(() => api.resetTable(t.id))) && notice(`${t.name} is reset.`, "green", undefined, 3000)) }, "reset"),
            ),
          ),
        )
      : h("p", { class: "muted small" }, tables.length ? "No table by that name." : "No roll tables yet. Make them in the Lore tab, or from the Codex in one go."),
    ctx.view.readOnly ? null : h("button", { class: "link small", onClick: () => void fromCodex(ctx) }, "+ Make a table from the Codex"),
  );
}

function actions(r: { id: string; name: string; kind: string }, ctx: DeskCtx): HTMLElement[] {
  if (ctx.view.readOnly || !ctx.data.session) return [];
  if (r.kind === "being")
    return [
      h(
        "button",
        {
          class: "button plain small-button",
          onClick: async () => {
            const n = Number((await askText(`How many ${r.name}?`, "1", "How many")) ?? "0");
            if (!n) return;
            await attempt(() => api.addToFight(r.id, { count: n, group: n >= 4, hidden: true }));
            notice(`${r.name} joined the fight, hidden.`, "green", undefined, 3000);
            await ctx.refresh();
          },
        },
        "Add to initiative",
      ),
    ];
  if (r.kind === "item")
    return [
      h(
        "button",
        {
          class: "button plain small-button",
          onClick: () => {
            const d = openDialog(`Give ${r.name} to…`);
            d.body.replaceChildren(h("div", { class: "pick-chips" }, ctx.data.roster.map((c) => h("button", { class: "pick-chip", onClick: async () => ((await attempt(() => api.attach({ targets: [c.id], bricks: [r.id] }))) !== undefined && (d.close(), notice(`${c.name} has ${r.name}.`, "green", undefined, 3000), await ctx.refresh())) }, c.name))));
            d.footer.replaceChildren(h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"));
          },
        },
        "Give to…",
      ),
    ];
  return [];
}

/** Pick a Codex section and a filter; the rows fill themselves, spread evenly over the die. */
async function fromCodex(ctx: DeskCtx) {
  const codex = (await attempt(() => api.codex())) ?? [];
  const d = openDialog("Make a roll table from the Codex", { wide: true });
  const name = h("input", { class: "text-input", placeholder: "Random potion", "aria-label": "Name" });
  const section = h("select", { class: "text-input select", "aria-label": "Section" }, codex.filter((s) => s.entries.length).map((s) => h("option", { value: s.key }, `${s.title} (${s.entries.length})`)));
  const filter = h("input", { class: "text-input", placeholder: "Words to match, such as Potion or CR 1/4", "aria-label": "Filter" });
  const count = h("p", { class: "muted small" }, "");
  const matches = () => {
    const sec = codex.find((s) => s.key === section.value);
    const q = filter.value.trim().toLowerCase();
    return (sec?.entries ?? []).filter((e) => !q || e.name.toLowerCase().includes(q) || e.sub.toLowerCase().includes(q)).slice(0, 100);
  };
  const update = () => (count.textContent = `${matches().length} things match. Each gets a row, spread evenly over the die; adjust after.`);
  section.addEventListener("change", update);
  filter.addEventListener("input", update);
  update();
  d.body.replaceChildren(h("label", { class: "field-label" }, "Name"), name, h("label", { class: "field-label spaced" }, "From"), section, h("label", { class: "field-label spaced" }, "Only those that match"), filter, count);
  const ok = h("button", { class: "button primary" }, "Make the table");
  ok.addEventListener("click", async () => {
    const id = await attempt(() => api.tableFrom(name.value || "New table", matches().map((m) => m.id)));
    if (id) {
      d.close();
      notice("Made. Change its rows in the Lore tab, or roll it right away.", "green", undefined, 5000);
      await ctx.refresh();
    }
  });
  d.footer.replaceChildren(h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"), ok);
}
