// The Rulebook tab: choose the book (Player's Handbook, Monster Manual...), its chapters and a few
// options on the left; the live preview in the middle is the same page that becomes the PDF.

import type { BookRequest } from "../app/backend.ts";
import { api } from "./api.ts";
import { attempt } from "./common.ts";
import { notice, openDialog } from "./dialogs.ts";
import { h, svg } from "./dom.ts";
import { ICONS } from "./icons.ts";
import { askText } from "./pickers.ts";
import type { PlaceCtx } from "./place.ts";

const choicesByPlace = new Map<string, BookRequest>();

/** The preview on screen now; the book page reports back how many pages it made. */
let current: { frame: HTMLIFrameElement; note: HTMLElement } | null = null;
window.addEventListener("message", (e) => {
  if (current && e.source === current.frame.contentWindow && e.data?.type === "book-pages") current.note.textContent = `${e.data.pages} pages`;
});

export async function rulebookPanels(ctx: PlaceCtx): Promise<{ list: HTMLElement; editor: HTMLElement }> {
  const choices = await attempt(() => api.bookChoices());
  const types = choices?.types ?? [];
  const isModule = ctx.view.type === "module";
  const req = choicesByPlace.get(ctx.view.id) ?? { type: isModule ? "adventure" : "players", variants: "differences", monstersByChallenge: false, author: "", pageSize: "Letter", encounterNumbers: "full" };
  const adventure = req.type === "adventure";
  choicesByPlace.set(ctx.view.id, req);
  const typeInfo = types.find((t) => t.id === req.type) ?? types[0];
  const ticked = new Set<string>(req.chapters ?? typeInfo?.chapters ?? []);
  const update = (patch: Partial<BookRequest>) => {
    Object.assign(req, patch);
    void ctx.refresh();
  };

  const typeSelect = h(
    "select",
    { class: "text-input", "aria-label": "Book" },
    types.map((t) => h("option", { value: t.id, selected: t.id === req.type }, t.title)),
    h("option", { value: "printshop", selected: req.type === "printshop" }, "Print shop (standees, tokens, cards)"),
  );
  typeSelect.addEventListener("change", () => update({ type: typeSelect.value as BookRequest["type"], chapters: undefined }));
  if (req.type === "printshop") return printShopPanels(ctx, req, typeSelect, update);
  const chapterList = h(
    "ul",
    { class: "book-chapters" },
    (choices?.chapters ?? []).map((c) => {
      const box = h("input", { type: "checkbox", checked: ticked.has(c.id) });
      box.addEventListener("change", () => {
        if (box.checked) ticked.add(c.id);
        else ticked.delete(c.id);
        // Keep the design's chapter order.
        update({ chapters: (choices?.chapters ?? []).map((x) => x.id).filter((id) => ticked.has(id)) as BookRequest["chapters"] });
      });
      return h("li", null, h("label", { class: "check" }, box, c.title));
    }),
  );
  const full = h("input", { type: "checkbox", checked: req.variants === "full" });
  full.addEventListener("change", () => update({ variants: full.checked ? "full" : "differences" }));
  const byCr = h("input", { type: "checkbox", checked: !!req.monstersByChallenge });
  byCr.addEventListener("change", () => update({ monstersByChallenge: byCr.checked }));
  const author = h("input", { class: "text-input", value: req.author ?? "", placeholder: "Your name (optional)", maxlength: 120 });
  author.addEventListener("change", () => update({ author: author.value }));
  const numbers = h(
    "select",
    { class: "text-input", "aria-label": "Encounter numbers" },
    h("option", { value: "full", selected: (req.encounterNumbers ?? "full") === "full" }, "All numbers (1, 1.1, 1.1.2)"),
    h("option", { value: "top", selected: req.encounterNumbers === "top" }, "Top level only (1, 2, 3)"),
    h("option", { value: "off", selected: req.encounterNumbers === "off" }, "No numbers"),
  );
  numbers.addEventListener("change", () => update({ encounterNumbers: numbers.value as BookRequest["encounterNumbers"] }));
  const size = h("select", { class: "text-input" }, h("option", { value: "Letter", selected: req.pageSize !== "A4" }, "Letter (8.5 × 11 in)"), h("option", { value: "A4", selected: req.pageSize === "A4" }, "A4"));
  size.addEventListener("change", () => update({ pageSize: size.value as "Letter" | "A4" }));

  // The book designer (version 2.6): exactly what goes in, front pages, contents and index.
  const [tree, layouts] = await Promise.all([attempt(() => api.journalTree()), attempt(() => api.bookLayouts())]);
  const fronts = (tree ?? []).filter((g) => g.category === "Front pages").flatMap((g) => g.pages).sort((a, b) => a.priority - b.priority);
  const frontOff = new Set(req.frontOff ?? []);
  const frontList = h(
    "ul",
    { class: "book-chapters" },
    fronts.map((f) => {
      const box = h("input", { type: "checkbox", checked: !frontOff.has(f.id) });
      box.addEventListener("change", () => update({ frontOff: box.checked ? [...frontOff].filter((x) => x !== f.id) : [...frontOff, f.id] }));
      return h("li", null, h("label", { class: "check" }, box, `${f.priority}. ${f.name}`), h("button", { class: "link small", title: "Edit it in the Journal tab", onClick: () => void ctx.open(f.id) }, "Edit"));
    }),
  );
  const tick = (label: string, on: boolean, change: (v: boolean) => void) => {
    const b = h("input", { type: "checkbox", checked: on });
    b.addEventListener("change", () => change(b.checked));
    return h("label", { class: "check" }, b, label);
  };
  const left = (req.leaveOut ?? []).length;
  const loadLayout = h("select", { class: "text-input", "aria-label": "Saved books" }, h("option", { value: "" }, "Use a saved book…"), (layouts ?? []).map((l) => h("option", { value: l.id }, l.name)));
  loadLayout.addEventListener("change", () => {
    const l = (layouts ?? []).find((x) => x.id === loadLayout.value);
    if (l) update({ ...l.request });
  });
  const designer = [
    h("label", { class: "field-label spaced" }, "What goes in"),
    h("button", { class: "button plain small-button", onClick: () => void chooseContents(req, update) }, left ? `Choose… (${left} left out)` : "Choose exactly what goes in…"),
    h("label", { class: "field-label spaced" }, "Front pages"),
    fronts.length ? frontList : h("p", { class: "muted small" }, "A cover, credits or a foreword, built from text and pictures like a journal page."),
    h(
      "button",
      {
        class: "link small",
        onClick: async () => {
          const name = await askText("A front page", "", "Its name", "Cover");
          if (!name) return;
          const id = await attempt(() => api.createPage(name, "Front pages"));
          if (id) {
            await attempt(() => api.setPage(id, { priority: fronts.length + 1 }));
            void ctx.open(id);
          }
        },
      },
      "+ Front page",
    ),
    tick("The plain cover with the title", req.plainCover !== false, (v) => update({ plainCover: v })),
    tick("Contents", req.contents !== false, (v) => update({ contents: v })),
    tick("Index", req.index !== false, (v) => update({ index: v })),
    h("label", { class: "field-label spaced" }, "Saved books"),
    layouts?.length ? loadLayout : null,
    h(
      "button",
      {
        class: "link small",
        title: "Keep these choices in the Codex (Sheet and book layouts) to use again",
        onClick: async () => {
          const name = await askText("Save this book", "", "Book name", "The giants of Greyhollow");
          if (name && (await attempt(() => api.saveBookLayout(name, req)))) notice(`Saved ${name} in the Codex.`, "green", undefined, 4000);
        },
      },
      "Save this book…",
    ),
  ];

  const save = h("button", { class: "button primary" }, "Save as PDF…");
  save.addEventListener("click", async () => {
    save.disabled = true;
    const r = await window.dm.bookPdf(req);
    save.disabled = false;
    if (!r.ok) return notice(r.message, "red");
    if (r.value) notice(`Saved ${String(r.value).split(/[\\/]/).pop()}.`, "green", { label: "Open it", run: () => void window.dm.openPdf(String(r.value)) }, 9000);
  });
  const word = h("button", { class: "button plain" }, "Save as Word…");
  word.addEventListener("click", async () => {
    word.disabled = true;
    const path = await attempt(() => api.bookWord(req));
    word.disabled = false;
    if (path) notice(`Saved ${path.split(/[\\/]/).pop()}. When Word asks to update the fields, choose Yes to fill in the page numbers.`, "green", { label: "Open it", run: () => void window.dm.openPdf(path) }, 12000);
  });
  const print = h("button", { class: "button plain" }, "Print…");
  print.addEventListener("click", async () => {
    const r = await window.dm.bookPrint(req);
    if (!r.ok) notice(r.message, "red");
  });

  const list = h(
    "aside",
    { class: "panel list-panel book-options", "aria-label": "Rulebook", "data-scroll": "book-options" },
    h("div", { class: "panel-head" }, "Rulebook"),
    h(
      "div",
      { class: "pad" },
      h("label", { class: "field-label" }, "Book"),
      typeSelect,
      ...(adventure
        ? [
            h("p", { class: "muted small" }, "The front page, then every encounter in the order of the tree, with read-aloud text in a box. The creatures, treasure and handouts it uses are printed at the back."),
            h("label", { class: "field-label spaced" }, "Encounter numbers"),
            numbers,
          ]
        : [
            h("label", { class: "field-label spaced" }, "Chapters"),
            chapterList,
            h("p", { class: "muted small" }, "Chapters with nothing in them are left out. Templates and world rules never print."),
            h("label", { class: "field-label spaced" }, "Options"),
            h("label", { class: "check" }, full, "Print variants in full"),
            h("p", { class: "muted small" }, "Otherwise a variant lists only what differs: \"As Goblin, plus…\"."),
            h("label", { class: "check" }, byCr, "Monsters in order of challenge"),
          ]),
      ...designer,
      h("label", { class: "field-label spaced" }, "Created by"),
      author,
      h("label", { class: "field-label spaced" }, "Page size"),
      size,
      h("div", { class: "book-actions" }, save, word, print),
    ),
  );

  // The preview: the book page in a frame, sent the book's content once it has loaded.
  const pagesNote = h("span", { class: "muted small" }, "");
  const frame = h("iframe", { class: "book-frame", src: "book.html", title: "Rulebook preview" });
  const data = await attempt(() => api.book(req));
  frame.addEventListener("load", () => frame.contentWindow?.postMessage({ type: "book", data, zoom: 0.62 }, "*"));
  current = { frame, note: pagesNote };
  const editor = h(
    "section",
    { class: "panel editor book-preview" },
    h("div", { class: "panel-head" }, "Preview", pagesNote, h("span", { class: "muted small head-count" }, "Exactly what prints. Every change to the world shows here.")),
    data && !data.book.chapters.length ? h("p", { class: "muted pad" }, adventure ? "There's nothing to print yet. Add encounters on the Adventure tab." : "There's nothing to print in this book yet. Add rules, beings or items, or tick more chapters.") : null,
    frame,
  );
  return { list, editor };
}

