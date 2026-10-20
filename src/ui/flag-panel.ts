// The flag panel on the right, and its pop-ups. Always quiet: flags slide into the panel and
// never interrupt. Click a block to go to what it's about; double-click for the details and fixes.

import type { BinView, FlagBlock, FlagPanelView, MissingDetail, RestoreResult } from "../app/backend.ts";
import { whenLabel } from "../app/words.ts";
import { api } from "./api.ts";
import { attempt } from "./common.ts";
import { ask, notice, openDialog } from "./dialogs.ts";
import { h, svg } from "./dom.ts";
import { ICONS } from "./icons.ts";
import type { PlaceCtx } from "./place.ts";

let showIgnored = false;
/** The flag panel's filter: everything, red only, or one kind of yellow check. */
let only: "all" | "red" | "balance" | "economy" | "filing" = "all";

export async function flagPanel(ctx: PlaceCtx): Promise<HTMLElement> {
  const view: FlagPanelView = (await attempt(() => api.flagPanel())) ?? { blocks: [], ignored: [], counts: { red: 0, yellow: 0, blue: 0, green: 0, new: 0 } };
  const c = view.counts;
  const counter = [c.red ? h("span", { class: "dot red" }, `${c.red} red`) : null, c.yellow ? h("span", { class: "dot yellow" }, `${c.yellow} yellow`) : null, c.blue ? h("span", { class: "dot blue" }, `${c.blue} blue`) : null, c.green ? h("span", { class: "dot green" }, `${c.green} green`) : null].filter(Boolean) as HTMLElement[];
  const ro = ctx.view.readOnly;
  return h(
    "aside",
    { class: "panel flag-panel", "aria-label": "Flags", "data-scroll": "flags" },
    h(
      "div",
      { class: "panel-head flag-head" },
      h("span", null, "Flags"),
      h("span", { class: "head-count small" }, counter.flatMap((x, i) => (i ? [" · ", x] : [x]))),
      c.new ? h("button", { class: "new-count", title: "Mark them all as seen", onClick: async () => (await attempt(() => api.markSeen(null)), await ctx.refresh()) }, `${c.new} new`) : null,
    ),
    (() => {
      const sel = h(
        "select",
        { class: "text-input select small-select flag-filter", "aria-label": "Show flags" },
        [
          ["all", "All flags"],
          ["red", "Red only"],
          ["balance", "Balance"],
          ["economy", "Economy"],
          ["filing", "Filing"],
        ].map(([v, l]) => h("option", { value: v, selected: only === v }, l)),
      );
      sel.addEventListener("change", () => ((only = sel.value as typeof only), void ctx.refresh()));
      return view.blocks.length ? h("div", { class: "pad tight" }, sel) : h("span");
    })(),
    (() => {
      const shown = view.blocks.filter((b) => only === "all" || (only === "red" ? b.color === "red" : b.category === only));
      return shown.length ? h("ul", { class: "flag-list" }, shown.map((b) => block(b, ctx, ro))) : h("p", { class: "muted small pad" }, view.blocks.length ? "None of that kind." : "No flags. Everything checks out.");
    })(),
    h(
      "div",
      { class: "flag-foot" },
      view.ignored.length ? h("button", { class: "link small", onClick: () => ((showIgnored = !showIgnored), void ctx.refresh()) }, showIgnored ? "Hide ignored" : `Show ignored (${view.ignored.length})`) : null,
      c.blue + c.green && !ro ? h("button", { class: "link small", title: "Remove the blue and green blocks from the panel", onClick: async () => (await attempt(() => api.clearLog()), await ctx.refresh()) }, "Clear blue and green") : null,
    ),
    showIgnored && view.ignored.length
      ? h(
          "ul",
          { class: "flag-list ignored" },
          view.ignored.map((b) =>
            h(
              "li",
              { class: `flag ${b.color} ignored` },
              h("div", { class: "flag-title" }, b.title),
              ro ? null : h("button", { class: "link small", onClick: async () => (await attempt(() => api.unignore(b.key)), await attempt(() => api.unignore(b.kind)), await ctx.refresh()) }, "Switch back on"),
            ),
          ),
        )
      : null,
  );
}

