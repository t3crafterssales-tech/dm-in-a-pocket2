// The Party tab (version 2): the world's roster of player characters on the right (a module
// borrows its world's), and the open character's sheet in the middle. The sheet is built from the
// game: its scores, the race's and class's features up to the character's level, the game's
// trackers (Inspiration) and the player's own. Empty things are simply not shown.

import type { CharacterView, RosterEntry, SheetDesign, TrackerView } from "../app/backend.ts";
import { api, pictureUrl } from "./api.ts";
import { attempt } from "./common.ts";
import { ask, notice, openDialog } from "./dialogs.ts";
import { h, svg } from "./dom.ts";
import { ICONS } from "./icons.ts";
import { DRAG_TYPE } from "./library-panel.ts";
import { NODE_DRAG, codexPanel } from "./codex-panel.ts";
import { askText, stepper } from "./pickers.ts";
import { openBuilder } from "./character-builder.ts";
import type { PlaceCtx } from "./place.ts";
import { playersSection } from "./players-panel.ts";
import { designerPanel, isDesigning, startDesigning } from "./sheet-designer.ts";

let side: "party" | "codex" = "party";
/** Characters whose Appearance is folded open. */
const openAppearance = new Set<string>();

export async function partyPanels(ctx: PlaceCtx): Promise<{ list: HTMLElement; editor: HTMLElement }> {
  const list = (await attempt(() => api.roster())) ?? [];
  let view: CharacterView | null = null;
  if (ctx.selected && list.some((c) => c.id === ctx.selected)) view = (await attempt(() => api.characterView(ctx.selected!))) ?? null;
  const design = view ? ((await attempt(() => api.sheetDesign(view!.id))) ?? null) : null;
  const editor = view ? (design && isDesigning(view.id) ? await designerPanel(view, design, ctx) : sheet(view, ctx, design)) : await overview(list, ctx);
  const switcher = h(
    "div",
    { class: "switch", role: "tablist", "aria-label": "Show" },
    h("button", { class: `switch-button${side === "party" ? " active" : ""}`, role: "tab", onClick: () => ((side = "party"), void ctx.refresh()) }, "Party"),
    h("button", { class: `switch-button${side === "codex" ? " active" : ""}`, role: "tab", onClick: () => ((side = "codex"), void ctx.refresh()) }, "Codex"),
  );
  const side_ = side === "codex" ? h("div", { class: "codex adventure-side" }, h("div", { class: "pad tight" }, switcher), await codexPanel(ctx)) : rosterPanel(list, switcher, ctx);
  return { list: side_, editor };
}

async function newCharacter(ctx: PlaceCtx) {
  const id = await openBuilder();
  if (id) {
    await ctx.refresh();
    ctx.select(id);
  }
}

function rosterPanel(list: RosterEntry[], switcher: HTMLElement, ctx: PlaceCtx): HTMLElement {
  const ro = ctx.view.readOnly;
  return h(
    "aside",
    { class: "panel list-panel roster", "aria-label": "Party", "data-scroll": "roster" },
    h("div", { class: "panel-head" }, switcher, ro ? null : h("button", { class: "button primary small-button head-button", onClick: () => void newCharacter(ctx) }, svg(ICONS.plus), "Character")),
    h(
      "button",
      { class: `tree-row front-row${ctx.selected === null ? " selected" : ""}`, onClick: () => ctx.select(null) },
      svg(ICONS.users),
      h("span", { class: "tree-name" }, "The whole party"),
    ),
    list.length
      ? h(
          "ul",
          { class: "roster-list" },
          list.map((c) =>
            h(
              "li",
              null,
              h(
                "button",
                { class: `roster-row${c.id === ctx.selected ? " selected" : ""}`, onClick: () => ctx.select(c.id) },
                c.picture ? h("img", { class: "roster-pic", src: pictureUrl(c.picture), alt: "" }) : h("span", { class: "roster-pic empty" }, c.name.slice(0, 1)),
                h("span", { class: "roster-text" }, h("span", { class: "roster-name" }, c.name, c.approved ? null : h("span", { class: "tag warn" }, "Waiting for OK")), h("span", { class: "muted small" }, [c.summary, c.player ? `played by ${c.player}` : ""].filter(Boolean).join(" · "))),
              ),
            ),
          ),
        )
      : h("p", { class: "muted small pad" }, ro ? "No characters." : "No characters yet. Press + Character to make one."),
    h("p", { class: "codex-hint" }, "Everyone who has ever played in this world. A module borrows whoever is at the table."),
  );
}

