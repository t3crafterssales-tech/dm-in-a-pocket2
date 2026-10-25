// The Rules tab: sections of small rule nodes on the left, the open rule in the middle.
// Every value saves the moment it changes (when you leave the box or press Enter), as one undo step.

import { STANDARD_CORE_TEXT } from "../app/codex-lists.ts";
import { chips } from "./pickers.ts";
import type { Choices, NodeView, Option, RulesSection } from "../app/backend.ts";
import { api } from "./api.ts";
import { attempt } from "./common.ts";
import { notice } from "./dialogs.ts";
import { h, svg } from "./dom.ts";
import { ICONS } from "./icons.ts";
import { FieldMaker, asLink, isObj } from "./fields.ts";
import type { Link, Value } from "./fields.ts";
import { openEditSystem } from "./edit-system.ts";
import { offerRestore } from "./flag-panel.ts";
import { showQuickStart } from "./quickstart-dialog.ts";
import type { PlaceCtx } from "./place.ts";
import { richBox, richView } from "./rich-box.ts";

const collapsed = new Set<string>();
/** The section with its "new rule" box open, if any. */
let adding: string | null = null;
let addingSection = false;

export async function rulesPanels(ctx: PlaceCtx): Promise<{ list: HTMLElement; editor: HTMLElement }> {
  const [sections, choices, moveTo] = await Promise.all([attempt(() => api.rulesTab()), attempt(() => api.choices()), attempt(() => api.sections())]);
  let view: NodeView | null = null;
  if (ctx.selected) {
    try {
      view = await api.node(ctx.selected);
    } catch {
      ctx.selected = null; // it was undone or deleted
    }
  }
  return {
    list: listPanel(sections ?? [], ctx),
    editor: editorPanel(view, choices ?? { abilities: [], conditions: [], resources: [] }, moveTo ?? [], ctx),
  };
}

// ---------- The list ----------

function listPanel(sections: RulesSection[], ctx: PlaceCtx) {
  const ro = ctx.view.readOnly;
  return h(
    "aside",
    { class: "panel list-panel", "aria-label": "Rules", "data-scroll": "rules-list" },
    h("div", { class: "panel-head" }, "Rules"),
    sections.map((s) => {
      const open = !collapsed.has(s.key);
      return h(
        "div",
        { class: "section" },
        h(
          "div",
          { class: "section-head" },
          h(
            "button",
            { class: `section-toggle${open ? " open" : ""}`, "aria-expanded": open ? "true" : "false", onClick: () => (open ? collapsed.add(s.key) : collapsed.delete(s.key), void ctx.refresh()) },
            svg(ICONS.chevron),
            h("span", null, s.title),
            s.nodes.length ? h("span", { class: "muted small" }, s.nodes.length) : null,
          ),
          ro ? null : h("button", { class: "icon-button small", title: `New ${s.noun}`, "aria-label": `New ${s.noun} in ${s.title}`, onClick: () => ((adding = s.key), collapsed.delete(s.key), void ctx.refresh()) }, svg(ICONS.plus)),
        ),
        open
          ? h(
              "ul",
              { class: "items" },
              s.nodes.map((n) =>
                h(
                  "li",
                  {
                    class: `item${n.id === ctx.selected ? " selected" : ""}`,
                    tabindex: 0,
                    "data-key": `item-${n.id}`,
                    onClick: () => ctx.select(n.id),
                    onKeydown: (e: KeyboardEvent) => {
                      if (e.key === "Enter") ctx.select(n.id);
                      if (e.key === "Delete" && !ro) void remove(n.id, ctx);
                    },
                  },
                  h("span", { class: "item-name" }, n.name),
                  n.label ? h("span", { class: "item-label" }, n.label) : null,
                  n.fromBelow ? h("span", { class: "from-below", title: "From the system" }, svg(ICONS.layers)) : null,
                ),
              ),
              adding === s.key ? h("li", { class: "item adding" }, newNameBox(`Name of the new ${s.noun}`, `new-${s.key}`, (name) => addRule(s.key, s.kind, name, ctx))) : null,
              !s.nodes.length && adding !== s.key ? h("li", { class: "empty muted small" }, "None yet.") : null,
            )
          : null,
      );
    }),
    ro
      ? null
      : addingSection
        ? h("div", { class: "pad" }, newNameBox("Name of the new section", "new-section", (name) => addSection(name, ctx), () => ((addingSection = false), void ctx.refresh())))
        : h("button", { class: "link add-section", onClick: () => ((addingSection = true), void ctx.refresh()) }, "+ New section"),
  );
}

