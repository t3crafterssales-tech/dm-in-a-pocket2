// Players join (version 2.5), the DM's side: opening the door, each player's PIN and level, the
// permissions grid (like Foundry's), templates, and Show to players. Used by the Party tab and by
// the Players tool at the DM's table.

import type { Access, Level, Part, Person, PlayersView } from "../app/backend.ts";
import { LEVELS, LEVEL_ORDER, PARTS } from "../app/players-lists.ts";
import { api } from "./api.ts";
import { attempt } from "./common.ts";
import { notice, openDialog } from "./dialogs.ts";
import { h, svg } from "./dom.ts";
import { ICONS } from "./icons.ts";
import { askText } from "./pickers.ts";

const ACCESS_WORDS: Record<Access, string> = { hidden: "Hidden", see: "Can see", change: "Can change" };
const NEXT: Record<Access, Access> = { hidden: "see", see: "change", change: "hidden" };

export interface PlayersHost {
  readOnly: boolean;
  refresh: () => Promise<void>;
  /** The characters in the roster, to link players to. */
  roster: { id: string; name: string; player: string }[];
  compact?: boolean;
}

/** The door, the people and their PINs. */
export async function playersSection(host: PlayersHost): Promise<HTMLElement> {
  const v = await attempt(() => api.players());
  if (!v) return h("div");
  const ro = host.readOnly;
  const redo = async (fn: () => Promise<unknown>) => {
    if ((await attempt(fn)) !== undefined) await host.refresh();
  };

  const door = v.open
    ? h(
        "div",
        { class: "door open" },
        v.qr && !host.compact ? h("div", { class: "door-qr", title: "Players can scan this with a phone camera" }, svg(v.qr)) : null,
        h(
          "div",
          { class: "door-text" },
          h("strong", null, "The table is open."),
          h("p", { class: "small" }, "On a phone, tablet or laptop on the same Wi-Fi, open a web browser and go to:"),
          v.addresses.length ? v.addresses.slice(0, host.compact ? 1 : 3).map((a, i) => h("div", { class: `door-address${i ? " muted small" : ""}` }, a)) : h("p", { class: "muted" }, "This computer isn't on a network right now."),
          h("p", { class: "muted small" }, "Then type your own PIN. Nothing to install, no accounts."),
          ro ? null : h("button", { class: "button plain small-button", onClick: () => void redo(() => api.closeTable()) }, "Close the table"),
        ),
      )
    : h(
        "div",
        { class: "door" },
        h(
          "div",
          { class: "door-text" },
          h("strong", null, "Players join on their own screens."),
          h("p", { class: "small muted" }, "Open the table and anyone on your Wi-Fi can join in a web browser with their PIN. The first time, Windows may ask whether DM in a Pocket can use the network: choose Allow."),
          h("button", { class: "button primary", disabled: ro, onClick: () => void redo(() => api.openTable()) }, "Open the table to players"),
        ),
      );

  const online = new Set(v.online);
  const rows = v.people.map((p) => personRow(p, v, host, online.has(p.id), redo));
  const named = new Set(v.people.map((p) => p.name.toLowerCase()));
  const missing = host.roster.filter((c) => c.player && !named.has(c.player.toLowerCase()));
  return h(
    "section",
    { class: `players-section${host.compact ? " compact" : ""}` },
    door,
    h("h3", null, "Players and PINs"),
    rows.length ? h("div", { class: "people" }, rows) : h("p", { class: "muted small" }, "No players yet. Add each person who plays: they get their own PIN."),
    ro
      ? null
      : h(
          "div",
          { class: "inline spaced" },
          h(
            "button",
            {
              class: "button plain small-button",
              onClick: async () => {
                const name = await askText("Add a player", "", "Their name", "Ken");
                if (name) await redo(() => api.addPerson(name, host.roster.find((c) => c.player.toLowerCase() === name.toLowerCase())?.id ?? null));
              },
            },
            svg(ICONS.plus),
            "Player",
          ),
          missing.length ? h("button", { class: "button plain small-button", title: missing.map((c) => `${c.player} (${c.name})`).join(", "), onClick: () => void redo(async () => { for (const c of missing) await api.addPerson(c.player, c.id); }) }, `Add ${missing.length === 1 ? missing[0]!.player : `everyone from the roster (${missing.length})`}`) : null,
          v.people.length ? h("button", { class: "button plain small-button", onClick: () => void permissionsDialog(host) }, "Permissions…") : null,
        ),
  );
}

