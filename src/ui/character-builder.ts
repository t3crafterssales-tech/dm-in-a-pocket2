// The character builder (version 2): a wizard, one step per screen, built from the game itself.
// It skips what the game doesn't have (no classes, no class step). "Make it for me" fills
// everything with sensible choices in one click. The result joins the party roster.

import type { BuilderOptions, CharacterInput, Method, OptionChoice } from "../app/backend.ts";
import { api, pictureUrl } from "./api.ts";
import { choosePicture } from "./picture-chooser.ts";
import { attempt } from "./common.ts";
import { notice, openDialog } from "./dialogs.ts";
import { h, svg } from "./dom.ts";
import { ICONS } from "./icons.ts";

type StepKey = "who" | "race" | "class" | "background" | "scores" | "gear" | "finish";

const STEP_TITLES: Record<StepKey, string> = { who: "Name", race: "Race", class: "Class", background: "Background", scores: "Ability scores", gear: "Gear", finish: "Finish" };

/** Opens the builder. Resolves to the new character's id, or null if cancelled. */
export function openBuilder(opts: { approved?: boolean; player?: string } = {}): Promise<string | null> {
  return new Promise((resolve) => {
    let made: string | null = null;
    const d = openDialog("New character", { wide: true, onClose: () => resolve(made) });
    d.el.classList.add("builder-dialog");
    void (async () => {
      const o = await attempt(() => api.builderOptions());
      if (!o) return d.close();
      const gearList = await gearChoices();
      const steps: StepKey[] = ["who", ...(o.races.length ? (["race"] as const) : []), ...(o.classes.length ? (["class"] as const) : []), ...(o.backgrounds.length ? (["background"] as const) : []), ...(o.abilities.length ? (["scores"] as const) : []), "gear", "finish"];
      const input: CharacterInput = { name: "", player: opts.player ?? "", picture: null, race: null, class: null, background: null, level: 1, method: o.defaultMethod, scores: {}, raceBonuses: true, hp: null, gold: "", gear: [], choices: {}, appearance: {}, approved: opts.approved ?? true };
      /** Rolled scores waiting to be placed (4d6 keep 3), with their dice. */
      let rolled: { score: number; breakdown: string }[] = [];
      let at = 0;

      const finish = async () => {
        const id = await attempt(() => api.createCharacter(input));
        if (!id) return;
        made = id;
        notice(`${input.name.trim() || "The new character"} joined the party.`, "green", undefined, 5000);
        d.close();
      };
      const forMe = async () => {
        const auto = await attempt(() => api.makeItForMe());
        if (!auto) return;
        Object.assign(input, { ...auto, name: input.name.trim() || auto.name, player: input.player || auto.player, picture: input.picture ?? auto.picture, approved: input.approved });
        at = steps.indexOf("finish");
        draw();
      };

      const draw = () => {
        const step = steps[at]!;
        const crumbs = h(
          "ol",
          { class: "steps builder-steps" },
          steps.map((s, i) => h("li", { class: i === at ? "current" : i < at ? "done" : "" }, h("button", { class: "link", onClick: () => ((at = i), draw()) }, h("span", { class: "step-number" }, String(i + 1)), STEP_TITLES[s]))),
        );
        d.body.replaceChildren(crumbs, h("div", { class: "builder-body" }, stepBody(step)));
        const back = h("button", { class: "button plain", disabled: at === 0, onClick: () => ((at = Math.max(0, at - 1)), draw()) }, "Back");
        const next = step === "finish" ? h("button", { class: "button primary", onClick: () => void finish() }, input.approved ? "Add to the party" : "Send to the DM") : h("button", { class: "button primary", onClick: () => ((at += 1), draw()) }, "Next");
        d.footer.replaceChildren(h("button", { class: "button plain", title: "Pick sensible choices for everything, then check them on the last step", onClick: () => void forMe() }, "✨ Make it for me"), h("span", { class: "grow" }), back, next);
        d.body.querySelector<HTMLElement>("[data-autofocus]")?.focus();
      };

      const stepBody = (step: StepKey): HTMLElement => {
        switch (step) {
          case "who":
            return whoStep(input, draw);
          case "race":
            return cardsStep("Pick a race. Subraces sit under their race.", o.races, input.race, (id) => ((input.race = id), draw()), (r) => [r.size, r.speed].filter(Boolean).join(" · "), choiceBoxes(o.races.find((r) => r.id === input.race)?.choices ?? [], input, draw));
          case "class": {
            const c = o.classes.find((x) => x.id === input.class);
            const parent = c?.parent ? o.classes.find((x) => x.id === c.parent) : null;
            return cardsStep("Pick a class. Subclasses sit under their class.", o.classes, input.class, (id) => ((input.class = id), draw()), (k) => (k.hitDie ? `Hit die ${k.hitDie}` : ""), h("div", null, levelPicker(input, draw), choiceBoxes([...(parent?.choices ?? []), ...(c?.choices ?? [])], input, draw), c ? featureList([...(parent?.features ?? []), ...c.features], input.level) : null));
          }
          case "background":
            return cardsStep("Pick a background: where the character comes from.", o.backgrounds.map((b) => ({ ...b, picture: null, parent: null })), input.background, (id) => ((input.background = id), draw()), () => "");
          case "scores":
            return scoresStep(o, input, rolled, (r) => ((rolled = r), draw()), draw);
          case "gear":
            return gearStep(o, input, gearList, draw);
          case "finish":
            return finishStep(o, input, draw);
        }
      };
      draw();
    })();
  });
}