async function overview(list: RosterEntry[], ctx: PlaceCtx): Promise<HTMLElement> {
  const ro = ctx.view.readOnly;
  const players = ctx.view.type === "system" ? null : await playersSection({ readOnly: ro, refresh: ctx.refresh, roster: list.map((c) => ({ id: c.id, name: c.name, player: c.player })) });
  return h(
    "section",
    { class: "panel editor" },
    h(
      "div",
      { class: "sheet" },
      h("div", { class: "eyebrow" }, ctx.view.type === "system" ? "Pre-made characters" : "The party"),
      h("h2", { class: "sheet-title" }, ctx.view.type === "module" ? `Characters from ${ctx.view.worldName ?? "the world"}` : `The party of ${ctx.view.name}`),
      h("p", { class: "muted" }, ctx.view.type === "module" ? "Characters live in the world, so they can play any of its modules. Ones made here stay with this module." : "Characters live here, in the world's roster, like a guild hall: everyone who has ever played. Each game night, the DM ticks who is at the table."),
      list.length
        ? h(
            "div",
            { class: "party-cards" },
            list.map((c) =>
              h(
                "button",
                { class: "party-card", onClick: () => ctx.select(c.id) },
                c.picture ? h("img", { src: pictureUrl(c.picture), alt: "" }) : h("span", { class: "party-card-letter" }, c.name.slice(0, 1)),
                h("span", { class: "party-card-name" }, c.name),
                h("span", { class: "muted small" }, c.summary),
                c.player ? h("span", { class: "muted small" }, `Played by ${c.player}`) : null,
              ),
            ),
          )
        : null,
      ro ? null : h("div", { class: "sheet-actions" }, h("button", { class: "button primary", onClick: () => void newCharacter(ctx) }, svg(ICONS.plus), "New character")),
      players,
    ),
  );
}

// ---------- The character sheet ----------