function personRow(p: Person, v: PlayersView, host: PlayersHost, isOnline: boolean, redo: (fn: () => Promise<unknown>) => Promise<void>): HTMLElement {
  const ro = host.readOnly;
  const character = h("select", { class: "text-input select small-select", "aria-label": `${p.name}'s character`, disabled: ro }, h("option", { value: "" }, "No character"), host.roster.map((c) => h("option", { value: c.id, selected: c.id === p.character }, c.name)));
  character.addEventListener("change", () => void redo(() => api.setPerson(p.id, { character: character.value || null })));
  const level = h("select", { class: "text-input select small-select", "aria-label": `${p.name}'s level`, disabled: ro }, LEVEL_ORDER.map((l) => h("option", { value: l, selected: l === p.level }, LEVELS[l].label)));
  level.addEventListener("change", () => void redo(() => api.setPerson(p.id, { level: level.value as Level })));
  const exceptions = Object.keys(p.grid).length;
  return h(
    "div",
    { class: "person" },
    h("span", { class: `presence${isOnline ? " on" : ""}`, title: isOnline ? "Joined" : "Not joined" }),
    h("span", { class: "person-name", style: `color:${p.color}` }, p.name),
    character,
    level,
    exceptions ? h("span", { class: "tag", title: "Squares changed from their level in the permissions grid" }, `${exceptions} exception${exceptions === 1 ? "" : "s"}`) : null,
    h("span", { class: `pin${p.pin ? "" : " none"}`, title: "Their PIN: both the key and who they are" }, p.pin || "no PIN"),
    ro
      ? null
      : h(
          "span",
          { class: "person-actions" },
          p.pin ? h("button", { class: "link small", title: "A QR code with their PIN in it: they scan it and they're in", onClick: () => void joinCard(p, v) }, "QR") : null,
          h("button", { class: "link small", title: "A new PIN; the old one stops working at once", onClick: () => void redo(() => api.rerollPin(p.id)) }, "New PIN"),
          p.pin ? h("button", { class: "link small", title: "Take their PIN away until you give a new one", onClick: () => void redo(() => api.revokePin(p.id)) }, "No PIN") : null,
          h("button", { class: "link small danger", title: "Remove from the party (their character stays)", onClick: () => void redo(() => api.removePerson(p.id)) }, "Remove"),
        ),
  );
}

async function joinCard(p: Person, v: PlayersView) {
  const base = v.addresses[0] ?? `http://this-computer:${v.port}`;
  const link = `${base}/?pin=${p.pin}`;
  const qr = await attempt(() => api.qrCode(link));
  const d = openDialog(`${p.name} joins`);
  d.body.replaceChildren(
    h("div", { class: "join-card" }, qr ? svg(qr) : null, h("div", null, h("p", null, `${p.name} scans this with their phone's camera, or goes to:`), h("div", { class: "door-address" }, base), h("p", null, "and types the PIN"), h("div", { class: "pin big" }, p.pin))),
    v.open ? h("span") : h("p", { class: "muted small" }, "Open the table first, or the link won't answer."),
  );
  d.footer.replaceChildren(h("button", { class: "button primary", onClick: () => d.close() }, "Done"));
}