async function gearChoices(): Promise<{ id: string; name: string; sub: string; section: string }[]> {
  const codex = (await attempt(() => api.codex())) ?? [];
  return codex.filter((s) => ["weapons", "armour", "gear", "magic"].includes(s.key)).flatMap((s) => s.entries.map((e) => ({ id: e.id, name: e.name, sub: e.sub, section: s.title })));
}

function whoStep(input: CharacterInput, redraw: () => void): HTMLElement {
  const name = h("input", { class: "text-input", value: input.name, placeholder: "Character name", maxlength: 120, "data-autofocus": "", "aria-label": "Character name" });
  name.addEventListener("input", () => (input.name = name.value));
  const player = h("input", { class: "text-input", value: input.player, placeholder: "Who plays them (optional)", maxlength: 120, "aria-label": "Player" });
  player.addEventListener("input", () => (input.player = player.value));
  const pic = h(
    "button",
    { class: `portrait${input.picture ? "" : " empty"}`, title: "Add a picture" },
    input.picture ? h("img", { src: pictureUrl(input.picture), alt: "" }) : [h("span", { class: "portrait-icon" }, "🧙"), h("span", null, "Add picture")],
  );
  pic.addEventListener("click", async () => {
    const id = await choosePicture();
    if (id) ((input.picture = id), redraw());
  });
  return h(
    "div",
    { class: "builder-who" },
    pic,
    h("div", { class: "grow" }, h("label", { class: "field-label" }, "Character name"), name, h("label", { class: "field-label spaced" }, "Player"), player, h("p", { class: "muted small" }, "Character name and player name always print on the sheet, with a line to write on if left empty.")),
  );
}

function levelPicker(input: CharacterInput, redraw: () => void): HTMLElement {
  const sel = h("select", { class: "text-input select", "aria-label": "Starting level" }, Array.from({ length: 20 }, (_, i) => h("option", { value: String(i + 1), selected: input.level === i + 1 }, `Level ${i + 1}`)));
  sel.addEventListener("change", () => ((input.level = Number(sel.value)), redraw()));
  return h("div", { class: "inline builder-level" }, h("span", { class: "field-label" }, "Starts at"), sel, h("span", { class: "muted small" }, "Bringing in an existing character? Pick their level; their features up to it are shown below."));
}

