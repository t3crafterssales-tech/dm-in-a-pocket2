// Building the value boxes on an editor. Every value saves when you leave its box or press Enter,
// as one undo step, then the screen redraws so summaries and flags catch up.

import type { NodeView, Option } from "../app/backend.ts";
import { api } from "./api.ts";
import { attempt } from "./common.ts";
import { h, svg } from "./dom.ts";
import { ICONS } from "./icons.ts";
import type { PlaceCtx } from "./place.ts";

export type Value = NodeView["fields"][string];
export type Link = { link: string };

export class FieldMaker {
  private readonly view: NodeView;
  private readonly ctx: PlaceCtx;
  constructor(view: NodeView, ctx: PlaceCtx) {
    this.view = view;
    this.ctx = ctx;
  }

  /** Saves a change, then redraws so the summary and flags catch up. */
  async save(fn: () => Promise<unknown>) {
    await attempt(fn);
    await this.ctx.refresh();
  }

  /**
   * A pencil mark for a value this node set for itself: a variant's own value ("Use Goblin's"), or
   * a change made in this world to something from the system ("Use the system's").
   */
  pencil(key: string | string[]) {
    const keys = Array.isArray(key) ? key : [key];
    const v = this.view;
    const own = v.parent ? keys.filter((k) => v.own.includes(k)) : [];
    const here = keys.filter((k) => v.changedHere.includes(k) && !own.includes(k));
    if (!own.length && !here.length) return null;
    const ro = v.readOnly;
    return h(
      "span",
      { class: "pencil", title: own.length ? `Set on ${v.name} itself; ${v.parent!.name}'s changes no longer reach it.` : "Changed in this world. The system's other worlds are unaffected." },
      svg(ICONS.pencil),
      ro || !own.length ? null : h("button", { class: "link small", onClick: () => void this.save(async () => { for (const k of own) await api.useParentValue(v.id, k); }) }, `Use ${v.parent!.name}'s`),
      ro || !here.length ? null : h("button", { class: "link small", onClick: () => void this.save(async () => { for (const k of here) await api.useSystemValue(v.id, k); }) }, "Use the system's"),
    );
  }

  row(label: string, key: string | string[], control: HTMLElement) {
    return h("div", { class: "field" }, h("div", { class: "field-label" }, label, this.pencil(key)), control);
  }

  text(key: string, placeholder = "") {
    const v = this.view.fields[key];
    const input = h("input", { class: "text-input", value: typeof v === "string" || typeof v === "number" ? String(v) : "", placeholder, "data-key": `f-${key}`, disabled: this.view.readOnly, maxlength: 500 });
    input.addEventListener("change", () => void this.save(() => api.setField(this.view.id, key, input.value)));
    input.addEventListener("keydown", (e) => e.key === "Enter" && input.blur());
    return input;
  }

  number(key: string, min?: number) {
    const v = this.view.fields[key];
    return this.plainNumber(v, (n) => api.setField(this.view.id, key, min !== undefined ? Math.max(min, n) : n), `f-${key}`);
  }

  plainNumber(v: Value | undefined, set: (n: number) => Promise<unknown>, dataKey: string) {
    const input = h("input", { class: "text-input number-input", type: "number", value: typeof v === "number" ? String(v) : "", "data-key": dataKey, disabled: this.view.readOnly });
    input.addEventListener("change", () => {
      if (input.value.trim() === "" || !Number.isFinite(Number(input.value))) return;
      void this.save(() => set(Number(input.value)));
    });
    input.addEventListener("keydown", (e) => e.key === "Enter" && input.blur());
    return input;
  }

  select(key: string, options: { value: string; label: string }[]) {
    const v = this.view.fields[key];
    return this.plainSelect(typeof v === "string" ? v : "", options, (value) => api.setField(this.view.id, key, value), `f-${key}`);
  }

  plainSelect(value: string, options: { value: string; label: string }[], set: (v: string) => Promise<unknown>, dataKey: string) {
    const sel = h(
      "select",
      { class: "text-input select", "data-key": dataKey, disabled: this.view.readOnly },
      options.some((o) => o.value === value) ? null : h("option", { value: "", disabled: true, selected: true }, "Choose…"),
      options.map((o) => h("option", { value: o.value, selected: o.value === value }, o.label)),
    );
    sel.addEventListener("change", () => void this.save(() => set(sel.value)));
    return sel;
  }

  /** A drop-down of nodes. A link to something that is gone shows as [missing: ...] in red. */
  linkSelect(key: string, options: Option[], none: string) {
    return this.plainLinkSelect(asLink(this.view.fields[key]), options, none, (id) => api.setField(this.view.id, key, id ? { link: id } : null), `f-${key}`);
  }

  plainLinkSelect(current: Link | null, options: Option[], none: string, set: (id: string | null) => Promise<unknown>, dataKey: string) {
    const id = current?.link ?? "";
    const missing = !!id && !options.some((o) => o.id === id);
    const sel = h(
      "select",
      { class: `text-input select${missing ? " broken" : ""}`, "data-key": dataKey, disabled: this.view.readOnly },
      h("option", { value: "" }, none),
      missing ? h("option", { value: id, selected: true }, `[missing: ${this.view.missing[id] ?? "something removed"}]`) : null,
      options.map((o) => h("option", { value: o.id, selected: o.id === id }, o.label ? `${o.name} (${o.label})` : o.name)),
    );
    sel.addEventListener("change", () => void this.save(() => set(sel.value || null)));
    return sel;
  }

  checkbox(checked: boolean, set: (on: boolean) => Promise<unknown>, dataKey: string) {
    const box = h("input", { type: "checkbox", checked, "data-key": dataKey, disabled: this.view.readOnly });
    box.addEventListener("change", () => void this.save(() => set(box.checked)));
    return box;
  }
}

export function isObj(v: Value | undefined): v is { [k: string]: Value } {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function asLink(v: Value | undefined): Link | null {
  return isObj(v) && typeof v.link === "string" ? { link: v.link } : null;
}
