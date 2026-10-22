// The journal's pages (version 2), shared by the Journal tab and the journal tool on the DM's
// table. A page is built from blocks, pictures and text, moved and resized anywhere like a
// scrapbook. Each page has a category drop-down in its corner (ending with + New category) and a
// priority (1 stays on top; give a finished page 30 and it sinks). A game night's page has the
// DM's notes on top and the table's log underneath.

import { showToPlayers } from "./players-panel.ts";
import type { Block, PageEntry, PageView } from "../app/backend.ts";
import { DEFAULT_CATEGORIES, FONTS, PAGE_WIDTH } from "../app/journal-lists.ts";
import { api, pictureUrl } from "./api.ts";
import { attempt } from "./common.ts";
import { ask, notice, openDialog } from "./dialogs.ts";
import { h, svg } from "./dom.ts";
import { ICONS } from "./icons.ts";
import { askText } from "./pickers.ts";

export interface JournalHost {
  readOnly: boolean;
  selected: string | null;
  select: (id: string | null) => void;
  refresh: () => Promise<void>;
  /** Opens another thing (a character named on the page). */
  open: (id: string) => void;
  /** Category order, kept with the table's memory. */
  categories: { name: string; priority: number }[];
  setCategories: (c: { name: string; priority: number }[]) => Promise<void>;
}

const BLOCK_COLOURS = ["#2b2620", "#8a4b2a", "#2f6fb0", "#3c8a4a", "#b93a2e", "#7b3fa0"];
let activeBlock: string | null = null;

export function journalTreePanel(tree: { category: string; pages: PageEntry[] }[], host: JournalHost, head: HTMLElement | null): HTMLElement {
  return h(
    "div",
    { class: "journal-tree" },
    head,
    tree.length
      ? tree.map((g) =>
          h(
            "div",
            { class: "journal-group" },
            h("div", { class: "journal-cat" }, g.category, h("span", { class: "muted tiny" }, ` ${g.pages.length}`)),
            g.pages.map((p) =>
              h(
                "button",
                { class: `journal-row${p.id === host.selected ? " selected" : ""}`, onClick: () => host.select(p.id) },
                p.picture ? h("img", { class: "journal-thumb", src: pictureUrl(p.picture), alt: "" }) : h("span", { class: "journal-thumb empty" }, p.session ? "📅" : "📄"),
                h("span", { class: "journal-name" }, p.name),
                p.priority > 1 ? h("span", { class: "muted tiny" }, String(p.priority)) : null,
                p.favourite ? h("span", { title: "Starred" }, "★") : null,
              ),
            ),
          ),
        )
      : h("p", { class: "muted small pad" }, "No pages yet. + Add page starts one."),
  );
}

export async function newPage(host: JournalHost, category = "Notes") {
  const name = await askText("New journal page", "", "Name", "Plot threads, NPC voices, Things the party owes…");
  if (!name) return;
  const id = await attempt(() => api.createPage(name, category));
  if (id) {
    host.select(id);
    await host.refresh();
  }
}

