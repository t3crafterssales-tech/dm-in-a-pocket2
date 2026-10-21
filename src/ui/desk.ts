// The DM's table (version 2): the screen the DM runs a game from. Every tool (initiative, dice,
// clock, encounter, roll tables, journal, bookmarks, party, map, chat and log, rules reference)
// sits in one of five areas: left, middle, right, top and bottom. Drag a tool by its title bar to
// another area; the arrangement is remembered and can be saved by name ("Combat", "Town").
// Each tool has its own small settings behind its gear.

import type { PlaceView, TableMeta, TableView, ToolPlace } from "../app/backend.ts";
import { TOOL_NAMES } from "../app/tablemeta.ts";
import { api } from "./api.ts";
import { app, attempt, brand, iconButton } from "./common.ts";
import { ask, notice, openDialog } from "./dialogs.ts";
import { h, svg } from "./dom.ts";
import { ICONS } from "./icons.ts";
import { drawPins } from "./floating-pins.ts";
import { TOOLS } from "./tools/registry.ts";
import type { DeskCtx } from "./tools/registry.ts";

const AREAS: ToolPlace["area"][] = ["top", "left", "middle", "right", "bottom"];
const TOOL_DRAG = "application/x-dm-tool";

let busy = false;
let again = false;
let ticking: number | null = null;

export async function drawDesk(view: PlaceView, exit: () => void, goHome: () => void): Promise<void> {
  if (busy) {
    again = true;
    return;
  }
  busy = true;
  try {
    do {
      again = false;
      await draw(view, exit, goHome);
    } while (again);
  } finally {
    busy = false;
  }
}

/** Stops the second-by-second ticking of real-time timers when the table is left. */
export function leaveDesk() {
  if (ticking !== null) clearInterval(ticking);
  ticking = null;
}

