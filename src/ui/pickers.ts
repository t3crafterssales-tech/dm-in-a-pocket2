// Pickers instead of typing boxes: chips to click, number steppers with − and +, drop-downs that
// always end with an Add or Other. Each one saves straight away, as one undo step.

import { openDialog } from "./dialogs.ts";
import { h } from "./dom.ts";

/** A row of chips; the chosen one is lit. "Other…" asks for a value of your own. */
export function chips(options: string[], value: string, set: (v: string) => void, opts: { disabled?: boolean; other?: string; label?: string } = {}): HTMLElement {
  const own = value && !options.includes(value) ? [value] : [];
  return h(
    "div",
    { class: "pick-chips", role: "group", "aria-label": opts.label ?? "" },
    [...options, ...own].map((o) => h("button", { class: `pick-chip${o === value ? " on" : ""}`, disabled: !!opts.disabled, "aria-pressed": o === value ? "true" : "false", onClick: () => o !== value && set(o) }, o)),
    opts.other && !opts.disabled
      ? h(
          "button",
          {
            class: "pick-chip add",
            onClick: async () => {
              const v = await askText(opts.other!, "", opts.label ?? "");
              if (v) set(v);
            },
          },
          "Other…",
        )
      : null,
  );
}

/** Several chips that can each be on or off. */
export function toggleChips(options: string[], on: string[], set: (v: string[]) => void, opts: { disabled?: boolean; label?: string } = {}): HTMLElement {
  return h(
    "div",
    { class: "pick-chips", role: "group", "aria-label": opts.label ?? "" },
    options.map((o) => h("button", { class: `pick-chip${on.includes(o) ? " on" : ""}`, disabled: !!opts.disabled, "aria-pressed": on.includes(o) ? "true" : "false", onClick: () => set(on.includes(o) ? on.filter((x) => x !== o) : [...on, o]) }, o)),
  );
}

/** A number with − and + buttons. Typing a number works too. */
export function stepper(value: number | null, set: (n: number) => void, opts: { step?: number; min?: number; disabled?: boolean; label: string; key: string }): HTMLElement {
  const step = opts.step ?? 1;
  const min = opts.min ?? 0;
  const clamp = (n: number) => Math.max(min, Math.round(n * 100) / 100);
  const input = h("input", { class: "stepper-input", inputmode: "decimal", value: value === null ? "" : String(value), "aria-label": opts.label, "data-key": opts.key, disabled: !!opts.disabled });
  input.addEventListener("change", () => {
    const n = Number(input.value.replace(",", "."));
    if (input.value.trim() !== "" && Number.isFinite(n)) set(clamp(n));
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      set(clamp((value ?? 0) + (e.key === "ArrowUp" ? step : -step)));
    }
  });
  return h(
    "div",
    { class: "stepper" },
    h("button", { class: "stepper-button", disabled: !!opts.disabled || (value ?? 0) <= min, "aria-label": `Less ${opts.label.toLowerCase()}`, onClick: () => set(clamp((value ?? 0) - step)) }, "−"),
    input,
    h("button", { class: "stepper-button", disabled: !!opts.disabled, "aria-label": `More ${opts.label.toLowerCase()}`, onClick: () => set(clamp((value ?? 0) + step)) }, "+"),
  );
}

/** A drop-down that ends with "+ Add …", which asks for a new choice and picks it. */
export function addSelect(options: string[], value: string, set: (v: string) => void, opts: { add: string; label: string; key: string; disabled?: boolean; none?: string }): HTMLElement {
  const list = value && !options.includes(value) ? [value, ...options] : options;
  const sel = h(
    "select",
    { class: "text-input select pick-select", "aria-label": opts.label, "data-key": opts.key, disabled: !!opts.disabled },
    value ? null : h("option", { value: "", selected: true }, opts.none ?? "Choose…"),
    list.map((o) => h("option", { value: o, selected: o === value }, o)),
    h("option", { value: "__add" }, `+ ${opts.add}…`),
  );
  sel.addEventListener("change", async () => {
    if (sel.value !== "__add") return set(sel.value);
    sel.value = value;
    const v = await askText(opts.add, "", opts.label, "Once added, it appears in every list of this kind in this game.");
    if (v) set(v);
  });
  return sel;
}

/** A small pop-up asking for one value. */
export function askText(title: string, value: string, label: string, hint?: string): Promise<string | null> {
  return new Promise((resolve) => {
    let out: string | null = null;
    const d = openDialog(title, { onClose: () => resolve(out) });
    const input = h("input", { class: "text-input", value, "aria-label": label, maxlength: 120 });
    const ok = h("button", { class: "button primary" }, "OK");
    const accept = () => {
      if (!input.value.trim()) return;
      out = input.value.trim();
      d.close();
    };
    ok.addEventListener("click", accept);
    input.addEventListener("keydown", (e) => e.key === "Enter" && (e.preventDefault(), accept()));
    d.body.append(h("label", { class: "field-label" }, label), input, ...(hint ? [h("p", { class: "muted small" }, hint)] : []));
    d.footer.append(h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"), ok);
    input.focus();
  });
}

/** "4 lb." or "1.8 kg" read as a number in the chosen unit. */
export function weightIn(text: unknown, units: "lb" | "kg"): number | null {
  if (typeof text === "number") return text;
  if (typeof text !== "string") return null;
  const m = text.trim().match(/^(\d+(?:[.,]\d+)?)\s*(lb|lbs|pounds?|kg|kilograms?)?\.?$/i);
  if (!m) return null;
  const n = Number(m[1]!.replace(",", "."));
  const isKg = /^k/i.test(m[2] ?? "");
  if (isKg === (units === "kg")) return n;
  return Math.round((isKg ? n / 0.4536 : n * 0.4536) * 10) / 10;
}

export function weightText(n: number, units: "lb" | "kg"): string {
  return units === "kg" ? `${n} kg` : `${n} lb.`;
}

/** "15 gp" → { amount: 15, unit: "gp" }. */
export function parseCost(v: unknown): { amount: number; unit: string } | null {
  if (typeof v === "number") return { amount: v, unit: "" };
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*?)\.?$/);
  return m ? { amount: Number(m[1]!.replace(",", ".")), unit: m[2]!.trim() } : null;
}
