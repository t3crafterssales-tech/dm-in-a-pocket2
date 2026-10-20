// Turns the open SRD 5.2 data from the 5e-database project (https://github.com/5e-bits/5e-database,
// folder src/2024/en, MIT licence; the content itself is the SRD 5.2 under CC-BY 4.0) into the
// app's own compact file, src/app/starters/srd52.json, which the Generic d20 starter is built from.
// The app never reads the outside project: this script is run by hand when the data is refreshed.
//
//   node scripts/srd-convert.mjs <path to 5e-database/src/2024/en> [commit]

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [dir, commit = ""] = process.argv.slice(2);
if (!dir) throw new Error("Usage: node scripts/srd-convert.mjs <5e-database/src/2024/en> [commit]");
const load = (name) => JSON.parse(readFileSync(join(dir, `5e-SRD-${name}.json`), "utf8"));

/** Plain text: no Markdown bold or italics, tidy spaces, paragraphs kept. */
const plain = (s) =>
  String(s ?? "")
    .replace(/\*\*\*?([^*]+?)\*\*\*?/g, "$1")
    .replace(/\s*•\s*/g, "\n• ")
    .replace(/(^|\s)_([^_]+)_(?=\s|[.,;:]|$)/g, "$1$2")
    .split(/\n/)
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    // Words split across lines in the printed SRD ("ex- pended"); a real dash is followed by a small word.
    .replace(/\b([a-z]+)- (?!(?:the|a|an|and|or|to)\b)([a-z]+)\b/g, "$1$2")
    .trim();
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const titleCase = (s) => String(s).replace(/\b[a-z]/g, (c) => c.toUpperCase());
const cost = (c) => (c ? `${c.quantity} ${c.unit}` : "");
const weight = (w) => (typeof w === "number" && w > 0 ? `${w} lb.` : "");
/** "1d4+2" → "1d4": the ability bonus is added by the sheet. */
const baseDice = (d) => String(d ?? "").replace(/\s+/g, "").replace(/[+-]\d+$/, "");
const crText = (n) => (n === 0.125 ? "1/8" : n === 0.25 ? "1/4" : n === 0.5 ? "1/2" : String(n));
const mod = (score) => Math.floor((score - 10) / 2);

// ---------- Conditions ----------

const conditions = load("Conditions").map((c) => ({ name: c.name, text: plain(c.description).replace(/^While you have the \w+ condition, you experience the following effects?\.\s*/i, "") }));

// ---------- Spells ----------

const spells = load("Spells").map((s) => {
  const dmg = s.damage ?? {};
  const atLevel = dmg.damage_at_slot_level ?? dmg.damage_at_character_level ?? {};
  const first = Object.keys(atLevel).sort((a, b) => Number(a) - Number(b))[0];
  const text = [plain(s.description), s.higher_level ? `Using a higher-level spell slot. ${plain(s.higher_level)}` : ""].filter(Boolean).join("\n\n");
  return {
    name: s.name,
    level: s.level,
    school: s.school?.name ?? "",
    castingTime: s.casting_time ?? "",
    range: s.range ?? "",
    components: [(s.components ?? []).join(", "), s.material ? `(${s.material})` : ""].filter(Boolean).join(" "),
    duration: [s.concentration ? "Concentration," : "", s.duration ?? ""].filter(Boolean).join(" "),
    ritual: !!s.ritual,
    classes: (s.classes ?? []).map((c) => c.name),
    dice: first ? baseDice(atLevel[first]) : "",
    damageType: dmg.damage_type?.name?.toLowerCase() ?? "",
    text,
  };
});

// ---------- Equipment ----------