async function draw(view: PlaceView, exit: () => void, goHome: () => void) {
  const scroll = [...document.querySelectorAll<HTMLElement>("[data-scroll]")].map((el) => [el.dataset.scroll!, el.scrollTop] as const);
  const focusKey = (document.activeElement as HTMLElement | null)?.dataset?.key ?? null;
  const meta = (await attempt(() => api.tableMeta())) ?? null;
  if (!meta) return exit();
  const glance = (meta.settings.initiative?.glance as string[] | undefined) ?? ["hp", "ac"];
  const data = (await attempt(() => api.tableView(glance))) ?? null;
  if (!data) return exit();
  const redraw = () => drawDesk(view, exit, goHome);
  const ctx: DeskCtx = {
    view,
    data,
    meta,
    refresh: redraw,
    settings: (tool) => meta.settings[tool] ?? {},
    setSettings: async (tool, patch) => {
      const next = { ...meta.settings, [tool]: { ...(meta.settings[tool] ?? {}), ...patch } };
      await attempt(() => api.setTableMeta({ settings: next }));
      await redraw();
    },
    setMeta: async (patch) => {
      await attempt(() => api.setTableMeta(patch));
      await redraw();
    },
    leave: exit,
    peek: (id) => peekOpen(id, ctx),
  };

  const s = data.session;
  const status = s
    ? h("span", { class: "desk-status" }, h("strong", null, s.title), s.combat.active ? h("span", { class: "tag accent" }, `Round ${s.combat.round}`) : null, h("span", { class: "muted small" }, `${data.date.time}, ${data.date.text}`))
    : h("span", { class: "desk-status muted" }, "No game tonight yet.");

  const arrangement = h(
    "select",
    { class: "text-input select small-select", "aria-label": "Arrangement", title: "Saved arrangements of the tools" },
    h("option", { value: "" }, "Arrange…"),
    meta.arrangements.map((a) => h("option", { value: `use:${a.name}` }, `Use "${a.name}"`)),
    h("option", { value: "save" }, "Save this arrangement…"),
    meta.arrangements.length ? h("option", { value: "forget" }, "Forget an arrangement…") : null,
    h("option", { value: "reset" }, "Back to the usual arrangement"),
  );
  arrangement.addEventListener("change", () => void arrange(arrangement.value, ctx));

  const addTool = h(
    "select",
    { class: "text-input select small-select", "aria-label": "Add a tool" },
    h("option", { value: "" }, "+ Tool"),
    Object.keys(TOOLS)
      .filter((t) => !meta.arrangement.some((p) => p.tool === t))
      .map((t) => h("option", { value: t }, TOOL_NAMES[t] ?? t)),
  );
  addTool.addEventListener("change", () => {
    if (!addTool.value) return;
    const places = [...meta.arrangement, { tool: addTool.value, area: "right" as const, order: 99 }];
    void ctx.setMeta({ arrangement: places });
  });

  const top = h(
    "header",
    { class: "topbar place desk-top" },
    brand(),
    h("div", { class: "place-title" }, h("span", { class: "place-name" }, view.name), h("span", { class: "muted small" }, "The DM's table")),
    status,
    h(
      "nav",
      { class: "top-actions" },
      s ? null : h("button", { class: "button primary", disabled: view.readOnly, onClick: () => void prepare(ctx) }, "Begin session…"),
      s ? h("button", { class: "button plain", disabled: view.readOnly, onClick: () => void wrapUpDialog(ctx) }, "Wrap up…") : null,
      addTool,
      arrangement,
      iconButton(ICONS.undo, "Undo", () => void undo(ctx), { iconOnly: true, title: "Undo (Ctrl+Z)", disabled: view.readOnly }),
      iconButton(ICONS.pencil, "Build", exit, { title: "Back to building: the Codex, sheets and rules" }),
      iconButton(ICONS.home, "Home", goHome),
    ),
  );

  // The five areas, each a column or a row of tools.
  const byArea = new Map<ToolPlace["area"], ToolPlace[]>(AREAS.map((a) => [a, []]));
  for (const p of [...meta.arrangement].sort((a, b) => a.order - b.order)) if (TOOLS[p.tool]) byArea.get(p.area)!.push(p);
  const frames = new Map<string, HTMLElement>();
  await Promise.all(meta.arrangement.filter((p) => TOOLS[p.tool]).map(async (p) => frames.set(p.tool, await frame(p, ctx))));
  const area = (a: ToolPlace["area"]) => {
    const el = h("div", { class: `desk-area area-${a}${byArea.get(a)!.length ? "" : " empty"}`, "data-area": a }, byArea.get(a)!.map((p) => frames.get(p.tool)!));
    el.addEventListener("dragover", (e) => {
      if (!e.dataTransfer?.types.includes(TOOL_DRAG)) return;
      e.preventDefault();
      el.classList.add("drop-over");
    });
    el.addEventListener("dragleave", (e) => !el.contains(e.relatedTarget as Node) && el.classList.remove("drop-over"));
    el.addEventListener("drop", (e) => {
      const tool = e.dataTransfer?.getData(TOOL_DRAG);
      el.classList.remove("drop-over");
      if (!tool) return;
      e.preventDefault();
      // Dropped on another tool: goes before it. On empty space: at the end of the area.
      const over = (e.target as HTMLElement).closest<HTMLElement>("[data-tool]")?.dataset.tool ?? null;
      const rest = meta.arrangement.filter((p) => p.tool !== tool);
      const here = rest.filter((p) => p.area === a).sort((x, y) => x.order - y.order).map((p) => p.tool);
      const at = over && over !== tool ? here.indexOf(over) : here.length;
      here.splice(at < 0 ? here.length : at, 0, tool);
      const next = [...rest.filter((p) => p.area !== a), ...here.map((t, i) => ({ tool: t, area: a, order: i }))];
      void ctx.setMeta({ arrangement: next });
    });
    return el;
  };
  const desk = h(
    "div",
    { class: "desk" },
    area("top"),
    h("div", { class: "desk-middle-row" }, area("left"), area("middle"), area("right")),
    area("bottom"),
  );
  app.replaceChildren(top, ...(view.readOnly ? [h("div", { class: "banner" }, h("strong", null, "Read-only. "), view.readOnlyReason ?? "")] : []), desk);
  await drawPins(view, { open: (id) => void peekOpen(id, ctx) });
  for (const [key, t] of scroll) {
    const el = document.querySelector<HTMLElement>(`[data-scroll="${CSS.escape(key)}"]`);
    if (el) el.scrollTop = t;
  }
  if (focusKey) document.querySelector<HTMLElement>(`[data-key="${CSS.escape(focusKey)}"]`)?.focus();
  // Real-time timers count down on screen every second.
  if (ticking === null)
    ticking = window.setInterval(() => {
      for (const el of document.querySelectorAll<HTMLElement>("[data-ends]")) {
        const left = Math.max(0, Number(el.dataset.ends) - Date.now());
        el.textContent = clockText(left);
        if (left === 0 && !el.dataset.rang) {
          el.dataset.rang = "1";
          if (el.dataset.sound === "1") beep();
          notice(`${el.dataset.name ?? "A timer"} ran out.`, "yellow", undefined, 8000);
        }
      }
    }, 1000);
}

