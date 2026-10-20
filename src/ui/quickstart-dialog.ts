// Quick start: the six big questions, one at a time, each answered with one click. Skippable at
// any point; what it makes is ordinary rules that can all be changed later.

import { api } from "./api.ts";
import { attempt } from "./common.ts";
import { notice, openDialog } from "./dialogs.ts";
import { h } from "./dom.ts";

export async function showQuickStart(refresh: () => Promise<void>) {
  const questions = await attempt(() => api.quickQuestions());
  if (!questions) return;
  const answers: Record<string, string> = {};
  let i = 0;
  const d = openDialog("Quick start", { wide: true, onClose: () => void refresh() });
  const draw = () => {
    const q = questions[i]!;
    d.body.replaceChildren(
      h("p", { class: "muted small" }, `Question ${i + 1} of ${questions.length}. Every answer makes ordinary rules you can change later. Skip whenever you like.`),
      h("h3", { class: "quick-question" }, q.question),
      h(
        "div",
        { class: "quick-options" },
        q.options.map((o) =>
          h(
            "button",
            {
              class: `quick-option${answers[q.key] === o.value ? " chosen" : ""}`,
              onClick: async () => {
                answers[q.key] = o.value;
                if (i < questions.length - 1) {
                  i++;
                  draw();
                  return;
                }
                const made = await attempt(() => api.quickStart(answers as never));
                if (!made) return;
                d.close();
                notice(`Quick start made ${made.length} rules. Look through the Rules tab and change anything; it's one undo step.`, "green", { label: "Undo", run: async () => (await attempt(() => api.undo()), await refresh()) }, 10000);
              },
            },
            h("span", { class: "quick-label" }, o.label),
            o.hint ? h("span", { class: "muted small" }, o.hint) : null,
          ),
        ),
      ),
    );
    d.footer.replaceChildren(
      i > 0 ? h("button", { class: "button plain", onClick: () => (i--, draw()) }, "Back") : h("span"),
      h("span", { class: "spacer" }),
      h("button", { class: "button plain", onClick: () => d.close() }, "Skip"),
    );
    (d.body.querySelector(".quick-option") as HTMLElement | null)?.focus();
  };
  draw();
}