function sheet(v: CharacterView, ctx: PlaceCtx, design: SheetDesign | null): HTMLElement {
  const ro = ctx.view.readOnly;
  const save = async (fn: () => Promise<unknown>) => {
    if ((await attempt(fn)) !== undefined) await ctx.refresh();
  };
  const set = (k: string, value: string | number | boolean | null) => save(() => api.setField(v.id, k, value));

  const pic = h("button", { class: `portrait${v.picture ? "" : " empty"}`, disabled: ro, title: "Change the picture" }, v.picture ? h("img", { src: pictureUrl(v.picture), alt: "" }) : [h("span", { class: "portrait-icon" }, "🧙"), h("span", null, "Add picture")]);
  pic.addEventListener("click", async () => {
    const id = await attempt(() => api.pickPicture());
    if (id) await save(() => api.setPicture(v.id, id));
  });
  const name = h("input", { class: "sheet-name", value: v.name, disabled: ro, "aria-label": "Character name", maxlength: 200 });
  name.addEventListener("change", () => name.value.trim() && void save(() => api.rename(v.id, name.value)));
  const player = h("input", { class: "text-input inline-input", value: v.player, disabled: ro, placeholder: "Player", "aria-label": "Player" });
  player.addEventListener("change", () => void set("player", player.value.trim()));
  const summary = [v.race?.name, v.class ? `${v.class.name} ${v.level}` : `Level ${v.level}`, v.background?.name].filter(Boolean).join(" · ");

  const head = h(
    "div",
    { class: "sheet-top-text" },
    name,
    h("div", { class: "inline" }, h("span", { class: "muted small" }, "Played by"), player),
    h("div", { class: "sheet-tags" }, h("span", { class: "tag accent" }, "🧙 Character"), h("span", { class: "tag" }, summary), v.approved ? null : h("span", { class: "tag warn" }, "Waiting for the DM's OK")),
  );

  // Key numbers: hit points now and most, armour, speed, experience, money.
  const hpNow = stepper(v.hpNow, (n) => void set("hpNow", n), { label: "Hit points now", key: "c-hpnow", min: -99, disabled: ro });
  const hpMax = stepper(v.hp, (n) => void set("hp", n), { label: "Most hit points", key: "c-hp", min: 0, disabled: ro });
  const numbers = h(
    "div",
    { class: "char-numbers" },
    box("Hit points", h("div", { class: "inline" }, hpNow, h("span", { class: "muted" }, "of"), hpMax)),
    box("Armour", stepper(v.ac, (n) => void set("ac", n), { label: "Armour", key: "c-ac", disabled: ro })),
    box("Speed", textBox(v.speed, "30 ft.", ro, (t) => void set("speed", t))),
  );
  const xpBox = h("div", { class: "char-numbers" }, box("Experience", stepper(v.xp, (n) => void set("xp", n), { label: "Experience", key: "c-xp", step: 50, disabled: ro })));
  const moneyBox = h("div", { class: "char-numbers" }, box("Money", textBox(v.gold, "15 gp", ro, (t) => void set("gold", t))));

  const scores = v.scores.length
    ? h(
        "div",
        { class: "char-scores" },
        v.scores.map((s) =>
          h(
            "div",
            { class: `char-score${s.score === null ? " missing" : ""}` },
            h("div", { class: "char-score-label" }, s.label),
            h("div", { class: "char-score-bonus" }, s.bonus === null ? "—" : `${s.bonus >= 0 ? "+" : ""}${s.bonus}`),
            stepper(s.score, (n) => void save(() => api.setScore(v.id, s.ability, n)), { label: s.name, key: `c-score-${s.ability}`, min: 0, disabled: ro }),
          ),
        ),
      )
    : null;

  const trackers = h(
    "div",
    { class: "char-section" },
    sectionHead("Trackers", ro ? null : h("button", { class: "link small", onClick: () => void addTracker(v, ctx) }, "+ Add")),
    v.trackers.length ? h("div", { class: "trackers" }, v.trackers.map((t) => tracker(v, t, ro, ctx))) : h("p", { class: "muted small" }, "Torches, arrows, rations, favours owed: add your own. The game's own (like Inspiration) appear by themselves."),
    ro
      ? null
      : h(
          "div",
          { class: "inline" },
          h("button", { class: "button plain small-button", onClick: () => void save(() => api.rest(v.id, "short rest")) }, "Short rest"),
          h("button", { class: "button plain small-button", onClick: () => void save(() => api.rest(v.id, "long rest")) }, "Long rest"),
        ),
  );

  const features = v.features.length
    ? h(
        "div",
        { class: "char-section" },
        sectionHead("Features", null),
        h("ul", { class: "feature-list" }, v.features.map((f) => h("li", null, h("strong", null, f.name), f.level ? h("span", { class: "muted small" }, ` · ${f.from}, level ${f.level}`) : h("span", { class: "muted small" }, ` · ${f.from}`), f.sentence ? h("div", { class: "small" }, f.sentence) : null))),
      )
    : null;

  const choices = v.choices.length
    ? h(
        "div",
        { class: "char-section" },
        sectionHead("Choices", null),
        v.choices.map((c) =>
          h(
            "div",
            { class: "choice-box" },
            h("div", { class: "field-label" }, `${c.from}: choose ${c.pick === 1 ? "one" : c.pick} ${c.label}`),
            h(
              "div",
              { class: "pick-chips" },
              c.options.map((o) => {
                const on = c.picked.includes(o.id);
                return h("button", { class: `pick-chip${on ? " on" : ""}`, disabled: ro, onClick: () => void save(() => api.setChoice(v.id, c.aid, on ? c.picked.filter((x) => x !== o.id) : [...c.picked, o.id].slice(-c.pick))) }, o.name);
              }),
            ),
          ),
        ),
      )
    : null;

  const picsTick = h("input", { type: "checkbox", checked: v.gearPictures, disabled: ro });
  picsTick.addEventListener("change", () => void set("gearPictures", picsTick.checked));
  const gear = h(
    "div",
    { class: "char-section gear-drop" },
    sectionHead("Gear", h("label", { class: "check small" }, picsTick, "Pictures")),
    v.gear.length
      ? h(
          "ul",
          { class: "gear-list" },
          v.gear.map((g) =>
            h(
              "li",
              null,
              v.gearPictures ? (g.picture ? h("img", { class: "gear-pic", src: pictureUrl(g.picture), alt: "" }) : h("span", { class: "gear-pic empty" }, "🎒")) : null,
              g.id ? h("button", { class: "link", onClick: () => void ctx.open(g.id!) }, g.name) : h("span", null, g.name),
              ro ? null : h("button", { class: "icon-button", title: `Remove ${g.name}`, "aria-label": `Remove ${g.name}`, onClick: () => void save(() => api.removeAttachment(v.id, g.aid)) }, svg(ICONS.close)),
            ),
          ),
        )
      : null,
    h("p", { class: "muted small" }, "Drag weapons, armour and gear here from the Codex."),
  );
  dropGear(gear, v, ro, ctx);

  const appearanceShown = v.appearance.filter((a) => a.value);
  const appearance = h(
    "details",
    { class: "fold-out char-section", open: openAppearance.has(v.id) },
    h("summary", null, "Appearance", appearanceShown.length ? h("span", { class: "muted small" }, ` · ${appearanceShown.map((a) => a.value).slice(0, 3).join(", ")}`) : null),
    h(
      "div",
      { class: "appearance-grid" },
      v.appearance.map((a) => h("label", null, h("span", { class: "muted small" }, a.label), textBox(a.value, a.label, ro, (t) => void save(() => api.setAppearance(v.id, a.key, t))))),
      extrasIn(v, "Appearance", ro, save),
    ),
    ro ? null : h("button", { class: "link small", onClick: () => void addExtra(v, "Appearance", ctx) }, "+ Add"),
  );
  appearance.addEventListener("toggle", () => ((appearance as HTMLDetailsElement).open ? openAppearance.add(v.id) : openAppearance.delete(v.id)));

  const sections = [...new Set(v.extras.map((e) => e.section).filter((s) => s !== "Appearance"))];
  if (!sections.includes("Notes")) sections.push("Notes");
  const extras = sections.map((sec) =>
    h("div", { class: "char-section" }, sectionHead(sec, ro ? null : h("button", { class: "link small", onClick: () => void addExtra(v, sec, ctx) }, "+ Add")), h("div", { class: "appearance-grid" }, extrasIn(v, sec, ro, save)), sec === "Notes" && !v.extras.some((e) => e.section === sec) ? h("p", { class: "muted small" }, "Add your own lines: scars, cybernetics, a favourite song, three hair colours.") : null),
  );

  const missing = v.missing.length ? h("div", { class: "char-missing" }, svg(ICONS.spark), h("span", null, "To finish: ", v.missing.join("; "), ".")) : null;

  const actions = ro
    ? null
    : h(
        "div",
        { class: "sheet-actions" },
        v.approved ? null : h("button", { class: "button primary", onClick: () => void set("approved", true) }, "Approve"),
        v.level < 20 ? h("button", { class: "button primary", onClick: () => void levelUp(v, ctx) }, "Level up") : null,
        h("button", { class: "button plain", title: "Move the groups around and choose what prints", onClick: () => (startDesigning(v.id), void ctx.refresh()) }, "Design the sheet"),
        h(
          "button",
          {
            class: "button plain danger-text",
            onClick: async () => {
              const ok = await ask(`Remove ${v.name} from the party?`, [`${v.name} goes to the recycle bin. You can restore them from there.`], [
                { label: "Cancel", value: false },
                { label: "Move to recycle bin", value: true, kind: "danger" },
              ]);
              if (ok && (await attempt(() => api.deleteNode(v.id))) !== undefined) {
                ctx.select(null);
                await ctx.refresh();
              }
            },
          },
          svg(ICONS.trash),
          "Remove",
        ),
      );

  // The groups, placed by the layout: the character's own, one from the Codex, the system's, or the plain one.
  const cells = new Map<string, (HTMLElement | null)[]>([
    ["portrait", [pic]],
    ["name", [head, xpBox]],
    ["combat", [numbers]],
    ["abilities", [scores]],
    ["inventory", [moneyBox, gear]],
    ["trackers", [trackers]],
    ["features", [features, choices]],
    ["appearance", [appearance]],
  ]);
  sections.forEach((sec, i) => cells.set(sec === "Notes" ? "notes" : `section:${sec}`, [extras[i] ?? null]));
  const placed = design?.layout.groups ?? [];
  const order = [...placed, ...[...cells.keys()].filter((id) => !placed.some((g) => g.id === id)).map((id) => ({ id, span: 12 }))];
  const grid = h(
    "div",
    { class: "sheet-grid" },
    order.flatMap((g) => {
      const parts = cells.get(g.id)?.filter((x): x is HTMLElement => !!x);
      return parts?.length ? [h("div", { class: "sheet-cell", "data-group": g.id, style: `--span:${g.span}` }, ...parts)] : [];
    }),
  );

  return h("section", { class: "panel editor", "data-scroll": "character" }, h("div", { class: "sheet char-sheet" }, missing, grid, actions));
}