const eq = load("Equipment");
const cats = (x) => new Set((x.equipment_categories ?? []).map((c) => c.index));
const weapons = [];
const armour = [];
const gear = [];
for (const x of eq) {
  const c = cats(x);
  const desc = plain([].concat(x.desc ?? []).join("\n"));
  if (c.has("weapons")) {
    const props = (x.properties ?? []).map((p) => p.name);
    const ranged = c.has("ranged-weapons");
    const finesse = props.includes("Finesse");
    const notes = [];
    if (x.range?.long) notes.push(`range ${x.range.normal}/${x.range.long} ft.`);
    if (x.throw_range) notes.push(`thrown ${x.throw_range.normal}/${x.throw_range.long} ft.`);
    if (x.two_handed_damage) notes.push(`${x.two_handed_damage.damage_dice} two-handed`);
    weapons.push({
      name: x.name,
      group: `${c.has("martial-weapons") ? "Martial" : "Simple"} ${ranged ? "ranged" : "melee"}`,
      light: props.includes("Light"),
      cost: cost(x.cost),
      weight: weight(x.weight),
      ability: ranged || finesse ? "DEX" : "STR",
      dice: baseDice(x.damage?.damage_dice) || "1",
      damageType: x.damage?.damage_type?.name?.toLowerCase() ?? "",
      notes: notes.join(", "),
      properties: props.join(", "),
      mastery: x.mastery?.name ?? "",
      text: desc,
    });
  } else if (c.has("armor")) {
    const ac = x.armor_class ?? {};
    const shield = c.has("shields");
    const lines = [];
    if (!shield) lines.push(`Armour Class ${ac.base}${ac.dex_bonus ? (ac.max_bonus ? ` + Dexterity bonus (up to ${ac.max_bonus})` : " + Dexterity bonus") : ""}.`);
    if (x.str_minimum) lines.push(`Needs Strength ${x.str_minimum}.`);
    if (x.stealth_disadvantage) lines.push("Disadvantage on Dexterity (Stealth) checks.");
    if (x.don_time) lines.push(`Takes ${x.don_time} to put on and ${x.doff_time} to take off.`);
    armour.push({ name: x.name, group: shield ? "Shields" : c.has("light-armor") ? "Light" : c.has("medium-armor") ? "Medium" : "Heavy", cost: cost(x.cost), weight: weight(x.weight), bonus: shield ? ac.base : ac.base - 10, text: [lines.join(" "), desc].filter(Boolean).join("\n\n") });
  } else {
    const group = c.has("equipment-packs") ? "Equipment packs" : c.has("tools") ? "Tools" : c.has("ammunition") ? "Ammunition" : c.has("arcane-foci") || c.has("druidic-foci") || c.has("holy-symbols") ? "Spellcasting foci" : c.has("mounts-and-vehicles") || c.has("mounts-and-other-animals") ? "Mounts and vehicles" : "Adventuring gear";
    const contents = (x.contents ?? []).map((i) => `${i.quantity > 1 ? `${i.quantity} ` : ""}${i.item?.name ?? ""}`).filter(Boolean);
    gear.push({ name: x.name, group, cost: cost(x.cost), weight: weight(x.weight), text: [desc, contents.length ? `Contains: ${contents.join(", ")}.` : ""].filter(Boolean).join("\n\n") });
  }
}
const poisons = load("Poisons").map((p) => ({ name: p.name, group: "Poisons", cost: typeof p.cost === "number" ? `${p.cost} gp` : cost(p.cost), weight: "", text: plain([p.type ? `${cap(p.type)} poison.` : "", [].concat(p.desc ?? p.description ?? []).join("\n")].join(" ")) }));
gear.push(...poisons);

// ---------- Magic items ----------

const magicItems = load("Magic-Items").map((m) => {
  const rarity = m.rarity?.name ?? "";
  // The data's first line repeats the kind and rarity ("Armor (Any Medium or Heavy) ..."), so it
  // is kept as the first line of the text.
  return { name: m.name, group: m.equipment_category?.name ?? "Wondrous Items", rarity, attunement: !!m.attunement, variantOf: null, text: plain(m.desc) };
});
// Variants (Armor +1, +2, +3) go under the item that lists them.
for (const m of load("Magic-Items")) for (const v of m.variants ?? []) {
  const child = magicItems.find((x) => x.name === v.name);
  if (child && child.name !== m.name) child.variantOf = m.name;
}