export function clockText(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** A short chime for a timer that runs out. */
export function beep() {
  try {
    const a = new AudioContext();
    const o = a.createOscillator();
    const g = a.createGain();
    o.frequency.value = 660;
    g.gain.setValueAtTime(0.2, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 1.2);
    o.connect(g).connect(a.destination);
    o.start();
    o.stop(a.currentTime + 1.2);
  } catch {
    // No sound available: the notice still shows.
  }
}

async function frame(p: ToolPlace, ctx: DeskCtx): Promise<HTMLElement> {
  const tool = TOOLS[p.tool]!;
  let body: HTMLElement;
  try {
    body = await tool.render(ctx);
  } catch (e) {
    body = h("p", { class: "muted small pad" }, `This tool couldn't open: ${e instanceof Error ? e.message : String(e)}`);
  }
  const head = h(
    "div",
    { class: "tool-head", draggable: "true", title: "Drag to move this tool to another place on the screen" },
    h("span", { class: "tool-grip", "aria-hidden": "true" }, "⋮⋮"),
    h("span", { class: "tool-title" }, TOOL_NAMES[p.tool] ?? p.tool),
    h("span", { class: "grow" }),
    tool.gear ? h("button", { class: "icon-button", title: `${TOOL_NAMES[p.tool]} settings`, "aria-label": "Settings", onClick: () => void tool.gear!(ctx) }, svg(ICONS.gear)) : null,
    h("button", { class: "icon-button", title: `Put ${TOOL_NAMES[p.tool]} away (+ Tool brings it back)`, "aria-label": "Close tool", onClick: () => void ctx.setMeta({ arrangement: ctx.meta.arrangement.filter((x) => x.tool !== p.tool) }) }, svg(ICONS.close)),
  );
  head.addEventListener("dragstart", (e) => {
    e.dataTransfer!.setData(TOOL_DRAG, p.tool);
    e.dataTransfer!.effectAllowed = "move";
    document.body.classList.add("moving-tool");
  });
  head.addEventListener("dragend", () => document.body.classList.remove("moving-tool"));
  return h("section", { class: `tool tool-${p.tool}`, "data-tool": p.tool, "aria-label": TOOL_NAMES[p.tool] }, head, h("div", { class: "tool-body", "data-scroll": `tool-${p.tool}` }, body));
}

async function arrange(choice: string, ctx: DeskCtx) {
  if (!choice) return;
  if (choice === "reset") return ctx.setMeta({ arrangement: [] });
  if (choice.startsWith("use:")) {
    const a = ctx.meta.arrangements.find((x) => x.name === choice.slice(4));
    if (a) await ctx.setMeta({ arrangement: a.places });
    return;
  }
  if (choice === "save") {
    const d = openDialog("Save this arrangement");
    const name = h("input", { class: "text-input", placeholder: "Combat, Town, Prep…", "aria-label": "Name" });
    const ok = h("button", { class: "button primary" }, "Save");
    ok.addEventListener("click", async () => {
      const n = name.value.trim();
      if (!n) return;
      d.close();
      await ctx.setMeta({ arrangements: [...ctx.meta.arrangements.filter((a) => a.name !== n), { name: n, places: ctx.meta.arrangement }] });
      notice(`Saved "${n}". Pick it from Arrange to switch back in one click.`, "green", undefined, 5000);
    });
    d.body.replaceChildren(h("p", { class: "muted" }, "Where every tool is right now, kept under a name to switch back to in one click."), name);
    d.footer.replaceChildren(h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"), ok);
    name.focus();
    return;
  }
  if (choice === "forget") {
    const which = await ask("Forget which arrangement?", ["The tools stay where they are now."], [...ctx.meta.arrangements.map((a) => ({ label: a.name, value: a.name as string | false })), { label: "Cancel", value: false }]);
    if (which) await ctx.setMeta({ arrangements: ctx.meta.arrangements.filter((a) => a.name !== which) });
    else await ctx.refresh();
  }
}

async function undo(ctx: DeskCtx) {
  const r = await attempt(() => api.undo());
  if (r === null) notice("Nothing to undo.", "blue", undefined, 3000);
  else if (r) notice(`Undid: ${r.label}`, "blue", undefined, 4000);
  await ctx.refresh();
}

/** Opening something from a tool never leaves the table: it floats on top as a pin. */
export async function peekOpen(id: string, ctx: DeskCtx) {
  const meta = await attempt(() => api.tableMeta());
  if (!meta) return;
  if (meta.pins.some((p) => p.node === id)) return;
  const n = meta.pins.length;
  await attempt(() => api.setTableMeta({ pins: [...meta.pins, { id: `${Date.now()}`, node: id, x: 120 + (n % 6) * 30, y: 120 + (n % 6) * 30, collapsed: false }] }));
  await ctx.refresh();
}

// ---------- Prepare and begin a session ----------

async function prepare(ctx: DeskCtx) {
  const d = openDialog("Begin a session", { wide: true });
  const data = ctx.data;
  const present = new Set(data.roster.map((c) => c.id));
  const starred = new Set<string>();
  const last = data.past[0] ? data.past[0].title : null;
  const lastTime = h("textarea", { class: "text-input", rows: 3, placeholder: "Last time… (read out at the start; optional)", "aria-label": "Last time" });
  const where = h("select", { class: "text-input select", "aria-label": "Start at" }, h("option", { value: "" }, data.encounters.length ? "Where the group got to last time" : "No module encounters here"), data.encounters.map((e) => h("option", { value: e.id }, `${e.number} ${e.name}`)));
  const draw = () =>
    d.body.replaceChildren(
      h("p", { class: "muted" }, last ? `Last time: ${last}. The clock carries on from there.` : "The first game night here. The clock starts at 8 in the morning, day 1."),
      h("h3", null, "Who's at the table tonight?"),
      data.roster.length
        ? h(
            "div",
            { class: "pick-chips" },
            data.roster.map((c) => h("button", { class: `pick-chip${present.has(c.id) ? " on" : ""}`, onClick: () => (present.has(c.id) ? present.delete(c.id) : present.add(c.id), draw()) }, c.name, c.player ? h("span", { class: "muted small" }, ` (${c.player})`) : null)),
          )
        : h("p", { class: "muted small" }, "No characters in the party yet. You can still play: add them in the Party tab any time."),
      h("p", { class: "muted small" }, "Anyone not ticked sits out: their character stays as it was."),
      data.encounters.length ? h("div", null, h("h3", null, "Start at"), where, h("h3", null, "Star the encounters you expect to reach"), h("div", { class: "pick-chips" }, data.encounters.map((e) => h("button", { class: `pick-chip${starred.has(e.id) ? " on" : ""}`, onClick: () => (starred.has(e.id) ? starred.delete(e.id) : starred.add(e.id), draw()) }, `${e.number} ${e.name}`)))) : h("span"),
      h("h3", null, "Last time…"),
      lastTime,
    );
  draw();
  const go = h("button", { class: "button primary" }, "Begin");
  go.addEventListener("click", async () => {
    if ((await attempt(() => api.beginSession({ present: [...present], starred: [...starred], encounter: where.value || null, lastTime: lastTime.value }))) === undefined) return;
    d.close();
    await ctx.refresh();
  });
  d.footer.replaceChildren(h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"), go);
}

// ---------- Wrap up ----------

async function wrapUpDialog(ctx: DeskCtx) {
  const s = ctx.data.session;
  if (!s) return;
  const d = openDialog(`Wrap up ${s.title}`, { wide: true });
  const shareAbsent = ctx.settings("session").absentShare === true;
  const to = shareAbsent ? ctx.data.roster.map((c) => c.id) : s.present;
  const each = to.length ? Math.floor(ctx.data.nightXp / to.length) : 0;
  const xp = h("input", { class: "text-input score-input", inputmode: "numeric", value: String(each), "aria-label": "Experience each" });
  const remove = new Set<string>();
  const newThings = await madeTonight(s.started);
  const absent = h("input", { type: "checkbox", checked: shareAbsent });
  absent.addEventListener("change", () => void ctx.setSettings("session", { absentShare: absent.checked }).then(() => (d.close(), wrapUpDialog(ctx))));
  d.body.replaceChildren(
    h("h3", null, "Experience"),
    h("p", null, ctx.data.nightXp ? `Monsters defeated tonight are worth ${ctx.data.nightXp} experience.` : "No monsters were defeated tonight (or the game doesn't count experience)."),
    h("div", { class: "inline" }, xp, h("span", { class: "muted small" }, `each, for ${to.map((id) => ctx.data.roster.find((c) => c.id === id)?.name).filter(Boolean).join(", ") || "nobody"}`)),
    h("label", { class: "check small" }, absent, "Absent characters share too"),
    h(
      "div",
      { class: "row" },
      h(
        "button",
        {
          class: "button plain",
          title: "Milestone levelling: everyone at the table goes up a level now",
          onClick: async () => {
            for (const c of s.present) await attempt(() => api.levelUp(c, null, {}));
            notice("Everyone at the table went up a level. Check their new features in the Party tab.", "green", undefined, 6000);
          },
        },
        "Everyone levels up",
      ),
    ),
    h("h3", null, "Made up tonight"),
    newThings.length
      ? h(
          "ul",
          { class: "bin-list" },
          newThings.map((t) => {
            const keep = h("input", { type: "checkbox", checked: true });
            keep.addEventListener("change", () => (keep.checked ? remove.delete(t.id) : remove.add(t.id)));
            return h("li", null, h("label", { class: "check" }, keep, `Keep ${t.name}`), h("span", { class: "muted small" }, t.what));
          }),
        )
      : h("p", { class: "muted small" }, "Nothing new was made during the session."),
    h("p", { class: "muted small" }, "The session's log stays with its journal page. Loot: drag items onto characters in the Party tool."),
  );
  const ok = h("button", { class: "button primary" }, "Wrap up");
  ok.addEventListener("click", async () => {
    if ((await attempt(() => api.wrapUp({ xpEach: Number(xp.value) || 0, to, remove: [...remove] }))) === undefined) return;
    d.close();
    notice(`${s.title} is wrapped up.`, "green", undefined, 5000);
    await ctx.refresh();
  });
  d.footer.replaceChildren(h("button", { class: "button plain", onClick: () => d.close() }, "Not yet"), ok);
}

/** Beings, items and lore pages made since the night began: the improvised innkeeper. */
async function madeTonight(since: number): Promise<{ id: string; name: string; what: string }[]> {
  return (await attempt(() => api.madeSince(since))) ?? [];
}

export type { DeskCtx, TableMeta, TableView };