/** A name box like a new folder in File Explorer: Enter creates, Escape cancels. */
export function newNameBox(placeholder: string, key: string, create: (name: string) => void, cancel?: () => void) {
  const input = h("input", { class: "text-input small-input", placeholder, "data-key": key, "data-autofocus": "", maxlength: 200 });
  let done = false;
  const finish = (ok: boolean) => {
    if (done) return;
    done = true;
    if (ok && input.value.trim()) create(input.value.trim());
    else if (cancel) cancel();
    else {
      adding = null;
      input.closest(".item")?.remove();
    }
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") (e.preventDefault(), finish(true));
    if (e.key === "Escape") (e.stopPropagation(), finish(false));
  });
  // Clicking elsewhere keeps what was typed, like File Explorer. A redraw that removes the box doesn't count.
  input.addEventListener("blur", () => input.isConnected && finish(true));
  return input;
}

async function addRule(sectionKey: string, kind: string, name: string, ctx: PlaceCtx) {
  adding = null;
  if (!(await offerRestore(name, kind, ctx))) return ctx.refresh();
  const id = await attempt(() => api.addRule(sectionKey, name));
  if (id) ctx.select(id);
  else await ctx.refresh();
}

async function addSection(title: string, ctx: PlaceCtx) {
  addingSection = false;
  await attempt(() => api.addSection(title));
  await ctx.refresh();
}

async function remove(id: string, ctx: PlaceCtx) {
  const r = await attempt(() => api.deleteNode(id));
  if (!r) return;
  notice(`${r.label}. It's in the recycle bin; anything that used it is flagged.`, "blue", {
    label: "Undo",
    run: async () => {
      await attempt(() => api.undo());
      ctx.select(id);
    },
  });
  ctx.select(null);
}

// ---------- The editor ----------

const KIND_NAMES: Record<string, string> = { ability: "Ability", resource: "Resource", skill: "Skill", condition: "Condition", rule: "Rule" };

