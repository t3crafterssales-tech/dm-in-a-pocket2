// Choosing a picture (version 3): suggestions that fit what you're making, the whole library
// filtered by tag, style and stars, and "Upload your own" with a name and tags. Used everywhere a
// picture slot is, and by the map's picture palette.

import type { PicEntry } from "../app/piclib.ts";
import { api, pictureUrl } from "./api.ts";
import { attempt } from "./common.ts";
import { openDialog } from "./dialogs.ts";
import { h } from "./dom.ts";

export interface ChooseOptions {
  /** Words that say what it's for (a name's words, then the kind): drive the Suggested row. */
  hints?: string[];
  title?: string;
}

/** Opens the chooser. Resolves with the picture's id, or null if the person closed it. */
export function choosePicture(opts: ChooseOptions = {}): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (id: string | null) => {
      if (done) return;
      done = true;
      d.close();
      resolve(id);
    };
    const d = openDialog(opts.title ?? "Choose a picture", { wide: true, onClose: () => finish(null) });
    const state = { text: "", tags: new Set<string>(), style: "", stars: false };
    let all: PicEntry[] = [];
    let suggested: PicEntry[] = [];
    const grid = h("div", { class: "pic-grid" });
    const chips = h("div", { class: "pic-tags" });
    const style = h("select", { class: "text-input select", "aria-label": "Style" });
    const search = h("input", { class: "text-input", type: "search", placeholder: "Search by name or tag…", "aria-label": "Search pictures" });
    const stars = h("label", { class: "inline small" }, h("input", { type: "checkbox" }), "Favourites");
    const tile = (e: PicEntry) =>
      h(
        "div",
        { class: "pic-tile" },
        h("button", { class: "pic-pick", title: `${e.name}${e.tags.length ? ` · ${e.tags.join(", ")}` : ""}`, "aria-label": `Use ${e.name}`, onClick: () => finish(e.id) }, h("img", { src: pictureUrl(e.id), alt: "", loading: "lazy" })),
        h("span", { class: "pic-name small" }, e.name),
        h("button", { class: "icon-button tiny", title: e.favourite ? "Unstar" : "Star", "aria-label": e.favourite ? `Unstar ${e.name}` : `Star ${e.name}`, onClick: async () => ((await attempt(() => api.tagPicture(e.id, { favourite: !e.favourite }))) && (await load())) }, e.favourite ? "★" : "☆"),
        h("button", { class: "icon-button tiny", title: "Name and tags", "aria-label": `Edit ${e.name}`, onClick: () => editTags(e, load) }, "✎"),
      );
    const draw = () => {
      const q = state.text.trim().toLowerCase();
      const shown = all.filter((e) => (!state.stars || e.favourite) && (!state.style || e.style === state.style) && [...state.tags].every((t) => e.tags.includes(t)) && (!q || e.name.toLowerCase().includes(q) || e.tags.some((t) => t.includes(q))));
      const tags = [...new Set(all.flatMap((e) => e.tags))].sort((a, b) => a.localeCompare(b));
      chips.replaceChildren(...tags.map((t) => h("button", { class: `pick-chip${state.tags.has(t) ? " on" : ""}`, "aria-pressed": state.tags.has(t) ? "true" : "false", onClick: () => (state.tags.has(t) ? state.tags.delete(t) : state.tags.add(t), draw()) }, t)));
      const styles = [...new Set(all.map((e) => e.style).filter(Boolean))].sort();
      style.replaceChildren(h("option", { value: "" }, "Any style"), ...styles.map((s) => h("option", { value: s, selected: s === state.style }, s)));
      grid.replaceChildren(
        ...(suggested.length && !q && !state.tags.size && !state.style && !state.stars ? [h("p", { class: "muted small pic-heading" }, "Suggested for this"), h("div", { class: "pic-grid" }, suggested.slice(0, 12).map(tile)), h("p", { class: "muted small pic-heading" }, "The whole library")] : []),
        ...(shown.length ? shown.map(tile) : [h("p", { class: "muted small" }, all.length ? "Nothing matches. Untick a tag or clear the search." : "The library is empty. Use Upload your own to add the first picture.")]),
      );
    };
    const load = async () => {
      all = (await attempt(() => api.pictureLibrary())) ?? [];
      suggested = opts.hints?.length ? ((await attempt(() => api.pictureSuggestions(opts.hints!))) ?? []) : [];
      draw();
    };
    search.addEventListener("input", () => ((state.text = search.value), draw()));
    style.addEventListener("change", () => ((state.style = style.value), draw()));
    stars.querySelector("input")!.addEventListener("change", (e) => ((state.stars = (e.target as HTMLInputElement).checked), draw()));
    d.body.replaceChildren(h("div", { class: "pic-filters" }, search, style, stars), chips, grid);
    d.footer.replaceChildren(
      h("button", { class: "button plain", onClick: () => finish(null) }, "Cancel"),
      h("span", { class: "grow" }),
      h("button", { class: "button primary", onClick: () => void upload(load, finish) }, "Upload your own…"),
    );
    void load();
  });
}

