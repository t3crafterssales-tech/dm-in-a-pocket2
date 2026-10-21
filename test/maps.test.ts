import { test } from "node:test";
import assert from "node:assert/strict";
import { Workspace, redFlags } from "../src/engine/index.ts";
import { addPins, addShape, copyPins, createMap, deletePins, editPins, fillShape, mapTree, mapView, mapsShowing, measure, movePins, setMapSettings } from "../src/app/maps.ts";

function setup() {
  const ws = new Workspace();
  const sys = ws.addLayer("system", "d20 Basic");
  const world = ws.addLayer("world", "Greyhollow", sys);
  const ids = ws.transact("x", () => ({
    region: createMap(ws, world, "Greyhollow region", { width: 2000, height: 1200 }),
    town: createMap(ws, world, "Greyhollow town"),
    mill: createMap(ws, world, "The Mill"),
    wolf: ws.create(sys, "being", "Wolf", { fields: { beingKind: "monster" } }),
    inn: ws.create(world, "lore", "The Laughing Pike", { fields: { template: "place" } }),
    sword: ws.create(world, "item", "Greatsword"),
  }));
  return { ws, sys, world, ...ids };
}

test("pins link to anything and start black with a symbol for what they link to", () => {
  const s = setup();
  const [wolfPin, innPin, swordPin, townPin] = s.ws.transact("drop", () => addPins(s.ws, s.world, s.region, [s.wolf, s.inn, s.sword, s.town], 100, 200));
  const v = mapView(s.ws, s.world, s.region);
  assert.equal(v.pins.length, 4);
  assert.deepEqual(v.pins.map((p) => p.symbol), ["dragon", "house", "sword", "map"]);
  assert.ok(v.pins.every((p) => p.color === "#1f1b16"), "pins start black");
  assert.equal(v.pins.find((p) => p.id === townPin)!.target!.isMap, true);
  s.ws.transact("move", () => movePins(s.ws, s.world, s.region, [{ id: wolfPin!, x: 500.4, y: 50 }]));
  assert.deepEqual([mapView(s.ws, s.world, s.region).pins[0]!.x, mapView(s.ws, s.world, s.region).pins[0]!.y], [500, 50]);
  s.ws.transact("edit", () => editPins(s.ws, s.world, s.region, [innPin!, swordPin!], { color: "#b93a2e", symbol: "star" }));
  assert.deepEqual(mapView(s.ws, s.world, s.region).pins.filter((p) => p.color === "#b93a2e").map((p) => p.symbol), ["star", "star"], "several pins change together");
  assert.deepEqual(mapsShowing(s.ws, s.world, s.inn).map((m) => m.name), ["Greyhollow region"], "the inn's page can say: On the map");
  s.ws.undo();
  assert.equal(mapView(s.ws, s.world, s.region).pins.find((p) => p.id === innPin)!.color, "#1f1b16", "every change undoes");
});

test("Ctrl+D copies a pin with its link; Ctrl+Shift+D keeps only the look", () => {
  const s = setup();
  const [pin] = s.ws.transact("drop", () => addPins(s.ws, s.world, s.town, [s.inn], 10, 10));
  const [joined] = s.ws.transact("copy", () => copyPins(s.ws, s.world, s.town, [pin!], true));
  const [loose] = s.ws.transact("copy", () => copyPins(s.ws, s.world, s.town, [pin!], false));
  const v = mapView(s.ws, s.world, s.town);
  assert.equal(v.pins.find((p) => p.id === joined)!.target!.id, s.inn);
  assert.equal(v.pins.find((p) => p.id === loose)!.link, null);
  assert.equal(v.pins.find((p) => p.id === loose)!.symbol, "house");
  s.ws.transact("relink", () => editPins(s.ws, s.world, s.town, [loose!], { link: s.wolf }));
  assert.equal(mapView(s.ws, s.world, s.town).pins.find((p) => p.id === loose)!.target!.name, "Wolf", "dropping something on a pin relinks it");
  s.ws.transact("del", () => deletePins(s.ws, s.world, s.town, [joined!]));
  assert.equal(mapView(s.ws, s.world, s.town).pins.length, 2);
});

test("maps inside maps: the tree follows pins that link to maps, and never loops", () => {
  const s = setup();
  s.ws.transact("x", () => addPins(s.ws, s.world, s.region, [s.town], 0, 0));
  s.ws.transact("x", () => addPins(s.ws, s.world, s.town, [s.mill], 0, 0));
  s.ws.transact("x", () => addPins(s.ws, s.world, s.mill, [s.region], 0, 0));
  const tree = mapTree(s.ws, s.world);
  const names = (n: { name: string; children: { name: string; children: unknown[] }[] }): unknown => [n.name, n.children.map((c) => names(c as never))];
  assert.equal(tree.length, 1, "every map appears, even in a loop");
  assert.deepEqual(JSON.stringify(tree.map(names as never)).includes("The Mill"), true);
  assert.deepEqual(mapView(s.ws, s.world, s.mill).inside.map((m) => m.name), ["Greyhollow town"]);
});

test("deleting something pinned on a map flags the pin red, like any link", () => {
  const s = setup();
  s.ws.transact("x", () => addPins(s.ws, s.world, s.region, [s.wolf], 0, 0));
  s.ws.delete(s.sys, s.wolf);
  assert.equal(mapView(s.ws, s.world, s.region).pins[0]!.missing, true);
  assert.ok(redFlags(s.ws, s.world).some((f) => f.slots.some((x) => x.node === s.region)), "a red flag on the map");
});

test("drawing, filling, settings and measuring", () => {
  const s = setup();
  const room = s.ws.transact("x", () => addShape(s.ws, s.world, s.mill, { layer: "drawing", tool: "room", points: [10.4, 10, 210, 160], color: "#1f1b16", width: 4, fill: null, texture: null, stamp: null, text: null, size: 24 }));
  s.ws.transact("x", () => fillShape(s.ws, s.world, s.mill, room, null, "stone"));
  assert.equal(mapView(s.ws, s.world, s.mill).shapes[0]!.texture, "stone");
  assert.equal(mapView(s.ws, s.world, s.mill).shapes[0]!.points[0], 10);
  s.ws.transact("x", () => setMapSettings(s.ws, s.world, s.mill, { grid: { kind: "square", size: 50, scale: "5 feet" } }));
  const g = mapView(s.ws, s.world, s.mill).grid;
  assert.equal(g.kind, "square");
  assert.equal(measure(g, { x: 0, y: 0 }, { x: 350, y: 0 }), "35 feet");
  assert.equal(measure({ kind: "hex", size: 100, scale: "6 miles", show: true }, { x: 0, y: 0 }, { x: 300, y: 400 }), "30 miles");
});
