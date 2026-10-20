// The SRD 5.2 content of the Generic d20 starter: every monster, spell, piece of equipment, magic
// item, species, class, background and feat, built from srd52.json (made by
// scripts/srd-convert.mjs). Monster actions become library bricks shared by name (Bite, Claw,
// Multiattack), with each monster's own dice and words kept on its sheet, so the free checks and
// "Used by" work on them like on anything made by hand.

import { F, SRD_LICENSE, link } from "../../engine/index.ts";
import type { Id, NodeKind, Value, Workspace } from "../../engine/index.ts";
import data from "./srd52.json" with { type: "json" };

export const SRD_DATA = data;

type Make = (kind: NodeKind, name: string, fields: Record<string, Value>, extra?: { category?: Id | null; text?: string; parent?: Id; template?: boolean }) => Id;

export interface SrdContext {
  ws: Workspace;
  sys: Id;
  make: Make;
  /** Makes a category under another. */
  sub: (name: string, under: Id) => Id;
  cats: Map<string, Id>;
  /** Ability ids by label (STR, DEX...). */
  abilities: Record<string, Id>;
  /** Condition ids by name. */
  conditions: Record<string, Id>;
}

const SECTION_SUFFIX: Record<string, string> = { trait: "", action: "", bonus: " (Bonus Action)", reaction: " (Reaction)", legendary: " (Legendary Action)" };
const MAGIC_GROUPS: Record<string, string> = { Armor: "Armour", Weapon: "Weapons", Weapons: "Weapons", Potion: "Potions", Ring: "Rings", Rod: "Rods", Scroll: "Scrolls", Staff: "Staffs", Wand: "Wands", "Wondrous Items": "Wondrous items", Ammunition: "Ammunition" };

