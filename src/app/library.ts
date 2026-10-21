// The library: reusable bricks (attacks, spells, traits...) and attaching them to sheets.
// Attaching makes a linked copy: editing the original in the library changes every sheet that
// uses it, except values a sheet changed for itself.

import { F, attachmentValues, sentence } from "../engine/index.ts";
import type { Activation, Attachment, Id, NodeRecord, Uses, Value, Workspace } from "../engine/index.ts";
import { sheetFor } from "./sheets.ts";

export type BrickType = "attack" | "damage" | "effect" | "spell" | "trait" | "immunity" | "abilityBonus" | "armor";

export const BRICK_TYPES: { id: BrickType; label: string; plural: string }[] = [
  { id: "attack", label: "Attack", plural: "Attacks" },
  { id: "spell", label: "Spell", plural: "Spells" },
  { id: "trait", label: "Trait", plural: "Traits" },
  { id: "effect", label: "Effect", plural: "Effects" },
  { id: "damage", label: "Damage", plural: "Damage" },
  { id: "immunity", label: "Immunity", plural: "Immunities" },
  { id: "abilityBonus", label: "Ability bonus", plural: "Ability bonuses" },
  { id: "armor", label: "Armour", plural: "Armour" },
];

/** What a new brick of each type starts with. */
export function brickDefaults(type: BrickType): Record<string, Value> {
  const base = { [F.type]: type };
  switch (type) {
    case "attack":
      return { ...base, [F.ability]: null, [F.dice]: "1d6", [F.damageType]: "slashing" };
    case "damage":
      return { ...base, [F.dice]: "1d6", [F.damageType]: "fire" };
    case "effect":
      return { ...base, [F.condition]: null, [F.wording]: "" };
    case "spell":
      return { ...base, [F.dice]: "", [F.damageType]: "", [F.wording]: "" };
    case "immunity":
      return { ...base, [F.condition]: null };
    case "abilityBonus":
      return { ...base, [F.ability]: null, amount: 1 };
    case "armor":
      return { ...base, bonus: 1 };
    default:
      return { ...base, [F.wording]: "" };
  }
}

export interface LibraryEntry {
  id: Id;
  name: string;
  /** A brick's type, "item" for items (which can be carried as gear), or "template" for template parents. */
  type: BrickType | "item" | "template";
  /** What it does, in a few words. */
  note: string;
  fromBelow: boolean;
}

export interface LibrarySection {
  type: BrickType | "item" | "template";
  title: string;
  entries: LibraryEntry[];
}