/** The permissions grid: people down the side, parts of the game across the top. Click cycles. */
export async function permissionsDialog(host: PlayersHost) {
  const d = openDialog("Permissions", { wide: true });
  const draw = async () => {
    const v = await attempt(() => api.players());
    if (!v) return;
    const set = async (p: Person, change: Parameters<typeof api.setPerson>[1]) => {
      await attempt(() => api.setPerson(p.id, change));
      await draw();
    };
    const cell = (p: Person, part: Part) => {
      const base = LEVELS[p.level].grid[part];
      const now = p.grid[part] ?? base;
      return h(
        "td",
        null,
        h(
          "button",
          {
            class: `perm perm-${now}${p.grid[part] ? " changed" : ""}`,
            title: `${p.name}: ${PARTS.find((x) => x.key === part)!.hint}. Click to change.`,
            disabled: host.readOnly,
            onClick: () => {
              const next = NEXT[now];
              const grid = { ...p.grid };
              if (next === base) delete grid[part];
              else grid[part] = next;
              void set(p, { grid });
            },
          },
          ACCESS_WORDS[now],
        ),
      );
    };
    const personTemplates = v.templates.filter((t) => t.kind === "person");
    const tableTemplates = v.templates.filter((t) => t.kind === "table");
    const rowFor = (p: Person) => {
      const level = h("select", { class: "text-input select small-select", "aria-label": "Level", disabled: host.readOnly }, LEVEL_ORDER.map((l) => h("option", { value: l, selected: l === p.level }, LEVELS[l].label)), personTemplates.map((t) => h("option", { value: `t:${t.name}` }, `Template: ${t.name}`)));
      level.addEventListener("change", async () => {
        if (level.value.startsWith("t:")) await attempt(() => api.useTemplate(level.value.slice(2), "person", p.id));
        else await attempt(() => api.setPerson(p.id, { level: level.value as Level, grid: {} }));
        await draw();
      });
      return h(
        "tr",
        null,
        h("th", { class: "perm-who" }, h("span", { style: `color:${p.color}` }, p.name), level),
        PARTS.map((x) => cell(p, x.key)),
        h(
          "td",
          { class: "perm-row-actions" },
          h("button", { class: "link small", disabled: host.readOnly, onClick: () => void set(p, { grid: Object.fromEntries(PARTS.map((x) => [x.key, "hidden"])) as Record<Part, Access> }) }, "Deny all"),
          p.level === "assistant" ? h("button", { class: "link small", disabled: host.readOnly, title: "Everything the DM can do (the DM seat itself stays yours)", onClick: () => void set(p, { grid: Object.fromEntries(PARTS.map((x) => [x.key, "change"])) as Record<Part, Access> }) }, "All") : null,
          h("button", { class: "link small", disabled: host.readOnly, title: "Back to their level's usual squares", onClick: () => void set(p, { grid: {} }) }, "Reset"),
          h(
            "button",
            {
              class: "link small",
              disabled: host.readOnly,
              title: "Save this row as a person template",
              onClick: async () => {
                const name = await askText("Save as a person template", "", "Template name", "Trusted, no map pointer");
                if (name && (await attempt(() => api.saveTemplate(name, "person", p.id)))) await draw();
              },
            },
            "Save…",
          ),
        ),
      );
    };
    const denyColumn = (part: Part) =>
      h(
        "button",
        {
          class: "link tiny",
          disabled: host.readOnly,
          onClick: async () => {
            for (const p of v.people) await attempt(() => api.setPerson(p.id, { grid: { ...p.grid, [part]: "hidden" } }));
            await draw();
          },
        },
        "Deny all",
      );
    const useTable = h("select", { class: "text-input select small-select", "aria-label": "Table template" }, h("option", { value: "" }, "Use a table template…"), tableTemplates.map((t) => h("option", { value: t.name }, t.name)));
    useTable.addEventListener("change", async () => {
      if (!useTable.value) return;
      await attempt(() => api.useTemplate(useTable.value, "table"));
      await draw();
    });
    d.body.replaceChildren(
      h("p", { class: "muted small" }, "Each person's level sets their row; click a square to make an exception (Hidden, Can see, Can change). You, the DM, always have everything, and can show anything to anyone whatever this says."),
      h(
        "div",
        { class: "perm-scroll" },
        h(
          "table",
          { class: "perm-grid" },
          h("thead", null, h("tr", null, h("th", null), PARTS.map((x) => h("th", { title: x.hint }, x.label, h("br"), denyColumn(x.key))), h("th"))),
          h("tbody", null, v.people.map(rowFor)),
        ),
      ),
      h(
        "div",
        { class: "inline spaced" },
        tableTemplates.length ? useTable : null,
        h(
          "button",
          {
            class: "button plain small-button",
            disabled: host.readOnly,
            title: "Save everyone's rows together, such as \"Thursday group\"",
            onClick: async () => {
              const name = await askText("Save as a table template", "", "Template name", "Thursday group");
              if (name && (await attempt(() => api.saveTemplate(name, "table")))) await draw();
            },
          },
          "Save as a table template…",
        ),
        [...personTemplates, ...tableTemplates].length
          ? h(
              "select",
              {
                class: "text-input select small-select",
                "aria-label": "Forget a template",
                onChange: async (e: Event) => {
                  const val = (e.target as HTMLSelectElement).value;
                  if (!val) return;
                  const [kind, ...name] = val.split(":");
                  await attempt(() => api.deleteTemplate(name.join(":"), kind as "person" | "table"));
                  await draw();
                },
              },
              h("option", { value: "" }, "Forget a template…"),
              [...personTemplates, ...tableTemplates].map((t) => h("option", { value: `${t.kind}:${t.name}` }, `${t.name} (${t.kind})`)),
            )
          : null,
      ),
    );
  };
  await draw();
  d.footer.replaceChildren(
    h(
      "button",
      {
        class: "button primary",
        onClick: async () => {
          d.close();
          await host.refresh();
        },
      },
      "Done",
    ),
  );
}

/** Show to players: the party ticked (everyone by default); untick anyone who shouldn't see it. */
export async function showToPlayers(node: string, name: string, opts: { live?: boolean } = {}) {
  const v = await attempt(() => api.players());
  if (!v) return;
  if (!v.people.length) return notice("Add your players first (Party tab, the whole party), then open the table.", "blue", undefined, 6000);
  const online = new Set(v.online);
  const ticks = v.people.map((p) => ({ p, box: h("input", { type: "checkbox", checked: true }) }));
  const d = openDialog(`Show ${name}`);
  d.body.replaceChildren(
    h("p", { class: "muted small" }, opts.live ? "The map goes live on their screens and follows your marks as you draw." : "It pops up on their screens and stays in their journal."),
    ...ticks.map(({ p, box }) => h("label", { class: "check" }, box, h("span", { class: `presence${online.has(p.id) ? " on" : ""}` }), p.name)),
    v.open ? h("span") : h("p", { class: "muted small" }, "The table isn't open yet: they'll see it when they join."),
  );
  const go = async () => {
    const picked = ticks.filter((t) => t.box.checked).map((t) => t.p.id);
    if (!picked.length) return d.close();
    const to = picked.length === ticks.length ? [] : picked;
    const ok = opts.live ? await attempt(() => api.showMapLive(node, to)) : await attempt(() => api.showToPlayers(node, to));
    if (ok) notice(`Showed ${name} to ${to.length ? ticks.filter((t) => t.box.checked).map((t) => t.p.name).join(", ") : "everyone"}.`, "green", undefined, 4000);
    d.close();
  };
  d.footer.replaceChildren(h("button", { class: "button plain", onClick: () => d.close() }, "Cancel"), h("button", { class: "button primary", onClick: () => void go() }, "Show"));
}
