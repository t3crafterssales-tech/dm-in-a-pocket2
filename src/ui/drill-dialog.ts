// Drilling into a brick on a sheet: change this copy only (its name, values, when it works, how
// often, a saving throw, and what happens inside it). The library original is untouched.

import type { AttachmentDetail, Choices, LibrarySection, NodeView } from "../app/backend.ts";
import { api } from "./api.ts";
import { attempt } from "./common.ts";
import { openDialog } from "./dialogs.ts";
import { h, svg } from "./dom.ts";
import { ICONS } from "./icons.ts";
import type { PlaceCtx } from "./place.ts";

type Value = NodeView["fields"][string];

const TRIGGER_GROUPS: { label: string; options: [string, string][] }[] = [
  { label: "Always", options: [["always", "Always on"]] },
  {
    label: "On an event",
    options: [
      ["hit", "On a hit"],
      ["crit", "On a critical hit"],
      ["nat", "On a natural roll of…"],
      ["whenHit", "When hit"],
      ["bloodied", "When bloodied"],
      ["zero", "When the wielder drops to 0"],
      ["flanked", "When the target is flanked"],
      ["unaware", "When the target is unaware"],
      ["belowHalf", "When the target is below half health"],
    ],
  },
  {
    label: "By choice",
    options: [
      ["action", "As an action"],
      ["bonus", "As a bonus action"],
      ["reaction", "As a reaction"],
    ],
  },
  { label: "Other", options: [["custom", "Something else (in your words)"]] },
];

/** Which values of a brick can be changed on one sheet, by type. */
const VALUES: Record<string, { key: string; label: string; kind: "text" | "number" | "ability" | "condition" }[]> = {
  attack: [
    { key: "ability", label: "Ability", kind: "ability" },
    { key: "dice", label: "Damage dice", kind: "text" },
    { key: "damageType", label: "Damage type", kind: "text" },
  ],
  damage: [
    { key: "dice", label: "Damage dice", kind: "text" },
    { key: "damageType", label: "Damage type", kind: "text" },
  ],
  spell: [
    { key: "dice", label: "Damage dice", kind: "text" },
    { key: "damageType", label: "Damage type", kind: "text" },
    { key: "wording", label: "What it does", kind: "text" },
  ],
  effect: [
    { key: "condition", label: "Condition", kind: "condition" },
    { key: "wording", label: "What it does", kind: "text" },
  ],
  immunity: [{ key: "condition", label: "Condition", kind: "condition" }],
  abilityBonus: [
    { key: "ability", label: "Ability", kind: "ability" },
    { key: "amount", label: "Amount", kind: "number" },
  ],
  armor: [{ key: "bonus", label: "Armour bonus", kind: "number" }],
  trait: [{ key: "wording", label: "What it does", kind: "text" }],
};

export async function openDrill(sheet: NodeView, aid: string, ctx: PlaceCtx) {
  const [choices, library] = await Promise.all([attempt(() => api.choices()), attempt(() => api.library())]);
  let detail = await attempt(() => api.attachmentDetail(sheet.id, aid));
  if (!detail) return;
  const d = openDialog(`${detail.ownName || detail.originalName} on ${sheet.name}`, { wide: true, onClose: () => void ctx.refresh() });
  const redraw = async () => {
    const next = await attempt(() => api.attachmentDetail(sheet.id, aid));
    if (!next) return d.close();
    detail = next;
    draw();
  };
  const save = async (patch: Parameters<typeof api.editAttachment>[2]) => {
    await attempt(() => api.editAttachment(sheet.id, aid, patch));
    await redraw();
  };
  const draw = () => {
    const x = detail!;
    const ro = sheet.readOnly || !!x.inheritedFrom || x.missing;
    d.body.replaceChildren(...body(x, ro, choices ?? { abilities: [], conditions: [], resources: [] }, library ?? [], save, sheet, aid, redraw, ctx, d.close));
  };
  draw();
  d.footer.append(h("span", { class: "spacer" }), h("button", { class: "button primary", onClick: () => d.close() }, "Done"));
}