/** Everything that can be dragged onto a sheet, section by section. */
export function librarySections(ws: Workspace, layerId: Id): LibrarySection[] {
  const below = ws.layer(layerId).base;
  const fromBelow = (id: Id) => !!below && ws.owner(layerId, id) !== layerId;
  const bricks = ws.list(layerId, "brick").filter((n) => !n.template);
  const sections: LibrarySection[] = BRICK_TYPES.map((t) => ({
    type: t.id,
    title: t.plural,
    entries: bricks
      .map((b) => ({ b, f: ws.resolve(layerId, b.id)!.fields }))
      .filter(({ f }) => (f[F.type] ?? "trait") === t.id || (t.id === "trait" && !BRICK_TYPES.some((x) => x.id === f[F.type])))
      .map(({ b }) => ({ id: b.id, name: b.name, type: t.id, note: brickNote(ws, layerId, b.id), fromBelow: fromBelow(b.id) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
  sections.push({
    type: "item",
    title: "Items",
    entries: ws
      .list(layerId, "item")
      .filter((n) => !n.template)
      .map((n) => ({ id: n.id, name: n.name, type: "item" as const, note: typeof ws.resolve(layerId, n.id)!.fields[F.cost] === "string" ? String(ws.resolve(layerId, n.id)!.fields[F.cost]) : "", fromBelow: fromBelow(n.id) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  });
  // Template parents live here rather than in the lists. They are opened, not dragged.
  sections.push({
    type: "template",
    title: "Templates",
    entries: ws
      .list(layerId)
      .filter((n) => n.template && (n.kind === "being" || n.kind === "item"))
      .map((n) => ({ id: n.id, name: n.name, type: "template" as const, note: n.kind === "item" ? "Item template" : "Being template", fromBelow: fromBelow(n.id) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  });
  return sections;
}

/** The sentence a brick reads as on a sheet, without its name in front. */
export function brickNote(ws: Workspace, layerId: Id, brickId: Id): string {
  return sentence(ws, layerId, fakeAttachment(brickId)).replace(/\.$/, "");
}

function fakeAttachment(brickId: Id): Attachment {
  return { aid: "", brick: { link: brickId }, name: null, overrides: {}, activation: { when: ["always"], join: "any" }, uses: null, save: null, children: [], tiers: [], choice: null };
}

export function createBrick(ws: Workspace, layerId: Id, type: BrickType, name: string): Id {
  if (!BRICK_TYPES.some((t) => t.id === type)) throw new Error("That isn't a kind of brick the app knows.");
  return ws.transact(`Added ${name} to the library`, () => ws.create(layerId, "brick", name, { fields: brickDefaults(type) }));
}

// ---------- Attaching ----------

/** Which section of a sheet a brick lands in, so the user can drop anywhere on the sheet. */
const SECTION_PREFS: Record<string, string[]> = {
  attack: ["Attacks and actions", "Attacks"],
  // On an item, extra damage and effects are enchantments (Flaming), not attacks of their own.
  damage: ["Attacks and actions", "Enchantments", "Attacks"],
  effect: ["Attacks and actions", "Enchantments", "Attacks", "Traits and features"],
  spell: ["Spells", "Enchantments"],
  trait: ["Traits and features", "Traits", "Features", "Properties"],
  immunity: ["Traits and features", "Traits", "Features", "Properties"],
  abilityBonus: ["Ability bonuses", "Traits and features", "Traits", "Features", "Properties"],
  armor: ["Properties", "Gear", "Traits and features", "Traits", "Features"],
  item: ["Gear", "Properties"],
  choice: ["Choices", "Features"],
};

export function sectionFor(sections: string[], type: string): string {
  for (const s of SECTION_PREFS[type] ?? []) if (sections.includes(s)) return s;
  return sections[0] ?? "Other";
}

export interface AttachmentView {
  aid: Id;
  brickId: Id | null;
  name: string;
  type: string;
  /** What it does on this sheet, in plain English. */
  sentence: string;
  section: string;
  /** The parent it was inherited from, for a variant; null if it is this sheet's own. */
  from: { id: Id; name: string } | null;
  /** The library original is gone (it is flagged red). */
  missing: boolean;
  /** Values this sheet changed on its copy (pencil marks). */
  changed: string[];
}

export function attachmentsOf(ws: Workspace, layerId: Id, nodeId: Id): AttachmentView[] {
  const r = ws.resolve(layerId, nodeId);
  if (!r) return [];
  const sheet = sheetFor(r.record, r.fields);
  const sections = sheet?.sections ?? [];
  return r.attachments.map(({ attachment: a, from }) => {
    const target = a.brick ? ws.get(layerId, a.brick.link) : null;
    const type = target?.kind === "item" ? "item" : a.choice ? "choice" : String(attachmentValues(ws, layerId, a)[F.type] ?? "trait");
    const fromNode = from ? ws.get(layerId, from) : null;
    return {
      aid: a.aid,
      brickId: a.brick?.link ?? null,
      name: a.name || target?.name || (a.brick ? (ws.binEntryFor(a.brick.link)?.node.name ?? "Something removed") : "Choice"),
      type,
      sentence: sentence(ws, layerId, a),
      section: sectionFor(sections, type),
      from: fromNode ? { id: fromNode.id, name: fromNode.name } : null,
      missing: !!a.brick && !target,
      changed: Object.keys(a.overrides),
    };
  });
}

/** True when this drop needs a quick question first: a spell on an item needs when and how often. */
export function dropNeedsAnswers(ws: Workspace, layerId: Id, targets: Id[], bricks: Id[]): boolean {
  const onItem = targets.some((t) => ws.get(layerId, t)?.kind === "item");
  const spell = bricks.some((b) => ws.resolve(layerId, b)?.fields[F.type] === "spell");
  return onItem && spell;
}

/**
 * Attaches bricks (or items, as gear) to one or more sheets in a single undo step: dropping three
 * bricks onto five goblins is one step. Something can't be attached to itself.
 */
export function attachMany(ws: Workspace, layerId: Id, targets: Id[], bricks: Id[], answers: { activation?: Activation; uses?: Uses | null } = {}): number {
  const t = targets.map((id) => ws.get(layerId, id)).filter((n): n is NodeRecord => !!n);
  const b = bricks.map((id) => ws.get(layerId, id)).filter((n): n is NodeRecord => !!n && (n.kind === "brick" || n.kind === "item"));
  if (!t.length) throw new Error("There is nothing to add it to.");
  if (!b.length) throw new Error("Only bricks and items can be added to a sheet.");
  const what = b.length === 1 ? b[0]!.name : count(b.length, "brick");
  const label = `Added ${what} to ${t.length === 1 ? t[0]!.name : count(t.length, "sheet")}`;
  let added = 0;
  ws.transact(label, () => {
    for (const target of t) {
      for (const brick of b) {
        if (brick.id === target.id) continue;
        const isSpellOnItem = target.kind === "item" && ws.resolve(layerId, brick.id)?.fields[F.type] === "spell";
        ws.attach(layerId, target.id, brick.id, isSpellOnItem ? { ...(answers.activation ? { activation: answers.activation } : {}), uses: answers.uses ?? null } : {});
        added++;
      }
    }
  });
  if (!added) throw new Error("Something can't be added to itself.");
  return added;
}

function count(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