function cardsStep<T extends { id: string; name: string; text: string; picture: string | null; parent: string | null }>(hint: string, list: T[], value: string | null, pick: (id: string) => void, note: (x: T) => string, extra?: HTMLElement | null): HTMLElement {
  const top = list.filter((x) => !x.parent || !list.some((p) => p.id === x.parent));
  const card = (x: T, sub: boolean) =>
    h(
      "button",
      { class: `pick-card${x.id === value ? " on" : ""}${sub ? " sub" : ""}`, "aria-pressed": x.id === value ? "true" : "false", onClick: () => pick(x.id), title: x.text.slice(0, 400) },
      x.picture ? h("img", { src: pictureUrl(x.picture), alt: "" }) : null,
      h("span", { class: "pick-card-name" }, x.name),
      note(x) ? h("span", { class: "muted small" }, note(x)) : null,
    );
  const chosen = list.find((x) => x.id === value);
  const subs = (id: string) => list.filter((x) => x.parent === id);
  const openParent = chosen ? (chosen.parent ?? chosen.id) : null;
  return h(
    "div",
    null,
    h("p", { class: "muted" }, hint),
    h("div", { class: "pick-cards" }, top.map((x) => card(x, false))),
    openParent && subs(openParent).length ? h("div", null, h("div", { class: "field-label spaced" }, `${list.find((x) => x.id === openParent)?.name}: pick one (optional)`), h("div", { class: "pick-cards" }, subs(openParent).map((x) => card(x, true)))) : null,
    chosen ? h("div", { class: "pick-detail" }, h("h3", null, chosen.name), chosen.text.split(/\n+/).slice(0, 6).map((p) => h("p", { class: "small" }, p))) : null,
    extra ?? null,
  );
}

function choiceBoxes(choices: OptionChoice[], input: CharacterInput, redraw: () => void): HTMLElement | null {
  if (!choices.length) return null;
  return h(
    "div",
    { class: "choice-boxes" },
    choices.map((c) => {
      const picked = input.choices[c.aid] ?? [];
      return h(
        "div",
        { class: "choice-box" },
        h("div", { class: "field-label" }, `Choose ${c.pick === 1 ? "one" : c.pick} ${c.label}`, h("span", { class: "muted small" }, ` (${picked.length} of ${c.pick})`)),
        h(
          "div",
          { class: "pick-chips" },
          c.options.map((opt) => {
            const on = picked.includes(opt.id);
            return h(
              "button",
              {
                class: `pick-chip${on ? " on" : ""}`,
                onClick: () => {
                  const next = on ? picked.filter((x) => x !== opt.id) : [...picked, opt.id].slice(-c.pick);
                  input.choices[c.aid] = next;
                  redraw();
                },
              },
              opt.name,
            );
          }),
        ),
      );
    }),
  );
}

function featureList(features: { level: number | null; name: string; sentence: string }[], level: number): HTMLElement | null {
  const shown = features.filter((f) => f.level === null || f.level <= level);
  if (!shown.length) return null;
  return h("div", { class: "pick-detail" }, h("div", { class: "field-label" }, `Features up to level ${level}`), h("ul", { class: "feature-list" }, shown.map((f) => h("li", null, f.level ? h("span", { class: "muted small" }, `Level ${f.level} · `) : null, h("strong", null, f.name), " ", h("span", { class: "small" }, f.sentence)))));
}

// ---------- Ability scores ----------

