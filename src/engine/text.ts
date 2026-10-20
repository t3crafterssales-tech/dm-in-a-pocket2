// Plain-English sentences for bricks on a sheet. The same sentences confirm that a chain of
// bricks does what the user meant, and become the rulebook text.
//
// Example: Big Shield -> Knocked prone (on a natural 19 or 20, Strength save DC 13) -> Fire 1d6
// "On a natural 19 or 20, the target must make a DC 13 Strength saving throw or fall Prone.
//  When that happens, also: deals 1d6 fire damage (Dexterity saving throw DC 13 for half)."

import { F, attachmentValues } from "./conventions.ts";
import { isLink } from "./links.ts";
import type { Attachment, Id, Save, Value } from "./types.ts";
import type { Workspace } from "./workspace.ts";

export const TRIGGERS: Record<string, string> = {
  always: "",
  hit: "on a hit",
  crit: "on a critical hit",
  whenHit: "when hit",
  bloodied: "when bloodied",
  zero: "when the wielder drops to 0 hit points",
  flanked: "when the target is flanked",
  unaware: "when the target is unaware",
  belowHalf: "when the target is below half health",
  action: "as an action",
  bonus: "as a bonus action",
  reaction: "as a reaction",
};

export function cap(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

export function joinWords(list: string[], word = "or"): string {
  if (list.length <= 1) return list.join("");
  return `${list.slice(0, -1).join(", ")} ${word} ${list[list.length - 1]}`;
}

function nameOf(ws: Workspace, layerId: Id, v: Value | undefined): string {
  if (!isLink(v)) return "nothing";
  return ws.get(layerId, v.link)?.name ?? `[missing: ${ws.binEntryFor(v.link)?.node.name ?? "removed"}]`;
}

export function whenText(a: Attachment): string {
  const act = a.activation;
  const parts = act.when
    .filter((w) => w !== "always")
    .map((w) => {
      if (w === "nat") {
        const n = act.natural ?? 20;
        return n >= 20 ? "on a natural 20" : n === 19 ? "on a natural 19 or 20" : `on a natural ${n} or higher`;
      }
      if (w === "custom") return act.custom?.trim() || "on a custom trigger";
      return TRIGGERS[w] ?? w;
    });
  return joinWords(parts, act.join === "all" ? "and" : "or");
}

export function usesText(a: Attachment): string {
  if (!a.uses || a.uses.count === "" || a.uses.count === 0) return "";
  const per = a.uses.per ? ` per ${a.uses.per}` : "";
  const c = a.uses.count;
  if (typeof c === "number" || /^\d+$/.test(c)) {
    const n = Number(c);
    return ` (${n === 1 ? "once" : n === 2 ? "twice" : `${n} times`}${per})`;
  }
  return ` (${c} times${per}, at least once)`;
}

function saveText(ws: Workspace, layerId: Id, s: Save): string {
  return `DC ${s.dc} ${nameOf(ws, layerId, s.ability)} saving throw`;
}

function fill(template: string, values: Record<string, Value>, ws: Workspace, layerId: Id): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = values[k];
    if (isLink(v)) return nameOf(ws, layerId, v);
    return v === undefined || v === null ? "?" : String(v);
  });
}

/** What the brick itself does, with no "when" and no saving throw. */
export function coreText(ws: Workspace, layerId: Id, a: Attachment): string {
  if (!a.brick) return "";
  const target = ws.get(layerId, a.brick.link);
  if (!target) return `uses something that was removed (${ws.binEntryFor(a.brick.link)?.node.name ?? "removed"})`;
  const name = a.name || target.name;
  if (target.kind === "item") {
    const item = ws.resolve(layerId, target.id)!;
    const attack = item.attachments.find(({ attachment }) => attachmentValues(ws, layerId, attachment)[F.type] === "attack");
    if (attack) return `${name}: ${coreText(ws, layerId, attack.attachment).replace(/^[^:]+: /, "")}`;
    return `carries a ${name}`;
  }
  const v = attachmentValues(ws, layerId, a);
  const wording = typeof v[F.wording] === "string" ? fill(v[F.wording] as string, v, ws, layerId) : "";
  switch (v[F.type]) {
    case "attack":
      // Any wording follows the damage: "(melee, reach 10 ft.) plus 5 (2d4) Fire damage".
      return `${name}: attack with d20 + ${nameOf(ws, layerId, v[F.ability])} + proficiency, ${v[F.dice] ?? "?"} ${v[F.damageType] ?? ""} damage`.replace(/\s+damage$/, " damage") + (wording ? ` ${wording}` : "");
    case "damage":
      return `deals ${v[F.dice] ?? "?"} ${v[F.damageType] ?? ""} damage`.replace(/\s+damage$/, " damage");
    case "effect":
      return wording || `the target is ${nameOf(ws, layerId, v[F.condition])}`;
    case "immunity":
      return `immune to the ${nameOf(ws, layerId, v[F.condition])} condition`;
    case "abilityBonus": {
      const amt = Number(v.amount ?? 0);
      return `${amt >= 0 ? "+" : ""}${amt} ${nameOf(ws, layerId, v[F.ability])}`;
    }
    case "armor":
      return `+${v.bonus ?? 0} armour`;
    case "spell":
      return `casts ${name}${v[F.dice] ? ` (${v[F.dice]} ${v[F.damageType] ?? ""})`.replace(" )", ")") : ""}${wording ? `: ${wording}` : ""}`;
    default:
      return wording ? `${name}: ${wording}` : name;
  }
}

/** The full sentence for a brick on a sheet, including everything nested inside it. */
export function sentence(ws: Workspace, layerId: Id, a: Attachment): string {
  if (a.choice) {
    const opts = a.choice.options.map((o) => nameOf(ws, layerId, o));
    const n = a.choice.pick === 1 ? "one" : String(a.choice.pick);
    let s = `Choose ${n} ${a.choice.label}: ${joinWords(opts)}`;
    if (a.choice.again) s += " (can be chosen again later)";
    if (a.choice.restrict) s += ` (${a.choice.restrict})`;
    return s + ".";
  }
  const core = coreText(ws, layerId, a);
  const when = whenText(a);
  let s: string;
  if (a.save) {
    const success = a.save.onSuccess === "half" ? " (half on a success)" : a.save.onSuccess && a.save.onSuccess !== "no effect" ? ` (${a.save.onSuccess} on a success)` : "";
    s = `${when ? `${cap(when)}, the` : "The"} target must make a ${saveText(ws, layerId, a.save)}; on a failure, ${core}${success}`;
  } else s = when ? `${cap(when)}, ${core}` : cap(core);
  const uses = usesText(a);
  // Wording copied from a book often ends with its own full stop.
  s += uses ? `${uses}.` : /[.!?]$/.test(s) ? "" : ".";
  if (a.children.length) s += ` When that happens, also: ${a.children.map((c) => sentence(ws, layerId, c).replace(/\.$/, "")).join("; ")}.`;
  if (a.tiers.length) s += ` Upgrades: ${a.tiers.map((t) => `${t.name}${t.requirement ? ` (${t.requirement})` : ""}: ${t.change}`).join("; ")}.`;
  return s;
}