function block(b: FlagBlock, ctx: PlaceCtx, ro: boolean) {
  const actions: HTMLElement[] = [];
  const act = (label: string, run: () => Promise<unknown>, title = "") =>
    h(
      "button",
      {
        class: "link small",
        title,
        onClick: async (e: MouseEvent) => {
          e.stopPropagation();
          await attempt(run);
          await ctx.refresh();
        },
        onDblclick: (e: MouseEvent) => e.stopPropagation(),
      },
      label,
    );
  if (!ro && (b.color === "red" || b.color === "yellow")) {
    actions.push(act("Ignore", () => api.ignoreFlag(b.key), "Hide this one flag (Show ignored brings it back)"));
    if (b.color === "yellow") actions.push(act("Ignore all like this", () => api.ignoreKind(b.kind), "Hide this kind of warning everywhere in this world"));
  }
  if (!ro && b.color === "green" && b.canUndo) actions.push(act("Undo", () => api.undoLog(b.key)));
  return h(
    "li",
    {
      class: `flag ${b.color}${b.isNew ? " new" : ""}`,
      tabindex: 0,
      title: b.color === "red" || b.color === "yellow" ? "Click to go to it; double-click for the details and fixes" : "",
      onClick: async () => {
        if (b.isNew) await attempt(() => api.markSeen([b.key]));
        if (b.nodes[0]) ctx.select(b.nodes[0].id);
        else await ctx.refresh();
      },
      onDblclick: () => void openFlag(b, ctx),
      onKeydown: (e: KeyboardEvent) => e.key === "Enter" && void openFlag(b, ctx),
    },
    h("div", { class: "flag-title" }, b.isNew ? h("span", { class: "new-dot", title: "New" }) : null, b.title),
    b.detail ? h("div", { class: "muted small" }, b.detail) : null,
    b.time ? h("div", { class: "muted tiny" }, whenLabel(b.time, Date.now())) : null,
    actions.length ? h("div", { class: "flag-actions" }, actions) : null,
  );
}

/** The detail pop-up: everything the flag is about, with the fixes. */
export async function openFlag(b: FlagBlock, ctx: PlaceCtx) {
  if (b.color === "blue" || b.color === "green") return;
  await attempt(() => api.markSeen([b.key]));
  if (b.kind === "missing") return void openMissing(b, ctx);
  const d = openDialog(b.title, { wide: true, onClose: () => void ctx.refresh() });
  const ro = ctx.view.readOnly;
  const ticks = new Set(b.nodes.map((n) => n.id));
  const list = h(
    "ul",
    { class: "checklist" },
    b.nodes.map((n) => {
      const box = h("input", { type: "checkbox", checked: true });
      box.addEventListener("change", () => (box.checked ? ticks.add(n.id) : ticks.delete(n.id)));
      return h("li", null, h("label", { class: "check" }, b.kind === "rule" ? box : null, h("span", null, n.name)), h("button", { class: "link small", onClick: () => (d.close(), ctx.select(n.id)) }, "Go to it"));
    }),
  );
  d.body.append(h("p", null, b.detail), list);
  if (b.kind === "rule") {
    d.body.append(h("p", { class: "muted small" }, "Change them so they follow the rule, or tick the ones that break it on purpose and choose I meant that."));
    d.footer.append(
      h("span", { class: "spacer" }),
      h("button", { class: "button plain", onClick: () => d.close() }, "Leave for later"),
      ...(ro ? [] : [h("button", { class: "button primary", onClick: async () => (await attempt(() => api.meantThat(b.key, [...ticks]))) && d.close() }, "I meant that")]),
    );
  } else {
    d.footer.append(
      ...(ro ? [] : [h("button", { class: "button plain", onClick: async () => (await attempt(() => api.ignoreKind(b.kind)), d.close()) }, "Ignore all like this")]),
      h("span", { class: "spacer" }),
      h("button", { class: "button plain", onClick: () => d.close() }, "Leave for later"),
      ...(ro ? [] : [h("button", { class: "button primary", title: "Nothing is wrong here", onClick: async () => (await attempt(() => api.markGood(b.key))) && d.close() }, "It's fine")]),
    );
  }
}

