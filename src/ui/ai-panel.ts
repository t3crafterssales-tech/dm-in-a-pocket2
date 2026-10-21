// The AI panel at the bottom of a world or system: one prompt line until clicked, then the
// conversation. "Working on" above the prompt says what a request is about (the thing open in the
// editor, or the whole world) and can be clicked to change. The AI's proposals show as a list of
// changes with Accept and Reject; nothing changes before Accept. Also the AI part of Settings and
// the World Notes.

import type { AiStatus } from "../app/backend.ts";
import type { AiView } from "../app/ai/assistant.ts";
import { api } from "./api.ts";
import { attempt } from "./common.ts";
import { ask, notice, openDialog } from "./dialogs.ts";
import { h, svg } from "./dom.ts";
import { ICONS } from "./icons.ts";
import type { PlaceCtx } from "./place.ts";

interface PanelState {
  open: boolean;
  draft: string;
  busy: boolean;
  /** True when the user switched Working on to the whole world. */
  whole: boolean;
  /** The flag the last proposal answers (Ask AI), for "Show me other ideas". */
  flagKey: string | null;
  /** Check for errors is running. */
  checking: boolean;
}
const states = new Map<string, PanelState>();
const stateFor = (id: string) => {
  let s = states.get(id);
  if (!s) states.set(id, (s = { open: false, draft: "", busy: false, whole: false, flagKey: null, checking: false }));
  return s;
};

