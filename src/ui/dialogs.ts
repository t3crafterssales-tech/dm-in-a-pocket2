// Pop-ups and notices.

import { h, svg } from "./dom.ts";
import { ICONS } from "./icons.ts";

// ---------- Notices (like email notifications: they pile up in the corner and fade) ----------

export type NoticeColor = "blue" | "green" | "yellow" | "red";

export function notice(text: string, color: NoticeColor = "blue", action?: { label: string; run: () => void }, ms = 9000) {
  const host = document.getElementById("notices")!;
  const close = () => {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 200);
  };
  const el = h(
    "div",
    { class: `notice ${color}`, role: color === "red" ? "alert" : "status" },
    h("span", { class: "notice-text" }, text),
    action && h("button", { class: "link", onClick: () => (close(), action.run()) }, action.label),
    h("button", { class: "icon-button small", title: "Close", "aria-label": "Close", onClick: close }, svg(ICONS.close)),
  );
  host.appendChild(el);
  if (ms > 0) setTimeout(close, ms);
}

// ---------- Pop-ups ----------

export interface Dialog {
  el: HTMLElement;
  body: HTMLElement;
  footer: HTMLElement;
  close: () => void;
}

/** Opens a pop-up over the screen. Escape or the cross closes it. */
export function openDialog(title: string, opts: { wide?: boolean; onClose?: () => void } = {}): Dialog {
  const previous = document.activeElement as HTMLElement | null;
  const body = h("div", { class: "dialog-body" });
  const footer = h("div", { class: "dialog-footer" });
  const titleId = `dlg-${Math.random().toString(36).slice(2)}`;
  const box = h(
    "div",
    { class: `dialog${opts.wide ? " wide" : ""}`, role: "dialog", "aria-modal": "true", "aria-labelledby": titleId },
    h("div", { class: "dialog-head" }, h("h2", { id: titleId }, title), h("button", { class: "icon-button", title: "Close", "aria-label": "Close", onClick: () => close() }, svg(ICONS.close))),
    body,
    footer,
  );
  const overlay = h("div", { class: "overlay" }, box);
  const onKey = (e: KeyboardEvent) => {
    // With pop-ups stacked, Escape closes only the top one.
    const overlays = document.querySelectorAll(".overlay");
    if (overlays[overlays.length - 1] !== overlay) return;
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  };
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey, true);
    overlay.remove();
    previous?.focus?.();
    opts.onClose?.();
  };
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", onKey, true);
  document.body.appendChild(overlay);
  return { el: box, body, footer, close };
}

export interface Choice<T> {
  label: string;
  value: T;
  kind?: "primary" | "danger" | "plain";
  disabled?: boolean;
  title?: string;
}

/** Asks a question with buttons. Resolves to the chosen value, or null if closed. */
export function ask<T>(title: string, message: (Node | string)[], choices: Choice<T>[]): Promise<T | null> {
  return new Promise((resolve) => {
    let answered = false;
    const d = openDialog(title, { onClose: () => !answered && resolve(null) });
    for (const m of message) d.body.appendChild(typeof m === "string" ? h("p", null, m) : m);
    for (const c of choices) {
      const b = h("button", { class: `button ${c.kind ?? "plain"}`, disabled: !!c.disabled, title: c.title, onClick: () => ((answered = true), d.close(), resolve(c.value)) }, c.label);
      d.footer.appendChild(b);
    }
    (d.footer.querySelector("button.primary:not([disabled]), button.danger:not([disabled])") as HTMLElement | null)?.focus();
  });
}
