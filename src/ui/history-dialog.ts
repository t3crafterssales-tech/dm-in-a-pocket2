// History: every change as a line in plain words, newest first. Clicking a line shows what it
// touched and offers to roll back to it; anything rolled back can be redone.

import type { HistoryStep } from "../app/backend.ts";
import { whenLabel } from "../app/words.ts";
import { api } from "./api.ts";
import { attempt } from "./common.ts";
import { notice, openDialog } from "./dialogs.ts";
import { h } from "./dom.ts";
import type { PlaceCtx } from "./place.ts";

export async function showHistory(ctx: PlaceCtx) {
  const d = openDialog("History", { wide: true, onClose: () => void ctx.refresh() });
  const ro = ctx.view.readOnly;
  let open: string | null = null;
  const draw = async () => {
    const hist = await attempt(() => api.history());
    if (!hist) return;
    const now = Date.now();
    const line = (s: HistoryStep, kind: "done" | "undone", first: boolean) => {
      const title = s.affected ? `${s.label}, ${s.affected} thing${s.affected === 1 ? "" : "s"} affected` : s.label;
      const when = `${whenLabel(s.time, now)}, ${new Date(s.time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
      const expanded = open === s.id;
      return h(
        "li",
        { class: `history-line ${kind}${expanded ? " open" : ""}` },
        h(
          "button",
          { class: "history-row", "aria-expanded": expanded ? "true" : "false", onClick: () => ((open = expanded ? null : s.id), void draw()) },
          h("span", { class: "history-label" }, title),
          s.by === "ai" ? h("span", { class: "chip small-chip ai-chip" }, "AI") : null,
          first && kind === "done" ? h("span", { class: "chip small-chip" }, "Now") : null,
          h("span", { class: "muted small history-when" }, when),
        ),
        expanded
          ? h(
              "div",
              { class: "history-detail" },
              s.things.length
                ? h("div", { class: "small" }, "Changed: ", s.things.map((t, i) => [i ? ", " : "", h("button", { class: "link", onClick: () => (d.close(), ctx.select(t.id)) }, t.name)]))
                : h("div", { class: "muted small" }, "Nothing that is still here."),
              ro
                ? null
                : kind === "done"
                  ? first
                    ? h("div", { class: "muted small" }, "This is where the world is now.")
                    : h("button", { class: "button plain small-button", onClick: () => void act(() => api.rollBackTo(s.id)) }, "Roll back to here")
                  : h("button", { class: "button plain small-button", onClick: () => void act(() => api.redoTo(s.id)) }, "Redo up to here"),
            )
          : null,
      );
    };
    d.body.replaceChildren(
      h("p", { class: "muted" }, "Every change, newest first. Click a line to see what it changed, or roll back to it. History is kept with the world for 30 days (or the last 5,000 steps); older work is covered by the daily backups."),
      hist.undone.length
        ? h("div", null, h("div", { class: "group-title" }, "Undone (can be redone)"), h("ul", { class: "history-list" }, [...hist.undone].reverse().map((s) => line(s, "undone", false))))
        : h("span"),
      hist.done.length ? h("ul", { class: "history-list" }, hist.done.map((s, i) => line(s, "done", i === 0))) : h("p", { class: "muted small" }, "Nothing has changed yet."),
    );
    d.footer.replaceChildren(
      ro || !hist.done.length ? h("span") : h("button", { class: "button plain", title: "Undo everything in History", onClick: () => void act(() => api.rollBackAll()) }, "Roll back everything"),
      h("span", { class: "spacer" }),
      h("button", { class: "button primary", onClick: () => d.close() }, "Close"),
    );
  };
  const act = async (fn: () => Promise<{ label: string }>) => {
    const r = await attempt(fn);
    if (r) notice(`${r.label}.`, "blue", undefined, 5000);
    open = null;
    await draw();
  };
  await draw();
}