// ---------- Monsters ----------

const SPEED_ORDER = ["walk", "burrow", "climb", "fly", "swim"];
const usageText = (u) => {
  if (!u) return "";
  if (u.type === "per day") return ` (${u.times}/Day${u.times_in_lair && u.times_in_lair !== u.times ? `, or ${u.times_in_lair}/Day in Lair` : ""})`;
  if (u.type === "recharge on roll") return ` (Recharge ${u.min_value === 6 ? "6" : `${u.min_value}-6`})`;
  if (u.type === "recharge after rest") return ` (Recharges after a ${(u.rest_types ?? []).join(" or ")} rest)`;
  return "";
};
// "Melee Attack Roll: +5 (with Advantage if ...), reach 5 ft. Hit: 10 (2d6 + 3) Slashing damage ..."
const ATTACK = /^(Melee|Ranged|Melee or Ranged) Attack Roll:\s*[+-]\d+(\s*\([^)]*\))?,\s*(.*?)\.\s*Hit:\s*(\d+)(?:\s*\(([^)]*)\))?\s*([A-Za-z]+) damage(.*)$/s;
const ABILITY_KEYS = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
const LABELS = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

function monsterAction(x, a, section) {
  const name = a.name + usageText(a.usage);
  const desc = plain(a.desc);
  let text = desc;
  if (a.spellcasting?.spells?.length) {
    // "At Will: Detect Magic, Mage Hand; 1/Day Each: Fireball"
    const groups = new Map();
    for (const s of a.spellcasting.spells) {
      const u = s.usage ?? {};
      const key = u.type === "at will" ? "At will" : u.type === "per day" ? `${u.times}/Day each` : "Spells";
      groups.set(key, [...(groups.get(key) ?? []), s.name]);
    }
    // Only when the text stops at "the following spells:" does it need the list.
    if (/:\s*$/.test(desc)) text = `${desc.trim()} ${[...groups].map(([k, v]) => `${k}: ${v.join(", ")}`).join("; ")}.`;
  }
  const m = desc.match(ATTACK);
  if (m && typeof a.attack_bonus === "number") {
    const [, how, note, where, flat, dice, type, after] = m;
    const toHit = a.attack_bonus - (x.proficiency_bonus ?? 2);
    const ranged = how === "Ranged";
    const order = ranged ? [1, 0, 5, 4, 3, 2] : [0, 1, 5, 4, 3, 2];
    const i = order.find((k) => mod(x[ABILITY_KEYS[k]]) === toHit) ?? (ranged ? 1 : mod(x.strength) >= mod(x.dexterity) ? 0 : 1);
    // "(melee, reach 5 ft.) plus 2 (1d4) Slashing damage if the attack roll had Advantage"
    const reach = where.trim().replace(/\bft$/, "ft.");
    const rest = after.trim().replace(/^,\s*/, "").replace(/\.$/, "");
    const join = !rest ? "" : rest.startsWith(".") ? `${rest}` : ` ${rest}`;
    const extra = note ? ` ${note.trim().replace(/^\(|\)$/g, "")}` : "";
    return { section, kind: "attack", name, ability: LABELS[i], dice: baseDice(a.damage?.[0]?.damage_dice ?? dice) || flat, damageType: type.toLowerCase(), text: `(${how.toLowerCase()}, ${reach}${extra ? `;${extra}` : ""})${join}` };
  }
  return { section, kind: "trait", name, text };
}