/** Name, main tag and any number of extra tag lines (each with suggestions), then pick the file. */
async function upload(reload: () => Promise<void>, finish: (id: string | null) => void) {
  const d = openDialog("Add a picture to the library");
  const name = h("input", { class: "text-input", placeholder: "Goblin scout", "aria-label": "Name" });
  const main = h("input", { class: "text-input", placeholder: "goblin", "aria-label": "Main tag", list: "pic-tag-list" });
  const style = h("input", { class: "text-input", placeholder: "Optional, such as cartoon or gothic", "aria-label": "Style" });
  const list = h("datalist", { id: "pic-tag-list" });
  const extras = h("div", { class: "pic-extras" });
  const refreshList = async (typed = "") => {
    const r = await attempt(() => api.pictureTags(main.value, typed, []));
    list.replaceChildren(...(r?.suggested ?? []).map((t) => h("option", { value: t })));
  };
  const line = () => {
    const input = h("input", { class: "text-input", placeholder: "another tag", "aria-label": "Tag", list: "pic-tag-list" });
    input.addEventListener("input", () => void refreshList(input.value));
    const row = h("div", { class: "inline" }, input, h("button", { class: "icon-button tiny", title: "Remove this tag", "aria-label": "Remove this tag", onClick: () => row.remove() }, "×"));
    extras.append(row);
    input.focus();
  };
  main.addEventListener("input", () => void refreshList(main.value));
  void refreshList();
  d.body.replaceChildren(
    h("label", { class: "field-label" }, "Name"),
    name,
    h("label", { class: "field-label spaced" }, "Main tag (one word, used first to match new things)"),
    main,
    extras,
    h("button", { class: "link small", onClick: line }, "+ Add tag"),
    h("label", { class: "field-label spaced" }, "Style"),
    style,
    list,
    h("p", { class: "muted small" }, "Tags are single lowercase words. A new word becomes a tag at once and is offered next time."),
  );
  const go = h("button", { class: "button primary" }, "Choose the file…");
  go.addEventListener("click", async () => {
    const tags = [main.value, ...[...extras.querySelectorAll("input")].map((i) => (i as HTMLInputElement).value)];
    const id = await attempt(() => api.importPictureTagged({ name: name.value, tags, style: style.value }));
    if (!id) return;
    d.close();
    await reload();
    finish(id);
  });
  d.footer.replaceChildren(h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"), go);
  name.focus();
}

function editTags(e: PicEntry, reload: () => Promise<void>) {
  const d = openDialog(`Tags for ${e.name}`);
  const name = h("input", { class: "text-input", value: e.name, "aria-label": "Name" });
  const tags = h("input", { class: "text-input", value: e.tags.join(", "), placeholder: "goblin, monster, fantasy", "aria-label": "Tags" });
  const style = h("input", { class: "text-input", value: e.style, "aria-label": "Style" });
  d.body.replaceChildren(h("label", { class: "field-label" }, "Name"), name, h("label", { class: "field-label spaced" }, "Tags, separated by commas (the first is the main tag)"), tags, h("label", { class: "field-label spaced" }, "Style"), style);
  const ok = h("button", { class: "button primary" }, "Save");
  ok.addEventListener("click", async () => {
    if (await attempt(() => api.tagPicture(e.id, { name: name.value, tags: tags.value.split(/[,;]/).map((t) => t.trim()), style: style.value }))) {
      d.close();
      await reload();
    }
  });
  d.footer.replaceChildren(h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"), ok);
}