function editorPanel(view: NodeView | null, choices: Choices, moveTo: { key: string; title: string }[], ctx: PlaceCtx) {
  if (!view)
    return h(
      "section",
      { class: "panel editor" },
      h(
        "div",
        { class: "empty-editor" },
        h("h2", null, ctx.view.name),
        h("p", { class: "muted" }, "Pick a rule on the left to open it, or press + beside a section to add one."),
        h("p", { class: "muted small" }, "Nothing here is required: every rule starts with sensible defaults, and you can build in any order."),
        !ctx.view.readOnly && ctx.view.type === "system" ? h("button", { class: "button plain", title: "Six big questions that set up the basics", onClick: () => void showQuickStart(() => ctx.refresh()) }, "Quick start…") : null,
      ),
    );
  const ro = view.readOnly;
  const ed = new FieldMaker(view, ctx);
  const isCore = view.kind === "rule" && view.sectionKey === "core";
  const nameInput = h("input", { class: "title-input", value: view.name, "data-key": "f-name", "aria-label": "Name", disabled: ro, maxlength: 200 });
  nameInput.addEventListener("change", () => void ed.save(() => api.rename(view.id, nameInput.value)));
  nameInput.addEventListener("keydown", (e) => e.key === "Enter" && nameInput.blur());

  const head = h(
    "div",
    { class: "editor-head" },
    h("div", { class: "title-row" }, nameInput, ed.pencil("name"), ro ? null : h("button", { class: "icon-button", title: "Delete (it goes to the recycle bin)", "aria-label": `Delete ${view.name}`, onClick: () => void remove(view.id, ctx) }, svg(ICONS.trash))),
    h(
      "div",
      { class: "chips" },
      h("span", { class: "chip" }, isCore ? "Core check" : (KIND_NAMES[view.kind] ?? view.kind)),
      view.kind === "rule" && !isCore && moveTo.length
        ? h("label", { class: "chip-select" }, "Section ", ed.plainSelect(view.sectionKey ?? "", moveTo.map((s) => ({ value: s.key, label: s.title })), (key) => api.moveToSection(view.id, key), "f-section"))
        : view.sectionTitle && !isCore
          ? h("span", { class: "chip muted" }, view.sectionTitle)
          : null,
      view.fromBelow ? h("span", { class: "chip muted", title: "This comes from the system. Changes you make here stay in this world, marked with a pencil." }, svg(ICONS.layers), "From the system") : null,
      view.fromBelow && !ro && ctx.view.type !== "system" ? h("button", { class: "link small", title: "Change the version underneath, and choose which places get it", onClick: () => void openEditSystem(view.id, ctx) }, ctx.view.type === "module" && ctx.view.worldName ? "Edit in the world" : "Edit in the system") : null,
    ),
  );

  const summary = h("p", { class: "summary" }, view.summary);
  const { main, more } = kindFields(view, choices, ed, isCore);
  const textBox = richBox(view.text, { className: "rules-text", key: "f-text", rows: 6, disabled: ro, placeholder: "Write the rule out in your own words. This is what the rulebook prints.", label: "The rule, in your words" });
  textBox.addEventListener("change", () => void ed.save(() => api.setText(view.id, textBox.value)));
  // A core check's standard wording (backlog 1): leave it, write your own, or go back to it.
  const standard = isCore ? (STANDARD_CORE_TEXT[String(view.fields.family ?? "rollOver")] ?? null) : null;
  const standardNote = standard
    ? view.text.trim() === standard
      ? h("p", { class: "muted small" }, h("span", { class: "std-tag" }, "Standard description"), " Leave it, or write your own over it. Whatever is here is what prints.")
      : ro || view.source !== "mine"
        ? null
        : h("button", { class: "link small", onClick: () => void ed.save(() => api.setText(view.id, standard)) }, "Back to the standard description")
    : null;

  return h(
    "section",
    { class: "panel editor", "data-scroll": "editor" },
    h(
      "div",
      { class: "editor-inner" },
      head,
      summary,
      main.length ? h("div", { class: "fields" }, main) : null,
      more.length ? h("details", { class: "more", open: moreOpen.has(view.id), onToggle: (e: Event) => ((e.target as HTMLDetailsElement).open ? moreOpen.add(view.id) : moreOpen.delete(view.id)) }, h("summary", null, "More options"), h("div", { class: "fields" }, more)) : null,
      h("div", { class: "field" }, h("div", { class: "field-label" }, view.kind === "rule" && !isCore ? "The rule" : "Description", ed.pencil("text")), textBox, standardNote),
      usedBy(view, ctx),
    ),
  );
}

const moreOpen = new Set<string>();

function usedBy(view: NodeView, ctx: PlaceCtx) {
  return h(
    "div",
    { class: "used-by" },
    h("div", { class: "field-label" }, "Used by"),
    view.usedBy.length
      ? h(
          "ul",
          { class: "link-list" },
          view.usedBy.map((u) => h("li", null, h("button", { class: "link", onClick: () => ctx.select(u.id) }, u.name))),
        )
      : h("p", { class: "muted small" }, "Nothing uses this yet."),
  );
}

// ---------- Fields for each kind of rule ----------