function body(x: AttachmentDetail, ro: boolean, c: Choices, library: LibrarySection[], save: (p: Parameters<typeof api.editAttachment>[2]) => Promise<void>, sheet: NodeView, aid: string, redraw: () => Promise<void>, ctx: PlaceCtx, close: () => void): HTMLElement[] {
  const out: HTMLElement[] = [];
  if (x.inheritedFrom)
    out.push(
      h(
        "p",
        { class: "multi-note" },
        `This comes from ${x.inheritedFrom.name}. Change it there, and ${sheet.name} follows. `,
        h("button", { class: "link", onClick: () => (close(), ctx.select(x.inheritedFrom!.id)) }, `Open ${x.inheritedFrom.name}`),
      ),
    );
  if (x.missing) out.push(h("p", { class: "multi-note broken-note" }, `The library original (${x.originalName}) was removed. Restore it from the recycle bin, or remove this from the sheet.`));
  out.push(h("p", { class: "summary" }, x.sentence));
  out.push(h("p", { class: "muted small" }, `Changes here are for ${sheet.name} only; the library's ${x.originalName} is untouched. Values you change get a pencil mark.`));

  // Name on this sheet only.
  const name = h("input", { class: "text-input", value: x.ownName ?? "", placeholder: x.originalName, disabled: ro, maxlength: 200 });
  name.addEventListener("change", () => void save({ name: name.value }));
  name.addEventListener("keydown", (e) => e.key === "Enter" && name.blur());
  out.push(row("Name on this sheet", name, x.ownName ? resetLink("Use the original's name", () => save({ name: null }), ro) : null));

  // Its values.
  for (const v of VALUES[x.type] ?? []) {
    const own = v.key in x.overrides;
    const current = own ? x.overrides[v.key] : x.original[v.key];
    let control: HTMLElement;
    if (v.kind === "ability" || v.kind === "condition") {
      const list = v.kind === "ability" ? c.abilities : c.conditions;
      const id = isLink(current) ? current.link : "";
      const sel = h("select", { class: "text-input select", disabled: ro }, h("option", { value: "" }, v.kind === "ability" ? "No ability" : "No condition"), list.map((o) => h("option", { value: o.id, selected: o.id === id }, o.name)));
      sel.addEventListener("change", () => void save({ overrides: { [v.key]: sel.value ? { link: sel.value } : null } }));
      control = sel;
    } else {
      const input = h("input", { class: `text-input${v.kind === "number" ? " number-input" : ""}`, type: v.kind === "number" ? "number" : "text", value: own && current !== null && current !== undefined ? String(current) : "", placeholder: current !== null && current !== undefined && !own ? String(current) : "", disabled: ro });
      input.addEventListener("change", () => {
        const raw = input.value.trim();
        if (!raw) return void save({ overrides: { [v.key]: null } });
        if (v.kind === "number" && !Number.isFinite(Number(raw))) return;
        void save({ overrides: { [v.key]: v.kind === "number" ? Number(raw) : raw } });
      });
      input.addEventListener("keydown", (e) => e.key === "Enter" && input.blur());
      control = input;
    }
    out.push(row(v.label, control, own ? pencilReset(() => save({ overrides: { [v.key]: null } }), ro) : null));
  }

  // When it works.
  const act = x.activation;
  const triggers = h(
    "div",
    { class: "thresholds" },
    act.when.map((w, i) => {
      const sel = h(
        "select",
        { class: "text-input select", disabled: ro },
        TRIGGER_GROUPS.map((g) => h("optgroup", { label: g.label }, g.options.map(([id, label]) => h("option", { value: id, selected: id === w }, label)))),
      );
      sel.addEventListener("change", () => {
        const when = act.when.map((x2, j) => (j === i ? sel.value : x2)).filter((x2, j, arr) => x2 !== "always" || arr.length === 1);
        void save({ activation: { ...act, when: when.length ? when : ["always"], ...(sel.value === "nat" && !act.natural ? { natural: 20 } : {}) } });
      });
      const extra: HTMLElement[] = [];
      if (w === "nat") {
        const n = h("input", { class: "text-input number-input", type: "number", min: "1", max: "20", value: String(act.natural ?? 20), disabled: ro, "aria-label": "Lowest natural roll" });
        n.addEventListener("change", () => Number.isFinite(Number(n.value)) && void save({ activation: { ...act, natural: Math.max(1, Math.min(20, Number(n.value))) } }));
        extra.push(h("span", { class: "muted small" }, "or higher:"), n);
      }
      if (w === "custom") {
        const t = h("input", { class: "text-input", value: act.custom ?? "", placeholder: "For example: under a full moon", disabled: ro });
        t.addEventListener("change", () => void save({ activation: { ...act, custom: t.value } }));
        extra.push(t);
      }
      const remove = act.when.length > 1 && !ro ? h("button", { class: "icon-button small", title: "Remove this trigger", "aria-label": "Remove this trigger", onClick: () => void save({ activation: { ...act, when: act.when.filter((_, j) => j !== i) } }) }, svg(ICONS.close)) : null;
      return h("div", { class: "inline wrap" }, i > 0 ? h("span", { class: "muted small" }, act.join === "all" ? "and" : "or") : null, sel, ...extra, remove);
    }),
    h(
      "div",
      { class: "inline" },
      ro || act.when.includes("always") ? null : h("button", { class: "link small", onClick: () => void save({ activation: { ...act, when: [...act.when, "hit"] } }) }, "+ Another trigger"),
      act.when.length > 1
        ? (() => {
            const j = h("select", { class: "text-input select", disabled: ro }, h("option", { value: "any", selected: act.join === "any" }, "Any of them (or)"), h("option", { value: "all", selected: act.join === "all" }, "All of them (and)"));
            j.addEventListener("change", () => void save({ activation: { ...act, join: j.value as "any" | "all" } }));
            return j;
          })()
        : null,
    ),
  );
  out.push(row("When it works", triggers, null));

  // How often.
  const count = h("input", { class: "text-input number-input", value: x.uses ? String(x.uses.count) : "", placeholder: "No limit", disabled: ro, title: "A number, or a formula such as INT" });
  const per = h("select", { class: "text-input select", disabled: ro }, [["", "no limit"], ["short rest", "per short rest"], ["long rest", "per long rest"], ["day", "per day"]].map(([v, l]) => h("option", { value: v, selected: (x.uses?.per ?? "") === v }, l)));
  const saveUses = () => {
    const raw = count.value.trim();
    if (!raw && !per.value) return void save({ uses: null });
    void save({ uses: { count: /^\d+$/.test(raw) ? Number(raw) : raw || 1, per: per.value } });
  };
  count.addEventListener("change", saveUses);
  per.addEventListener("change", saveUses);
  out.push(row("How often", h("div", { class: "inline" }, count, per), null));

  // A saving throw.
  const s = x.save;
  const on = h("input", { type: "checkbox", checked: !!s, disabled: ro });
  on.addEventListener("change", () => void save({ save: on.checked ? { ability: null, dc: 10, onSuccess: "no effect" } : null }));
  const saveParts: HTMLElement[] = [h("label", { class: "check" }, on, "The target gets a saving throw")];
  if (s) {
    const ab = h("select", { class: "text-input select", disabled: ro }, h("option", { value: "" }, "Which ability?"), c.abilities.map((o) => h("option", { value: o.id, selected: o.id === s.ability?.link }, o.name)));
    ab.addEventListener("change", () => void save({ save: { ...s, ability: ab.value ? { link: ab.value } : null } }));
    const dc = h("input", { class: "text-input number-input", value: String(s.dc), disabled: ro, "aria-label": "Difficulty" });
    dc.addEventListener("change", () => void save({ save: { ...s, dc: /^\d+$/.test(dc.value.trim()) ? Number(dc.value) : dc.value.trim() || 10 } }));
    const succ = h("select", { class: "text-input select", disabled: ro }, [["no effect", "Success: no effect"], ["half", "Success: half effect"]].map(([v, l]) => h("option", { value: v, selected: s.onSuccess === v }, l)));
    succ.addEventListener("change", () => void save({ save: { ...s, onSuccess: succ.value } }));
    saveParts.push(h("div", { class: "inline wrap" }, ab, "DC", dc, succ));
  }
  out.push(row("Saving throw", h("div", { class: "thresholds" }, saveParts), null));

  // What happens inside it.
  const add = h(
    "select",
    { class: "text-input select", disabled: ro },
    h("option", { value: "" }, "+ Add inside it…"),
    library.filter((sec) => sec.type !== "item" && sec.entries.length).map((sec) => h("optgroup", { label: sec.title }, sec.entries.map((e) => h("option", { value: e.id }, e.name)))),
  );
  add.addEventListener("change", async () => {
    if (!add.value) return;
    await attempt(() => api.attachInside(sheet.id, aid, [add.value]));
    await redraw();
  });
  out.push(
    row(
      "Inside it",
      h(
        "div",
        { class: "thresholds" },
        x.children.length ? null : h("p", { class: "muted small" }, "Bricks inside happen only when this one does: Fire inside Knocked prone burns only when the target is knocked down."),
        x.children.map((ch) =>
          h(
            "div",
            { class: "brick-card nested" },
            h(
              "div",
              { class: "brick-card-head" },
              h("button", { class: "brick-name link-plain", title: "Change this one", onClick: () => void openDrill(sheet, ch.aid, ctx) }, ch.name),
              ro ? null : h("button", { class: "icon-button small", title: "Remove", "aria-label": `Remove ${ch.name}`, onClick: async () => (await attempt(() => api.removeAttachment(sheet.id, ch.aid)), await redraw()) }, svg(ICONS.close)),
            ),
            h("div", { class: "brick-sentence" }, ch.sentence),
          ),
        ),
        ro ? null : add,
      ),
      null,
    ),
  );
  return out;
}

function row(label: string, control: HTMLElement, after: HTMLElement | null) {
  return h("div", { class: "field" }, h("div", { class: "field-label" }, label, after), control);
}

function pencilReset(run: () => Promise<void>, ro: boolean) {
  return h("span", { class: "pencil", title: "Changed on this sheet only" }, svg(ICONS.pencil), ro ? null : h("button", { class: "link small", onClick: () => void run() }, "Use the original's"));
}

function resetLink(label: string, run: () => Promise<void>, ro: boolean) {
  return h("span", { class: "pencil" }, svg(ICONS.pencil), ro ? null : h("button", { class: "link small", onClick: () => void run() }, label));
}

function isLink(v: Value | undefined): v is { link: string } {
  return !!v && typeof v === "object" && !Array.isArray(v) && typeof (v as { link?: unknown }).link === "string";
}
