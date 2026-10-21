// The Codex sections and the pickers' starting lists. No imports, so the window can use them
// without pulling in the back end.

export type CodexKey = "weapons" | "armour" | "gear" | "magic" | "monsters" | "npcs" | "characters" | "races" | "classes" | "spells" | "attacks" | "enchantments" | "traits" | "conditions" | "tables" | "encounters" | "maps" | "journal" | "macros" | "layouts" | "templates";

/** In the order they show. `what` is what a node in it is. */
export const CODEX_SECTIONS: { key: CodexKey; title: string; one: string; icon: string; what: "item" | "being" | "brick" | "encounter" | "template" | "other" }[] = [
  { key: "weapons", title: "Weapons", one: "weapon", icon: "⚔️", what: "item" },
  { key: "armour", title: "Armour", one: "armour", icon: "🛡️", what: "item" },
  { key: "gear", title: "Gear", one: "piece of gear", icon: "🏮", what: "item" },
  { key: "magic", title: "Magic items", one: "magic item", icon: "💎", what: "item" },
  { key: "monsters", title: "Monsters", one: "monster", icon: "🐉", what: "being" },
  { key: "npcs", title: "NPCs", one: "NPC", icon: "🧑", what: "being" },
  { key: "characters", title: "Characters", one: "character", icon: "🧙", what: "being" },
  { key: "races", title: "Races", one: "race", icon: "🧝", what: "being" },
  { key: "classes", title: "Classes", one: "class", icon: "🎭", what: "being" },
  { key: "spells", title: "Spells", one: "spell", icon: "📜", what: "brick" },
  { key: "attacks", title: "Attacks", one: "attack", icon: "🗡️", what: "brick" },
  { key: "enchantments", title: "Enchantments", one: "enchantment", icon: "✨", what: "brick" },
  { key: "traits", title: "Traits and features", one: "trait", icon: "🧩", what: "brick" },
  { key: "conditions", title: "Conditions", one: "condition", icon: "🩹", what: "other" },
  { key: "tables", title: "Roll tables", one: "roll table", icon: "🎲", what: "other" },
  { key: "encounters", title: "Encounters", one: "encounter", icon: "⚔️", what: "encounter" },
  { key: "maps", title: "Maps", one: "map", icon: "🗺️", what: "other" },
  { key: "journal", title: "Journal", one: "journal page", icon: "📓", what: "other" },
  { key: "macros", title: "Macros", one: "macro", icon: "🪄", what: "other" },
  { key: "layouts", title: "Sheet and book layouts", one: "layout", icon: "📐", what: "other" },
  { key: "templates", title: "Templates", one: "template", icon: "📐", what: "template" },
];

export const DICE_CHOICES = ["1", "1d4", "1d6", "1d8", "1d10", "1d12", "2d4", "2d6", "2d8", "2d10"];
export const DAMAGE_TYPES = ["slashing", "piercing", "bludgeoning", "fire", "cold", "lightning", "thunder", "acid", "poison", "necrotic", "radiant", "force", "psychic"];
export const HANDLING = ["One-handed", "Two-handed", "Versatile"];
export const STARTER_MATERIALS = ["Wood", "Bone", "Stone", "Leather", "Cloth", "Hemp", "Glass", "Bronze", "Iron", "Steel", "Silver", "Gold", "Mithral", "Adamantine", "Crystal"];
export const STARTER_COINS = ["cp", "sp", "gp", "pp"];
export const CHALLENGES = ["0", "1/8", "1/4", "1/2", ...Array.from({ length: 30 }, (_, i) => String(i + 1))];
export const HIT_DICE = ["d6", "d8", "d10", "d12"];


/**
 * Standard wording for each kind of core check (backlog 1), written for DM in a Pocket. It fills
 * the description and the rulebook until the user writes their own.
 */
export const STANDARD_CORE_TEXT: Record<string, string> = {
  rollOver: "When the outcome is uncertain, roll the die and add the bonus that fits what you are doing. If the total meets or beats the number to beat, you succeed. The harder the task, the higher that number.",
  rollUnder: "When the outcome is uncertain, roll the die and compare it with the score that fits what you are doing. Roll equal to or under your score and you succeed; roll over it and you fail. Hard tasks may lower the score you roll against.",
  pool: "When the outcome is uncertain, gather a handful of dice, usually one for each point in the ability and skill that fit, and roll them all. Each die that shows the success number or higher is a success. One success is enough for most tasks; harder ones need more.",
  bands: "When the outcome is uncertain, roll two six-sided dice and add the bonus that fits. On a high total you do it cleanly. On a middling total you do it, but at a cost or with a complication. On a low total things go wrong.",
  percentile: "When the outcome is uncertain, roll percentile dice (two ten-sided dice read as 1 to 100) and compare the roll with your skill. Roll equal to or under your skill and you succeed. Very low rolls are special successes.",
  step: "Every ability and skill is a die, from a d4 for poor to a d12 for excellent. When the outcome is uncertain, roll the dice that fit what you are doing and keep the highest. Meet or beat the number to beat and you succeed. Getting better steps a die up.",
  none: "There are no dice. When the outcome is uncertain, it is decided another way, such as drawing a card, spending a token or agreeing on what happens at the table.",
  other: "Describe here how a character finds out whether they succeed when the outcome is uncertain.",
};
