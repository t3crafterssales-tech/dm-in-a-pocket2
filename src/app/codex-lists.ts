// The Codex sections and the pickers' starting lists. No imports, so the window can use them
// without pulling in the back end.

export type CodexKey = "weapons" | "armour" | "gear" | "magic" | "monsters" | "npcs" | "characters" | "races" | "classes" | "spells" | "attacks" | "enchantments" | "traits" | "templates";

/** In the order they show. `what` is what a node in it is. */
export const CODEX_SECTIONS: { key: CodexKey; title: string; one: string; icon: string; what: "item" | "being" | "brick" | "template" }[] = [
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
  { key: "templates", title: "Templates", one: "template", icon: "📐", what: "template" },
];

export const DICE_CHOICES = ["1", "1d4", "1d6", "1d8", "1d10", "1d12", "2d4", "2d6", "2d8", "2d10"];
export const DAMAGE_TYPES = ["slashing", "piercing", "bludgeoning", "fire", "cold", "lightning", "thunder", "acid", "poison", "necrotic", "radiant", "force", "psychic"];
export const HANDLING = ["One-handed", "Two-handed", "Versatile"];
export const STARTER_MATERIALS = ["Wood", "Bone", "Stone", "Leather", "Cloth", "Hemp", "Glass", "Bronze", "Iron", "Steel", "Silver", "Gold", "Mithral", "Adamantine", "Crystal"];
export const STARTER_COINS = ["cp", "sp", "gp", "pp"];
export const CHALLENGES = ["0", "1/8", "1/4", "1/2", ...Array.from({ length: 30 }, (_, i) => String(i + 1))];
export const HIT_DICE = ["d6", "d8", "d10", "d12"];

