// Lays a rulebook out into real pages, then fills in the page numbers: the table of contents,
// the index and "see Poisoned, page 42". The same page is the in-app preview and the PDF.

import type { BookData, MapView } from "../app/backend.ts";
import { mapSvg } from "../ui/map-render.ts";

type Entry = BookData["book"]["chapters"][number]["entries"][number];

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

let pages: HTMLElement;
let body: HTMLElement;

function newPage(cls = ""): HTMLElement {
  const page = el("section", `page ${cls}`.trim());
  body = el("div", "page-body");
  page.append(body, el("div", "page-foot"));
  pages.appendChild(page);
  return page;
}

const overflowing = () => body.scrollHeight > body.clientHeight + 1;

/** Puts a block on the current page, or on a new page if it doesn't fit. Long blocks are split. */
function place(block: HTMLElement) {
  body.appendChild(block);
  if (!overflowing()) return;
  if (body.children.length > 1) {
    block.remove();
    newPage();
    body.appendChild(block);
    if (!overflowing()) return;
  }
  // Too tall for a whole page: move its last parts to a continuation on the next page.
  const rest = block.cloneNode(false) as HTMLElement;
  rest.removeAttribute("id");
  while (overflowing() && block.children.length > 1) rest.prepend(block.lastElementChild!);
  if (rest.children.length) {
    newPage();
    place(rest);
  }
}

function entryBlock(e: Entry, data: BookData, depth: number): HTMLElement[] {
  const b = el("div", `entry${depth ? " variant" : ""}`);
  b.id = `n-${e.node}`;
  b.appendChild(el(depth ? "h4" : "h3", "", e.title));
  if (e.picture) {
    const img = el("img", "portrait");
    img.src = `dmpic://pic/${encodeURIComponent(e.picture)}`;
    img.alt = "";
    b.appendChild(img);
  }
  if (e.map) {
    const box = el("div", "book-map");
    box.innerHTML = mapSvg(e.map as MapView, { pictureHref: (e.map as MapView).picture ? `dmpic://pic/${encodeURIComponent((e.map as MapView).picture!)}` : null, show: { grid: true, pins: true, labels: true, drawing: true, dm: false }, numbers: e.mapNumbers !== false });
    b.appendChild(box);
  }
  if (e.readAloud) for (const [i, p] of e.readAloud.split(/\n+/).filter((x) => x.trim()).entries()) b.appendChild(el("p", `read-aloud${i ? " more" : ""}`, p.trim()));
  if (e.stats) b.appendChild(el("div", "stats", e.stats));
  for (const p of e.paragraphs) b.appendChild(el("p", "", p));
  // Only things printed in this book get a page reference.
  const printed = new Set(data.book.index.map((i) => i.node));
  const seen = e.mentions.filter((m) => data.names[m] && m !== e.node && printed.has(m));
  if (seen.length) {
    const see = el("p", "see");
    see.append("See ");
    seen.forEach((m, i) => {
      if (i) see.append(i === seen.length - 1 ? " and " : ", ");
      const a = el("a", "", data.names[m]);
      a.href = `#n-${m}`;
      const ref = el("span", "ref");
      ref.dataset.node = m;
      ref.textContent = "page 00";
      see.append(a, " (", ref, ")");
    });
    see.append(".");
    b.appendChild(see);
  }
  b.appendChild(el("div", "clear"));
  return [b, ...e.variants.flatMap((v) => entryBlock(v, data, depth + 1))];
}

function line(cls: string, text: string, target: string): HTMLElement {
  const l = el("div", cls);
  const a = el("a", "", text);
  a.href = `#${target}`;
  const num = el("span", "num");
  num.dataset.target = target;
  num.textContent = "00";
  l.append(a, el("span", "dots"), num);
  return l;
}

/** A page of blocks (a handout or a front page), placed where they sit on the journal page. */
function blockSheet(blocks: NonNullable<BookData["handout"]>["blocks"], look: { plain: boolean; hand: boolean }): HTMLElement {
  const sheet = el("div", "handout-sheet");
  const tall = Math.max(400, ...blocks.map((b) => b.y + b.h + 20));
  sheet.style.setProperty("--page-h", String(tall));
  for (const b of blocks) {
    const box = el("div", `hblock type-${b.type}`);
    box.style.cssText = `--x:${b.x};--y:${b.y};--w:${b.w};--h:${b.h}`;
    if (b.type === "image" && b.picture) {
      const img = el("img");
      img.src = `${(window as unknown as { dmPicBase?: string }).dmPicBase ?? "dmpic://pic/"}${encodeURIComponent(b.picture)}`;
      box.appendChild(img);
    } else {
      box.style.fontFamily = look.hand ? "" : b.font;
      box.style.fontSize = `calc(${b.size}px * var(--k))`;
      box.style.color = look.plain ? "#000" : b.color;
      box.textContent = b.text;
    }
    sheet.appendChild(box);
  }
  return sheet;
}

