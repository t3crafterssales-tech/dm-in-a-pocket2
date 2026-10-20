// A tiny d20-style system and a world, used by the tests.

import { Workspace, link } from "../src/engine/index.ts";
import type { Id } from "../src/engine/index.ts";

export interface Fixture {
  ws: Workspace;
  sys: Id;
  world: Id;
  str: Id;
  dex: Id;
  con: Id;
  poisoned: Id;
  prone: Id;
  weaponAttack: Id;
  fire: Id;
  hp: Id;
  longsword: Id;
  goblin: Id;
}

export function makeFixture(): Fixture {
  const ws = new Workspace();
  let t = 1_700_000_000_000;
  ws.now = () => (t += 1000);
  const sys = ws.addLayer("system", "d20 Basic");
  const world = ws.addLayer("world", "Greyhollow", sys);
  const ability = (name: string, label: string) => ws.create(sys, "ability", name, { source: "template", fields: { label, min: 3, max: 18 } });
  const str = ability("Strength", "STR");
  const dex = ability("Dexterity", "DEX");
  const con = ability("Constitution", "CON");
  const poisoned = ws.create(sys, "condition", "Poisoned", { fields: { effects: "Disadvantage on attacks." } });
  const prone = ws.create(sys, "condition", "Prone", { fields: { effects: "Can only crawl." } });
  const weaponAttack = ws.create(sys, "brick", "Weapon Attack", { fields: { type: "attack", ability: link(str), dice: "1d6", damageType: "bludgeoning" } });
  const fire = ws.create(sys, "brick", "Fire damage", { fields: { type: "damage", dice: "1d6", damageType: "fire" } });
  const hp = ws.create(sys, "resource", "Hit Points", { fields: { label: "HP", maxAbility: link(con), plus: 10 } });
  const longsword = ws.create(world, "item", "Longsword", { fields: { cost: "15 gp" } });
  ws.attach(world, longsword, weaponAttack, { overrides: { dice: "1d8", damageType: "slashing" } });
  const goblin = ws.create(world, "being", "Goblin", { fields: { beingKind: "monster", hp: 7, ac: 15, cr: "1/4" } });
  ws.attach(world, goblin, longsword);
  return { ws, sys, world, str, dex, con, poisoned, prone, weaponAttack, fire, hp, longsword, goblin };
}