function scoresStep(o: BuilderOptions, input: CharacterInput, rolled: { score: number; breakdown: string }[], setRolled: (r: { score: number; breakdown: string }[]) => void, redraw: () => void): HTMLElement {
  const method = input.method;
  const sel = h("select", { class: "text-input select", "aria-label": "Method" }, o.methods.map((m) => h("option", { value: m.id, selected: m.id === method }, `${m.label}${m.id === o.defaultMethod ? " (this game's rule)" : ""}`)));
  sel.addEventListener("change", () => {
    input.method = sel.value as Method;
    input.scores = {};
    setRolled([]);
  });
  const head = h("div", null, h("div", { class: "inline" }, h("span", { class: "field-label" }, "Method"), sel), o.methodRule ? h("p", { class: "muted small" }, `This game's rule is "${o.methodRule}". The DM can switch it for this character.`) : null);
  const race = o.races.find((r) => r.id === input.race);
  const parentRace = race?.parent ? o.races.find((r) => r.id === race.parent) : null;
  const bonuses = [...(race?.bonuses ?? []), ...(parentRace?.bonuses ?? [])];
  const bonusOf = (id: string) => bonuses.filter((b) => b.ability === id).reduce((s, b) => s + b.amount, 0);
  const final = (id: string) => (input.scores[id] === undefined ? null : input.scores[id]! + (input.raceBonuses ? bonusOf(id) : 0));
  const scoreCell = (id: string) => {
    const f = final(id);
    const b = bonusOf(id);
    return h("span", { class: "score-final" }, f === null ? "—" : String(f), b && input.raceBonuses ? h("span", { class: "muted small" }, ` (${b > 0 ? "+" : ""}${b} race)`) : null);
  };

  // A pool of numbers to place: the standard set, or what was rolled.
  const assignFrom = (pool: number[]) => {
    const used = new Map<number, number>();
    for (const v of Object.values(input.scores)) used.set(v, (used.get(v) ?? 0) + 1);
    return h(
      "table",
      { class: "score-assign" },
      h("tbody", null,
        o.abilities.map((a) => {
          const cur = input.scores[a.id];
          const s = h("select", { class: "text-input select", "aria-label": a.name }, h("option", { value: "" }, "—"), [...new Set(pool)].sort((x, y) => y - x).map((n) => {
            const free = pool.filter((x) => x === n).length - (used.get(n) ?? 0) + (cur === n ? 1 : 0);
            return h("option", { value: String(n), selected: cur === n, disabled: free <= 0 }, String(n));
          }));
          s.addEventListener("change", () => {
            if (s.value === "") delete input.scores[a.id];
            else input.scores[a.id] = Number(s.value);
            redraw();
          });
          return h("tr", null, h("th", { scope: "row" }, `${a.name} (${a.label})`), h("td", null, s), h("td", null, scoreCell(a.id)));
        }),
      ),
    );
  };

  let body: HTMLElement;
  if (method === "standard") body = h("div", null, h("p", { class: "muted small" }, `Place each of ${o.standardSet.join(", ")} once.`), assignFrom(o.standardSet));
  else if (method === "pointBuy") {
    const p = o.pointBuy ?? { id: "", points: 27, start: 8, max: 15, min: 8, costs: "d20" as const };
    const cost = (s: number) => (s <= p.start ? s - p.start : p.costs === "flat" ? s - p.start : Array.from({ length: s - p.start }, (_, i) => (p.start + i + 1 <= 13 ? 1 : 2)).reduce((x, y) => x + y, 0));
    for (const a of o.abilities) if (input.scores[a.id] === undefined) input.scores[a.id] = p.start;
    const spent = o.abilities.reduce((s, a) => s + cost(input.scores[a.id]!), 0);
    body = h(
      "div",
      null,
      h("p", { class: `points-left${spent > p.points ? " over" : ""}` }, `${p.points - spent} of ${p.points} points left`),
      h("table", { class: "score-assign" }, h("tbody", null,
        o.abilities.map((a) => {
          const v = input.scores[a.id]!;
          const set = (n: number) => ((input.scores[a.id] = Math.max(p.min, Math.min(p.max, n))), redraw());
          return h("tr", null, h("th", { scope: "row" }, `${a.name} (${a.label})`), h("td", null, h("div", { class: "stepper" }, h("button", { class: "stepper-button", disabled: v <= p.min, onClick: () => set(v - 1), "aria-label": `Lower ${a.name}` }, "−"), h("span", { class: "stepper-value" }, String(v)), h("button", { class: "stepper-button", disabled: v >= p.max, onClick: () => set(v + 1), "aria-label": `Raise ${a.name}` }, "+"))), h("td", null, scoreCell(a.id)));
        }),
      )),
    );
  } else if (method === "roll4d6" || method === "roll3d6") {
    const rollBtn = h("button", { class: "button primary" }, svg(ICONS.dice), rolled.length ? "Roll again" : "Roll");
    rollBtn.addEventListener("click", async () => {
      const r = await attempt(() => api.rollScores(method, o.abilities.length));
      if (!r) return;
      input.scores = {};
      if (method === "roll3d6") o.abilities.forEach((a, i) => (input.scores[a.id] = r[i]!.score));
      setRolled(r);
      redraw();
    });
    const shown = rolled.length ? h("ul", { class: "rolled" }, rolled.map((r, i) => h("li", null, h("strong", null, String(r.score)), " ", h("span", { class: "muted small" }, method === "roll3d6" ? `${o.abilities[i]?.name}: ${r.breakdown}` : r.breakdown)))) : h("p", { class: "muted small" }, method === "roll3d6" ? "Each roll goes to the next ability in order: the first to Strength, the second to Dexterity, and so on." : "Roll six times, then place each number where you like.");
    body = h("div", null, rollBtn, shown, rolled.length && method === "roll4d6" ? assignFrom(rolled.map((r) => r.score)) : null, rolled.length && method === "roll3d6" ? h("table", { class: "score-assign" }, h("tbody", null, o.abilities.map((a) => h("tr", null, h("th", { scope: "row" }, a.name), h("td", null, scoreCell(a.id)))))) : null);
  } else {
    body = h(
      "table",
      { class: "score-assign" },
      h("tbody", null,
        o.abilities.map((a) => {
          const box = h("input", { class: "text-input score-input", inputmode: "numeric", value: input.scores[a.id] === undefined ? "" : String(input.scores[a.id]), "aria-label": a.name });
          box.addEventListener("change", () => {
            const n = Number(box.value);
            if (box.value.trim() === "" || !Number.isFinite(n)) delete input.scores[a.id];
            else input.scores[a.id] = Math.round(n);
            redraw();
          });
          return h("tr", null, h("th", { scope: "row" }, `${a.name} (${a.label})`), h("td", null, box), h("td", null, scoreCell(a.id)));
        }),
      ),
    );
  }
  const bonusTick = h("input", { type: "checkbox", checked: input.raceBonuses });
  bonusTick.addEventListener("change", () => ((input.raceBonuses = bonusTick.checked), redraw()));
  return h("div", null, head, body, bonuses.length ? h("label", { class: "check spaced" }, bonusTick, `Add ${race?.name}'s ability bonuses`) : null, h("p", { class: "muted small" }, "An empty score is flagged on the sheet, never blocked: you can fill it in later."));
}