export async function aiPanel(ctx: PlaceCtx, selectedName: string | null): Promise<HTMLElement> {
  const st = stateFor(ctx.view.id);
  const status = await attempt(() => api.aiStatus());
  const view = st.open ? await attempt(() => api.aiView()) : null;
  const place = ctx.view.type;
  const target = !st.whole && ctx.selected && selectedName ? { id: ctx.selected, name: selectedName } : null;

  const workingOn = h(
    "button",
    { class: "working-on", title: "Click to change what the AI works on", onClick: () => ((st.whole = !st.whole), void ctx.refresh()) },
    "Working on: ",
    h("strong", null, target ? target.name : `whole ${place}`),
    ctx.selected && selectedName ? h("span", { class: "muted small" }, st.whole ? ` (click for ${selectedName})` : ` (click for the whole ${place})`) : null,
  );

  const unavailable = !status?.hasKey ? "Add your Claude API key to use the AI. Everything else works without it." : !status.online ? "Offline: the AI needs the internet. Everything else works as normal." : null;
  const input = h("input", { class: "text-input ai-input", placeholder: unavailable ? "" : target ? `Ask the AI about ${target.name}…` : "Ask the AI…", value: st.draft, "data-key": "ai-prompt", disabled: !!unavailable || st.busy || !!view?.waiting, "aria-label": "Ask the AI" });
  input.addEventListener("input", () => (st.draft = input.value));
  input.addEventListener("focus", () => {
    if (!st.open) {
      st.open = true;
      void ctx.refresh();
    }
  });
  const send = async (confirmed = false) => {
    const prompt = st.draft.trim();
    if (!prompt || st.busy) return;
    st.busy = true;
    st.open = true;
    void ctx.refresh();
    try {
      const r = await api.aiAsk(prompt, target?.id ?? null, confirmed);
      if (r.status === "estimate") {
        st.busy = false;
        const go = await ask("This could cost more than usual", [r.estimate, "Small jobs just run; this one is over the cost warning set in Settings."], [
          { label: "Cancel", value: false },
          { label: "Go ahead", value: true, kind: "primary" },
        ]);
        if (go) return send(true);
      } else st.draft = "";
    } catch (e) {
      // All or nothing: a failed job changes nothing, and says so.
      notice(e instanceof Error ? e.message : String(e), "blue", undefined, 9000);
    } finally {
      st.busy = false;
      await ctx.refresh();
    }
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void send();
    } else if (e.key === "Escape" && st.open) {
      st.open = false;
      void ctx.refresh();
    }
  });

  const button = unavailable
    ? !status?.hasKey
      ? h("button", { class: "button primary small-button", onClick: () => void showAiSettings(() => ctx.refresh()) }, "Add key…")
      : h("span", { class: "chip" }, "Offline")
    : h("button", { class: "button primary small-button", disabled: st.busy || !!view?.waiting, onClick: () => void send() }, st.busy ? "Thinking…" : "Ask");

  const bar = h(
    "div",
    { class: "ai-bar" },
    svg(ICONS.spark),
    h("div", { class: "ai-line" }, workingOn, h("div", { class: "ai-prompt" }, input, button)),
    h("span", { class: "muted small ai-spent", title: "What the AI has cost this month, worked out from what Claude reports" }, status?.spent ?? ""),
    h("button", { class: "icon-button", title: st.open ? "Hide the conversation" : "Show the conversation", "aria-label": st.open ? "Hide the conversation" : "Show the conversation", onClick: () => ((st.open = !st.open), void ctx.refresh()) }, svg(ICONS.chevron)),
  );
  const tip = status?.tip && !unavailable ? liveTip(ctx) : null;
  if (!st.open) return h("section", { class: "ai-panel closed", "aria-label": "AI" }, bar, unavailable ? h("p", { class: "muted small ai-note" }, unavailable) : null, tip);

  return h(
    "section",
    { class: "ai-panel open", "aria-label": "AI" },
    bar,
    unavailable ? h("p", { class: "muted small ai-note" }, unavailable) : null,
    tip,
    conversation(view, ctx, st),
    view?.build ? buildStrip(view, ctx, st) : null,
    h(
      "div",
      { class: "ai-tools" },
      h("button", { class: "button plain small-button", onClick: () => void showWorldNotes(ctx, !unavailable) }, "World Notes"),
      h(
        "button",
        {
          class: "button plain small-button",
          disabled: !!unavailable || st.busy || !!view?.waiting || !!view?.build || ctx.view.readOnly,
          title: "The AI reads a document you wrote (.txt, .md or Word) and builds what it describes, part by part",
          onClick: async () => {
            const v = await attempt(() => api.aiFromDocument());
            if (v) await runBuildStep(ctx, st);
          },
        },
        "Create from a document…",
      ),
      h("button", { class: "button plain small-button", disabled: !!unavailable || st.busy || !!view?.waiting || !!view?.build || ctx.view.readOnly, title: "Describe a game in a sentence; the AI builds it section by section", onClick: () => void showGenerate(ctx, st) }, "Generate a whole system…"),
      h(
        "button",
        {
          class: "button plain small-button",
          disabled: !view?.chat.length || st.busy,
          onClick: async () => {
            const sure = await ask("Clear the conversation?", ["The AI forgets the chat, but keeps the World Notes. Changes you accepted stay, and can still be undone."], [
              { label: "Cancel", value: false },
              { label: "Clear it", value: true, kind: "danger" },
            ]);
            if (sure && (await attempt(() => api.clearAiChat()))) void ctx.refresh();
          },
        },
        "Clear chat",
      ),
      h("span", { class: "muted small" }, status ? `Model: ${status.model === "auto" ? "Automatic" : status.model === "quick" ? status.models.quick : status.models.careful}` : ""),
    ),
  );
}