const monsters = load("Monsters").map((x) => {
  const speed = SPEED_ORDER.filter((k) => x.speed?.[k]).map((k) => (k === "walk" ? x.speed[k] : `${k} ${x.speed[k]}`));
  const extraSpeed = Object.entries(x.speed ?? {}).filter(([k]) => !SPEED_ORDER.includes(k)).map(([k, v]) => (typeof v === "boolean" ? (v ? `(${k})` : "") : `${k} ${v}`));
  const skills = (x.proficiencies ?? []).filter((p) => p.proficiency.index.startsWith("skill-")).map((p) => `${p.proficiency.name.replace(/^Skill: /, "")} +${p.value}`);
  const saves = (x.proficiencies ?? []).filter((p) => p.proficiency.index.startsWith("saving-throw-")).map((p) => `${p.proficiency.name.replace(/^Saving Throw: /, "")} +${p.value}`);
  const senses = Object.entries(x.senses ?? {}).map(([k, v]) => (k === "passive_perception" ? `Passive Perception ${v}` : `${titleCase(k)} ${v}`));
  const list = (l) => (l ?? []).map((d) => (typeof d === "string" ? titleCase(d) : d.name ?? "")).filter(Boolean).join(", ");
  const facts = [
    `${x.size} ${titleCase(x.type)}${x.subtype ? ` (${titleCase(x.subtype)})` : ""}, ${titleCase(x.alignment)}.`,
    saves.length ? `Saving throws ${saves.join(", ")}.` : "",
    skills.length ? `Skills ${skills.join(", ")}.` : "",
    x.damage_vulnerabilities?.length ? `Vulnerabilities ${list(x.damage_vulnerabilities)}.` : "",
    x.damage_resistances?.length ? `Resistances ${list(x.damage_resistances)}.` : "",
    x.damage_immunities?.length ? `Immunities ${list(x.damage_immunities)}.` : "",
    x.gear ? `Gear ${x.gear}.` : "",
    `Senses ${senses.join(", ")}.`,
    `Languages ${x.languages || "None"}.`,
    `XP ${x.xp}${x.xp_in_lair ? `, or ${x.xp_in_lair} in lair` : ""}; Proficiency Bonus +${x.proficiency_bonus}.`,
  ].filter(Boolean);
  const actions = [
    ...(x.special_abilities ?? []).map((a) => monsterAction(x, a, "trait")),
    ...(x.actions ?? []).map((a) => monsterAction(x, a, "action")),
    ...(x.bonus_actions ?? []).map((a) => monsterAction(x, a, "bonus")),
    ...(x.reactions ?? []).map((a) => monsterAction(x, a, "reaction")),
    ...(x.legendary_actions ?? []).map((a) => monsterAction(x, a, "legendary")),
  ];
  return {
    name: x.name,
    cr: crText(x.challenge_rating),
    hp: x.hit_points,
    hitDice: x.hit_points_roll ?? x.hit_dice ?? "",
    ac: x.armor_class?.[0]?.value ?? 10,
    speed: [...speed, ...extraSpeed].filter(Boolean).join(", "),
    size: x.size,
    scores: ABILITY_KEYS.map((k) => x[k]),
    facts: facts.join(" "),
    immuneTo: (x.condition_immunities ?? []).map((c) => c.name),
    actions,
  };
});

// ---------- Species, classes, backgrounds and feats ----------

const traits = load("Traits");
const traitText = (t) => `${t.name}. ${plain(t.description)}`;
const subspecies = load("Subspecies");
const species = load("Species").map((s) => ({
  name: s.name,
  size: s.size ?? (s.size_options?.from?.options ?? []).map((o) => o.size).join(" or "),
  speed: `${s.speed} ft.`,
  text: [`${s.type ?? "Humanoid"}.`, ...traits.filter((t) => (t.species ?? []).some((x) => x.index === s.index) && !(t.subspecies ?? []).length).map(traitText)].join("\n\n"),
  subspecies: subspecies.filter((ss) => ss.species?.index === s.index).map((ss) => ({ name: ss.name, text: traits.filter((t) => (t.subspecies ?? []).some((x) => x.index === ss.index)).map(traitText).join("\n\n") })),
}));