/** "Strength removed: 214 things affected": tick any set, apply one fix, repeat with the rest. */
async function openMissing(b: FlagBlock, ctx: PlaceCtx) {
  const d = openDialog(b.title, { wide: true, onClose: () => void ctx.refresh() });
  const ro = ctx.view.readOnly;
  let ticked = new Set<number>();
  let first = true;
  const draw = async () => {
    let detail: MissingDetail;
    try {
      detail = await api.missingDetail(b.key);
    } catch {
      d.body.replaceChildren(h("p", null, "All fixed. The flag has cleared."));
      d.footer.replaceChildren(h("span", { class: "spacer" }), h("button", { class: "button primary", onClick: () => d.close() }, "Done"));
      return;
    }
    if (first) ticked = new Set(detail.slots.map((_, i) => i));
    first = false;
    const swap = h("select", { class: "text-input select", disabled: ro }, h("option", { value: "" }, "Point them at…"), detail.candidates.map((c) => h("option", { value: c.id }, c.name)));
    const apply = async (to: string | null) => {
      const slots = detail.slots.filter((_, i) => ticked.has(i)).map((s) => s.slot);
      if (!slots.length) return notice("Tick at least one first.", "blue", undefined, 3000);
      const r = await attempt(() => api.fixMissing(b.key, slots, to));
      if (r) notice(`${r.label}.`, "green", undefined, 5000);
      ticked = new Set();
      first = true;
      await draw();
    };
    swap.addEventListener("change", () => swap.value && void apply(swap.value));
    d.body.replaceChildren(
      h("p", null, `${detail.slots.length === 1 ? "1 link points" : `${detail.slots.length} links point`} at ${detail.missingName}, which is gone. Tick the ones to fix, then choose a fix. Repeat with the rest, or leave them for later.`),
      h(
        "div",
        { class: "inline" },
        h("button", { class: "link small", onClick: () => ((ticked = new Set(detail.slots.map((_, i) => i))), void draw()) }, "Select all"),
        h("button", { class: "link small", onClick: () => ((ticked = new Set()), void draw()) }, "Unselect all"),
        h("span", { class: "muted small" }, `${ticked.size} ticked`),
      ),
      h(
        "ul",
        { class: "checklist" },
        detail.slots.map((s, i) => {
          const box = h("input", { type: "checkbox", checked: ticked.has(i), disabled: ro });
          box.addEventListener("change", () => (box.checked ? ticked.add(i) : ticked.delete(i), void draw()));
          return h("li", null, h("label", { class: "check" }, box, h("strong", null, s.nodeName), h("span", { class: "muted small" }, s.where)), h("button", { class: "link small", onClick: () => (d.close(), ctx.select(s.nodeId)) }, "Go to it"));
        }),
      ),
      ro
        ? h("span")
        : h(
            "div",
            { class: "fix-row" },
            detail.candidates.length ? swap : h("span", { class: "muted small" }, `There's nothing else of that kind to point them at yet.`),
            h("button", { class: "button plain", title: "For example, the attack uses no ability at all", onClick: () => void apply(null) }, "Remove the link"),
            detail.binId
              ? h(
                  "button",
                  {
                    class: "button primary",
                    onClick: async () => {
                      d.close();
                      await restoreWithReconnect(detail.binId!, ctx);
                    },
                  },
                  `Restore ${detail.missingName}`,
                )
              : null,
          ),
    );
    d.footer.replaceChildren(h("span", { class: "spacer" }), h("button", { class: "button plain", onClick: () => d.close() }, "Leave the rest for later"));
  };
  await draw();
}

// ---------- The recycle bin inside a world ----------

/** Restores, then offers to reconnect anything that was pointed elsewhere meanwhile. */
export async function restoreWithReconnect(binId: string, ctx: PlaceCtx) {
  const r: RestoreResult | undefined = await attempt(() => api.restoreNode(binId));
  if (!r) return;
  if (!r.reconnect.length) {
    notice(`${r.label}. Everything that used it works again.`, "green", { label: "Undo", run: async () => (await attempt(() => api.undo()), await ctx.refresh()) }, 6000);
    ctx.select(r.nodeId);
    return;
  }
  const ticks = new Set(r.reconnect.map((_, i) => i).filter((i) => !r.reconnect[i]!.changedSince));
  const d = openDialog(`Reconnect to ${r.name}?`, { wide: true, onClose: () => ctx.select(r.nodeId) });
  d.body.append(
    h("p", null, `${r.name} is back. ${r.reconnect.length} thing${r.reconnect.length === 1 ? " was" : "s were"} pointed somewhere else after it was removed. Reconnect them?`),
    h(
      "ul",
      { class: "checklist" },
      r.reconnect.map((x, i) => {
        const box = h("input", { type: "checkbox", checked: ticks.has(i) });
        box.addEventListener("change", () => (box.checked ? ticks.add(i) : ticks.delete(i)));
        return h(
          "li",
          null,
          h("label", { class: "check" }, box, h("strong", null, x.nodeName), h("span", { class: "muted small" }, `${x.where}, now ${x.nowUses ? `uses ${x.nowUses}` : "uses nothing"}`), x.changedSince ? h("span", { class: "chip small-chip warn-chip", title: "It was changed again after the fix. Check it before reconnecting." }, "changed since") : null),
        );
      }),
    ),
  );
  d.footer.append(
    h("span", { class: "spacer" }),
    h("button", { class: "button plain", onClick: () => d.close() }, "Keep them as they are"),
    h(
      "button",
      {
        class: "button primary",
        onClick: async () => {
          const res = await attempt(() => api.reconnect(r.nodeId, r.reconnect.filter((_, i) => ticks.has(i)).map((x) => x.slot)));
          if (res) notice(`${res.label}.`, "green", undefined, 5000);
          d.close();
        },
      },
      "Reconnect ticked",
    ),
  );
}