/** One page, built from blocks. */
export function pageEditor(v: PageView, host: JournalHost, opts: { compact?: boolean } = {}): HTMLElement {
  const ro = host.readOnly || !!v.readOnly;
  const done = async (fn: () => Promise<unknown>) => {
    if ((await attempt(fn)) !== undefined) await host.refresh();
  };
  const cats = [...new Set([...host.categories.map((c) => c.name), ...DEFAULT_CATEGORIES, v.category])];
  const cat = h("select", { class: "text-input select small-select", disabled: ro, "aria-label": "Category" }, cats.map((c) => h("option", { value: c, selected: c === v.category }, c)), h("option", { value: "__new" }, "+ New category…"));
  cat.addEventListener("change", async () => {
    let c = cat.value;
    if (c === "__new") {
      const n = await askText("New category", "", "Name", "Quests, Rumours, Gods…");
      if (!n) return host.refresh();
      c = n.trim();
      await host.setCategories([...host.categories, { name: c, priority: 50 }]);
    }
    await done(() => api.setPage(v.id, { category: c }));
  });
  const prio = h("input", { class: "text-input score-input", inputmode: "numeric", value: String(v.priority), disabled: ro, title: "Priority: 1 stays on top. Give a finished page 30 and it sinks to the bottom.", "aria-label": "Priority" });
  prio.addEventListener("change", () => void done(() => api.setPage(v.id, { priority: Number(prio.value) || 1 })));
  const name = h("input", { class: "title-input", value: v.name, disabled: ro, "aria-label": "Page name" });
  name.addEventListener("change", () => name.value.trim() && void done(() => api.rename(v.id, name.value)));

  // The page: blocks placed on an 800-wide sheet, scaled to fit.
  const sheet = h("div", { class: "journal-page" });
  const height = Math.max(420, ...v.blocks.map((b) => b.y + b.h + 30));
  sheet.style.setProperty("--page-h", String(height));
  for (const b of v.blocks) sheet.appendChild(blockEl(b, v, ro, done));
  if (!ro) {
    // Drop a picture file straight onto the page (it goes where it lands).
    sheet.addEventListener("dragover", (e) => e.dataTransfer?.types.includes("Files") && e.preventDefault());
    sheet.addEventListener("drop", (e) => {
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      notice("Use + Add → Picture to bring in a picture file.", "blue", undefined, 4000);
    });
    sheet.addEventListener("click", (e) => {
      if (e.target === sheet && activeBlock) {
        activeBlock = null;
        void host.refresh();
      }
    });
  }
  const scale = () => {
    const w = sheet.clientWidth || PAGE_WIDTH;
    sheet.style.setProperty("--k", String(w / PAGE_WIDTH));
  };
  new ResizeObserver(scale).observe(sheet);
  requestAnimationFrame(scale);

  const addMenu = ro
    ? null
    : h(
        "div",
        { class: "inline" },
        h("button", { class: "button plain small-button", onClick: () => void done(() => api.addBlock(v.id, "text")) }, svg(ICONS.plus), "Text"),
        h(
          "button",
          {
            class: "button plain small-button",
            onClick: async () => {
              const pic = await attempt(() => api.pickPicture());
              if (pic) await done(() => api.addBlock(v.id, "image", pic));
            },
          },
          svg(ICONS.image),
          "Picture",
        ),
      );

  const links = v.links.length ? h("div", { class: "inline small journal-links" }, h("span", { class: "muted" }, "On this page:"), v.links.map((l) => h("button", { class: "link small", onClick: () => host.open(l.id) }, l.name))) : null;
  const mentioned = v.mentionedIn.length ? h("div", { class: "inline small" }, h("span", { class: "muted" }, "Mentioned in:"), v.mentionedIn.map((m) => h("button", { class: "link small", onClick: () => host.select(m.id) }, m.name))) : null;
  const log = v.session
    ? h(
        "div",
        { class: "journal-log" },
        h("h3", null, "The table's log"),
        v.log.length ? h("ol", { class: "log-lines" }, v.log.map((l) => h("li", null, h("span", { class: "muted tiny" }, new Date(l.time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })), " ", l.text))) : h("p", { class: "muted small" }, "The log fills itself during the session."),
      )
    : null;

  const more = ro
    ? null
    : h(
        "div",
        { class: "inline small" },
        h("button", { class: "link small", title: "Pop it up on players' screens (it stays in their journal)", onClick: () => void showToPlayers(v.id, v.name) }, "Show to players…"),
        h("button", { class: "link small", title: "Print or save this page as a PDF, with an old-paper look if you like", onClick: () => void printPage(v) }, "Print…"),
        h("button", { class: "link small", title: "Make this note a lore page in the world", onClick: async () => ((await attempt(() => api.pageToNode(v.id, "lore"))) && notice(`${v.name} is now a lore page too (Lore tab).`, "green", undefined, 5000)) }, "Make it a lore page"),
        h("button", { class: "link small", title: "The improvised innkeeper becomes a real NPC", onClick: async () => ((await attempt(() => api.pageToNode(v.id, "npc"))) && notice(`${v.name} is now an NPC too (Beings tab).`, "green", undefined, 5000)) }, "Make it an NPC"),
        h(
          "button",
          {
            class: "link small danger-text",
            onClick: async () => {
              const ok = await ask(`Delete ${v.name}?`, ["The page goes to the recycle bin."], [
                { label: "Cancel", value: false },
                { label: "Move to recycle bin", value: true, kind: "danger" },
              ]);
              if (ok && (await attempt(() => api.deleteNode(v.id))) !== undefined) {
                host.select(null);
                await host.refresh();
              }
            },
          },
          "Delete",
        ),
      );

  return h(
    "div",
    { class: `journal-editor${opts.compact ? " compact" : ""}` },
    h("div", { class: "journal-top" }, name, h("span", { class: "grow" }), h("label", { class: "inline small" }, "Priority", prio), cat),
    v.session ? h("div", { class: "muted small" }, "Your notes for the night go on the page; the table writes its log underneath.") : null,
    addMenu,
    sheet,
    links,
    mentioned,
    log,
    more,
  );
}

