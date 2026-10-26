// Right-click menus: a small list of choices beside the mouse, closed by Esc, a click anywhere else
// or choosing one. A choice that can't be used stays visible but greyed, and says why on hover.

import { h } from "./dom.ts";

export interface MenuItem {
  label: string;
  run: () => void | Promise<void>;
  /** Greyed out, with this as the reason shown on hover. */
  why?: string;
  danger?: boolean;
  /** A thin line above this item. */
  divider?: boolean;
}

let current: HTMLElement | null = null;

export function closeMenu() {
  current?.remove();
  current = null;
}

export function showMenu(x: number, y: number, items: MenuItem[]) {
  closeMenu();
  const menu = h(
    "div",
    { class: "context-menu", role: "menu" },
    items.map((it) =>
      h(
        "button",
        {
          class: `menu-item${it.danger ? " danger" : ""}${it.divider ? " with-line" : ""}`,
          role: "menuitem",
          disabled: !!it.why,
          title: it.why ?? "",
          onClick: () => (closeMenu(), void it.run()),
        },
        it.label,
      ),
    ),
  );
  document.body.appendChild(menu);
  current = menu;
  // Keep it on the screen.
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - r.width - 4))}px`;
  menu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - r.height - 4))}px`;
  (menu.querySelector("button:not(:disabled)") as HTMLElement | null)?.focus();
  const off = (e: Event) => {
    if (e.type === "keydown" && (e as KeyboardEvent).key !== "Escape") {
      const k = (e as KeyboardEvent).key;
      if (k === "ArrowDown" || k === "ArrowUp") {
        e.preventDefault();
        const all = [...menu.querySelectorAll<HTMLElement>("button:not(:disabled)")];
        const at = all.indexOf(document.activeElement as HTMLElement);
        all[(at + (k === "ArrowDown" ? 1 : all.length - 1)) % all.length]?.focus();
      }
      return;
    }
    if (e.type === "pointerdown" && menu.contains(e.target as Node)) return;
    closeMenu();
    document.removeEventListener("pointerdown", off, true);
    document.removeEventListener("keydown", off, true);
    window.removeEventListener("blur", off);
  };
  document.addEventListener("pointerdown", off, true);
  document.addEventListener("keydown", off, true);
  window.addEventListener("blur", off);
}
