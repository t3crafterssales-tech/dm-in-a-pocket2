// The small generic d20 starter: the core rules plus a couple of dozen monsters and items, built
// into a new system when "Generic d20" is chosen. Game numbers follow the SRD 5.2 (CC-BY 4.0), so
// everything is marked with its licence and the rulebook prints the credit line automatically.
// The rules text is short and written for this app.

import { F, SRD_LICENSE, link } from "../../engine/index.ts";
import type { Id, NodeKind, Value, Workspace } from "../../engine/index.ts";
import { ensureSections } from "../rules.ts";
import type { SectionKey } from "../rules.ts";
import { ensureCategories } from "../sheets.ts";

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

  // ---------- Conditions ----------
  const conditions: Record<string, Id> = {};
  for (const [name, text, stages] of [
    ["Blinded", "Can't see. Attacks against it have advantage; its own attacks have disadvantage.", 1],
    ["Charmed", "Can't attack the charmer, who has advantage on social checks against it.", 1],
    ["Deafened", "Can't hear.", 1],
    ["Exhaustion", "Each level gives -2 to every d20 roll and slows you by 5 feet. Level 6 is death. A long rest removes one level.", 6],
    ["Frightened", "Disadvantage on checks and attacks while the source of fear is in sight; can't move closer to it.", 1],
    ["Grappled", "Speed 0. Ends if the grappler is incapacitated or the two are pulled apart.", 1],
    ["Incapacitated", "Can't take actions or reactions.", 1],
    ["Invisible", "Can't be seen. Its attacks have advantage; attacks against it have disadvantage.", 1],
    ["Paralyzed", "Incapacitated and can't move or speak. Attacks against it have advantage, and hits from within 5 feet are critical.", 1],
    ["Petrified", "Turned to stone: incapacitated, unaware, and resistant to all damage.", 1],
    ["Poisoned", "Disadvantage on attack rolls and ability checks.", 1],
    ["Prone", "Lying down: it can only crawl. Melee attacks against it have advantage; ranged ones disadvantage.", 1],
    ["Restrained", "Speed 0. Its attacks have disadvantage; attacks against it have advantage.", 1],
    ["Stunned", "Incapacitated, can barely speak, and attacks against it have advantage.", 1],
    ["Unconscious", "Incapacitated, drops what it holds and falls prone. Hits from within 5 feet are critical.", 1],
  ] as const) {
    conditions[name] = rule("conditions", name, { [F.stages]: stages, [F.duration]: "", [F.save]: null }, text);
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

  // ---------- Categories ----------
  const melee = sub("Melee", cats.get("weapon")!);
  // Light weapons cost more for their damage because they are quick and easy to hide, so their
  // prices are compared with each other.
  const lightMelee = sub("Light", melee);
  const ranged = sub("Ranged", cats.get("weapon")!);
  const light = sub("Light", cats.get("armour")!);
  const medium = sub("Medium", cats.get("armour")!);
  const heavy = sub("Heavy", cats.get("armour")!);
  const shields = sub("Shields", cats.get("armour")!);
  const gear = sub("Adventuring gear", cats.get("item")!);
  const potions = sub("Potions", cats.get("item")!);

  // ---------- Library bricks ----------
  const attack = (name: string, l: string, dice: string, damageType: string) => make("brick", name, { [F.type]: "attack", [F.ability]: ab(l), [F.dice]: dice, [F.damageType]: damageType });
  const trait = (name: string, wording: string) => make("brick", name, { [F.type]: "trait", [F.wording]: wording });
  const bricks = {
    bite: attack("Bite", "STR", "1d6", "piercing"),
    claw: attack("Claw", "STR", "1d6", "slashing"),
    slam: attack("Slam", "STR", "1d6", "bludgeoning"),
    tusk: attack("Tusk", "STR", "1d6", "slashing"),
    beak: attack("Beak", "STR", "1d10", "piercing"),
    club: attack("Club attack", "STR", "1d4", "bludgeoning"),
    greatclub: attack("Greatclub attack", "STR", "2d8", "bludgeoning"),
    dagger: attack("Dagger attack", "DEX", "1d4", "piercing"),
    shortsword: attack("Shortsword attack", "DEX", "1d6", "piercing"),
    scimitar: attack("Scimitar attack", "DEX", "1d6", "slashing"),
    longsword: attack("Longsword attack", "STR", "1d8", "slashing"),
    greataxe: attack("Greataxe attack", "STR", "1d12", "slashing"),
    spear: attack("Spear attack", "STR", "1d6", "piercing"),
    mace: attack("Mace attack", "STR", "1d6", "bludgeoning"),
    morningstar: attack("Morningstar attack", "STR", "1d8", "piercing"),
    shortbow: attack("Shortbow shot", "DEX", "1d6", "piercing"),
    longbow: attack("Longbow shot", "DEX", "1d8", "piercing"),
    darkvision: trait("Darkvision", "sees in darkness as if it were dim light, up to 60 feet"),
    keen: trait("Keen Senses", "advantage on Perception checks that rely on smell or hearing"),
    pack: trait("Pack Tactics", "advantage on attacks against a creature if an ally is within 5 feet of it"),
    nimble: trait("Nimble Escape", "can Disengage or Hide as a bonus action"),
    sunlight: trait("Sunlight Sensitivity", "disadvantage on attacks and Perception while in sunlight"),
    regeneration: trait("Regeneration", "regains 10 hit points at the start of each turn unless it took fire or acid damage"),
    undead: trait("Undead Nature", "doesn't need air, food, drink or sleep"),
    prone: make("brick", "Knocked prone", { [F.type]: "effect", [F.condition]: cond("Prone") }),
    poison: make("brick", "Poison", { [F.type]: "effect", [F.condition]: cond("Poisoned") }),
    paralysis: make("brick", "Paralysing touch", { [F.type]: "effect", [F.condition]: cond("Paralyzed") }),
    immunePoison: make("brick", "Immune to poison", { [F.type]: "immunity", [F.condition]: cond("Poisoned") }),
    fireBolt: make("brick", "Fire Bolt", { [F.type]: "spell", [F.dice]: "1d10", [F.damageType]: "fire", [F.wording]: "a ranged spell attack, 120 feet" }),
    missile: make("brick", "Magic Missile", { [F.type]: "spell", [F.dice]: "3d4", [F.damageType]: "force", [F.wording]: "three darts that always hit" }),
    healing: make("brick", "Healing", { [F.type]: "effect", [F.wording]: "the drinker regains 2d4 + 2 hit points" }),
  };
  const armourBrick = (name: string, bonus: number) => make("brick", name, { [F.type]: "armor", bonus });

  // ---------- Items ----------
  const item = (name: string, category: Id, fields: Record<string, Value>, attach: Id[] = [], extra: { parent?: Id; template?: boolean } = {}) => {
    const id = make("item", name, fields, { category, ...extra });
    for (const b of attach) ws.attach(sys, id, b);
    return id;
  };
  // A template parent holds what all metal melee weapons share; real weapons are its variants.
  const basicMelee = item("Basic Melee Weapon", melee, { material: "Metal" }, [], { template: true });
  const items = {
    club: item("Club", melee, { [F.cost]: "1 sp", [F.weight]: "2 lb.", material: "Wood" }, [bricks.club]),
    dagger: item("Dagger", lightMelee, { [F.cost]: "2 gp", [F.weight]: "1 lb." }, [bricks.dagger], { parent: basicMelee }),
    shortsword: item("Shortsword", lightMelee, { [F.cost]: "10 gp", [F.weight]: "2 lb." }, [bricks.shortsword], { parent: basicMelee }),
    scimitar: item("Scimitar", lightMelee, { [F.cost]: "25 gp", [F.weight]: "3 lb." }, [bricks.scimitar], { parent: basicMelee }),
    longsword: item("Longsword", melee, { [F.cost]: "15 gp", [F.weight]: "3 lb." }, [bricks.longsword], { parent: basicMelee }),
    greataxe: item("Greataxe", melee, { [F.cost]: "30 gp", [F.weight]: "7 lb." }, [bricks.greataxe], { parent: basicMelee }),
    mace: item("Mace", melee, { [F.cost]: "5 gp", [F.weight]: "4 lb." }, [bricks.mace], { parent: basicMelee }),
    spear: item("Spear", melee, { [F.cost]: "1 gp", [F.weight]: "3 lb.", material: "Wood and metal" }, [bricks.spear]),
    shortbow: item("Shortbow", ranged, { [F.cost]: "25 gp", [F.weight]: "2 lb.", material: "Wood" }, [bricks.shortbow]),
    longbow: item("Longbow", ranged, { [F.cost]: "50 gp", [F.weight]: "2 lb.", material: "Wood" }, [bricks.longbow]),
    leather: item("Leather Armour", light, { [F.cost]: "10 gp", [F.weight]: "10 lb.", material: "Leather" }, [armourBrick("Leather protection", 1)]),
    chainShirt: item("Chain Shirt", medium, { [F.cost]: "50 gp", [F.weight]: "20 lb.", material: "Metal" }, [armourBrick("Chain shirt protection", 3)]),
    chainMail: item("Chain Mail", heavy, { [F.cost]: "75 gp", [F.weight]: "55 lb.", material: "Metal" }, [armourBrick("Chain mail protection", 6)]),
    plate: item("Plate Armour", heavy, { [F.cost]: "1500 gp", [F.weight]: "65 lb.", material: "Metal" }, [armourBrick("Plate protection", 8)]),
    shield: item("Shield", shields, { [F.cost]: "10 gp", [F.weight]: "6 lb.", material: "Wood" }, [armourBrick("Shield block", 2)]),
    rope: item("Rope (50 feet)", gear, { [F.cost]: "1 gp", [F.weight]: "5 lb.", material: "Hemp" }),
    torch: item("Torch", gear, { [F.cost]: "1 cp", [F.weight]: "1 lb.", material: "Wood" }),
    rations: item("Rations (1 day)", gear, { [F.cost]: "5 sp", [F.weight]: "2 lb." }),
    potion: item("Potion of Healing", potions, { [F.cost]: "50 gp", [F.weight]: "0.5 lb.", material: "Glass" }, [bricks.healing]),
  };

  // ---------- Beings ----------
  const scores = (s: [number, number, number, number, number, number]) => Object.fromEntries(["STR", "DEX", "CON", "INT", "WIS", "CHA"].map((l, i) => [`score_${abilities[l]}`, { ability: ab(l), score: s[i]! } as Value]));
  // A brick can be given this sheet's own dice: [bricks.bite, "2d4"].
  type Attach = Id | [Id, string];
  const being = (name: string, kind: string, fields: Record<string, Value>, attach: Attach[], text = "", extra: { parent?: Id } = {}) => {
    const id = make("being", name, extra.parent ? fields : { [F.beingKind]: kind, ...fields }, { category: cats.get("creature")!, text, ...extra });
    for (const b of attach) {
      if (Array.isArray(b)) ws.attach(sys, id, b[0], { overrides: { [F.dice]: b[1] } });
      else ws.attach(sys, id, b);
    }
    return id;
  };
  const m = (name: string, cr: string, hp: number, ac: number, speed: string, s: [number, number, number, number, number, number], attach: Attach[], text = "") => being(name, "monster", { [F.cr]: cr, [F.hp]: hp, [F.ac]: ac, [F.speed]: speed, ...scores(s) }, attach, text);

  const goblin = m("Goblin", "1/4", 7, 15, "30 ft.", [8, 14, 10, 10, 8, 8], [items.scimitar, items.shortbow, bricks.nimble, bricks.darkvision], "Small, sneaky raiders who fight in packs and run when the odds turn.");
  being("Goblin Boss", "monster", { [F.cr]: "1", [F.hp]: 21, [F.ac]: 17 }, [bricks.scimitar], "A goblin tough or cruel enough to lead the others. It strikes twice a turn.", { parent: goblin });
  m("Bandit", "1/8", 11, 12, "30 ft.", [11, 12, 12, 10, 10, 10], [items.scimitar], "Robbers of the roads, more interested in loot than a fair fight.");
  m("Black Bear", "1/2", 19, 11, "40 ft., climb 30 ft.", [15, 10, 14, 2, 12, 7], [bricks.bite, [bricks.claw, "2d4"], bricks.keen]);
  m("Boar", "1/4", 11, 11, "40 ft.", [13, 11, 12, 2, 9, 5], [bricks.tusk]);
  m("Brown Bear", "1", 34, 11, "40 ft., climb 30 ft.", [19, 10, 16, 2, 13, 7], [[bricks.bite, "1d8"], bricks.claw, bricks.keen]);
  m("Wolf", "1/4", 11, 13, "40 ft.", [12, 15, 12, 3, 12, 6], [[bricks.bite, "2d4"], bricks.pack, bricks.keen]);
  m("Dire Wolf", "1", 37, 14, "50 ft.", [17, 15, 15, 3, 12, 7], [[bricks.bite, "2d6"], bricks.prone, bricks.pack, bricks.keen], "A wolf the size of a horse.");
  m("Giant Rat", "1/8", 7, 12, "30 ft.", [7, 15, 11, 2, 10, 4], [[bricks.bite, "1d4"], bricks.pack, bricks.darkvision]);
  m("Giant Spider", "1", 26, 14, "30 ft., climb 30 ft.", [14, 16, 12, 2, 11, 4], [[bricks.bite, "1d8"], bricks.poison, bricks.darkvision]);
  m("Hobgoblin", "1/2", 11, 18, "30 ft.", [13, 12, 12, 10, 10, 9], [items.longsword, items.longbow, bricks.darkvision], "Disciplined soldiers who march in ranks.");
  m("Kobold", "1/8", 5, 12, "30 ft.", [7, 15, 9, 8, 7, 8], [items.dagger, bricks.pack, bricks.sunlight, bricks.darkvision]);
  m("Bugbear", "1", 27, 16, "30 ft.", [15, 14, 13, 8, 11, 9], [bricks.morningstar, bricks.darkvision]);
  m("Gnoll", "1/2", 22, 15, "30 ft.", [14, 12, 11, 6, 10, 7], [items.spear, items.longbow, bricks.darkvision]);
  m("Ghoul", "1", 22, 12, "30 ft.", [13, 15, 10, 7, 10, 6], [[bricks.claw, "2d4"], bricks.paralysis, bricks.immunePoison, bricks.undead]);
  m("Ogre", "2", 59, 11, "40 ft.", [19, 8, 16, 5, 7, 7], [bricks.greatclub, bricks.darkvision], "Huge, hungry and not very clever.");
  m("Owlbear", "3", 59, 13, "40 ft.", [20, 12, 17, 3, 12, 7], [bricks.beak, [bricks.claw, "2d8"], bricks.keen]);
  m("Skeleton", "1/4", 13, 13, "30 ft.", [10, 14, 15, 6, 8, 5], [items.shortsword, items.shortbow, bricks.immunePoison, bricks.undead]);
  m("Zombie", "1/4", 19, 8, "20 ft.", [13, 6, 16, 3, 6, 5], [bricks.slam, bricks.immunePoison, bricks.undead], "Slow and relentless.");
  m("Troll", "5", 84, 15, "30 ft.", [18, 13, 20, 7, 9, 7], [bricks.bite, [bricks.claw, "2d6"], bricks.regeneration, bricks.darkvision]);
  const n = (name: string, cr: string, hp: number, ac: number, s: [number, number, number, number, number, number], attach: Id[], text: string) => being(name, "npc", { [F.cr]: cr, [F.hp]: hp, [F.ac]: ac, [F.speed]: "30 ft.", ...scores(s) }, attach, text);
  n("Commoner", "0", 4, 10, [10, 10, 10, 10, 10, 10], [items.club], "Farmers, servants and townsfolk.");
  n("Guard", "1/8", 11, 16, [13, 12, 12, 10, 11, 10], [items.spear, items.shield], "A town watch member or castle sentry.");
  n("Thug", "1/2", 32, 11, [15, 11, 14, 10, 10, 11], [items.mace], "Hired muscle.");

  being("Human", "race", { size: "Medium", [F.speed]: "30 ft." }, [], "Adaptable and ambitious, found everywhere.");
  being("Elf", "race", { size: "Medium", [F.speed]: "30 ft." }, [bricks.darkvision], "Graceful, long-lived and attuned to magic.");
  being("Dwarf", "race", { size: "Medium", [F.speed]: "30 ft." }, [bricks.darkvision], "Sturdy folk of mountain halls.");
  being("Fighter", "class", { hitDie: "d10" }, [], "A master of weapons and armour.");
  being("Wizard", "class", { hitDie: "d6" }, [bricks.fireBolt, bricks.missile], "A scholar of spells.");
}