function conversation(view: AiView | null | undefined, ctx: PlaceCtx, st: PanelState): HTMLElement {
  const box = h("div", { class: "ai-chat" });
  // The newest message is at the bottom, like any chat.
  requestAnimationFrame(() => (box.scrollTop = box.scrollHeight));
  if (!view || !view.chat.length) {
    box.append(h("p", { class: "muted small" }, 'Ask for changes in plain words: "All swords use Dexterity", "Make a cave spider for challenge 1/2", or "Give the Goblin a sneakier description". You see every change before anything happens.'));
    return box;
  }
  view.chat.forEach((c, i) => {
    if (c.role === "user") return box.append(h("div", { class: "ai-msg user" }, c.text));
    const last = i === view.chat.length - 1;
    const card = h(
      "div",
      { class: `ai-msg ai${c.status ? ` ${c.status}` : ""}` },
      h("p", null, c.text),
      c.lines?.length ? h("ul", { class: "ai-changes" }, c.lines.map((l) => h("li", null, l))) : null,
      c.suggestions?.length ? h("ul", { class: "ai-suggest" }, c.suggestions.map((l) => h("li", null, l, h("span", { class: "muted small" }, " Only you can delete things."))) ) : null,
      c.status === "accepted" ? h("p", { class: "muted small" }, "Accepted. Ctrl+Z or History can undo it.") : null,
      c.status === "rejected" ? h("p", { class: "muted small" }, "Rejected: nothing was changed.") : null,
      c.costUsd !== undefined ? h("p", { class: "muted small ai-cost" }, `${c.model ?? ""} · ${c.costUsd < 0.01 ? "under 1 cent" : `$${c.costUsd.toFixed(2)}`}`) : null,
    );
    if (last && c.status === "waiting" && view.waiting) {
      card.append(
        h(
          "div",
          { class: "ai-actions" },
          h(
            "button",
            {
              class: "button primary small-button",
              disabled: ctx.view.readOnly,
              onClick: async () => {
                const r = await attempt(() => api.aiAccept());
                if (r) notice(`Done: ${r.label}.`, "green", { label: "Undo", run: () => void attempt(() => api.undo()).then(() => ctx.refresh()) }, 6000);
                await ctx.refresh();
              },
            },
            "Accept",
          ),
          h("button", { class: "button plain small-button", onClick: async () => ((st.flagKey = null), await attempt(() => api.aiReject()), await ctx.refresh()) }, "Reject"),
          st.flagKey
            ? h(
                "button",
                {
                  class: "button plain small-button",
                  onClick: async () => {
                    await attempt(() => api.aiReject());
                    await askAiAboutFlag(ctx, st.flagKey!, true);
                  },
                },
                "Show me other ideas",
              )
            : null,
        ),
      );
    }
    box.append(card);
  });
  if (st.busy) box.append(h("div", { class: "ai-msg ai thinking" }, st.checking ? "Checking for errors…" : "Thinking…"));
  return box;
}

/** A job done section by section: where it is, and the buttons to go on or stop. */
function buildStrip(view: AiView, ctx: PlaceCtx, st: PanelState): HTMLElement {
  const b = view.build!;
  return h(
    "div",
    { class: "ai-build" },
    h("strong", null, b.title),
    h("span", { class: "muted small" }, ` ${b.done} of ${b.total} section${b.total === 1 ? "" : "s"} done. Next: ${b.next ?? "nothing"}.`),
    h("span", { class: "spacer" }),
    view.waiting ? h("span", { class: "muted small" }, "Accept or reject this section first.") : h("button", { class: "button primary small-button", disabled: st.busy, onClick: () => void runBuildStep(ctx, st) }, "Build next section"),
    h("button", { class: "button plain small-button", disabled: st.busy, onClick: async () => (await attempt(() => api.aiBuildStop()), await ctx.refresh()) }, "Stop"),
  );
}

async function runBuildStep(ctx: PlaceCtx, st: PanelState, confirmed = false): Promise<void> {
  st.open = true;
  st.busy = true;
  await ctx.refresh();
  try {
    const r = await api.aiBuildNext(confirmed);
    if (r.status === "estimate") {
      st.busy = false;
      const go = await ask("This section could cost more than usual", [r.estimate, "Each section shows what it will build before anything changes, so you can stop at any point."], [
        { label: "Cancel", value: false },
        { label: "Go ahead", value: true, kind: "primary" },
      ]);
      if (go) return runBuildStep(ctx, st, true);
    }
  } catch (e) {
    notice(e instanceof Error ? e.message : String(e), "blue", undefined, 9000);
  } finally {
    st.busy = false;
    await ctx.refresh();
  }
}

function showGenerate(ctx: PlaceCtx, st: PanelState) {
  const d = openDialog("Generate a whole system");
  const idea = h("textarea", { class: "text-input notes-box", rows: 4, placeholder: "For example: a cyberpunk game where hackers and street samurai roll pools of d6s, gritty and fast" });
  d.body.append(
    h("p", { class: "muted" }, "Describe the game in a sentence or two. The AI builds it in seven sections (the core check and abilities, resources and conditions, skills, rules of play, monsters, equipment, lore). You see each section and its cost before anything changes, and you can stop at any point."),
    idea,
  );
  d.footer.replaceChildren(
    h("span", { class: "spacer" }),
    h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"),
    h(
      "button",
      {
        class: "button primary",
        onClick: async () => {
          if (!(await attempt(() => Promise.resolve(api.aiGenerate(idea.value))))) return;
          d.close();
          await runBuildStep(ctx, st);
        },
      },
      "Start",
    ),
  );
}