function kindFields(view: NodeView, c: Choices, ed: FieldMaker, isCore: boolean): { main: HTMLElement[]; more: HTMLElement[] } {
  const f = view.fields;
  switch (view.kind) {
    case "ability":
      return {
        main: [
          ed.row("Short label", "label", ed.text("label", "For example STR")),
          ed.row("Scores", ["rangeMin", "rangeMax"], h("div", { class: "inline" }, "from ", ed.number("rangeMin"), " to ", ed.number("rangeMax"))),
          ed.row(
            "Bonus",
            "bonus",
            ed.select("bonus", [
              { value: "d20", label: "(score − 10) ÷ 2, like d20 games" },
              { value: "score", label: "The score is the bonus" },
              { value: "table", label: "From a table (written in the description)" },
              { value: "none", label: "No bonus" },
            ]),
          ),
        ],
        more: [],
      };
    case "resource":
      return {
        main: [
          ed.row("Short label", "label", ed.text("label", "For example HP")),
          ed.row("Maximum", "maximum", formulaEditor(view, "maximum", c.abilities, ed)),
          ed.row(
            "Starts",
            ["start", "startValue"],
            h(
              "div",
              { class: "inline" },
              ed.select("start", [
                { value: "full", label: "Full" },
                { value: "empty", label: "Empty" },
                { value: "set", label: "At a set number" },
              ]),
              f.start === "set" ? ed.number("startValue") : null,
            ),
          ),
        ],
        more: [
          ed.row(
            "Recovers",
            "recovery",
            ed.select("recovery", [
              { value: "short rest", label: "Each short rest" },
              { value: "long rest", label: "Each long rest" },
              { value: "day", label: "Each day" },
              { value: "spend", label: "By spending something" },
              { value: "award", label: "When the DM awards it (like Inspiration)" },
              { value: "never", label: "Never" },
            ]),
          ),
          ed.row(
            "Shown on the sheet as",
            "display",
            ed.select("display", [
              { value: "number", label: "A number" },
              { value: "bar", label: "A bar" },
              { value: "boxes", label: "Tick boxes" },
              { value: "countdown", label: "A countdown" },
            ]),
          ),
          ed.row("Thresholds", "thresholds", thresholdsEditor(view, c.conditions, ed)),
        ],
      };
    case "skill":
      return { main: [ed.row("Uses", "ability", ed.linkSelect("ability", c.abilities, "No ability"))], more: [] };
    case "condition": {
      const save = isObj(f.save) ? f.save : null;
      return {
        main: [
          ed.row("Lasts", "duration", ed.text("duration", "For example 1 minute, or until the end of your next turn")),
          ed.row(
            "Saving throw",
            "save",
            h(
              "div",
              { class: "inline wrap" },
              h(
                "label",
                { class: "check" },
                ed.checkbox(!!save, (on) => api.setField(view.id, "save", on ? { ability: null, dc: 10 } : null), "f-save-on"),
                "A saving throw resists or ends it",
              ),
              save
                ? h(
                    "span",
                    { class: "inline" },
                    ed.plainLinkSelect(asLink(save.ability), c.abilities, "Which ability?", (id) => api.setField(view.id, "save", { ...save, ability: id ? { link: id } : null }), "f-save-ability"),
                    " DC ",
                    ed.plainNumber(save.dc, (n) => api.setField(view.id, "save", { ...save, dc: n }), "f-save-dc"),
                  )
                : null,
            ),
          ),
        ],
        more: [ed.row("Stages", "stages", h("div", { class: "inline" }, ed.number("stages", 1), h("span", { class: "muted small" }, "More than 1 for conditions that worsen, like fatigue levels 1 to 6.")))],
      };
    }
    default:
      if (view.sectionKey === "world") return { main: worldRuleFields(view, ed), more: [] };
      if (!isCore) return { main: methodFields(view, ed), more: [] };
      return { main: coreFields(view, ed), more: [] };
  }
}

/**
 * A rule is written out in words, or is point buy for ability scores: points to spend, where
 * every score starts, how high it can go, and how low (below the start is a deficit that gives
 * points back).
 */
