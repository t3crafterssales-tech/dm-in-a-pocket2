// The text box for everything you write (version 3): a toolbar with fonts, sizes, bold, italic,
// underline, strikethrough, colour, headings, lists and alignment. It stands in for the plain text
// area anywhere one was: it has a `value` and fires `change` when you leave it, so the places that
// use it hardly change. Plain writing is still saved as plain text; only formatting makes it rich.

import { RICH_FONTS, RICH_SIZES, cleanRich, fromEditor, isRich, toEditable, units } from "../engine/richtext.ts";
import { h } from "./dom.ts";

export interface RichOptions {
  /** Shows as a hint while empty. */
  placeholder?: string;
  disabled?: boolean;
  /** Roughly how many lines tall it starts. */
  rows?: number;
  /** Used to put the cursor back after the screen redraws, like any other box. */
  key?: string;
  label?: string;
  autofocus?: boolean;
  className?: string;
}

export type RichBox = HTMLElement & { value: string };

const exec = (cmd: string, value?: string) => document.execCommand(cmd, false, value);

export function richBox(text: string, opts: RichOptions = {}): RichBox {
  const edit = h("div", {
    class: "rich-edit",
    contenteditable: opts.disabled ? "false" : "true",
    role: "textbox",
    "aria-multiline": "true",
    "aria-label": opts.label ?? "Text",
    "aria-readonly": opts.disabled ? "true" : "false",
    "data-placeholder": opts.placeholder ?? "",
    "data-key": opts.key ?? null,
    "data-autofocus": opts.autofocus ? "" : null,
    style: `min-height:${(opts.rows ?? 4) * 1.5}em`,
  });
  edit.innerHTML = toEditable(text);
  let stored = text;
  const syncEmpty = () => edit.classList.toggle("is-empty", !edit.textContent?.trim() && !edit.querySelector("li, h1, h2, h3"));
  syncEmpty();

  const read = () => fromEditor(edit.innerHTML);
  const box = h("div", { class: `rich-box${opts.className ? ` ${opts.className}` : ""}${opts.disabled ? " read-only" : ""}` }) as unknown as RichBox;
  Object.defineProperty(box, "value", { get: () => read(), set: (v: string) => ((edit.innerHTML = toEditable(v)), (stored = v), syncEmpty()) });

  // ---------- Toolbar ----------
  const keepSelection = (b: HTMLElement) => b.addEventListener("mousedown", (e) => e.preventDefault());
  const button = (label: string, title: string, run: () => void, cls = "") => {
    const b = h("button", { class: `rich-btn ${cls}`.trim(), type: "button", title, "aria-label": title, onClick: () => (edit.focus(), run(), after()) }, label);
    keepSelection(b);
    return b;
  };
  const select = (title: string, options: [string, string][], onPick: (v: string) => void) => {
    const s = h("select", { class: "rich-select", title, "aria-label": title }, h("option", { value: "" }, title), options.map(([v, l]) => h("option", { value: v }, l)));
    s.addEventListener("change", () => {
      if (!s.value) return;
      edit.focus();
      onPick(s.value);
      s.value = "";
      after();
    });
    return s;
  };
  const after = () => {
    syncEmpty();
    // Anything pasted or made by the browser is tidied to what we keep.
    const clean = cleanRich(edit.innerHTML);
    if (clean !== edit.innerHTML) {
      // Keep the cursor where it was by only rewriting when it really differs.
      const sel = window.getSelection();
      const inside = !!sel && sel.anchorNode && edit.contains(sel.anchorNode);
      if (!inside) edit.innerHTML = clean;
    }
  };

  const colour = h("input", { class: "rich-colour", type: "color", value: "#1f1b16", title: "Text colour", "aria-label": "Text colour" });
  keepSelection(colour);
  colour.addEventListener("input", () => (edit.focus(), exec("styleWithCSS", "true"), exec("foreColor", colour.value), after()));

  const bar = h(
    "div",
    { class: "rich-bar", role: "toolbar", "aria-label": "Formatting" },
    select("Font", RICH_FONTS.map((f) => [f.css, f.name]), (css) => (exec("styleWithCSS", "true"), exec("fontName", css))),
    select("Size", RICH_SIZES.map((n) => [String(n), `${n}`]), (px) => {
      // The browser only knows seven sizes; ask for the biggest and swap in the real one.
      exec("styleWithCSS", "true");
      exec("fontSize", "7");
      for (const el of edit.querySelectorAll<HTMLElement>('font[size="7"], span[style*="xxx-large"]')) {
        el.removeAttribute("size");
        el.style.fontSize = `${px}px`;
      }
    }),
    select("Style", [["p", "Normal"], ["h1", "Heading 1"], ["h2", "Heading 2"], ["h3", "Heading 3"]], (tag) => exec("formatBlock", `<${tag}>`)),
    button("B", "Bold (Ctrl+B)", () => exec("bold"), "b"),
    button("I", "Italic (Ctrl+I)", () => exec("italic"), "i"),
    button("U", "Underline (Ctrl+U)", () => exec("underline"), "u"),
    button("S", "Strikethrough", () => exec("strikeThrough"), "s"),
    colour,
    button("•", "Bulleted list", () => exec("insertUnorderedList")),
    button("1.", "Numbered list", () => exec("insertOrderedList")),
    button("⟸", "Align left", () => exec("justifyLeft")),
    button("≡", "Centre", () => exec("justifyCenter")),
    button("⟹", "Align right", () => exec("justifyRight")),
    button("✕", "Clear formatting", () => exec("removeFormat")),
  );

  // ---------- Editing ----------
  edit.addEventListener("input", syncEmpty);
  // Pasted text keeps only what we keep: no stray fonts, scripts or page styles from other programs.
  edit.addEventListener("paste", (e) => {
    e.preventDefault();
    const html = e.clipboardData?.getData("text/html");
    const plain = e.clipboardData?.getData("text/plain") ?? "";
    exec("insertHTML", html ? cleanRich(html) : toEditable(plain));
    syncEmpty();
  });
  edit.addEventListener("keydown", (e) => {
    if (e.key === "Tab") return; // leave Tab for moving between boxes
  });
  edit.addEventListener("blur", () => {
    const now = read();
    if (now === stored) return;
    stored = now;
    box.dispatchEvent(new Event("change", { bubbles: true }));
  });

  if (opts.disabled) box.append(edit);
  else box.append(bar, edit);
  return box;
}

/** Stored text laid out for reading on screen (a description you can't edit, a pin, a card). */
export function richView(text: string, cls = ""): HTMLElement {
  const box = h("div", { class: `rich-view ${cls}`.trim() });
  for (const u of units(text)) {
    const e = h(u.tag === "p" || u.tag === "li" ? "p" : "div", { class: u.tag === "p" ? "" : `rt-${u.tag}` });
    if (u.tag === "li") {
      e.append(h("span", { class: "rt-mark" }, u.marker ?? "•"));
      const item = h("span", { class: "rt-item" });
      item.innerHTML = u.html;
      e.append(item);
    } else e.innerHTML = u.html;
    if (u.align !== "left") e.style.textAlign = u.align;
    box.append(e);
  }
  return box;
}

export { isRich };
