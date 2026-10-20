// Quick start: the six big questions, asked right after New system (and skippable), each of which
// builds a handful of small rule nodes. Everything it makes is ordinary and can be changed after.

import { F, link } from "../engine/index.ts";
import type { Id, NodeKind, Value, Workspace } from "../engine/index.ts";
import { ensureSections } from "./rules.ts";
import type { SectionKey } from "./rules.ts";
import { ensureCategories } from "./sheets.ts";

export interface QuickStartAnswers {
  /** How a check works. */
  check: "rollOver" | "rollUnder" | "pool" | "bands" | "percentile" | "step" | "none";
  /** Which abilities. */
  abilities: "classic" | "four" | "three" | "none";
  /** How characters take harm. */
  health: "hp" | "wounds" | "none";
  /** Heroic or gritty: healing, dying and resting. */
  tone: "heroic" | "gritty";
  /** Grid tactical or theatre of the mind: movement, ranges and reach. */
  map: "grid" | "theatre";
  /** Magic and powers. */
  magic: "slots" | "mana" | "none";
}

export const QUICK_QUESTIONS: { key: keyof QuickStartAnswers; question: string; options: { value: string; label: string; hint: string }[] }[] = [
  {
    key: "check",
    question: "How do players find out if something works?",
    options: [
      { value: "rollOver", label: "Roll d20 + bonus against a difficulty", hint: "Like most d20 games." },
      { value: "rollUnder", label: "Roll under your stat", hint: "Simple and old-school." },
      { value: "percentile", label: "Roll d100 under your skill", hint: "Good for gritty or horror games." },
      { value: "pool", label: "Roll a pool of d6s and count successes", hint: "More dice for better characters." },
      { value: "bands", label: "Roll 2d6: full success, partial, or fail", hint: "Story-first games." },
      { value: "step", label: "Step dice: d4 to d12", hint: "Better abilities roll bigger dice." },
      { value: "none", label: "No dice", hint: "Cards, tokens or the story decides." },
    ],
  },
  {
    key: "abilities",
    question: "Which abilities do characters have?",
    options: [
      { value: "classic", label: "The classic six", hint: "Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma." },
      { value: "four", label: "Four", hint: "Body, Agility, Mind, Spirit." },
      { value: "three", label: "Three", hint: "Might, Finesse, Wits." },
      { value: "none", label: "I'll make my own", hint: "Start with none and add them in the Rules tab." },
    ],
  },
  {
    key: "health",
    question: "How do characters take harm?",
    options: [
      { value: "hp", label: "Hit points", hint: "A number that goes down; at 0 you are down." },
      { value: "wounds", label: "Wound boxes", hint: "Three boxes to tick off; quick and deadly." },
      { value: "none", label: "I'll decide later", hint: "" },
    ],
  },
  {
    key: "tone",
    question: "Heroic or gritty?",
    options: [
      { value: "heroic", label: "Heroic", hint: "Heroes heal overnight and are hard to kill." },
      { value: "gritty", label: "Gritty", hint: "Healing is slow and injuries linger." },
    ],
  },
  {
    key: "map",
    question: "Grid tactical or theatre of the mind?",
    options: [
      { value: "grid", label: "Grid", hint: "Squares on a battle map; exact movement and ranges." },
      { value: "theatre", label: "Theatre of the mind", hint: "Near, far and out of reach; no map needed." },
    ],
  },
  {
    key: "magic",
    question: "Is there magic, or other powers?",
    options: [
      { value: "slots", label: "Spell slots", hint: "A few spells a day, back after a long rest." },
      { value: "mana", label: "Mana points", hint: "A pool of points spent on powers." },
      { value: "none", label: "No magic", hint: "" },
    ],
  },
];

const ABILITY_SETS: Record<string, [string, string, string][]> = {
  classic: [
    ["Strength", "STR", "Physical power."],
    ["Dexterity", "DEX", "Agility and reflexes."],
    ["Constitution", "CON", "Health and stamina."],
    ["Intelligence", "INT", "Memory and reasoning."],
    ["Wisdom", "WIS", "Awareness and insight."],
    ["Charisma", "CHA", "Force of personality."],
  ],
  four: [
    ["Body", "BOD", "Strength and toughness."],
    ["Agility", "AGI", "Speed and precision."],
    ["Mind", "MND", "Knowledge and wits."],
    ["Spirit", "SPI", "Willpower and presence."],
  ],
  three: [
    ["Might", "MIG", "Force and endurance."],
    ["Finesse", "FIN", "Skill and grace."],
    ["Wits", "WIT", "Cleverness and nerve."],
  ],
};

/** What an ability's score looks like for each way of checking. */
const SCORES: Record<QuickStartAnswers["check"], { min: number; max: number; bonus: string }> = {
  rollOver: { min: 3, max: 18, bonus: "d20" },
  rollUnder: { min: 3, max: 18, bonus: "none" },
  percentile: { min: 1, max: 100, bonus: "none" },
  pool: { min: 1, max: 5, bonus: "score" },
  bands: { min: -1, max: 3, bonus: "score" },
  step: { min: 4, max: 12, bonus: "none" },
  none: { min: 1, max: 5, bonus: "none" },
};