function box(label: string, control: HTMLElement): HTMLElement {
  return h("div", { class: "char-box" }, h("div", { class: "char-box-label" }, label), control);
}

function sectionHead(title: string, extra: HTMLElement | null): HTMLElement {
  return h("div", { class: "char-section-head" }, h("h3", null, title), extra);
}

function textBox(value: string, placeholder: string, ro: boolean, set: (t: string) => void): HTMLInputElement {
  const b = h("input", { class: "text-input", value, placeholder, disabled: ro, "aria-label": placeholder, maxlength: 200 });
  b.addEventListener("change", () => set(b.value));
  return b;
}

function extrasIn(v: CharacterView, section: string, ro: boolean, save: (fn: () => Promise<unknown>) => Promise<void>): HTMLElement[] {
  return v.extras
    .filter((e) => e.section === section)
    .map((e) =>
      h(
        "label",
        { class: "extra-field" },
        h("span", { class: "muted small" }, e.label, ro ? null : h("button", { class: "link tiny", title: `Remove ${e.label}`, onClick: (ev: MouseEvent) => (ev.preventDefault(), void save(() => api.setExtra(v.id, e.index, null))) }, " ×")),
        textBox(e.value, e.label, ro, (t) => void save(() => api.setExtra(v.id, e.index, { value: t }))),
      ),
    );
}