export async function showNodeBin(ctx: PlaceCtx) {
  const d = openDialog("Recycle bin", { wide: true, onClose: () => void ctx.refresh() });
  const ro = ctx.view.readOnly;
  const draw = async () => {
    const items: BinView[] = (await attempt(() => api.bin())) ?? [];
    if (!items.length) {
      d.body.replaceChildren(h("p", { class: "muted" }, "The recycle bin is empty."));
      d.footer.replaceChildren(h("span", { class: "spacer" }), h("button", { class: "button primary", onClick: () => d.close() }, "Close"));
      return;
    }
    const now = Date.now();
    d.body.replaceChildren(
      h("p", { class: "muted" }, "Deleted things stay here until you empty the bin. Each remembers every link it had, so restoring reconnects them."),
      h(
        "ul",
        { class: "bin-list" },
        items.map((b) =>
          h(
            "li",
            null,
            svg(ICONS.trash),
            h("div", { class: "bin-text" }, h("div", { class: "bin-name" }, b.name), h("div", { class: "muted small" }, `${KIND[b.kind] ?? b.kind} · deleted ${whenLabel(b.deleted, now).toLowerCase()}${b.usedBy ? ` · ${b.usedBy} thing${b.usedBy === 1 ? "" : "s"} used it` : ""}`)),
            ro
              ? null
              : h(
                  "button",
                  {
                    class: "button plain",
                    onClick: async () => {
                      d.close();
                      await restoreWithReconnect(b.binId, ctx);
                    },
                  },
                  "Restore",
                ),
          ),
        ),
      ),
    );
    d.footer.replaceChildren(
      ro
        ? h("span")
        : h(
            "button",
            {
              class: "button danger",
              onClick: async () => {
                const ok = await ask("Empty the recycle bin?", [`This permanently deletes ${items.length} thing${items.length === 1 ? "" : "s"}. It is the only action in the app that can't be undone; anything that used them stays flagged.`], [
                  { label: "Cancel", value: false },
                  { label: "Empty recycle bin", value: true, kind: "danger" },
                ]);
                if (!ok) return;
                await attempt(() => api.emptyNodeBin(null));
                await draw();
              },
            },
            "Empty recycle bin",
          ),
      h("span", { class: "spacer" }),
      h("button", { class: "button primary", onClick: () => d.close() }, "Close"),
    );
  };
  await draw();
}

const KIND: Record<string, string> = { ability: "Ability", resource: "Resource", skill: "Skill", condition: "Condition", rule: "Rule", brick: "Library brick", being: "Being", item: "Item", lore: "Lore", table: "Roll table", category: "Category" };

/**
 * Before making something new: "You removed Strength yesterday. Restore it instead?"
 * Resolves true when the caller should go on making a new one.
 */
export async function offerRestore(name: string, kind: string | null, ctx: PlaceCtx): Promise<boolean> {
  const b = await attempt(() => api.binnedNamed(name, kind as never));
  if (!b) return true;
  const choice = await ask(`Restore ${b.name} instead?`, [`You removed ${b.name} ${whenLabel(b.deleted, Date.now()).toLowerCase()}. Restoring it brings back everything that used it.`], [
    { label: "Make a new one", value: "new" as const },
    { label: `Restore ${b.name}`, value: "restore" as const, kind: "primary" },
  ]);
  if (choice === "restore") {
    await restoreWithReconnect(b.binId, ctx);
    return false;
  }
  return choice === "new";
}
