// The Generic d20 starter, built into a new system when "Generic d20" is chosen: short core rules
// written for this app, then the full SRD 5.2 (CC-BY 4.0): conditions, spells, equipment, magic
// items, monsters, species, classes, backgrounds and feats (see srd.ts). Everything is marked with
// its licence, so the rulebook and shared files print the credit line automatically.

import { F, SRD_LICENSE, link } from "../../engine/index.ts";
import type { Id, NodeKind, Value, Workspace } from "../../engine/index.ts";
import { ensureSections } from "../rules.ts";
import type { SectionKey } from "../rules.ts";
import { ensureCategories } from "../sheets.ts";
import { SRD_DATA, buildSrdContent } from "./srd.ts";

const LIC = { [F.license]: SRD_LICENSE };

/** Builds the starter into an empty system layer. Runs inside the caller's step. */
export function buildD20Starter(ws: Workspace, sys: Id) {
  const sections = ensureSections(ws, sys);
  const cats = ensureCategories(ws, sys);
  const make = (kind: NodeKind, name: string, fields: Record<string, Value>, extra: { category?: Id | null; text?: string; parent?: Id; template?: boolean } = {}) =>
    ws.create(sys, kind, name, {
      source: "template",
      fields: { ...LIC, ...fields },
      text: extra.text ?? "",
      category: extra.category ? link(extra.category) : null,
      parent: extra.parent ? link(extra.parent) : null,
      template: !!extra.template,
    });
  const rule = (section: SectionKey, name: string, fields: Record<string, Value>, text: string) => make(section === "abilities" ? "ability" : section === "resources" ? "resource" : section === "skills" ? "skill" : section === "conditions" ? "condition" : "rule", name, fields, { category: sections.get(section)!, text });
  const sub = (name: string, under: Id) => ws.create(sys, "category", name, { source: "template", fields: { [F.under]: link(under) } });

  // ---------- Core check ----------
  rule("core", "The d20 check", { [F.family]: "rollOver", [F.die]: "d20", [F.target]: "Difficulty Class (DC)" }, "When the outcome of something is uncertain, roll a d20 and add the bonus of the ability that fits, plus your proficiency bonus if you are trained in it. Meet or beat the Difficulty Class (DC) to succeed. Easy tasks are DC 10, medium DC 15, hard DC 20. Attacks work the same way against a target's Armour Class. A natural 20 on an attack is a critical hit; a natural 1 always misses.");

  // ---------- Abilities ----------
  const abilities: Record<string, Id> = {};
  for (const [name, label, text] of [
    ["Strength", "STR", "Physical power: lifting, climbing, hitting hard."],
    ["Dexterity", "DEX", "Agility and reflexes: dodging, sneaking, aiming."],
    ["Constitution", "CON", "Health and stamina: shrugging off poison, staying on your feet."],
    ["Intelligence", "INT", "Memory and reasoning: knowledge, investigation, wizardry."],
    ["Wisdom", "WIS", "Awareness and insight: noticing things, reading people, surviving outdoors."],
    ["Charisma", "CHA", "Force of personality: persuading, deceiving, performing."],
  ] as const) {
    abilities[label] = rule("abilities", name, { [F.label]: label, [F.rangeMin]: 1, [F.rangeMax]: 30, [F.bonus]: "d20" }, text);
  }
  const ab = (l: string) => link(abilities[l]!);

  // ---------- Conditions (the SRD's own words) ----------
  const conditions: Record<string, Id> = {};
  for (const c of SRD_DATA.conditions) {
    conditions[c.name] = rule("conditions", c.name, { [F.stages]: c.name === "Exhaustion" ? 6 : 1, [F.duration]: "", [F.save]: null }, c.text);
  }
  const cond = (n: string) => link(conditions[n]!);

  // ---------- Resources ----------
  rule("resources", "Hit points", { [F.label]: "HP", [F.maximum]: { formula: [{ op: "+", number: 8 }, { op: "+", ability: ab("CON"), use: "bonus" }] }, [F.start]: "full", [F.recovery]: "long rest", [F.display]: "number", [F.thresholds]: [{ at: 0, condition: cond("Unconscious") }] }, "At 1st level a character has 8 plus their Constitution bonus (more for tough classes); each level adds the class's hit die. At 0 hit points a creature falls unconscious.");

  // ---------- Skills ----------
  for (const [name, l] of [
    ["Acrobatics", "DEX"], ["Animal Handling", "WIS"], ["Arcana", "INT"], ["Athletics", "STR"], ["Deception", "CHA"], ["History", "INT"],
    ["Insight", "WIS"], ["Intimidation", "CHA"], ["Investigation", "INT"], ["Medicine", "WIS"], ["Nature", "INT"], ["Perception", "WIS"],
    ["Performance", "CHA"], ["Persuasion", "CHA"], ["Religion", "INT"], ["Sleight of Hand", "DEX"], ["Stealth", "DEX"], ["Survival", "WIS"],
  ] as const) {
    rule("skills", name, { [F.ability]: ab(l) }, "");
  }

  // ---------- Rules ----------
  rule("combat", "Initiative", {}, "When a fight starts, everyone rolls a d20 and adds their Dexterity bonus. Turns go from highest to lowest, round after round. A round is about 6 seconds.");
  rule("combat", "Your turn", {}, "On your turn you can move up to your speed and take one action (Attack, Dash, Dodge, Help, Hide, or something else you describe). Some features give a bonus action, and you get one reaction each round, such as an attack when an enemy leaves your reach.");
  rule("combat", "Attacks and damage", {}, "Roll a d20 and add your attack bonus (the ability bonus plus proficiency). If it meets or beats the target's Armour Class, it hits: roll the weapon's damage and add the same ability bonus. A critical hit rolls the damage dice twice.");
  rule("combat", "Advantage and disadvantage", {}, "With advantage, roll two d20s and use the higher; with disadvantage, the lower. If both apply, they cancel out.");
  rule("time", "Short rest", {}, "An hour of rest. Spend hit dice to get back hit points.");
  rule("time", "Long rest", {}, "Eight hours of rest, at most once a day. Get back all hit points and half your hit dice, and remove one level of Exhaustion.");
  rule("currency", "Coins", {}, "10 copper pieces (cp) make a silver piece (sp), 10 silver a gold piece (gp), and 10 gold a platinum piece (pp).");
  rule("advancement", "Levels", {}, "Characters gain experience points for overcoming challenges and go up a level at set totals, getting more hit points and new class features. Proficiency bonus starts at +2 and grows to +6 by 17th level.");
  rule("magic", "Spellcasting", {}, "Spellcasters cast spells using spell slots that come back after a long rest. A spell's attack bonus or saving throw DC uses the caster's spellcasting ability: Intelligence for wizards, Wisdom for clerics, Charisma for sorcerers.");

  // ---------- Origins: backgrounds, feats, weapon properties and languages ----------
  for (const b of SRD_DATA.backgrounds) rule("advancement", `Background: ${b.name}`, {}, b.text);
  for (const f of SRD_DATA.feats) rule("advancement", `Feat: ${f.name}`, {}, [f.type ? `${f.type[0]!.toUpperCase()}${f.type.slice(1)} feat.` : "", f.text].filter(Boolean).join("\n"));
  for (const p of SRD_DATA.weaponProperties) rule("combat", `${p.mastery ? "Weapon mastery" : "Weapon property"}: ${p.name}`, {}, p.text);
  const langs = (rare: boolean) => SRD_DATA.languages.filter((l) => l.rare === rare).map((l) => l.name).join(", ");
  rule("advancement", "Languages", {}, `Standard languages: ${langs(false)}.\nRare languages: ${langs(true)}.`);

  // ---------- Categories, then everything else ----------
  buildSrdContent({ ws, sys, make, sub, cats, abilities, conditions });

  // ---------- Enchantments ----------
  // A few ready-made enchantments to drop onto weapons and armour (written for DM in a Pocket,
  // not from the SRD, so they carry no SRD credit).
  const own = (name: string, fields: Record<string, Value>, text: string) => ws.create(sys, "brick", name, { source: "template", fields, text });
  for (const [name, dice, type, text] of [
    ["Flaming", "1d6", "fire", "Wreathed in flame that never burns the one who holds it."],
    ["Frost", "1d6", "cold", "Rimed with ice that never melts."],
    ["Shocking", "1d6", "lightning", "Crackles with sparks that jump to whatever it strikes."],
    ["Thundering", "2d6", "thunder", "Booms like thunder when it lands a blow."],
    ["Venomous", "1d4", "poison", "Its edge weeps a thin, green poison."],
    ["Radiant", "1d6", "radiant", "Shines with a holy light that sears the wicked."],
  ] as const)
    own(name, { [F.type]: "damage", [F.dice]: dice, [F.damageType]: type }, text);
  own("Glowing", { [F.type]: "effect", [F.condition]: null, [F.wording]: "sheds dim light for 10 feet" }, "A soft glow, bright enough to read by.");
  own("Returning", { [F.type]: "effect", [F.condition]: null, [F.wording]: "flies back to the thrower's hand after it is thrown" }, "Thrown, it turns in the air and comes home.");
}