// ---------- Gear ----------

function gearStep(o: BuilderOptions, input: CharacterInput, all: { id: string; name: string; sub: string; section: string }[], redraw: () => void): HTMLElement {
  const klass = o.classes.find((c) => c.id === input.class);
  const parent = klass?.parent ? o.classes.find((c) => c.id === klass.parent) : null;
  const kit = klass?.startingGear ?? parent?.startingGear ?? null;
  const gold = h("input", { class: "text-input", value: input.gold, placeholder: "15 gp", maxlength: 60, "aria-label": "Money" });
  gold.addEventListener("input", () => (input.gold = gold.value));
  const find = h("input", { class: "text-input", type: "search", placeholder: "Find gear to add…", "aria-label": "Find gear" });
  const results = h("ul", { class: "gear-results" });
  const show = () => {
    const q = find.value.trim().toLowerCase();
    const hits = q.length < 2 ? [] : all.filter((x) => x.name.toLowerCase().includes(q)).slice(0, 12);
    results.replaceChildren(...hits.map((x) => h("li", null, h("button", { class: "link", onClick: () => (input.gear.push(x.id), redraw()) }, x.name), h("span", { class: "muted small" }, ` ${x.section}${x.sub ? ` · ${x.sub}` : ""}`))));
  };
  find.addEventListener("input", show);
  const chosen = input.gear.map((id, i) => h("li", null, all.find((x) => x.id === id)?.name ?? "?", " ", h("button", { class: "link small", onClick: () => (input.gear.splice(i, 1), redraw()), "aria-label": "Remove" }, "remove")));
  return h(
    "div",
    null,
    kit ? h("div", { class: "pick-detail" }, h("div", { class: "field-label" }, `${klass?.name ?? parent?.name} starting equipment`), h("p", { class: "small" }, kit)) : null,
    h("label", { class: "field-label spaced" }, "Money"),
    gold,
    h("label", { class: "field-label spaced" }, "Gear"),
    find,
    results,
    chosen.length ? h("ul", { class: "gear-chosen" }, chosen) : h("p", { class: "muted small" }, "Nothing yet. You can also drag gear from the Codex onto the sheet later."),
  );
}