export function buildSrdContent(c: SrdContext) {
  const { ws, sys, make, sub, cats } = c;
  const ab = (label: string) => link(c.abilities[label]!);
  const usedNames = new Set(ws.list(sys).filter((n) => n.kind === "brick").map((n) => n.name.toLowerCase()));
  /** A brick name nothing else uses yet ("Bite", then "Bite (trait)" for a different kind of Bite). */
  const freeName = (name: string, hint: string) => {
    let n = name;
    for (let i = 2; usedNames.has(n.toLowerCase()); i++) n = i === 2 ? `${name} (${hint})` : `${name} (${hint} ${i})`;
    usedNames.add(n.toLowerCase());
    return n;
  };

  // ---------- Spells ----------
  const spellCat = cats.get("spell") ?? null;
  const spells = new Map<string, Id>();
  for (const s of data.spells) {
    const name = freeName(s.name, "spell");
    spells.set(s.name, make("brick", name, { [F.type]: "spell", [F.dice]: s.dice, [F.damageType]: s.damageType, [F.wording]: "", [F.spellLevel]: s.level, [F.school]: s.school, [F.castingTime]: s.castingTime, [F.range]: s.range, [F.components]: s.components, [F.duration]: s.duration, [F.ritual]: s.ritual, [F.spellClasses]: s.classes.join(", ") }, { category: spellCat, text: s.text }));
  }

  // ---------- Equipment ----------
  const weaponCats = new Map<string, Id>();
  const melee = sub("Melee", cats.get("weapon")!);
  const ranged = sub("Ranged", cats.get("weapon")!);
  const weaponCat = (group: string, light: boolean) => {
    // Light weapons are compared with each other: they cost more for their damage because they
    // are quick and easy to hide.
    const key = `${group}${light ? " light" : ""}`;
    if (!weaponCats.has(key)) {
      const [kind, reach] = group.split(" ");
      const parent = reach === "ranged" ? ranged : melee;
      let id = weaponCats.get(group) ?? sub(kind!, parent);
      weaponCats.set(group, id);
      if (light) id = sub("Light", id);
      weaponCats.set(key, id);
    }
    return weaponCats.get(key)!;
  };
  const items = new Map<string, Id>();
  const item = (name: string, category: Id, fields: Record<string, Value>, text: string, attach: Id[] = [], extra: { parent?: Id; template?: boolean } = {}) => {
    const id = make("item", name, fields, { category, text, ...extra });
    for (const b of attach) ws.attach(sys, id, b);
    if (!extra.template) items.set(name, id);
    return id;
  };
  for (const w of data.weapons) {
    const words = [w.notes, w.properties, w.mastery ? `mastery ${w.mastery}` : ""].filter(Boolean).join("; ");
    const attack = make("brick", freeName(`${w.name} attack`, "weapon"), { [F.type]: "attack", [F.ability]: ab(w.ability), [F.dice]: w.dice, [F.damageType]: w.damageType, [F.wording]: words ? `(${words.toLowerCase()})` : "" });
    item(w.name, weaponCat(w.group, w.light), { [F.cost]: w.cost, [F.weight]: w.weight }, w.text, [attack]);
  }
  const armourCats = new Map<string, Id>();
  for (const a of data.armour) {
    if (!armourCats.has(a.group)) armourCats.set(a.group, sub(a.group, cats.get("armour")!));
    const brick = make("brick", freeName(`${a.name} protection`, "armour"), { [F.type]: "armor", bonus: a.bonus });
    item(a.name, armourCats.get(a.group)!, { [F.cost]: a.cost, [F.weight]: a.weight }, a.text, [brick]);
  }
  const gearCats = new Map<string, Id>();
  const gearCat = (group: string, under = cats.get("item")!) => {
    const key = `${under}:${group}`;
    if (!gearCats.has(key)) gearCats.set(key, sub(group, under));
    return gearCats.get(key)!;
  };
  for (const g of data.gear) item(g.name, gearCat(g.group), { [F.cost]: g.cost, [F.weight]: g.weight }, g.text);

  // Magic items. One that only lists its variants (Armor +1, +2, +3) becomes their template.
  const magic = sub("Magic items", cats.get("item")!);
  const parents = new Set(data.magicItems.map((m) => m.variantOf).filter(Boolean));
  const magicIds = new Map<string, Id>();
  const magicFields = (m: (typeof data.magicItems)[number]) => ({ rarity: m.rarity, attunement: m.attunement });
  for (const m of data.magicItems.filter((m) => parents.has(m.name))) {
    magicIds.set(m.name, item(`${m.name} (magic, any bonus)`, gearCat(MAGIC_GROUPS[m.group] ?? m.group, magic), magicFields(m), m.text, [], { template: true }));
  }
  for (const m of data.magicItems.filter((m) => !parents.has(m.name))) {
    const parent = m.variantOf ? magicIds.get(m.variantOf) : undefined;
    const lead = [m.rarity, m.attunement ? "requires attunement" : ""].filter(Boolean).join(", ");
    item(m.name, gearCat(MAGIC_GROUPS[m.group] ?? m.group, magic), magicFields(m), [lead ? `${lead[0]!.toUpperCase()}${lead.slice(1)}.` : "", m.text].filter(Boolean).join("\n"), [], parent ? { parent } : {});
  }

  // ---------- Monsters ----------
  const shared = new Map<string, { id: Id; name: string; values: Record<string, Value> }>();
  const immunity = new Map<string, Id>();
  const creature = cats.get("creature")!;
  const monsterNames = new Set(data.classes.map((x) => x.name.toLowerCase()));
  const USAGE = /\s*\((Recharge|\d+\/Day|Recharges)[^)]*\)$/;
  for (const m of data.monsters) {
    const scores = Object.fromEntries(["STR", "DEX", "CON", "INT", "WIS", "CHA"].map((l, i) => [`score_${c.abilities[l]}`, { ability: ab(l), score: m.scores[i]! } as Value]));
    // "Druid" is a class too, so the stat block is called "Druid (monster)".
    const name = monsterNames.has(m.name.toLowerCase()) ? `${m.name} (monster)` : m.name;
    const id = make("being", name, { [F.beingKind]: "monster", [F.cr]: m.cr, [F.hp]: m.hp, hitDice: m.hitDice, [F.ac]: m.ac, [F.speed]: m.speed, size: m.size, ...scores }, { category: creature, text: m.facts });
    for (const a of m.actions) {
      const base = a.name.replace(USAGE, "");
      const values: Record<string, Value> =
        a.kind === "attack" ? { [F.type]: "attack", [F.ability]: ab(a.ability!), [F.dice]: a.dice!, [F.damageType]: a.damageType!, [F.wording]: a.text } : { [F.type]: "trait", [F.wording]: a.text };
      const key = `${a.kind}:${base.toLowerCase()}`;
      let brick = shared.get(key);
      if (!brick) {
        const brickName = freeName(base, a.kind);
        brick = { id: make("brick", brickName, values), name: brickName, values };
        shared.set(key, brick);
      }
      // Only what differs from the library brick is kept on this sheet.
      const overrides: Record<string, Value> = {};
      for (const [k, v] of Object.entries(values)) if (JSON.stringify(brick.values[k]) !== JSON.stringify(v)) overrides[k] = v;
      const shown = a.name + (SECTION_SUFFIX[a.section] ?? "");
      ws.attach(sys, id, brick.id, { overrides, name: shown !== brick.name ? shown : null });
    }
    for (const cname of m.immuneTo) {
      const cond = c.conditions[cname];
      if (!cond) continue;
      if (!immunity.has(cname)) immunity.set(cname, make("brick", freeName(`Immune to ${cname}`, "immunity"), { [F.type]: "immunity", [F.condition]: link(cond) }));
      ws.attach(sys, id, immunity.get(cname)!);
    }
  }

  // ---------- Species and classes ----------
  for (const s of data.species) {
    const id = make("being", s.name, { [F.beingKind]: "race", size: s.size, [F.speed]: s.speed }, { category: creature, text: s.text });
    for (const v of s.subspecies) make("being", v.name, {}, { category: creature, text: v.text, parent: id });
  }
  for (const k of data.classes) {
    const id = make("being", k.name, { [F.beingKind]: "class", hitDie: k.hitDie }, { category: creature, text: k.text });
    for (const v of k.subclasses) make("being", v.name, {}, { category: creature, text: v.text, parent: id });
  }
  return { spells, items };
}