async function addExtra(v: CharacterView, section: string, ctx: PlaceCtx) {
  const label = await askText(`Add to ${section}`, "", "Name", "For example: Scars, Cybernetics, Favourite song.");
  if (!label) return;
  if ((await attempt(() => api.addExtra(v.id, section, label))) !== undefined) await ctx.refresh();
}

function tracker(v: CharacterView, t: TrackerView, ro: boolean, ctx: PlaceCtx): HTMLElement {
  const set = async (value: number) => {
    if ((await attempt(() => api.setTracker(v.id, t.id, { value }))) !== undefined) await ctx.refresh();
  };
  let body: HTMLElement;
  if (t.look === "boxes" && t.max <= 20) {
    body = h(
      "div",
      { class: "tracker-boxes" },
      Array.from({ length: t.max }, (_, i) => h("button", { class: `tracker-box${i < t.value ? " on" : ""}`, disabled: ro, "aria-label": `${t.name} ${i + 1}`, onClick: () => void set(i < t.value ? i : i + 1) })),
    );
  } else if (t.look === "bar") {
    body = h("div", { class: "tracker-bar-row" }, h("button", { class: "stepper-button", disabled: ro || t.value <= 0, onClick: () => void set(t.value - 1) }, "−"), h("div", { class: "tracker-bar" }, h("div", { class: "tracker-fill", style: `width:${t.max ? Math.round((t.value / t.max) * 100) : 0}%` })), h("span", { class: "small" }, `${t.value}/${t.max}`), h("button", { class: "stepper-button", disabled: ro || t.value >= t.max, onClick: () => void set(t.value + 1) }, "+"));
  } else body = h("div", { class: "inline" }, stepper(t.value, (n) => void set(n), { label: t.name, key: `t-${t.id}`, disabled: ro }), h("span", { class: "muted small" }, `of ${t.max}`));
  const refill = t.refill === "award" ? "the DM awards it" : t.refill === "never" ? "doesn't refill" : `refills each ${t.refill}`;
  return h(
    "div",
    { class: "tracker" },
    h("div", { class: "tracker-head" }, h("strong", null, t.name), h("span", { class: "muted tiny" }, ` ${refill}`), t.refill === "award" && !ro ? h("button", { class: "link small", title: "Award one", onClick: async () => ((await attempt(() => api.award(v.id, t.id))) === false ? notice(`${v.name} already has all the ${t.name} they can hold.`, "blue", undefined, 4000) : await ctx.refresh()) }, "Award") : null, t.fromSystem || ro ? null : h("button", { class: "link tiny", title: `Remove ${t.name}`, onClick: async () => ((await attempt(() => api.setTracker(v.id, t.id, null))) !== undefined && (await ctx.refresh())) }, "×")),
    body,
  );
}

