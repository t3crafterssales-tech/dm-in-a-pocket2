// The in-world clock and timers (version 2). The date and time in the world, day or night, moons,
// season and holidays, with buttons to move time on: torches burn down, conditions run out,
// repeating timers roll their tables. Timers count rounds, world time, repeat, or real time (a
// countdown on screen with a chime, which the DM can pause).

import type { Calendar, Timer } from "../../app/backend.ts";
import { api } from "../api.ts";
import { attempt } from "../common.ts";
import { notice, openDialog } from "../dialogs.ts";
import { h } from "../dom.ts";
import { clockText } from "../desk.ts";
import type { DeskCtx } from "./registry.ts";

const STEPS: [string, number][] = [
  ["+10 min", 10],
  ["+1 hour", 60],
  ["+8 hours", 480],
  ["+1 day", 1440],
];

export async function clockTool(ctx: DeskCtx): Promise<HTMLElement> {
  const s = ctx.data.session;
  const d = ctx.data.date;
  const ro = ctx.view.readOnly || !s;
  const move = async (minutes: number) => {
    const r = await attempt(() => api.advanceClock(minutes));
    if (r?.fired.length) notice(r.fired.map((f) => (f.roll ? `${f.name}: ${f.roll}` : `${f.name} ran out`)).join(". "), "yellow", undefined, 8000);
    await ctx.refresh();
  };
  const face = h(
    "div",
    { class: `clock-face ${d.daylight ? "day" : "night"}` },
    h("div", { class: "clock-sky" }, d.daylight ? "☀️" : "🌙"),
    h("div", null, h("div", { class: "clock-time" }, d.time), h("div", { class: "small" }, d.text), h("div", { class: "muted tiny" }, [d.season, d.holiday ? `🎉 ${d.holiday}` : null, ...d.moons.map((m) => `${m.name}: ${m.phase}`)].filter(Boolean).join(" · "))),
  );
  const buttons = ro
    ? null
    : h(
        "div",
        { class: "inline clock-steps" },
        STEPS.map(([l, m]) => h("button", { class: "button plain small-button", onClick: () => void move(m) }, l)),
        h("button", { class: "button plain small-button", title: "Everyone at the table: trackers refill, an hour passes", onClick: async () => ((await attempt(() => api.partyRest("short rest"))) && (notice("Short rest: an hour passed.", "green", undefined, 3000), await ctx.refresh())) }, "Short rest"),
        h("button", { class: "button plain small-button", title: "Everyone at the table: hit points and trackers refill, 8 hours pass", onClick: async () => ((await attempt(() => api.partyRest("long rest"))) && (notice("Long rest: 8 hours passed.", "green", undefined, 3000), await ctx.refresh())) }, "Long rest"),
      );
  const timers = s?.timers ?? [];
  const list = timers.length
    ? h(
        "ul",
        { class: "timer-list" },
        timers.map((t) => {
          const left =
            t.kind === "real"
              ? t.paused
                ? h("span", { class: "timer-left" }, clockText(t.remaining ?? 0), " (paused)")
                : h("span", { class: "timer-left", "data-ends": String(t.endsAt ?? 0), "data-sound": t.sound ? "1" : "0", "data-name": t.name }, clockText(Math.max(0, (t.endsAt ?? 0) - Date.now())))
              : h("span", { class: "timer-left" }, t.kind === "rounds" ? `${t.left} round${t.left === 1 ? "" : "s"}` : t.kind === "repeat" ? `next in ${Math.ceil(t.left)} min, every ${t.every}` : `${Math.ceil(t.left)} min`);
          return h(
            "li",
            { class: `timer kind-${t.kind}` },
            h("span", { class: "timer-icon" }, { rounds: "⚔", world: "🕯", repeat: "🔁", real: "⏱" }[t.kind]),
            h("span", { class: "timer-name" }, t.name, t.dmOnly ? h("span", { class: "muted tiny" }, " DM only") : null),
            left,
            ro || t.kind !== "real" ? null : h("button", { class: "link small", onClick: async () => ((await attempt(() => api.setTimer(t.id, { paused: !t.paused }))) && (await ctx.refresh())) }, t.paused ? "Go" : "Pause"),
            ro ? null : h("button", { class: "icon-button", title: "Stop the timer", onClick: async () => ((await attempt(() => api.setTimer(t.id, null))) && (await ctx.refresh())) }, "×"),
          );
        }),
      )
    : h("p", { class: "muted small" }, s ? "No timers. A torch, a ritual, a collapsing bridge…" : "Begin a session to run the clock.");
  return h("div", { class: "clock-tool" }, face, buttons, h("div", { class: "field-label spaced" }, "Timers"), list, ro ? null : h("button", { class: "link small", onClick: () => void addTimer(ctx) }, "+ Timer"));
}