function liveTip(ctx: PlaceCtx): HTMLElement {
  return h(
    "p",
    { class: "small ai-note ai-tip" },
    h("strong", null, "Tip: "),
    "Live AI checking can look over each change as you make it, a few seconds after you stop, using the quick model. It costs a little each time, so it starts off. ",
    h("button", { class: "link small", onClick: async () => (await attempt(() => api.setAiLive(true)), notice("Live AI checking is on. Switch it off in Settings → AI.", "green", undefined, 5000), await ctx.refresh()) }, "Turn it on"),
    " · ",
    h("button", { class: "link small", onClick: async () => (await attempt(() => api.dismissAiTip()), await ctx.refresh()) }, "No thanks"),
  );
}

/** Ask AI on a flag: the fix is proposed in the AI panel, like any other request. */
export async function askAiAboutFlag(ctx: PlaceCtx, key: string, other = false) {
  const st = stateFor(ctx.view.id);
  st.open = true;
  st.busy = true;
  st.flagKey = key;
  await ctx.refresh();
  try {
    await api.aiFixFlag(key, other);
  } catch (e) {
    st.flagKey = null;
    notice(e instanceof Error ? e.message : String(e), "blue", undefined, 9000);
  } finally {
    st.busy = false;
    await ctx.refresh();
  }
}

/** Check for errors (the flag panel's spark button). Big checks show their estimate first. */
export async function checkForErrors(ctx: PlaceCtx, confirmed = false): Promise<void> {
  const st = stateFor(ctx.view.id);
  if (st.busy) return;
  st.open = true;
  st.busy = true;
  st.checking = true;
  await ctx.refresh();
  try {
    const r = await api.aiCheck(confirmed);
    if (r.status === "estimate") {
      st.busy = st.checking = false;
      const go = await ask("Check for errors could cost more than usual", [r.estimate, "It looks at your own work and what it needs to compare it with. Switching off some checks in World settings → Checks makes it cheaper."], [
        { label: "Cancel", value: false },
        { label: "Go ahead", value: true, kind: "primary" },
      ]);
      if (go) return checkForErrors(ctx, true);
    } else if (r.nothing) notice("There is nothing of your own to check yet: the starter content is the yardstick.", "blue", undefined, 6000);
    else notice(r.found ? `The AI found ${r.found === 1 ? "1 problem" : `${r.found} problems`}. They are yellow flags in the flag panel.` : "The AI found nothing wrong.", r.found ? "blue" : "green", undefined, 6000);
  } catch (e) {
    notice(e instanceof Error ? e.message : String(e), "blue", undefined, 9000);
  } finally {
    st.busy = st.checking = false;
    await ctx.refresh();
  }
}

/** World Notes: what the AI remembers about this world. Lines you write are pinned and kept. */
async function showWorldNotes(ctx: PlaceCtx, canUpdate: boolean) {
  const view = await attempt(() => api.aiView());
  if (!view) return;
  const d = openDialog("World Notes");
  const box = h("textarea", { class: "text-input notes-box", rows: 12, placeholder: "For example: There is no oxygen in the water.\nThe tone is grim and funny." }, view.notes.map((n) => n.text).join("\n"));
  const pinned = view.notes.filter((n) => n.pinned).length;
  d.body.append(
    h("p", { class: "muted" }, "The AI reads these with the recent chat before every answer, so it remembers this world's tone, important facts and decisions. A line each. Lines you write or change are pinned: the AI never changes them."),
    box,
    h("p", { class: "muted small" }, `${pinned} pinned line${pinned === 1 ? "" : "s"}, ${view.notes.length - pinned} written by the AI.`),
  );
  d.footer.replaceChildren(
    h(
      "button",
      {
        class: "button plain",
        disabled: !canUpdate,
        title: canUpdate ? "A quick, cheap AI job that rewrites only its own lines" : "Needs a key and the internet",
        onClick: async () => {
          d.close();
          notice("Updating the World Notes…", "blue", undefined, 3000);
          const r = await attempt(() => api.updateWorldNotes());
          if (r) stateFor(ctx.view.id).open = true;
          await ctx.refresh();
        },
      },
      "Update world notes",
    ),
    h("span", { class: "spacer" }),
    h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"),
    h(
      "button",
      {
        class: "button primary",
        onClick: async () => {
          if (await attempt(() => api.setWorldNotes(box.value))) d.close();
        },
      },
      "Save",
    ),
  );
}