export async function renderBook(data: BookData, opts: { preview?: boolean; zoom?: number } = {}): Promise<number> {
  document.documentElement.classList.toggle("a4", data.pageSize === "A4");
  document.body.classList.toggle("preview", !!opts.preview);
  if (opts.zoom) document.body.style.setProperty("--zoom", String(opts.zoom));
  pages = document.getElementById("pages")!;
  pages.replaceChildren();
  const book = data.book;

  // A handout (version 2): one journal page, drawn from its blocks, with an old-paper look if asked.
  if (data.handout) {
    const ho = data.handout;
    newPage(`handout look-${ho.style}${ho.hand ? " handwriting" : ""}`);
    body.appendChild(blockSheet(ho.blocks, { plain: ho.style === "plain", hand: ho.hand }));
    if (ho.seal) body.appendChild(el("div", "wax-seal", "✦"));
    await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => ((img.onload = r), (img.onerror = r))))));
    return 1;
  }

  // The print shop (version 2.6): paper pieces, laid out to fill each page.
  if (data.printshop) {
    const shop = data.printshop;
    const pic = (id: string | null) => (id ? `${(window as unknown as { dmPicBase?: string }).dmPicBase ?? "dmpic://pic/"}${encodeURIComponent(id)}` : null);
    const face = (p: (typeof shop.pieces)[number], cls: string) => {
      const box = el("div", cls);
      const src = pic(p.picture);
      if (src) {
        const img = el("img");
        img.src = src;
        box.appendChild(img);
      } else box.appendChild(el("span", "piece-letter", p.title.slice(0, 1)));
      return box;
    };
    newPage(`shop shop-${shop.kind}`);
    document.body.style.setProperty("--sq", `${shop.inch}in`);
    if (!shop.pieces.length) place(el("p", "", "Nothing picked yet. Choose what to print on the left."));
    for (const p of shop.pieces) {
      let piece: HTMLElement;
      if (shop.kind === "tokens") {
        piece = el("div", "token");
        piece.style.setProperty("--n", String(p.squares));
        piece.append(face(p, "token-face"), el("div", "token-name", p.title));
      } else if (shop.kind === "standees") {
        piece = el("div", "standee");
        piece.style.setProperty("--n", String(p.squares));
        piece.append(el("div", "standee-base flip", p.title), face(p, "standee-face flip"), face(p, "standee-face"), el("div", "standee-base", p.title));
      } else if (shop.kind === "initiative") {
        piece = el("div", "tent");
        const half = (flip: boolean) => {
          const x = el("div", `tent-half${flip ? " flip" : ""}`);
          x.append(el("div", "tent-name", p.title), el("div", "tent-stats", p.stats ?? ""));
          return x;
        };
        piece.append(half(true), half(false));
      } else {
        piece = el("div", "card");
        const head = el("div", "card-head");
        head.append(el("span", "card-title", p.title), el("span", "card-kind", p.kind));
        piece.append(head);
        if (p.picture) piece.append(face(p, "card-pic"));
        if (p.stats) piece.append(el("div", "card-stats", p.stats));
        const text = el("div", "card-text");
        for (const l of p.lines) text.appendChild(el("p", "", l));
        piece.append(text);
      }
      place(piece);
    }
    await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => ((img.onload = r), (img.onerror = r))))));
    return pages.querySelectorAll(".page").length;
  }

  // Cover (unless one of the front pages is the cover).
  const made = book.credits.find((c) => c.startsWith("Created by"));
  if (data.plainCover !== false) {
    newPage("cover");
    body.append(el("h1", "", book.title), el("div", "flourish"), el("div", "subtitle", book.subtitle));
    if (made) body.appendChild(el("div", "made", made));
  }

  // Front pages (version 2.6): built from blocks like a journal page, in priority order.
  for (const f of data.front ?? []) {
    newPage("handout front-page");
    body.appendChild(blockSheet(f.blocks, { plain: false, hand: false }));
  }

  // Contents, with numbers filled in at the end.
  if (data.contents !== false) {
    newPage("toc");
    place(el("h2", "chapter", "Contents"));
    for (const c of book.chapters) {
      place(line("toc-line chapter-line", c.title, `c-${c.id}`));
      for (const e of c.entries) place(line("toc-line entry-line", e.title, `n-${e.node}`));
    }
  }

  // The chapters.
  for (const c of book.chapters) {
    newPage();
    const h = el("h2", "chapter", c.title);
    h.id = `c-${c.id}`;
    place(h);
    for (const p of (c.text ?? "").split(/\n\s*\n/).filter((x) => x.trim())) place(el("p", "", p.trim()));
    for (const e of c.entries) for (const b of entryBlock(e, data, 0)) place(b);
  }

  // Index and credits.
  if (book.index.length) {
    newPage();
    place(el("h2", "chapter", "Index"));
    for (const i of book.index) place(line("index-line", i.term, `n-${i.node}`));
  }
  const credits = book.credits.filter((c) => !c.startsWith("Created by"));
  if (credits.length || made) {
    const box = el("div", "credits");
    box.appendChild(el("h3", "", "Credits"));
    if (made) box.appendChild(el("p", "", made));
    for (const c of credits) box.appendChild(el("p", "", c));
    place(box);
  }

  // Number the pages, then fill in every page reference.
  await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => ((img.onload = r), (img.onerror = r))))));
  const all = [...pages.querySelectorAll<HTMLElement>(".page")];
  all.forEach((p, i) => {
    if (i) p.querySelector(".page-foot")!.textContent = `· ${i + 1} ·`;
  });
  const pageOf = (id: string) => {
    const t = document.getElementById(id);
    const p = t?.closest(".page");
    return p ? all.indexOf(p as HTMLElement) + 1 : null;
  };
  for (const n of pages.querySelectorAll<HTMLElement>(".num")) n.textContent = String(pageOf(n.dataset.target!) ?? "");
  for (const r of pages.querySelectorAll<HTMLElement>(".ref")) {
    const p = pageOf(`n-${r.dataset.node}`);
    r.textContent = p ? `page ${p}` : "not in this book";
  }
  return all.length;
}

declare global {
  interface Window {
    renderBook: typeof renderBook;
  }
}
window.renderBook = renderBook;

// The preview inside the app sends the book with a message.
window.addEventListener("message", (e) => {
  if (e.data?.type === "book") void renderBook(e.data.data as BookData, { preview: true, zoom: e.data.zoom }).then((n) => parent.postMessage({ type: "book-pages", pages: n }, "*"));
});