const CHECK_DIE: Record<QuickStartAnswers["check"], [string, string]> = {
  rollOver: ["d20", "Difficulty"],
  rollUnder: ["d20", ""],
  percentile: ["d100", ""],
  pool: ["d6", "5"],
  bands: ["2d6", "10"],
  step: ["", ""],
  none: ["", "the story"],
};

/** Builds the answers into the system, as one undo step called "Quick start". Returns what it made. */
export function buildQuickStart(ws: Workspace, layerId: Id, a: QuickStartAnswers): string[] {
  for (const q of QUICK_QUESTIONS) if (!q.options.some((o) => o.value === a[q.key])) throw new Error(`Answer: ${q.question}`);
  const made: string[] = [];
  ws.transact("Quick start", () => {
    const sections = ensureSections(ws, layerId);
    ensureCategories(ws, layerId);
    const add = (section: SectionKey, kind: NodeKind, name: string, fields: Record<string, Value>, text = "") => {
      made.push(name);
      return ws.create(layerId, kind, name, { category: link(sections.get(section)!), fields, text });
    };
    const rule = (section: SectionKey, name: string, text: string) => add(section, "rule", name, {}, text);

    const [die, target] = CHECK_DIE[a.check];
    add("core", "rule", "The core check", { [F.family]: a.check, [F.die]: die, [F.target]: target });

    const sc = SCORES[a.check];
    const abilities = (ABILITY_SETS[a.abilities] ?? []).map(([name, label, text]) => add("abilities", "ability", name, { [F.label]: label, [F.rangeMin]: sc.min, [F.rangeMax]: sc.max, [F.bonus]: sc.bonus }, text));
    const tough = abilities[a.abilities === "classic" ? 2 : 0];

    if (a.health !== "none") {
      const down = add("conditions", "condition", a.health === "hp" ? "Unconscious" : "Down", { [F.stages]: 1, [F.duration]: "until healed", [F.save]: null }, "Out of the fight: can't act, and falls over.");
      if (a.health === "hp") {
        const max: Value = tough ? { formula: [{ op: "+", number: 10 }, { op: "+", ability: link(tough), use: sc.bonus === "d20" ? "bonus" : "score" }] } : 10;
        add("resources", "resource", "Hit points", { [F.label]: "HP", [F.maximum]: max, [F.start]: "full", [F.recovery]: a.tone === "heroic" ? "long rest" : "never", [F.display]: "number", [F.thresholds]: [{ at: 0, condition: link(down) }] }, a.tone === "gritty" ? "Lost hit points come back slowly: 1 a day of rest, or with a healer." : "");
      } else {
        add("resources", "resource", "Wounds", { [F.label]: "", [F.maximum]: 3, [F.start]: "full", [F.recovery]: a.tone === "heroic" ? "long rest" : "never", [F.display]: "boxes", [F.thresholds]: [{ at: 0, condition: link(down) }] }, "Tick one box for each serious hit.");
      }
    }

    if (a.tone === "heroic") {
      rule("time", "Resting", "A night's rest heals a hero fully. A short break of an hour heals a little.");
      rule("combat", "Dying", "A hero who goes down isn't dead yet: allies have a few rounds to help them up.");
    } else {
      rule("time", "Resting", "Rest heals slowly: one day of rest brings back a little health. Serious wounds need a healer.");
      rule("combat", "Lasting injuries", "Going down leaves a mark: roll on an injury table, or the GM picks a lasting injury.");
    }

    if (a.map === "grid") {
      rule("combat", "Movement", "Play on a grid of 5-foot squares. Most characters move 6 squares on their turn; difficult ground costs double.");
      rule("combat", "Ranges and reach", "Melee attacks reach the next square. Ranged weapons have a range in squares; beyond it, attacks are harder.");
    } else {
      rule("combat", "Movement and range", "No map: things are in reach, near (a quick dash away) or far (a whole turn of running). Describe where you go.");
    }

    if (a.magic === "slots") {
      add("resources", "resource", "Spell slots", { [F.label]: "", [F.maximum]: 2, [F.start]: "full", [F.recovery]: "long rest", [F.display]: "boxes", [F.thresholds]: [] }, "Each spell uses up a slot.");
      rule("magic", "Spellcasting", "Casting a spell uses a spell slot. Slots come back after a long rest.");
    } else if (a.magic === "mana") {
      add("resources", "resource", "Mana", { [F.label]: "MP", [F.maximum]: 10, [F.start]: "full", [F.recovery]: "long rest", [F.display]: "bar", [F.thresholds]: [] }, "Spend mana to use powers; bigger powers cost more.");
      rule("magic", "Powers", "Each power has a mana cost. Mana comes back after a long rest.");
    } else {
      rule("magic", "No magic", "There is no magic in this game.");
    }
  });
  return made;
}