/** The tick list: every chapter and thing the book could hold, with Select all and a search box. */
async function chooseContents(req: BookRequest, update: (patch: Partial<BookRequest>) => void) {
  const all = (await attempt(() => api.bookContents(req))) ?? [];
  const out = new Set(req.leaveOut ?? []);
  let find = "";
  const d = openDialog("What goes in this book", { wide: true });
  const draw = () => {
    const words = find.toLowerCase().split(/\s+/).filter(Boolean);
    const match = (t: string) => words.every((w) => t.toLowerCase().includes(w));
    const box = h("input", { class: "text-input", type: "search", value: find, placeholder: "Find…", "aria-label": "Find" });
    box.addEventListener("input", () => {
      find = box.value;
      draw();
      (d.body.querySelector("input[type=search]") as HTMLInputElement | null)?.focus();
    });
    const shown = all.map((c) => ({ ...c, entries: c.entries.filter((e) => match(e.title) || match(c.title)) })).filter((c) => c.entries.length);
    const set = (ids: string[], on: boolean) => {
      for (const id of ids) on ? out.delete(id) : out.add(id);
      draw();
    };
    d.body.replaceChildren(
      h("div", { class: "inline spaced" }, box, h("button", { class: "button plain small-button", onClick: () => set(shown.flatMap((c) => c.entries.map((e) => e.id)), true) }, "Select all"), h("button", { class: "button plain small-button", onClick: () => set(shown.flatMap((c) => c.entries.map((e) => e.id)), false) }, "Unselect all")),
      h("p", { class: "muted small" }, words.length ? "Select all and Unselect all change only what the search shows: unselect all monsters, find giant, select all, and it's a book of giants." : "Untick anything to leave it out. New things you make later go in by themselves."),
      h(
        "div",
        { class: "book-pick" },
        shown.map((c) =>
          h(
            "div",
            { class: "book-pick-chapter" },
            h("div", { class: "inline" }, h("strong", null, c.title), h("span", { class: "grow" }), h("button", { class: "link small", onClick: () => set(c.entries.map((e) => e.id), true) }, "All"), h("button", { class: "link small", onClick: () => set(c.entries.map((e) => e.id), false) }, "None")),
            c.entries.map((e) => {
              const b = h("input", { type: "checkbox", checked: !out.has(e.id) });
              b.addEventListener("change", () => set([e.id], b.checked));
              return h("label", { class: "check", style: `margin-left:${e.depth * 18}px` }, b, e.title);
            }),
          ),
        ),
      ),
    );
  };
  draw();
  d.footer.replaceChildren(
    h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"),
    h(
      "button",
      {
        class: "button primary",
        onClick: () => {
          d.close();
          update({ leaveOut: [...out] });
        },
      },
      "Use these",
    ),
  );
}