const features = load("Features");
const levelOf = (f) => Number(String(f.level?.index ?? "").split("-").pop()) || 0;
const featureText = (list) =>
  list
    .sort((a, b) => levelOf(a) - levelOf(b))
    .map((f) => `Level ${levelOf(f)}: ${f.name}. ${plain(f.description)}`)
    .join("\n\n");
const subclasses = load("Subclasses");
const classes = load("Classes").map((c) => {
  const profs = (c.proficiencies ?? []).map((p) => p.name).filter((n) => !n.startsWith("Saving Throw")).join(", ");
  const facts = [
    c.primary_ability?.desc ? `Primary ability: ${c.primary_ability.desc}.` : "",
    `Hit point die: d${c.hit_die}.`,
    `Saving throws: ${(c.saving_throws ?? []).map((s) => s.name).join(", ")}.`,
    profs ? `Proficiencies: ${profs}.` : "",
    ...(c.proficiency_choices ?? []).map((p) => (p.desc ? `${cap(p.desc)}.` : "")),
    ...(c.starting_equipment_options ?? []).map((o) => (o.desc ? `Starting equipment: ${o.desc}.` : "")),
  ]
    .filter(Boolean)
    .map((s) => s.replace(/\.\.$/, "."));
  return {
    name: c.name,
    hitDie: `d${c.hit_die}`,
    text: [facts.join(" "), featureText(features.filter((f) => f.class?.index === c.index && !f.subclass))].filter(Boolean).join("\n\n"),
    subclasses: subclasses.filter((s) => s.class?.index === c.index).map((s) => ({ name: s.name, text: [plain(s.summary ?? ""), featureText(features.filter((f) => f.subclass?.index === s.index))].filter(Boolean).join("\n\n") })),
  };
});

const backgrounds = load("Backgrounds").map((b) => ({
  name: b.name,
  text: [
    `Ability scores: ${(b.ability_scores ?? []).map((a) => a.name).join(", ")}.`,
    b.feat ? `Feat: ${b.feat.name}${b.feat.note ? ` (${b.feat.note})` : ""}.` : "",
    `Proficiencies: ${(b.proficiencies ?? []).map((p) => p.name.replace(/^(Skill|Tool): /, "")).join(", ")}.`,
    ...(b.equipment_options ?? []).map((o) => (o.desc ? `Equipment: ${o.desc.replace(/^Choose A or B:\s*/, "")}` : "")),
  ]
    .filter(Boolean)
    .join(" "),
}));
const feats = load("Feats").map((f) => ({ name: f.name, type: f.type ?? "", text: [f.prerequisites?.length ? `Prerequisite: ${f.prerequisites.map((p) => p.desc ?? p.name ?? p.type ?? "").filter(Boolean).join(", ") || "see the text"}.` : "", plain(f.description)].filter(Boolean).join("\n\n") }));
const weaponProperties = [...load("Weapon-Properties"), ...load("Weapon-Mastery-Properties")].map((p) => ({ name: p.name, mastery: load("Weapon-Mastery-Properties").some((m) => m.index === p.index), text: plain([].concat(p.desc ?? p.description ?? []).join("\n")) }));
const languages = load("Languages").map((l) => ({ name: l.name, rare: !!l.is_rare, note: plain(l.note ?? "") }));

const out = {
  source: { project: "5e-database (https://github.com/5e-bits/5e-database), src/2024/en", commit },
  conditions,
  spells,
  weapons,
  armour,
  gear,
  magicItems,
  monsters,
  species,
  classes,
  backgrounds,
  feats,
  weaponProperties,
  languages,
};
writeFileSync(new URL("../src/app/starters/srd52.json", import.meta.url), JSON.stringify(out) + "\n");
console.log(Object.entries(out).map(([k, v]) => `${k} ${Array.isArray(v) ? v.length : ""}`).join(", "));
