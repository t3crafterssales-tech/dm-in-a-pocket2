// Chat and log (version 2). The chat holds messages and every roll ("Rob rolled 14", with the
// breakdown a click away); the session log keeps only what matters: fights, characters dropping,
// rewards, conditions, things shown. Each kind of log line can be switched off in the gear.

import type { ChatLine } from "../../app/backend.ts";
import { api } from "../api.ts";
import { attempt } from "../common.ts";
import { openDialog } from "../dialogs.ts";
import { h } from "../dom.ts";
import type { DeskCtx } from "./registry.ts";

let view: "chat" | "log" = "chat";
let ic = false;
let draft = "";

const LOG_KINDS: [string, string][] = [
  ["fight", "Fights started and ended"],
  ["drop", "Characters and monsters dropping"],
  ["reward", "Rewards and experience"],
  ["condition", "Conditions"],
  ["shown", "Things shown to players, and to whom"],
  ["roll", "Roll table results"],
  ["rest", "Rests"],
  ["clock", "Time passing"],
  ["weather", "New days and weather"],
  ["note", "Timers and notes"],
  ["join", "Who's at the table"],
];

const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function chatLine(c: ChatLine): HTMLElement {
  const seen = c.see === "public" ? "" : c.see === "private" ? " (private)" : c.see === "dm" ? " (DM only)" : " (blind)";
  return h(
    "li",
    { class: `chat-line kind-${c.kind}${c.ic ? " in-character" : ""}`, style: `--who:${c.color}` },
    h("span", { class: "chat-who" }, c.who),
    c.kind === "whisper" ? h("span", { class: "muted tiny" }, ` whispers to ${c.to.join(", ")}`) : null,
    c.roll
      ? h(
          "details",
          { class: "chat-roll" },
          h("summary", null, " ", h("span", null, c.text.replace(/^(.*?)(\d+)(\D*)$/, "$1")), h("strong", { class: "chat-total" }, String(c.roll.total)), c.text.replace(/^.*?\d+(\D*)$/, "$1"), h("span", { class: "muted tiny" }, seen)),
          h("div", { class: "muted small" }, `${c.roll.formula}: ${c.roll.breakdown}`),
        )
      : h("span", { class: "chat-text" }, " ", c.text, h("span", { class: "muted tiny" }, seen)),
    h("span", { class: "chat-time muted tiny" }, time(c.time)),
  );
}

export async function logTool(ctx: DeskCtx): Promise<HTMLElement> {
  const switcher = h(
    "div",
    { class: "switch" },
    h("button", { class: `switch-button${view === "chat" ? " active" : ""}`, onClick: () => ((view = "chat"), void ctx.refresh()) }, "Chat"),
    h("button", { class: `switch-button${view === "log" ? " active" : ""}`, onClick: () => ((view = "log"), void ctx.refresh()) }, "Session log"),
  );
  if (view === "log") {
    const off = new Set<string>((ctx.settings("log").off as string[] | undefined) ?? []);
    const lines = (ctx.data.session?.log ?? []).filter((l) => !off.has(l.kind));
    const note = h("input", { class: "text-input", placeholder: "Add a note to the log…", "aria-label": "Note", "data-key": "log-note" });
    note.addEventListener("keydown", async (e) => {
      if (e.key !== "Enter" || !note.value.trim()) return;
      if ((await attempt(() => api.addLog("note", note.value.trim()))) !== undefined) await ctx.refresh();
    });
    return h(
      "div",
      { class: "log-tool" },
      switcher,
      lines.length ? h("ol", { class: "log-lines", "data-scroll": "log-lines" }, lines.map((l) => h("li", { class: `log-line kind-${l.kind}` }, h("span", { class: "muted tiny" }, time(l.time)), " ", l.text))) : h("p", { class: "muted small" }, ctx.data.session ? "Nothing yet. Fights, drops, rewards and conditions write themselves here." : "Begin a session to start its log."),
      ctx.data.session && !ctx.view.readOnly ? note : null,
    );
  }
  const chat = ctx.meta.chat.slice(-200);
  const box = h("input", { class: "text-input", value: draft, placeholder: ic ? "Say it in character…" : "Type to the table…", "aria-label": "Message", "data-key": "chat-input" });
  box.addEventListener("input", () => (draft = box.value));
  const send = async () => {
    const text = box.value.trim();
    if (!text) return;
    // "/r 2d6+3" rolls, like most virtual tabletops.
    const roll = /^\/r(?:oll)?\s+(.+)$/i.exec(text);
    const who = (ctx.settings("dice").name as string | undefined) ?? "DM";
    const color = (ctx.settings("dice").color as string | undefined) ?? "#b93a2e";
    const ok = roll ? await attempt(() => api.rollDice({ formula: roll[1]!, who, color, see: "public" })) : await attempt(() => api.postChat({ kind: "chat", who, color, see: "public", to: [], text, roll: null, ic }));
    if (ok) {
      draft = "";
      await ctx.refresh();
    }
  };
  box.addEventListener("keydown", (e) => e.key === "Enter" && void send());
  const icTick = h("input", { type: "checkbox", checked: ic });
  icTick.addEventListener("change", () => ((ic = icTick.checked), void ctx.refresh()));
  const list = h("ol", { class: "chat-lines", "data-scroll": "chat-lines" }, chat.length ? chat.map(chatLine) : [h("li", { class: "muted small" }, "Rolls and messages show here. Type /r 2d6+3 to roll.")]);
  requestAnimationFrame(() => (list.scrollTop = list.scrollHeight));
  return h("div", { class: "log-tool" }, switcher, list, h("div", { class: "inline" }, box, h("button", { class: "button primary small-button", onClick: () => void send() }, "Send")), h("label", { class: "check small" }, icTick, "In character"));
}

export async function logGear(ctx: DeskCtx) {
  const d = openDialog("What the session log keeps");
  const off = new Set<string>((ctx.settings("log").off as string[] | undefined) ?? []);
  d.body.replaceChildren(
    h("p", { class: "muted small" }, "Only what matters goes in the log, never every dice roll. Untick a kind to hide it."),
    ...LOG_KINDS.map(([k, label]) => {
      const b = h("input", { type: "checkbox", checked: !off.has(k) });
      b.addEventListener("change", () => {
        b.checked ? off.delete(k) : off.add(k);
        void ctx.setSettings("log", { off: [...off] });
      });
      return h("label", { class: "check" }, b, label);
    }),
  );
  d.footer.replaceChildren(h("button", { class: "button primary", onClick: () => d.close() }, "Done"));
}