// ---------- Finish ----------

function finishStep(o: BuilderOptions, input: CharacterInput, redraw: () => void): HTMLElement {
  const name = (list: { id: string; name: string }[], id: string | null) => list.find((x) => x.id === id)?.name ?? "—";
  const appearanceOpen = Object.values(input.appearance).some(Boolean);
  const fields = [
    ["height", "Height"],
    ["weight", "Weight"],
    ["age", "Age"],
    ["hair", "Hair"],
    ["eyes", "Eyes"],
    ["skin", "Skin"],
    ["marks", "Distinguishing marks"],
    ["voice", "Voice and mannerisms"],
  ];
  const appearance = h(
    "details",
    { class: "fold-out", open: appearanceOpen },
    h("summary", null, "Appearance"),
    h(
      "div",
      { class: "appearance-grid" },
      fields.map(([k, label]) => {
        const box = h("input", { class: "text-input", value: input.appearance[k!] ?? "", placeholder: label, "aria-label": label! });
        box.addEventListener("input", () => (input.appearance[k!] = box.value));
        return h("label", null, h("span", { class: "muted small" }, label), box);
      }),
    ),
    h("p", { class: "muted small" }, "Anything left empty doesn't print."),
  );
  const scoreLine = o.abilities.map((a) => `${a.label} ${input.scores[a.id] ?? "—"}`).join(" · ");
  const nameBox = h("input", { class: "text-input", value: input.name, placeholder: "Character name", "aria-label": "Character name" });
  nameBox.addEventListener("input", () => (input.name = nameBox.value));
  void redraw;
  return h(
    "div",
    null,
    h("label", { class: "field-label" }, "Character name"),
    nameBox,
    h(
      "dl",
      { class: "facts spaced" },
      input.player ? [h("dt", null, "Player"), h("dd", null, input.player)] : [],
      o.races.length ? [h("dt", null, "Race"), h("dd", null, name(o.races, input.race))] : [],
      o.classes.length ? [h("dt", null, "Class"), h("dd", null, `${name(o.classes, input.class)}, level ${input.level}`)] : [],
      o.backgrounds.length ? [h("dt", null, "Background"), h("dd", null, name(o.backgrounds, input.background))] : [],
      o.abilities.length ? [h("dt", null, "Scores"), h("dd", null, scoreLine, input.raceBonuses ? h("span", { class: "muted small" }, " before race bonuses") : null)] : [],
      input.gold || input.gear.length ? [h("dt", null, "Gear"), h("dd", null, [input.gold, input.gear.length ? `${input.gear.length} item${input.gear.length === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · "))] : [],
    ),
    h("p", { class: "muted small" }, o.hpRule),
    appearance,
  );
}
