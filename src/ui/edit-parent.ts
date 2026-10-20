// Edit parent (or Alt-click): opens the parent's version of this sheet in a pop-up, with this
// sheet's values beside it and "Use my version" to copy one across. Saving shows a checklist of
// the parent's whole family; ticked ones get the change, unticked ones keep their old value as
// their own (a pencil mark). Changes still only flow down: they are made at the parent.

import type { Choices, FamilyRow, NodeView } from "../app/backend.ts";
import { api } from "./api.ts";
import { attempt } from "./common.ts";
import { notice, openDialog } from "./dialogs.ts";
import { h } from "./dom.ts";
import type { PlaceCtx } from "./place.ts";

type Value = NodeView["fields"][string];

interface Row {
  key: string;
  label: string;
  type: "number" | "text";
  /** Ability scores are stored as { ability, score }. */
  ability?: string;
}

export async function openEditParent(child: NodeView, ctx: PlaceCtx) {
  if (!child.parent) return;
  const choices = (await attempt(() => api.choices())) ?? ({ abilities: [], conditions: [], resources: [] } as Choices);
  let parent = await attempt(() => api.node(child.parent!.id));
  if (!parent) return;
  const d = openDialog(`Edit parent: ${parent.name}`, { wide: true, onClose: () => void ctx.refresh() });
  let staged: Record<string, Value | null> = {};

  const rows = (p: NodeView): Row[] => [
    ...(p.sheet?.header ?? []).map((f) => ({ key: f.key, label: f.label, type: f.type })),
    ...(p.sheet?.scores ? choices.abilities.map((a) => ({ key: `score_${a.id}`, label: a.name, type: "number" as const, ability: a.id })) : []),
  ];
  const valueOf = (v: NodeView, r: Row): string => {
    if (r.ability) {
      const s = v.scores.find((x) => x.ability === r.ability);
      return s ? String(s.score) : "";
    }
    const x = v.fields[r.key];
    return x === undefined || x === null ? "" : String(x);
  };
  const toValue = (r: Row, raw: string): Value | null => {
    if (raw.trim() === "") return null;
    if (r.ability) return Number.isFinite(Number(raw)) ? { ability: { link: r.ability }, score: Number(raw) } : null;
    return r.type === "number" ? (Number.isFinite(Number(raw)) ? Number(raw) : null) : raw;
  };

  const drawEdit = () => {
    const p = parent!;
    const list = rows(p);
    const table = h(
      "table",
      { class: "compare" },
      h("thead", null, h("tr", null, h("th", null, ""), h("th", null, p.name), h("th", null, child.name), h("th", null, ""))),
      h(
        "tbody",
        null,
        list.map((r) => {
          const mine = valueOf(child, r);
          const theirs = r.key in staged ? stagedText(staged[r.key]!, r) : valueOf(p, r);
          const input = h("input", { class: `text-input${r.type === "number" ? " number-input" : ""}`, value: theirs, "data-key": `ep-${r.key}`, "aria-label": `${p.name}'s ${r.label}` });
          input.addEventListener("change", () => {
            if (input.value === valueOf(p, r)) delete staged[r.key];
            else staged[r.key] = toValue(r, input.value);
            drawEdit();
          });
          const differs = mine !== theirs;
          return h(
            "tr",
            { class: r.key in staged ? "staged" : "" },
            h("th", { scope: "row" }, r.label),
            h("td", null, input),
            h("td", { class: differs ? "differs" : "muted" }, mine || "—"),
            h(
              "td",
              null,
              differs && mine
                ? h(
                    "button",
                    {
                      class: "link small",
                      title: `Copy ${child.name}'s ${r.label} to ${p.name}`,
                      onClick: () => {
                        staged[r.key] = toValue(r, mine);
                        drawEdit();
                      },
                    },
                    "Use my version",
                  )
                : null,
            ),
          );
        }),
      ),
    );
    d.body.replaceChildren(
      h("p", { class: "muted" }, `You're changing ${p.name} itself. Next you choose which of its variants get the change; ${child.name} is ticked already.`),
      table,
      h("p", { class: "small" }, Object.keys(staged).length ? `${Object.keys(staged).length} change${Object.keys(staged).length === 1 ? "" : "s"} waiting to be saved.` : ""),
    );
    d.footer.replaceChildren(
      p.parent
        ? h(
            "button",
            {
              class: "button plain",
              title: `Edit ${p.parent.name} instead`,
              onClick: async () => {
                const up = await attempt(() => api.node(p.parent!.id));
                if (!up) return;
                parent = up;
                staged = {};
                d.el.querySelector("h2")!.textContent = `Edit parent: ${up.name}`;
                drawEdit();
              },
            },
            `Up one level (${p.parent.name})`,
          )
        : h("span"),
      h("span", { class: "spacer" }),
      h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"),
      h("button", { class: "button primary", disabled: !Object.keys(staged).length, onClick: () => void drawChecklist() }, "Save…"),
    );
  };

  const drawChecklist = async () => {
    const p = parent!;
    const labels = Object.fromEntries(rows(p).map((r) => [r.key, r.label]));
    const family = (await attempt(() => api.familyChecklist(p.id, Object.keys(staged), labels))) ?? [];
    if (!family.length) return apply(null);
    const ticked = new Set(family.filter((f) => f.canGet).map((f) => f.id));
    const draw = () => {
      d.body.replaceChildren(
        h("p", null, `Which of ${p.name}'s variants get the change? Unticked ones keep their old value as their own, marked with a pencil.`),
        h(
          "div",
          { class: "inline" },
          h("button", { class: "link small", onClick: () => (family.forEach((f) => f.canGet && ticked.add(f.id)), draw()) }, "Select all"),
          h("button", { class: "link small", onClick: () => (ticked.clear(), draw()) }, "Unselect all"),
        ),
        h(
          "ul",
          { class: "checklist" },
          family.map((f) => {
            const box = h("input", { type: "checkbox", checked: ticked.has(f.id), disabled: !f.canGet });
            box.addEventListener("change", () => {
              // Unticking protects the whole branch below; a node below can then be ticked on its own.
              if (box.checked) ticked.add(f.id);
              else for (const id of [f.id, ...below(family, f)]) ticked.delete(id);
              draw();
            });
            return h("li", { class: `depth-${Math.min(f.depth, 6)}${f.id === child.id ? " current" : ""}` }, h("label", { class: "check" }, box, h("span", null, f.name), f.id === child.id ? h("span", { class: "chip small-chip" }, "this one") : null, f.note ? h("span", { class: "muted small" }, f.note) : null));
          }),
        ),
      );
      d.footer.replaceChildren(
        h("button", { class: "button plain", onClick: () => drawEdit() }, "Back"),
        h("span", { class: "spacer" }),
        h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"),
        h("button", { class: "button primary", onClick: () => void apply([...ticked]) }, `Save to ${p.name}`),
      );
    };
    draw();
  };

  const apply = async (ticked: string[] | null) => {
    const r = await attempt(() => api.changeParent(parent!.id, staged, ticked));
    if (!r) return;
    notice(`${r.label}.`, "green", { label: "Undo", run: async () => (await attempt(() => api.undo()), await ctx.refresh()) }, 8000);
    d.close();
  };

  drawEdit();
}

function stagedText(v: Value, r: Row): string {
  if (v === null) return "";
  if (r.ability && typeof v === "object" && !Array.isArray(v)) return String((v as Record<string, Value>).score ?? "");
  return String(v);
}

/** Everything under a row in the checklist (its branch). */
function below(family: FamilyRow[], row: FamilyRow): string[] {
  const i = family.indexOf(row);
  const out: string[] = [];
  for (const f of family.slice(i + 1)) {
    if (f.depth <= row.depth) break;
    out.push(f.id);
  }
  return out;
}
