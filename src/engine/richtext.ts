// Rich text (version 3): every content text box can hold formatted text. It is stored as a small,
// safe piece of HTML in the same text string the plain boxes always used, starting with a marker;
// text without the marker is plain, as it always was, so every older file still reads the same.
// Only a short list of tags and styles survives `cleanRich`, whatever is pasted or imported.
// Pure and without a window, so the rulebook, search and tests all read it the same way.

export const RICH_MARK = "<!--rt-->";

/** The fonts offered: the fonts every Windows and Mac already has, so nothing has to ship or load. */
export const RICH_FONTS: { id: string; name: string; css: string }[] = [
  { id: "serif", name: "Book serif", css: "Georgia, 'Times New Roman', serif" },
  { id: "sans", name: "Clean sans", css: "'Segoe UI', Arial, sans-serif" },
  { id: "classic", name: "Classic", css: "'Palatino Linotype', Palatino, 'Book Antiqua', serif" },
  { id: "mono", name: "Typewriter", css: "Consolas, 'Courier New', monospace" },
  { id: "script", name: "Handwritten", css: "'Segoe Script', 'Brush Script MT', cursive" },
];

export const RICH_SIZES = [10, 12, 14, 16, 18, 22, 28, 36];

const BLOCKS = new Set(["p", "h1", "h2", "h3", "ul", "ol", "li", "div"]);
const INLINE = new Set(["strong", "em", "u", "s", "span", "br"]);
const ALIGNS = new Set(["left", "center", "right", "justify"]);

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1]!.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const isRich = (text: string): boolean => typeof text === "string" && text.startsWith(RICH_MARK);