function methodFields(view: NodeView, ed: FieldMaker): HTMLElement[] {
  const kinds = ["pointBuy", "standard", "roll4d6", "roll3d6"];
  const method = kinds.includes(String(view.fields.method)) ? String(view.fields.method) : "words";
  const out = [
    ed.row(
      "This rule is",
      "method",
      ed.plainSelect(
        method,
        [
          { value: "words", label: "Written out in words" },
          { value: "pointBuy", label: "Point buy for ability scores" },
          { value: "standard", label: "A standard set of numbers for ability scores" },
          { value: "roll4d6", label: "Roll 4d6, keep the highest three (arrange as you like)" },
          { value: "roll3d6", label: "Roll 3d6 in order" },
        ],
        (v) => api.setField(view.id, "method", v === "words" ? null : v),
        "f-method",
      ),
    ),
  ];
  if (method !== "words") out.push(h("p", { class: "muted small" }, "The character builder's Method drop-down starts with this. The DM can switch it for one character."));
  if (method === "standard") out.push(ed.row("The numbers", "standardSet", h("div", { class: "inline" }, ed.text("standardSet", "15, 14, 13, 12, 10, 8"), h("span", { class: "muted small" }, "One for each ability"))));
  if (method !== "pointBuy") return out;
  const start = typeof view.fields.scoreStart === "number" ? view.fields.scoreStart : 8;
  out.push(
    ed.row("Points to spend", "points", h("div", { class: "inline" }, ed.number("points", 0), h("span", { class: "muted small" }, "27 if left empty"))),
    ed.row("Every score starts at", "scoreStart", h("div", { class: "inline" }, ed.number("scoreStart"), h("span", { class: "muted small" }, "8 if left empty"))),
    ed.row("Highest score you can buy", "scoreMax", h("div", { class: "inline" }, ed.number("scoreMax"), h("span", { class: "muted small" }, "15 if left empty"))),
    ed.row("Lowest a score can go", "scoreMin", h("div", { class: "inline" }, ed.number("scoreMin"), h("span", { class: "muted small" }, `Lower than ${start} allows deficits: each step below gives a point back. Leave empty for none.`))),
    ed.row("Costs", "costs", ed.plainSelect(view.fields.costs === "flat" ? "flat" : "d20", [{ value: "d20", label: "1 point a step up to 13, then 2 (the familiar d20 table)" }, { value: "flat", label: "1 point for every step" }], (v) => api.setField(view.id, "costs", v), "f-costs")),
  );
  return out;
}

/** The values a world rule can be about (the same list as WORLD_RULE_VALUES in src/app/rules.ts). */
const WORLD_VALUES = [
  { value: "material", label: "Material" },
  { value: "damageType", label: "Damage type" },
  { value: "size", label: "Size" },
  { value: "beingKind", label: "Kind of being" },
];

/** World rules where the user picked "Something else", so its name box shows. */
const otherValue = new Set<string>();

