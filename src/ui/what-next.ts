// "Where do you want to start?" and "What next?": a few big choices on an empty screen, so a new
// person is never left staring at a blank area wondering what to do. They go away by themselves
// once something is open.

import { h } from "./dom.ts";

export interface NextChoice {
  icon: string;
  title: string;
  blurb: string;
  run: () => void;
  disabled?: boolean;
}

export function whatNext(heading: string, intro: string, choices: NextChoice[], extra: (HTMLElement | null)[] = []): HTMLElement {
  return h(
    "div",
    { class: "what-next" },
    h("h2", null, heading),
    h("p", { class: "muted" }, intro),
    h(
      "div",
      { class: "next-cards" },
      choices.map((c) =>
        h(
          "button",
          { class: "next-card", disabled: !!c.disabled, onClick: c.run },
          h("span", { class: "next-icon", "aria-hidden": "true" }, c.icon),
          h("strong", null, c.title),
          h("span", { class: "muted small" }, c.blurb),
        ),
      ),
    ),
    ...extra,
  );
}