const canon = (s: string) => s.toLowerCase().replace(/["']/g, "").replace(/\s+/g, " ").trim();
const FONT_BY_CANON = new Map(RICH_FONTS.map((f) => [canon(f.css), f.css]));

function colourOf(v: string): string | null {
  const s = v.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  const m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(s);
  if (m) return `#${[m[1], m[2], m[3]].map((x) => Math.min(255, Number(x)).toString(16).padStart(2, "0")).join("")}`;
  return null;
}

/** Keeps only the styles we know: colour, one of our fonts, a size, and alignment (blocks only). */
function cleanStyle(style: string, block: boolean): string {
  const out: string[] = [];
  for (const part of style.split(";")) {
    const i = part.indexOf(":");
    if (i < 0) continue;
    const k = part.slice(0, i).trim().toLowerCase();
    const v = part.slice(i + 1).trim();
    if (!block && k === "color") {
      const c = colourOf(v);
      if (c) out.push(`color: ${c}`);
    } else if (!block && k === "font-family") {
      const f = FONT_BY_CANON.get(canon(v));
      if (f) out.push(`font-family: ${f}`);
    } else if (!block && k === "font-size") {
      const m = /^(\d+(?:\.\d+)?)px$/.exec(v);
      if (m && Number(m[1]) >= 8 && Number(m[1]) <= 72) out.push(`font-size: ${Math.round(Number(m[1]))}px`);
    } else if (block && k === "text-align" && ALIGNS.has(v.toLowerCase()) && v.toLowerCase() !== "left") out.push(`text-align: ${v.toLowerCase()}`);
  }
  return out.join("; ");
}

const ALIAS: Record<string, string> = { b: "strong", i: "em", strike: "s", del: "s", ins: "u" };

/** Makes any HTML safe: only our tags and styles stay; loose text gets a paragraph; empty things go. */
export function cleanRich(html: string): string {
  const out: string[] = [];
  const stack: string[] = [];
  let loose = false; // inside a paragraph we opened ourselves for loose text
  const closeLoose = () => {
    if (loose) {
      out.push("</p>");
      loose = false;
    }
  };
  const tokens = html.replace(/^<!--rt-->/, "").match(/<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>|[^<]+|</g) ?? [];
  const closeTo = (name: string) => {
    const at = stack.lastIndexOf(name);
    if (at < 0) return;
    while (stack.length > at) out.push(`</${stack.pop()}>`);
  };
  for (const tok of tokens) {
    if (tok.startsWith("<!--")) continue;
    const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>$/.exec(tok);
    if (!m) {
      const text = escape(decode(tok));
      if (!text.trim() && !stack.length) continue;
      if (!stack.length) {
        out.push("<p>");
        loose = true;
      } else if (stack.length === 1 && (stack[0] === "ul" || stack[0] === "ol") && !text.trim()) continue;
      out.push(text);
      continue;
    }
    const closing = m[1] === "/";
    let name = m[2]!.toLowerCase();
    name = ALIAS[name] ?? name;
    if (name === "br") {
      if (!closing && stack.length) out.push("<br>");
      continue;
    }
    if (!BLOCKS.has(name) && !INLINE.has(name)) continue; // unknown: drop the tag, keep what's inside it
    if (name === "div") name = "p";
    if (closing) {
      closeTo(name);
      continue;
    }
    const style = /style\s*=\s*"([^"]*)"|style\s*=\s*'([^']*)'/i.exec(m[3] ?? "");
    const css = cleanStyle(decode(style?.[1] ?? style?.[2] ?? ""), BLOCKS.has(name));
    if (BLOCKS.has(name)) {
      closeLoose();
      // A block can't sit inside another block, except items in a list.
      if (name === "li") {
        if (stack.at(-1) === "li") closeTo("li");
        if (stack.at(-1) !== "ul" && stack.at(-1) !== "ol") {
          // A stray item: give it a list.
          while (stack.length) out.push(`</${stack.pop()}>`);
          out.push("<ul>");
          stack.push("ul");
        }
      } else while (stack.length) out.push(`</${stack.pop()}>`);
    } else if (!stack.length) {
      out.push("<p>");
      loose = true;
      stack.push("\u0000loose");
      stack.pop();
    }
    out.push(`<${name}${css ? ` style="${css}"` : ""}>`);
    stack.push(name);
  }
  closeLoose();
  while (stack.length) out.push(`</${stack.pop()}>`);
  // Tidy: empty inline spans and empty paragraphs at the ends go.
  let s = out.join("");
  for (let n = 0; n < 3; n++) s = s.replace(/<(strong|em|u|s|span)(?: style="[^"]*")?><\/\1>/g, "");
  return s.replace(/<p(?: style="[^"]*")?>(<br>)*<\/p>/g, "<p></p>").replace(/^(<p><\/p>)+|(<p><\/p>)+$/g, "");
}

/** One thing to lay out: a paragraph, a heading, or one list item. */
export interface Unit {
  tag: "p" | "h1" | "h2" | "h3" | "li";
  /** Safe HTML for the inside. */
  html: string;
  /** The words alone. */
  plain: string;
  align: "left" | "center" | "right" | "justify";
  /** For a list item: "•" or "1." */
  marker: string | null;
}

const stripTags = (h: string) => decode(h.replace(/<br>/g, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

/** Splits stored text into units, in order. Plain text: each line is a paragraph, as before. */
export function units(text: string): Unit[] {
  if (!isRich(text)) {
    return text
      .split(/\n+/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => ({ tag: "p" as const, html: escape(p), plain: p, align: "left" as const, marker: null }));
  }
  const html = cleanRich(text);
  const out: Unit[] = [];
  const re = /<(p|h1|h2|h3|ul|ol)((?: style="[^"]*")?)>([\s\S]*?)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[1] as "p" | "h1" | "h2" | "h3" | "ul" | "ol";
    const align = (/text-align: (\w+)/.exec(m[2] ?? "")?.[1] ?? "left") as Unit["align"];
    if (tag === "ul" || tag === "ol") {
      let n = 0;
      for (const li of m[3]!.matchAll(/<li((?: style="[^"]*")?)>([\s\S]*?)<\/li>/g)) {
        n++;
        const plain = stripTags(li[2]!);
        if (plain) out.push({ tag: "li", html: li[2]!, plain, align: (/text-align: (\w+)/.exec(li[1] ?? "")?.[1] ?? "left") as Unit["align"], marker: tag === "ul" ? "•" : `${n}.` });
      }
    } else {
      const plain = stripTags(m[3]!);
      if (plain) out.push({ tag, html: m[3]!, plain, align, marker: null });
    }
  }
  return out;
}

/** The words only, one paragraph per line: what search, Word files, cards and the AI read. */
export function toPlain(text: string): string {
  if (!isRich(text)) return text;
  return units(text)
    .map((u) => (u.marker ? `${u.marker} ${u.plain}` : u.plain))
    .join("\n\n");
}

/** What goes in the editor for a stored text: plain lines become paragraphs. */
export function toEditable(text: string): string {
  if (isRich(text)) return cleanRich(text);
  return text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escape(p)}</p>`)
    .join("");
}

/**
 * What to store for what the editor holds: if nothing is formatted, plain text (so plain boxes stay
 * exactly as they were); otherwise the marker and the cleaned HTML.
 */
export function fromEditor(html: string): string {
  const clean = cleanRich(html);
  const onlyPlain = /^(?:<p>(?:[^<]|<br>)*<\/p>)*$/.test(clean);
  if (onlyPlain) {
    return [...clean.matchAll(/<p>((?:[^<]|<br>)*)<\/p>/g)]
      .map((m) => decode(m[1]!.replace(/<br>/g, "\n")).trim())
      .filter(Boolean)
      .join("\n\n");
  }
  return `${RICH_MARK}${clean}`;
}