/** "No metal": nothing may have [Material] equal to [Metal], with its deliberate exceptions. */
function worldRuleFields(view: NodeView, ed: FieldMaker): HTMLElement[] {
  const forbid = isObj(view.fields.forbid) ? view.fields.forbid : { field: "material", equals: "" };
  const field = typeof forbid.field === "string" ? forbid.field : "material";
  const known = WORLD_VALUES.some((v) => v.value === field) && !otherValue.has(view.id);
  const save = (next: { field?: string; equals?: string }) => ed.save(() => api.setField(view.id, "forbid", { field, equals: typeof forbid.equals === "string" ? forbid.equals : "", ...next }));
  const which = ed.plainSelect(known ? field : "__other", [...WORLD_VALUES, { value: "__other", label: "Something else (name it)" }], async (v) => {
    if (v === "__other") otherValue.add(view.id);
    else {
      otherValue.delete(view.id);
      await save({ field: v });
    }
  }, "f-forbid-field");
  const other = h("input", { class: "text-input", value: known ? "" : field, placeholder: "The value's name on the sheet, for example weight", "data-key": "f-forbid-other", disabled: view.readOnly });
  other.addEventListener("change", () => other.value.trim() && void save({ field: other.value.trim() }));
  const value = h("input", { class: "text-input", value: typeof forbid.equals === "string" ? forbid.equals : "", placeholder: "For example Metal", "data-key": "f-forbid-equals", disabled: view.readOnly });
  value.addEventListener("change", () => void save({ equals: value.value.trim() }));
  value.addEventListener("keydown", (e) => e.key === "Enter" && value.blur());
  const exceptions = (Array.isArray(view.fields.exceptions) ? view.fields.exceptions : []).filter((x): x is Link => isObj(x) && typeof x.link === "string");
  return [
    ed.row("Nothing may have", "forbid", h("div", { class: "inline wrap" }, which, known ? null : other, h("span", null, "equal to"), value)),
    h("p", { class: "muted small" }, "Matching ignores capitals, so Metal, metal and METAL are the same. Bricks on a sheet count too: a sword with a Metal material brick breaks No metal."),
    ed.row(
      "Deliberate exceptions",
      "exceptions",
      exceptions.length
        ? h(
            "div",
            { class: "thresholds" },
            exceptions.map((x) =>
              h(
                "div",
                { class: "inline" },
                h("span", null, view.names[x.link] ?? `[missing: ${view.missing[x.link] ?? "removed"}]`),
                view.readOnly ? null : h("button", { class: "icon-button small", title: "It's no longer an exception", "aria-label": "Remove this exception", onClick: () => void ed.save(() => api.setField(view.id, "exceptions", exceptions.filter((e) => e.link !== x.link))) }, svg(ICONS.close)),
              ),
            ),
          )
        : h("p", { class: "muted small" }, "None. Things that break this rule on purpose can be marked with I meant that on the red flag."),
    ),
  ];
}

const FAMILIES = [
  { value: "rollOver", label: "Roll over a target (d20 + bonus against a difficulty)" },
  { value: "rollUnder", label: "Roll under your stat" },
  { value: "pool", label: "Dice pool, counting successes" },
  { value: "bands", label: "2d6 bands (full success, partial, fail)" },
  { value: "percentile", label: "Percentile (roll d100 under your skill)" },
  { value: "step", label: "Step dice (d4 to d12)" },
  { value: "none", label: "No dice (cards, tokens or narration)" },
  { value: "other", label: "Other" },
];

function coreFields(view: NodeView, ed: FieldMaker): HTMLElement[] {
  const family = String(view.fields.family ?? "rollOver");
  const out = [ed.row("How a check works", "family", ed.select("family", FAMILIES))];
  // Dice as chips, not a typing box (backlog 3), with Other for anything unusual.
  const dice = family === "pool" ? ["d6", "d10"] : family === "rollUnder" ? ["d20", "3d6", "d100", "2d6"] : ["d20", "d12", "d10", "d6", "2d6", "3d6", "d100"];
  if (family === "rollOver" || family === "rollUnder" || family === "pool") out.push(ed.row(family === "pool" ? "Dice in the pool" : "Dice rolled", "die", chips(dice, String(view.fields.die ?? ""), (v) => void ed.save(() => api.setField(view.id, "die", v)), { disabled: view.readOnly, other: "Other dice, such as d30 or 4dF", label: "Dice rolled" })));
  if (family === "rollOver") out.push(ed.row("The number to beat is called", "target", ed.text("target", "For example Difficulty, or DC")));
  if (family === "pool") out.push(ed.row("A die succeeds on", "target", ed.text("target", "For example 5 (meaning 5 or more)")));
  if (family === "bands") out.push(ed.row("Full success at", "target", ed.text("target", "For example 10 (7 to 9 is a partial success)")));
  if (family === "none") out.push(ed.row("Outcomes are decided by", "target", ed.text("target", "For example drawing cards")));
  return out;
}

