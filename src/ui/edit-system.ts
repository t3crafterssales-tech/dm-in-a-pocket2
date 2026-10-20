// Edit parent from a world up to its system. The system's version of this thing is shown beside
// this world's, with "Use my version"; saving shows a checklist of the system's worlds.

import type { UpwardView } from "../app/backend.ts";
import { api } from "./api.ts";
import { attempt } from "./common.ts";
import { notice, openDialog } from "./dialogs.ts";
import { h } from "./dom.ts";
import type { PlaceCtx } from "./place.ts";

type Value = UpwardView["rows"][number]["systemValue"];

export async function openEditSystem(nodeId: string, ctx: PlaceCtx) {
  const view = await attempt(() => api.upwardView(nodeId));
  if (!view) return;
  const d = openDialog(`Edit in ${view.systemName}: ${view.nodeName}`, { wide: true, onClose: () => void ctx.refresh() });
  const staged: Record<string, Value> = {};

  const drawEdit = () => {
    const shown = view.rows.filter((r) => r.differs || r.editable || r.key in staged);
    d.body.replaceChildren(
      h("p", { class: "muted" }, `You're changing ${view.systemName} itself, so its worlds can get the change. Next you choose which worlds do; this one is ticked already.`),
      h(
        "table",
        { class: "compare" },
        h("thead", null, h("tr", null, h("th", null, ""), h("th", null, view.systemName), h("th", null, "This world"), h("th", null, ""))),
        h(
          "tbody",
          null,
          shown.map((r) => {
            const value = r.key in staged ? staged[r.key] : r.systemValue;
            let cell: HTMLElement;
            if (r.editable) {
              const input = h("input", { class: "text-input", value: value === null || value === undefined ? "" : String(value), "data-key": `es-${r.key}` });
              input.addEventListener("change", () => {
                const raw = input.value;
                const next: Value = typeof r.systemValue === "number" && raw.trim() !== "" && Number.isFinite(Number(raw)) ? Number(raw) : raw === "" ? null : raw;
                if (JSON.stringify(next) === JSON.stringify(r.systemValue)) delete staged[r.key];
                else staged[r.key] = next;
                drawEdit();
              });
              cell = input;
            } else cell = h("span", null, r.key in staged ? `${r.world} (from this world)` : r.system || "—");
            return h(
              "tr",
              { class: r.key in staged ? "staged" : "" },
              h("th", { scope: "row" }, r.label),
              h("td", null, cell),
              h("td", { class: r.differs ? "differs" : "muted" }, r.world || "—"),
              h(
                "td",
                null,
                r.differs && !(r.key in staged)
                  ? h(
                      "button",
                      {
                        class: "link small",
                        title: `Copy this world's ${r.label} up to ${view.systemName}`,
                        onClick: () => {
                          staged[r.key] = r.worldValue;
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
      ),
      h("p", { class: "small" }, Object.keys(staged).length ? `${Object.keys(staged).length} change${Object.keys(staged).length === 1 ? "" : "s"} waiting to be saved.` : ""),
    );
    d.footer.replaceChildren(
      h("span", { class: "spacer" }),
      h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"),
      h("button", { class: "button primary", disabled: !Object.keys(staged).length, onClick: () => drawChecklist() }, "Save…"),
    );
  };

  const drawChecklist = () => {
    const ticked = new Set(view.worlds.map((w) => w.id));
    const draw = () => {
      d.body.replaceChildren(
        h("p", null, `Which of ${view.systemName}'s worlds get the change? Unticked ones keep their old value as their own, marked with a pencil. Values a world already set for itself are never touched.`),
        h(
          "div",
          { class: "inline" },
          h("button", { class: "link small", onClick: () => (view.worlds.forEach((w) => ticked.add(w.id)), draw()) }, "Select all"),
          h("button", { class: "link small", onClick: () => (ticked.clear(), draw()) }, "Unselect all"),
        ),
        h(
          "ul",
          { class: "checklist" },
          view.worlds.map((w) => {
            const box = h("input", { type: "checkbox", checked: ticked.has(w.id) || !w.available, disabled: !w.available });
            box.addEventListener("change", () => (box.checked ? ticked.add(w.id) : ticked.delete(w.id)));
            return h("li", { class: w.current ? "current" : "" }, h("label", { class: "check" }, box, h("span", null, w.name), w.current ? h("span", { class: "chip small-chip" }, "this one") : null, w.note ? h("span", { class: "muted small" }, w.note) : null));
          }),
        ),
      );
      d.footer.replaceChildren(
        h("button", { class: "button plain", onClick: () => drawEdit() }, "Back"),
        h("span", { class: "spacer" }),
        h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"),
        h(
          "button",
          {
            class: "button primary",
            onClick: async () => {
              const r = await attempt(() => api.changeInSystem(nodeId, staged, [...ticked]));
              if (!r) return;
              const extra = [r.kept.length ? `${r.kept.join(", ")} kept the old value` : "", r.couldNot.length ? `${r.couldNot.join(", ")} couldn't be protected (open elsewhere)` : ""].filter(Boolean).join("; ");
              notice(`${r.label}.${extra ? ` ${extra}.` : ""}`, "green", { label: "Undo", run: async () => (await attempt(() => api.undo()), await ctx.refresh()) }, 9000);
              d.close();
            },
          },
          `Save to ${view.systemName}`,
        ),
      );
    };
    draw();
  };
  drawEdit();
}