async function addTimer(ctx: DeskCtx) {
  const tables = ((await attempt(() => api.codex())) ?? []).find((sec) => sec.key === "tables")?.entries ?? [];
  const d = openDialog("New timer");
  const name = h("input", { class: "text-input", placeholder: "Torch, The ritual, Wandering monsters", "aria-label": "Name" });
  const kind = h("select", { class: "text-input select", "aria-label": "Kind" }, [
    ["world", "World time: minutes on the in-world clock (a torch burns for 60)"],
    ["rounds", "Rounds: ticks with initiative (the ritual finishes in 3 rounds)"],
    ["repeat", "Repeating: every so many minutes, rolls a table (wandering monsters)"],
    ["real", "Real time: a countdown on screen, with a chime"],
  ].map(([v, l]) => h("option", { value: v }, l)));
  const amount = h("input", { class: "text-input score-input", inputmode: "numeric", value: "60", "aria-label": "How long" });
  const unit = h("span", { class: "muted small" }, "minutes");
  const table = h("select", { class: "text-input select", "aria-label": "Roll on" }, h("option", { value: "" }, "No table"), tables.map((t) => h("option", { value: t.id }, t.name)));
  const dmOnly = h("input", { type: "checkbox" });
  const sound = h("input", { type: "checkbox", checked: true });
  kind.addEventListener("change", () => (unit.textContent = kind.value === "rounds" ? "rounds" : kind.value === "repeat" ? "minutes between" : kind.value === "real" ? "real minutes" : "minutes"));
  d.body.replaceChildren(h("label", { class: "field-label" }, "Name"), name, h("label", { class: "field-label spaced" }, "Kind"), kind, h("div", { class: "inline spaced" }, amount, unit), h("label", { class: "field-label spaced" }, "Roll on a table when it goes (repeating timers)"), table, h("label", { class: "check spaced" }, dmOnly, "DM only"), h("label", { class: "check" }, sound, "Chime when it runs out (real time)"));
  const ok = h("button", { class: "button primary" }, "Start");
  ok.addEventListener("click", async () => {
    const n = Math.max(1, Number(amount.value) || 1);
    const t: Omit<Timer, "id"> = { name: name.value.trim() || "Timer", kind: kind.value as Timer["kind"], left: n, every: kind.value === "repeat" ? n : 0, table: table.value || null, endsAt: null, paused: false, remaining: null, sound: sound.checked, dmOnly: dmOnly.checked };
    if ((await attempt(() => api.addTimer(t))) !== undefined) {
      d.close();
      await ctx.refresh();
    }
  });
  d.footer.replaceChildren(h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"), ok);
  name.focus();
}

/** The gear: the world's calendar (months, weekdays, holidays, moons, seasons with weather tables). */
export async function clockGear(ctx: DeskCtx) {
  const cal: Calendar = structuredClone(ctx.data.calendar);
  const tables = ((await attempt(() => api.codex())) ?? []).find((sec) => sec.key === "tables")?.entries ?? [];
  const d = openDialog("The calendar", { wide: true });
  const lines = (v: string[]) => v.join("\n");
  const months = h("textarea", { class: "text-input", rows: 6, "aria-label": "Months" }, lines(cal.months.map((m) => `${m.name}, ${m.days}`)));
  const days = h("textarea", { class: "text-input", rows: 3, "aria-label": "Weekdays" }, lines(cal.weekdays));
  const holidays = h("textarea", { class: "text-input", rows: 3, "aria-label": "Holidays" }, lines(cal.holidays.map((x) => `${x.month}/${x.day} ${x.name}`)));
  const moons = h("textarea", { class: "text-input", rows: 2, "aria-label": "Moons" }, lines(cal.moons.map((m) => `${m.name}, ${m.cycle}`)));
  const seasons = h("textarea", { class: "text-input", rows: 4, "aria-label": "Seasons" }, lines(cal.seasons.map((x) => `${x.month}/${x.day} ${x.name}${x.weather ? ` | ${tables.find((t) => t.id === x.weather)?.name ?? ""}` : ""}`)));
  const year = h("input", { class: "text-input score-input", inputmode: "numeric", value: String(cal.year), "aria-label": "Starting year" });
  d.body.replaceChildren(
    h("p", { class: "muted small" }, "One per line. The calendar is a rule in this world (or system), so it flows down like everything else. Leave it plain for numbered months and days."),
    h("div", { class: "cal-grid" },
      h("label", null, h("span", { class: "field-label" }, "Months (name, days)"), months),
      h("label", null, h("span", { class: "field-label" }, "Weekdays"), days),
      h("label", null, h("span", { class: "field-label" }, "Holidays (month/day name)"), holidays),
      h("label", null, h("span", { class: "field-label" }, "Moons (name, days in a cycle)"), moons),
      h("label", null, h("span", { class: "field-label" }, "Seasons (month/day name | weather table)"), seasons),
      h("label", null, h("span", { class: "field-label" }, "Year the game starts in"), year),
    ),
    h("p", { class: "muted small" }, `Weather tables you can name: ${tables.map((t) => t.name).join(", ") || "make a roll table first (Lore tab)"}.`),
  );
  const ok = h("button", { class: "button primary" }, "Save the calendar");
  ok.addEventListener("click", async () => {
    const split = (t: string) => t.split("\n").map((x) => x.trim()).filter(Boolean);
    const md = (x: string) => {
      const m = /^(\d+)\s*\/\s*(\d+)\s+(.+)$/.exec(x);
      return m ? { month: Number(m[1]), day: Number(m[2]), rest: m[3]!.trim() } : null;
    };
    const next = {
      months: split(months.value).map((x) => ({ name: x.split(",")[0]!.trim(), days: Number(x.split(",")[1]) || 30 })),
      weekdays: split(days.value),
      holidays: split(holidays.value).flatMap((x) => (md(x) ? [{ month: md(x)!.month, day: md(x)!.day, name: md(x)!.rest }] : [])),
      moons: split(moons.value).map((x) => ({ name: x.split(",")[0]!.trim(), cycle: Number(x.split(",")[1]) || 28, offset: 0 })),
      seasons: split(seasons.value).flatMap((x) => {
        const m = md(x);
        if (!m) return [];
        const [nm, wt] = m.rest.split("|").map((y) => y.trim());
        const t = tables.find((tb) => tb.name.toLowerCase() === (wt ?? "").toLowerCase());
        return [{ month: m.month, day: m.day, name: nm!, weather: t ? { link: t.id } : null }];
      }),
      year: Number(year.value) || 1,
    };
    if ((await attempt(() => api.setCalendar(next))) !== undefined) {
      d.close();
      await ctx.refresh();
    }
  });
  d.footer.replaceChildren(h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"), ok);
}
