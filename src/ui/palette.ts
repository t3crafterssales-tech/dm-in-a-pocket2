// The command palette (Ctrl+K): type what you want in plain words ("new monster", "open Strength",
// "undo", "go to Lore") and press Enter. Shift+Enter opens a found thing in a window instead of the
// middle. Nothing here is new: every command is something the screens already do.

import type { SearchHit } from "../app/search.ts";
import { matchCommands } from "../app/palette-match.ts";
import { api } from "./api.ts";
import { attempt } from "./common.ts";
import { h } from "./dom.ts";

export interface PaletteCommand {
  label: string;
  /** Extra words that also find it ("print" finds the Rulebook). */
  words?: string;
  hint?: string;
  run: () => void | Promise<void>;
}

export interface PaletteHost {
  commands: PaletteCommand[];
  /** Opens a found thing in the middle. */
  open: (id: string) => void;
  /** Opens a found thing in a window. */
  window: (id: string) => void;
}

let openPaletteEl: HTMLElement | null = null;

export function paletteOpen(): boolean {
  return !!openPaletteEl?.isConnected;
}

export function openPalette(host: PaletteHost) {
  if (paletteOpen()) return;
  type Row = { label: string; hint: string; run: (shift: boolean) => void };
  let rows: Row[] = [];
  let at = 0;
  const input = h("input", { class: "text-input palette-input", placeholder: "Type a command or a name…  (new monster, open Strength, undo, go to Lore)", "aria-label": "Command palette" });
  const list = h("div", { class: "palette-list", role: "listbox" });
  const close = () => {
    ov.remove();
    openPaletteEl = null;
  };
  const show = () => {
    list.replaceChildren(
      ...(rows.length
        ? rows.map((r, i) =>
            h(
              "button",
              { class: `palette-row${i === at ? " active" : ""}`, role: "option", "aria-selected": i === at ? "true" : "false", onMousemove: () => i !== at && ((at = i), mark()), onClick: (e: MouseEvent) => (close(), r.run(e.shiftKey)) },
              h("span", { class: "palette-label" }, r.label),
              h("span", { class: "palette-hint muted small" }, r.hint),
            ),
          )
        : [h("p", { class: "muted small pad" }, "Nothing matches. Try a different word.")]),
    );
  };
  const mark = () => {
    [...list.children].forEach((el, i) => {
      el.classList.toggle("active", i === at);
      el.setAttribute("aria-selected", i === at ? "true" : "false");
    });
    (list.children[at] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  };
  let seq = 0;
  const update = async () => {
    const q = input.value.trim();
    const mine = ++seq;
    const cmds = matchCommands(host.commands, q).slice(0, q ? 8 : 12);
    const commandRows: Row[] = cmds.map((c) => ({ label: c.label, hint: c.hint ?? "Command", run: () => void c.run() }));
    rows = commandRows;
    at = 0;
    show();
    // Open <name>: things in the world that match what is typed (the same search as the top bar).
    const text = q.replace(/^(open|go to|find)\s+/i, "");
    if (text.length >= 2) {
      const r = await attempt(() => api.search(text));
      if (mine !== seq || !r) return;
      const found: Row[] = (r.hits as SearchHit[]).slice(0, 8).map((x) => ({ label: `Open ${x.name}`, hint: `${x.what} · Enter opens it, Shift+Enter in a window`, run: (shift) => (shift ? host.window(x.id) : host.open(x.id)) }));
      rows = [...commandRows, ...found];
      show();
    }
  };
  input.addEventListener("input", () => void update());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (rows.length) at = (at + (e.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length;
      mark();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = rows[at];
      if (r) {
        close();
        r.run(e.shiftKey);
      }
    }
  });
  const ov = h("div", { class: "overlay palette-ov", onMousedown: (e: MouseEvent) => e.target === ov && close() }, h("div", { class: "palette", role: "dialog", "aria-label": "Command palette" }, input, list));
  openPaletteEl = ov;
  document.body.appendChild(ov);
  void update();
  input.focus();
}
