// The sample to explore (version 2.6, Jeff: "a small fantasy valley"). Built with the same steps a
// user takes (so it is exactly what they could make themselves): the d20 starter as its system, a
// world with a town, a mill and a cave, and a short module with four encounters, two NPCs, a map
// with pins, a roll table and a journal handout. Deleting it is one click; Help brings it back.

import type { Backend } from "./backend.ts";
import type { Id, Value } from "../engine/index.ts";

export const SAMPLE_SYSTEM = "d20 Basic (sample)";
export const SAMPLE_WORLD = "Greyhollow Valley (sample)";
export const SAMPLE_MODULE = "The Mill on Ash Creek (sample)";

export function makeSample(b: Backend): { system: Id; world: Id; module: Id } {
  b.goHome();
  const system = b.createSystem({ name: SAMPLE_SYSTEM, picture: null, start: "d20" });
  const world = b.createWorld({ name: SAMPLE_WORLD, picture: null, systemId: system });

  // ---------- The world: a valley with a town, a mill and a cave ----------
  b.open({ type: "world", id: world });
  const page = (name: string, template: string, text: string) => {
    const id = b.addLore(name, template);
    b.setText(id, text);
    return id;
  };
  const town = page("Greyhollow", "place", "## What it looks like\nA market town of grey stone where two roads cross, with a squat temple and the Lantern inn.\n\n## Who lives there\nFarmers, millers' families, a few retired soldiers. Sister Wren runs the temple's sickroom.\n\n## Dangers\nWolves in hard winters. Strangers asking too many questions.\n\n## Adventure hooks\nThe miller's boy has gone missing near Ash Creek.");
  const mill = page("Ash Creek Mill", "place", "## What it looks like\nAn old water mill a morning's walk up the creek, its wheel groaning day and night.\n\n## Who lives there\nHob the miller and, until three days ago, his son Tam.\n\n## Dangers\nThe woods behind it have gone quiet. Too quiet.");
  const cave = page("The Hollow", "place", "## What it looks like\nA cave mouth above the creek, half hidden by birches. Cold air breathes out of it.\n\n## Who lives there\nA small band of goblins who moved in this autumn.\n\n## Dangers\nTraps of twine and bells; a slippery drop to an underground pool.");
  const npc = (name: string, text: string) => {
    const id = b.addBeing({ name, kind: "npc", variantOf: null });
    b.setText(id, text);
    return id;
  };
  const hob = npc("Hob the miller", "A big, flour-dusted man who talks too loudly when he's scared. He'll pay 50 gold pieces to have Tam home safe, and he'll owe the party a favour for life.");
  const wren = npc("Sister Wren", "The temple's healer: quick, kind and sharper than she lets on. She sells Potions of Healing at cost to anyone going after Tam.");
  const road = b.addLore("Road encounters", "table");
  const rows = [
    { from: 1, to: 1, text: "A farmer's cart stuck in the mud; they'll share news for a hand." },
    { from: 2, to: 2, text: "Fresh wolf tracks heading toward the creek." },
    { from: 3, to: 3, text: "A torn blue scarf on a thornbush: Tam's." },
    { from: 4, to: 4, text: "A pedlar selling 'genuine' dragon scales (painted tin)." },
    { from: 5, to: 5, text: "Rain. Everything is slower and louder." },
    { from: 6, to: 6, text: "Three wolves, hungry and bold." },
  ].map((r) => ({ ...r, result: null }));
  b.setField(road, "rows", rows as unknown as Value);
  b.setText(road, "Roll when the party travels between Greyhollow and the mill.");
  b.goHome();

  // ---------- The module: four encounters, a map and a handout ----------
  const module = b.createModule({ name: SAMPLE_MODULE, picture: null, baseId: world });
  b.open({ type: "module", id: module });
  const codex = b.codex();
  const monster = (name: string) => codex.find((s) => s.key === "monsters")?.entries.find((e) => e.name === name || e.name.startsWith(name))?.id ?? null;
  const wolf = monster("Wolf");
  const goblin = monster("Goblin");
  const enc = (name: string, readAloud: string, text: string) => {
    const id = b.addEncounter(name, null);
    b.setField(id, "readAloud", readAloud);
    b.setText(id, text);
    return id;
  };
  const e1 = enc("Hob's plea", "The miller fills the doorway of the Lantern, cap twisting in his huge hands. \"My boy,\" he says. \"Three days. Please.\"", "Hob hires the party. He knows Tam went looking for the goblins' 'shiny stones' up the creek. Sister Wren offers potions.");
  const e2 = enc("On the road", "Rain hammers the muddy road. Somewhere close, a wolf howls, and another answers.", "The wolves are hungry, not evil. Fire scares them off. Roll on Road encounters first if you like.");
  const e3 = enc("The cave mouth", "Twine is strung between the birches, hung with little brass bells. Beyond them, the cave breathes cold air.", "Careful players spot the twine (Wisdom check, 12). Ringing the bells brings two goblins to the entrance.");
  const e4 = enc("Tam in the dark", "By the underground pool, a boy sits wrapped in a goblin's cloak, sharing a fish with the smallest goblin you've ever seen.", "Tam isn't a prisoner: he's made a friend. The goblins only want to be left alone. A fight here is a choice, not a must.");
  if (wolf) b.addToEncounter(e2, [wolf], 3);
  if (goblin) b.addToEncounter(e3, [goblin], 2);
  b.addToEncounter(e1, [hob, wren]);
  b.addToEncounter(e2, [road]);
  b.addToEncounter(e4, [cave]);
  b.addToEncounter(e1, [e2]);
  b.addToEncounter(e2, [e3]);
  b.addToEncounter(e3, [e4]);

  // The handout: Tam's note, left at the mill.
  const note = b.createPage("Tam's note", "Handouts");
  const block = b.pageView(note).blocks[0]?.id ?? b.addBlock(note, "text");
  b.setBlock(note, block, { text: "Da —\nGone to see the shiny-stone people up the creek. They're not bad, honest. Back by supper.\n— Tam", font: "Segoe Print", size: 20 });

  // The map: the creek, the mill, the town and the cave, with pins that open them.
  const map = b.createMap({ name: "Ash Creek valley", picture: null });
  const v = b.mapView(map);
  const W = v.width;
  const H = v.height;
  const at = (x: number, y: number) => [Math.round(W * x), Math.round(H * y)];
  b.addShape(map, { layer: "drawing", tool: "fill", points: [0, 0], color: "#8fb36a", width: 0, fill: null, texture: "grass", stamp: null, text: null, size: 0 });
  b.addShape(map, { layer: "drawing", tool: "line", points: [...at(0.05, 0.1), ...at(0.3, 0.3), ...at(0.45, 0.45), ...at(0.7, 0.55), ...at(0.95, 0.9)], color: "#5d97c6", width: Math.max(10, W / 80), fill: null, texture: null, stamp: null, text: null, size: 0 });
  b.addShape(map, { layer: "drawing", tool: "line", points: [...at(0.1, 0.9), ...at(0.4, 0.75), ...at(0.45, 0.5)], color: "#9b7b52", width: Math.max(6, W / 160), fill: null, texture: null, stamp: null, text: null, size: 0 });
  for (const [x, y, s] of [[0.12, 0.82, "building"], [0.16, 0.86, "building"], [0.46, 0.44, "building"], [0.2, 0.15, "mountain"], [0.27, 0.12, "mountain"], [0.62, 0.3, "tree"], [0.66, 0.25, "tree"], [0.7, 0.32, "tree"], [0.8, 0.7, "tree"]] as const) b.addShape(map, { layer: "drawing", tool: "stamp", points: at(x, y), color: "#2b2620", width: 0, fill: null, texture: null, stamp: s, text: null, size: Math.max(40, W / 22) });
  b.addShape(map, { layer: "labels", tool: "text", points: at(0.52, 0.62), color: "#2b4f6e", width: 0, fill: null, texture: null, stamp: null, text: "Ash Creek", size: Math.max(20, W / 45) });
  b.addShape(map, { layer: "dm", tool: "text", points: at(0.6, 0.12), color: "#b93a2e", width: 0, fill: null, texture: null, stamp: null, text: "Goblin lookout (DM only)", size: Math.max(16, W / 60) });
  b.addPins(map, [town], ...(at(0.14, 0.8) as [number, number]), { symbol: "house" });
  b.addPins(map, [e1], ...(at(0.18, 0.76) as [number, number]));
  b.addPins(map, [mill], ...(at(0.46, 0.4) as [number, number]), { symbol: "house" });
  b.addPins(map, [e2], ...(at(0.4, 0.72) as [number, number]));
  b.addPins(map, [cave], ...(at(0.24, 0.24) as [number, number]), { symbol: "skull" });
  b.addPins(map, [e3], ...(at(0.3, 0.27) as [number, number]));
  b.setText(map, "Use this map at the table: Show to players puts it on their screens.");
  b.goHome();
  return { system, world, module };
}
