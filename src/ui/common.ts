// Pieces every screen shares: the logo that glows on save, top-bar buttons, and running an action
// with any problem shown as a notice.

import { AppError } from "./api.ts";
import { notice } from "./dialogs.ts";
import { h, svg } from "./dom.ts";
import { LOGO } from "./icons.ts";

export const app = document.getElementById("app")!;

/** Moving between screens, filled in by the screens themselves (so they needn't import each other). */
export const nav = {
  home: async (_highlight?: string) => {},
};

// One logo for the whole app, moved between screens, so a redraw never cuts its glow short.
const logo = svg(LOGO);
logo.addEventListener("animationend", () => logo.classList.remove("pulse"));

export function pulseLogo() {
  logo.classList.remove("pulse");
  void (logo as unknown as HTMLElement).getBoundingClientRect();
  logo.classList.add("pulse");
}

export function brand(): HTMLElement {
  return h("div", { class: "brand", title: "The logo glows each time your work is saved" }, logo, h("span", { class: "brand-name" }, "DM in a Pocket"));
}

export function iconButton(icon: string, label: string, onClick: () => void, opts: { disabled?: boolean; title?: string; badge?: number; iconOnly?: boolean } = {}) {
  return h(
    "button",
    { class: `top-button${opts.iconOnly ? " icon-only" : ""}`, disabled: !!opts.disabled, title: opts.title ?? label, "aria-label": label, onClick },
    svg(icon),
    opts.iconOnly ? null : h("span", null, label),
    opts.badge ? h("span", { class: "count-badge", "aria-label": `${opts.badge} in the bin` }, opts.badge) : null,
  );
}

/** Runs an action and shows any problem as a red notice instead of failing quietly. */
export async function attempt<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    notice(e instanceof AppError || e instanceof Error ? e.message : String(e), "red");
    return undefined;
  }
}

/** True when the key press belongs to a text box or drop-down, which handle their own keys. */
export function typingIn(e: KeyboardEvent): boolean {
  return (e.target as HTMLElement).matches?.("input, textarea, select") ?? false;
}