/** Maximum hit points: [Constitution] [score] [+] [10], built from blocks, never typed. */
function formulaEditor(view: NodeView, key: string, abilities: Option[], ed: FieldMaker) {
  type Term = { op: "+" | "-"; ability?: Link; use?: "score" | "bonus"; number?: number };
  const v = view.fields[key];
  const terms: Term[] = typeof v === "number" ? [{ op: "+", number: v }] : isObj(v) && Array.isArray(v.formula) ? (v.formula as unknown as Term[]) : [{ op: "+", number: 0 }];
  const save = (next: Term[]) => {
    const value = next.length === 1 && next[0]!.op === "+" && next[0]!.number !== undefined ? next[0]!.number : { formula: next as unknown as Value[] };
    return ed.save(() => api.setField(view.id, key, value as Value));
  };
  const what = (t: Term) => (t.ability ? `${t.ability.link}|${t.use ?? "score"}` : "number");
  const options = [
    { value: "number", label: "A number" },
    ...abilities.flatMap((a) => [
      { value: `${a.id}|score`, label: `${a.name} score` },
      { value: `${a.id}|bonus`, label: `${a.name} bonus` },
    ]),
  ];
  const rows = terms.map((t, i) => {
    const missing = t.ability && !abilities.some((a) => a.id === t.ability!.link);
    const opts = missing ? [{ value: what(t), label: `[missing: ${view.missing[t.ability!.link] ?? "something removed"}]` }, ...options] : options;
    return h(
      "div",
      { class: `formula-term${missing ? " broken" : ""}` },
      i === 0 && t.op === "+"
        ? null
        : ed.plainSelect(t.op, [
            { value: "+", label: "+" },
            { value: "-", label: "−" },
          ], (op) => save(terms.map((x, j) => (j === i ? { ...x, op: op as "+" | "-" } : x))), `f-${key}-op-${i}`),
      ed.plainSelect(what(t), opts, (w) => {
        const next: Term = w === "number" ? { op: t.op, number: t.number ?? 0 } : { op: t.op, ability: { link: w.split("|")[0]! }, use: w.split("|")[1] as "score" | "bonus" };
        return save(terms.map((x, j) => (j === i ? next : x)));
      }, `f-${key}-what-${i}`),
      t.ability ? null : ed.plainNumber(t.number ?? 0, (n) => save(terms.map((x, j) => (j === i ? { ...x, number: n } : x))), `f-${key}-num-${i}`),
      terms.length > 1 && !view.readOnly ? h("button", { class: "icon-button small", title: "Remove this block", "aria-label": "Remove this block", onClick: () => void save(terms.filter((_, j) => j !== i)) }, svg(ICONS.close)) : null,
    );
  });
  return h(
    "div",
    { class: "formula" },
    rows,
    view.readOnly ? null : h("button", { class: "link small", onClick: () => void save([...terms, { op: "+", number: 0 }]) }, "+ Add a block"),
  );
}

/** Hunger 5 applies Hungry; Hunger 8 applies Starving. */
function thresholdsEditor(view: NodeView, conditions: Option[], ed: FieldMaker) {
  type Th = { at: number; condition: Link | null };
  const list = (Array.isArray(view.fields.thresholds) ? view.fields.thresholds : []) as unknown as Th[];
  const save = (next: Th[]) => ed.save(() => api.setField(view.id, "thresholds", next as unknown as Value));
  return h(
    "div",
    { class: "thresholds" },
    list.map((t, i) =>
      h(
        "div",
        { class: "inline" },
        "At ",
        ed.plainNumber(t.at, (n) => save(list.map((x, j) => (j === i ? { ...x, at: n } : x))), `f-th-at-${i}`),
        " you are ",
        ed.plainLinkSelect(t.condition, conditions, "Choose a condition…", (id) => save(list.map((x, j) => (j === i ? { ...x, condition: id ? { link: id } : null } : x))), `f-th-c-${i}`),
        view.readOnly ? null : h("button", { class: "icon-button small", title: "Remove", "aria-label": "Remove this threshold", onClick: () => void save(list.filter((_, j) => j !== i)) }, svg(ICONS.close)),
      ),
    ),
    conditions.length ? null : h("p", { class: "muted small" }, "Add conditions (such as Hungry) in the Conditions section to use them here."),
    view.readOnly ? null : h("button", { class: "link small", onClick: () => void save([...list, { at: 0, condition: null }]) }, "+ Add a threshold"),
  );
}