function blockEl(b: Block, v: PageView, ro: boolean, done: (fn: () => Promise<unknown>) => Promise<void>): HTMLElement {
  const el = h("div", { class: `jblock type-${b.type}${activeBlock === b.id ? " active" : ""}`, style: `--x:${b.x};--y:${b.y};--w:${b.w};--h:${b.h}`, "data-block": b.id });
  if (b.type === "image") el.appendChild(b.picture ? h("img", { src: pictureUrl(b.picture), alt: "", draggable: "false" }) : h("span", { class: "muted small" }, "No picture"));
  else {
    const t = h("textarea", { class: "jtext", disabled: ro, placeholder: "Type here…", style: `font-family:${b.font};font-size:calc(${b.size}px * var(--k, 1));color:${b.color}`, "aria-label": "Text" }, b.text);
    t.addEventListener("focus", () => {
      if (activeBlock !== b.id) {
        activeBlock = b.id;
        el.classList.add("active");
      }
    });
    t.addEventListener("change", () => void done(() => api.setBlock(v.id, b.id, { text: t.value })));
    el.appendChild(t);
  }
  if (ro) return el;
  // Move by the grip, resize by the corner; one undo step each.
  const grip = h("div", { class: "jgrip", title: "Drag to move" }, "⠿");
  const corner = h("div", { class: "jcorner", title: "Drag to resize" });
  const drag = (mode: "move" | "size") => (e: PointerEvent) => {
    e.preventDefault();
    const page = el.parentElement!;
    const k = page.clientWidth / PAGE_WIDTH || 1;
    const sx = e.clientX;
    const sy = e.clientY;
    const start = { x: b.x, y: b.y, w: b.w, h: b.h };
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / k;
      const dy = (ev.clientY - sy) / k;
      if (mode === "move") {
        el.style.setProperty("--x", String(Math.max(0, start.x + dx)));
        el.style.setProperty("--y", String(Math.max(0, start.y + dy)));
      } else {
        el.style.setProperty("--w", String(Math.max(60, start.w + dx)));
        el.style.setProperty("--h", String(Math.max(40, start.h + dy)));
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const n = (p: string) => Number(el.style.getPropertyValue(p));
      void done(() => api.setBlock(v.id, b.id, mode === "move" ? { x: n("--x"), y: n("--y") } : { w: n("--w"), h: n("--h") }));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  grip.addEventListener("pointerdown", drag("move"));
  corner.addEventListener("pointerdown", drag("size"));
  const bar = h(
    "div",
    { class: "jbar" },
    b.type === "text"
      ? [
          (() => {
            const f = h("select", { class: "mini-select", "aria-label": "Font" }, FONTS.map((x) => h("option", { value: x, selected: x === b.font }, x)));
            f.addEventListener("change", () => void done(() => api.setBlock(v.id, b.id, { font: f.value })));
            return f;
          })(),
          (() => {
            const s = h("select", { class: "mini-select", "aria-label": "Size" }, [12, 14, 16, 20, 24, 32, 44].map((x) => h("option", { value: String(x), selected: x === b.size }, String(x))));
            s.addEventListener("change", () => void done(() => api.setBlock(v.id, b.id, { size: Number(s.value) })));
            return s;
          })(),
          ...BLOCK_COLOURS.map((c) => h("button", { class: `swatch tiny-swatch${c === b.color ? " on" : ""}`, style: `background:${c}`, "aria-label": `Colour ${c}`, onClick: () => void done(() => api.setBlock(v.id, b.id, { color: c })) })),
        ]
      : h("button", { class: "mini", title: "Make it the whole page width", onClick: () => void done(() => api.setBlock(v.id, b.id, { x: 0, w: PAGE_WIDTH, h: Math.round((b.h * PAGE_WIDTH) / Math.max(1, b.w)) })) }, "Fit width"),
    h("button", { class: "mini", title: "Remove this block", onClick: () => void done(() => api.setBlock(v.id, b.id, null)) }, "×"),
  );
  el.append(grip, corner, bar);
  return el;
}

/** Print a page (a handout) with style: border, old paper, wax seal, handwriting; or plain with Ink saver. */
async function printPage(v: PageView) {
  const d = openDialog(`Print ${v.name}`);
  const style = h("select", { class: "text-input select", "aria-label": "Look" }, h("option", { value: "plain" }, "Plain"), h("option", { value: "parchment" }, "Old paper (aged, stained, torn edges)"), h("option", { value: "border" }, "A border"));
  const seal = h("input", { type: "checkbox" });
  const hand = h("input", { type: "checkbox" });
  const saver = h("input", { type: "checkbox" });
  d.body.replaceChildren(h("label", { class: "field-label" }, "Look"), style, h("label", { class: "check spaced" }, seal, "A wax seal"), h("label", { class: "check" }, hand, "Handwriting-style font"), h("label", { class: "check" }, saver, "Ink saver (prints it plain)"));
  const go = (kind: "pdf" | "print") => async () => {
    const req = { type: "handout" as const, page: v.id, handout: { style: saver.checked ? "plain" : style.value, seal: seal.checked && !saver.checked, hand: hand.checked } };
    const r = kind === "pdf" ? await window.dm.bookPdf(req) : await window.dm.bookPrint(req);
    if (!r.ok) notice(r.message, "red");
    else if (kind === "pdf" && r.value) notice(`Saved ${String(r.value).split(/[\\/]/).pop()}.`, "green", { label: "Open it", run: () => void window.dm.openPdf(String(r.value)) }, 8000);
    d.close();
  };
  d.footer.replaceChildren(h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"), h("button", { class: "button plain", onClick: go("print") }, "Print…"), h("button", { class: "button primary", onClick: go("pdf") }, "Save as PDF…"));
}

export type { Block };