// ---------- The print shop (version 2.6) ----------

const SHOP_KINDS: { id: "standees" | "tokens" | "cards" | "initiative"; title: string; help: string }[] = [
  { id: "standees", title: "Fold-over standees", help: "Cut out, fold in half and stand on the table. Sized to each creature." },
  { id: "tokens", title: "Round tokens", help: "Cut out circles for the battle map, one square wide, two for Large and so on." },
  { id: "cards", title: "Cards", help: "Spells, items, monsters and conditions on small cards for the table." },
  { id: "initiative", title: "Initiative tent cards", help: "A name and the key numbers on both sides, so everyone sees who is up." },
];

const shopFind = new Map<string, string>();

async function printShopPanels(ctx: PlaceCtx, req: BookRequest, typeSelect: HTMLSelectElement, update: (patch: Partial<BookRequest>) => void): Promise<{ list: HTMLElement; editor: HTMLElement }> {
  const pieces = (req.pieces ??= { kind: "tokens", items: [], inch: 1 });
  const set = (patch: Partial<NonNullable<BookRequest["pieces"]>>) => update({ pieces: { ...pieces, ...patch } });
  const groups = (await attempt(() => api.shopChoices())) ?? [];
  const counts = new Map(pieces.items.map((i) => [i.id, i.count]));
  const find = shopFind.get(ctx.view.id) ?? "";
  const words = find.toLowerCase().split(/\s+/).filter(Boolean);
  const match = (t: string) => words.every((w) => t.toLowerCase().includes(w));
  const shown = groups.map((c) => ({ ...c, entries: c.entries.filter((e) => match(e.title) || match(c.title)) })).filter((c) => c.entries.length);
  const ids = (list: { id: string }[]) => list.map((e) => e.id);
  const pick = (on: string[], off: string[]) => {
    const keep = pieces.items.filter((i) => !off.includes(i.id) && !on.includes(i.id));
    const added = on.map((id) => ({ id, count: counts.get(id) ?? 1 }));
    set({ items: [...keep, ...added] });
  };

  const kind = h("select", { class: "text-input", "aria-label": "What to print" }, SHOP_KINDS.map((k) => h("option", { value: k.id, selected: k.id === pieces.kind }, k.title)));
  kind.addEventListener("change", () => set({ kind: kind.value as typeof pieces.kind }));
  const inch = h("input", { class: "text-input", type: "number", min: 0.5, max: 2, step: 0.25, value: String(pieces.inch ?? 1), "aria-label": "Inches per square" });
  inch.addEventListener("change", () => set({ inch: Math.min(2, Math.max(0.5, Number(inch.value) || 1)) }));
  const search = h("input", { class: "text-input", type: "search", value: find, placeholder: "Find…", "aria-label": "Find" });
  search.addEventListener("change", () => {
    shopFind.set(ctx.view.id, search.value);
    void ctx.refresh();
  });
  const size = h("select", { class: "text-input" }, h("option", { value: "Letter", selected: req.pageSize !== "A4" }, "Letter (8.5 × 11 in)"), h("option", { value: "A4", selected: req.pageSize === "A4" }, "A4"));
  size.addEventListener("change", () => update({ pageSize: size.value as "Letter" | "A4" }));

  const tickList = h(
    "div",
    { class: "book-pick" },
    shown.map((c) =>
      h(
        "div",
        { class: "book-pick-chapter" },
        h("div", { class: "inline" }, h("strong", null, c.title), h("span", { class: "grow" }), h("button", { class: "link small", onClick: () => pick(ids(c.entries), []) }, "All"), h("button", { class: "link small", onClick: () => pick([], ids(c.entries)) }, "None")),
        c.entries.map((e) => {
          const on = counts.has(e.id);
          const box = h("input", { type: "checkbox", checked: on });
          box.addEventListener("change", () => (box.checked ? pick([e.id], []) : pick([], [e.id])));
          const n = h("input", { class: "text-input count-input", type: "number", min: 1, max: 50, value: String(counts.get(e.id) ?? 1), "aria-label": `How many ${e.title}` });
          n.addEventListener("change", () => set({ items: pieces.items.map((i) => (i.id === e.id ? { ...i, count: Math.min(50, Math.max(1, Math.round(Number(n.value)) || 1)) } : i)) }));
          return h("div", { class: "inline", style: `margin-left:${e.depth * 18}px` }, h("label", { class: "check grow" }, box, e.title), on ? n : null);
        }),
      ),
    ),
  );

  const save = h("button", { class: "button primary" }, "Save as PDF…");
  save.addEventListener("click", async () => {
    save.disabled = true;
    const r = await window.dm.bookPdf(req);
    save.disabled = false;
    if (!r.ok) return notice(r.message, "red");
    if (r.value) notice(`Saved ${String(r.value).split(/[\\/]/).pop()}.`, "green", { label: "Open it", run: () => void window.dm.openPdf(String(r.value)) }, 9000);
  });
  const print = h("button", { class: "button plain" }, "Print…");
  print.addEventListener("click", async () => {
    const r = await window.dm.bookPrint(req);
    if (!r.ok) notice(r.message, "red");
  });
  const total = pieces.items.reduce((n, i) => n + i.count, 0);
  const help = SHOP_KINDS.find((k) => k.id === pieces.kind)?.help ?? "";

  const list = h(
    "aside",
    { class: "panel list-panel book-options", "aria-label": "Print shop", "data-scroll": "book-options" },
    h("div", { class: "panel-head" }, "Print shop"),
    h(
      "div",
      { class: "pad" },
      h("label", { class: "field-label" }, "Book"),
      typeSelect,
      h("label", { class: "field-label spaced" }, "Print"),
      kind,
      h("p", { class: "muted small" }, help),
      pieces.kind === "cards" ? null : h("label", { class: "field-label spaced" }, "Inches per square"),
      pieces.kind === "cards" ? null : inch,
      h("label", { class: "field-label spaced" }, "Pick what to print"),
      h("div", { class: "inline spaced" }, search, h("button", { class: "button plain small-button", onClick: () => pick(ids(shown.flatMap((c) => c.entries)), []) }, "Select all"), h("button", { class: "button plain small-button", onClick: () => pick([], ids(shown.flatMap((c) => c.entries))) }, "Unselect all")),
      groups.length ? tickList : h("p", { class: "muted small" }, "Nothing to print yet. Make a monster, an item or a rule first."),
      h("p", { class: "muted small" }, total ? `${total} piece${total === 1 ? "" : "s"} picked. Tick a thing, then say how many copies.` : "Tick the things to print, then say how many copies of each."),
      h("label", { class: "field-label spaced" }, "Page size"),
      size,
      h("div", { class: "book-actions" }, save, print),
    ),
  );

  const pagesNote = h("span", { class: "muted small" }, "");
  const frame = h("iframe", { class: "book-frame", src: "book.html", title: "Print shop preview" });
  const data = await attempt(() => api.book(req));
  frame.addEventListener("load", () => frame.contentWindow?.postMessage({ type: "book", data, zoom: 0.62 }, "*"));
  current = { frame, note: pagesNote };
  const editor = h("section", { class: "panel editor book-preview" }, h("div", { class: "panel-head" }, "Preview", pagesNote, h("span", { class: "muted small head-count" }, "Exactly what prints. Cut along the edges.")), frame);
  return { list, editor };
}