async function addTracker(v: CharacterView, ctx: PlaceCtx) {
  const d = openDialog(`Add a tracker to ${v.name}`);
  const name = h("input", { class: "text-input", placeholder: "Torches carried", "aria-label": "Name", "data-autofocus": "" });
  const max = h("input", { class: "text-input", inputmode: "numeric", value: "5", "aria-label": "Most" });
  const look = h("select", { class: "text-input select", "aria-label": "Looks like" }, h("option", { value: "boxes" }, "Boxes to tick"), h("option", { value: "number" }, "A number"), h("option", { value: "bar" }, "A bar"));
  const refill = h("select", { class: "text-input select", "aria-label": "Refills" }, h("option", { value: "never" }, "Never (I change it myself)"), h("option", { value: "short rest" }, "Each short rest"), h("option", { value: "long rest" }, "Each long rest"), h("option", { value: "award" }, "When the DM awards it"));
  d.body.replaceChildren(h("label", { class: "field-label" }, "Name"), name, h("label", { class: "field-label spaced" }, "Most it can hold"), max, h("label", { class: "field-label spaced" }, "Looks like"), look, h("label", { class: "field-label spaced" }, "Refills"), refill);
  const ok = h("button", { class: "button primary" }, "Add");
  ok.addEventListener("click", async () => {
    if ((await attempt(() => api.addTracker(v.id, { name: name.value, max: Number(max.value) || 1, look: look.value, refill: refill.value }))) !== undefined) {
      d.close();
      await ctx.refresh();
    }
  });
  d.footer.replaceChildren(h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"), ok);
  name.focus();
}

function dropGear(el: HTMLElement, v: CharacterView, ro: boolean, ctx: PlaceCtx) {
  el.addEventListener("dragover", (ev) => {
    const types = ev.dataTransfer?.types ?? [];
    if (ro || !(types.includes(NODE_DRAG) || types.includes(DRAG_TYPE))) return;
    ev.preventDefault();
    el.classList.add("drop-over");
  });
  el.addEventListener("dragleave", (ev) => !el.contains(ev.relatedTarget as Node) && el.classList.remove("drop-over"));
  el.addEventListener("drop", (ev) => {
    ev.preventDefault();
    el.classList.remove("drop-over");
    void (async () => {
      const ids = (JSON.parse(ev.dataTransfer?.getData(NODE_DRAG) || "{}") as { ids?: string[] }).ids ?? (JSON.parse(ev.dataTransfer?.getData(DRAG_TYPE) || "[]") as string[]);
      if (!ids.length) return;
      await attempt(() => api.attach({ targets: [v.id], bricks: ids }));
      await ctx.refresh();
    })();
  });
}

async function levelUp(v: CharacterView, ctx: PlaceCtx) {
  const p = await attempt(() => api.levelUpPreview(v.id));
  if (!p) return;
  const d = openDialog(`${v.name} goes up to level ${p.level}`, { wide: true });
  const hp = h("input", { class: "text-input score-input", inputmode: "numeric", value: p.hp === null ? "" : String(p.hp), "aria-label": "Hit points gained" });
  const picks: Record<string, string[]> = {};
  const drawChoices = () =>
    p.choices.map((c) =>
      h(
        "div",
        { class: "choice-box" },
        h("div", { class: "field-label" }, `Choose ${c.pick === 1 ? "one" : c.pick} ${c.label}`),
        h(
          "div",
          { class: "pick-chips" },
          c.options.map((o) => {
            const on = (picks[c.aid] ?? []).includes(o.id);
            const b = h("button", { class: `pick-chip${on ? " on" : ""}` }, o.name);
            b.addEventListener("click", () => {
              const cur = picks[c.aid] ?? [];
              picks[c.aid] = on ? cur.filter((x) => x !== o.id) : [...cur, o.id].slice(-c.pick);
              draw();
            });
            return b;
          }),
        ),
      ),
    );
  const draw = () =>
    d.body.replaceChildren(
      h("label", { class: "field-label" }, "Hit points gained"),
      h("div", { class: "inline" }, hp, h("span", { class: "muted small" }, p.hp === null ? "Type what the game gives." : "The class's average plus the Constitution bonus. Change it if your table rolls.")),
      p.features.length ? h("div", { class: "pick-detail" }, h("div", { class: "field-label" }, `New at level ${p.level}`), h("ul", { class: "feature-list" }, p.features.map((f) => h("li", null, h("strong", null, f.name), " ", h("span", { class: "small" }, f.sentence))))) : h("p", { class: "muted" }, `No new features are listed for level ${p.level}. Check the class's level table in the Codex.`),
      ...drawChoices(),
    );
  draw();
  const ok = h("button", { class: "button primary" }, "Level up");
  ok.addEventListener("click", async () => {
    const gain = hp.value.trim() === "" ? null : Number(hp.value);
    if ((await attempt(() => api.levelUp(v.id, gain !== null && Number.isFinite(gain) ? gain : null, picks))) !== undefined) {
      d.close();
      notice(`${v.name} is now level ${p.level}.`, "green", undefined, 4000);
      await ctx.refresh();
    }
  });
  d.footer.replaceChildren(h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"), ok);
}
