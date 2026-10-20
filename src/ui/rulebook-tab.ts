// The Rulebook tab: choose the book (Player's Handbook, Monster Manual...), its chapters and a few
// options on the left; the live preview in the middle is the same page that becomes the PDF.

import type { BookRequest } from "../app/backend.ts";
import { api } from "./api.ts";
import { attempt } from "./common.ts";
import { notice } from "./dialogs.ts";
import { h } from "./dom.ts";
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
  const req = choicesByPlace.get(ctx.view.id) ?? { type: "players", variants: "differences", monstersByChallenge: false, author: "", pageSize: "Letter" };
  choicesByPlace.set(ctx.view.id, req);
  const typeInfo = types.find((t) => t.id === req.type) ?? types[0];
  const ticked = new Set<string>(req.chapters ?? typeInfo?.chapters ?? []);
  const update = (patch: Partial<BookRequest>) => {
    Object.assign(req, patch);
    void ctx.refresh();
  };

  const typeSelect = h("select", { class: "text-input", "aria-label": "Book" }, types.map((t) => h("option", { value: t.id, selected: t.id === req.type }, t.title)));
  typeSelect.addEventListener("change", () => update({ type: typeSelect.value as BookRequest["type"], chapters: undefined }));
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
  const size = h("select", { class: "text-input" }, h("option", { value: "Letter", selected: req.pageSize !== "A4" }, "Letter (8.5 × 11 in)"), h("option", { value: "A4", selected: req.pageSize === "A4" }, "A4"));
  size.addEventListener("change", () => update({ pageSize: size.value as "Letter" | "A4" }));

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
      h("label", { class: "field-label spaced" }, "Chapters"),
      chapterList,
      h("p", { class: "muted small" }, "Chapters with nothing in them are left out. Templates and world rules never print."),
      h("label", { class: "field-label spaced" }, "Options"),
      h("label", { class: "check" }, full, "Print variants in full"),
      h("p", { class: "muted small" }, "Otherwise a variant lists only what differs: \"As Goblin, plus…\"."),
      h("label", { class: "check" }, byCr, "Monsters in order of challenge"),
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
    data && !data.book.chapters.length ? h("p", { class: "muted pad" }, "There's nothing to print in this book yet. Add rules, beings or items, or tick more chapters.") : null,
    frame,
  );
  return { list, editor };
}