/** Settings → AI. Used by Settings on the home screen and by the panel's Add key button. */
export function aiSettings(redraw: () => void): HTMLElement {
  const wrap = h("div", { class: "ai-settings" }, h("p", { class: "muted small" }, "Loading…"));
  void (async () => {
    const s = await attempt(() => api.aiStatus());
    if (s) wrap.replaceChildren(...aiSettingsBody(s, redraw));
  })();
  return wrap;
}

function aiSettingsBody(s: AiStatus, redraw: () => void): HTMLElement[] {
  const key = h("input", { class: "text-input", type: "password", placeholder: s.hasKey ? `A key ending …${s.keyEnd} is saved` : "sk-ant-…", autocomplete: "off", "aria-label": "Claude API key" });
  const save = h("button", { class: "button primary", onClick: async () => (await attempt(() => api.setAiKey(key.value))) && (notice("Key saved, in this computer's protected storage.", "green", undefined, 5000), redraw()) }, "Save key");
  const remove = s.hasKey ? h("button", { class: "button plain", onClick: async () => (await attempt(() => api.setAiKey(null))) && (notice("The key was removed from this computer.", "green", undefined, 4000), redraw()) }, "Remove key") : null;
  const model = h(
    "select",
    { class: "text-input", "aria-label": "Model" },
    h("option", { value: "auto", selected: s.model === "auto" }, "Automatic: quick for small edits and checks, careful for big jobs"),
    h("option", { value: "quick", selected: s.model === "quick" }, `Always quick: ${s.models.quick}`),
    h("option", { value: "careful", selected: s.model === "careful" }, `Always careful: ${s.models.careful}`),
  );
  model.addEventListener("change", () => void attempt(() => api.setAiOptions({ model: model.value as AiStatus["model"] })));
  const threshold = h("input", { class: "text-input number-input", type: "number", min: 0, step: 0.1, value: String(s.threshold), "aria-label": "Cost warning in dollars" });
  const live = h("input", { type: "checkbox", checked: s.live });
  live.addEventListener("change", () => void attempt(() => api.setAiLive(live.checked)));
  threshold.addEventListener("change", () => void attempt(() => api.setAiOptions({ threshold: Number(threshold.value) })));
  return [
    h("p", { class: "muted" }, "The AI is optional and you pay for it yourself through a Claude API key, which is separate from a Claude subscription. Get one at console.anthropic.com (Billing to add credit, then API Keys → Create Key). The key stays on this computer, in its protected storage, and is never put in a world file."),
    h("div", { class: "row" }, key, save, remove),
    h("label", { class: "field-label spaced" }, "Model"),
    model,
    h("label", { class: "field-label spaced" }, "Warn me before a job that may cost more than ($)"),
    threshold,
    h("label", { class: "check spaced" }, live, "Live AI checking: the AI checks each change as you make it (with the quick model; a little cost each time)"),
    h("p", { class: "muted small" }, `Small jobs just run. ${s.spent}, worked out from what Claude reports. Your Anthropic account shows the real bill.`),
  ];
}

export async function showAiSettings(then?: () => void) {
  const d = openDialog("AI settings", { onClose: then });
  const draw = () => d.body.replaceChildren(aiSettings(draw));
  draw();
  d.footer.replaceChildren(h("span", { class: "spacer" }), h("button", { class: "button primary", onClick: () => d.close() }, "Done"));
}
