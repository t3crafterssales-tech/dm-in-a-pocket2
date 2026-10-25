import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Backend } from "../src/app/backend.ts";
import { allTags, cleanTags, hintsFor, matchPictures, normTag, searchPictures, suggestTags } from "../src/app/piclib.ts";
import type { PicEntry, PicIndex } from "../src/app/piclib.ts";

// A 1x1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "dmip-pics-"));
  const files: string[] = [];
  let n = 0;
  const backend = new Backend({
    settingsPath: join(dir, "settings.json"),
    defaultFolder: join(dir, "DM in a Pocket"),
    machine: "home-pc",
    pickPicture: async () => files.shift() ?? null,
    pickFolder: async () => null,
    emit: () => {},
    timers: { set: () => 0, clear: () => {}, now: () => Date.now() },
  });
  const file = (name: string, extra = "") => {
    const path = join(dir, `${name}${n++}.png`);
    writeFileSync(path, Buffer.concat([PNG, Buffer.from(extra)]));
    files.push(path);
  };
  return { backend, file };
}

test("tags are single lowercase words, and Sword, SWORD and sword are one tag", () => {
  assert.equal(normTag("  Sword "), "sword");
  assert.equal(normTag("Two words"), "two");
  assert.equal(normTag("wea!pon"), "weapon");
  assert.deepEqual(cleanTags(["Sword", "SWORD", "sword", "", 5, "Melee"]), ["sword", "melee"]);
  assert.deepEqual(cleanTags("Axe, melee ; AXE"), ["axe", "melee"]);
});

test("suggestions narrow as you type, lead with words that go with the main tag, and avoid near-duplicates", () => {
  const index: PicIndex = {
    a: { name: "A", tags: ["sword", "weapon"], style: "", favourite: false },
    b: { name: "B", tags: ["axe", "weapon", "fantasy"], style: "", favourite: false },
    c: { name: "C", tags: ["tree", "nature"], style: "", favourite: false },
  };
  assert.equal(suggestTags(index, "", "wea")[0], "weapon", "wea finds weapon before weapons gets made");
  assert.deepEqual(suggestTags(index, "sword", "").slice(0, 4), ["melee", "weapon", "blade", "fantasy"], "context first");
  assert.ok(!suggestTags(index, "sword", "", ["weapon"]).includes("weapon"), "already used tags aren't offered again");
  assert.deepEqual(allTags(index), ["axe", "fantasy", "nature", "sword", "tree", "weapon"], "the filter panel lists everything, alphabetically");
});

test("searching narrows by every ticked tag, words, style and stars", () => {
  const e = (id: string, name: string, tags: string[], style = "", favourite = false): PicEntry => ({ id, name, tags, style, favourite });
  const all = [e("1", "Oak", ["tree", "nature"], "cartoon"), e("2", "Pine", ["tree", "nature"], "gothic", true), e("3", "Rock", ["stone"], "gothic")];
  assert.deepEqual(searchPictures(all, { tags: ["tree"] }).map((x) => x.id), ["1", "2"]);
  assert.deepEqual(searchPictures(all, { tags: ["tree", "nature"], style: "Gothic" }).map((x) => x.id), ["2"]);
  assert.deepEqual(searchPictures(all, { text: "ston" }).map((x) => x.id), ["3"], "words match tags too");
  assert.deepEqual(searchPictures(all, { favourites: true }).map((x) => x.id), ["2"]);
});

test("a new thing matches a picture by its name's words first, then what it is filed as", () => {
  const e = (id: string, name: string, tags: string[]): PicEntry => ({ id, name, tags, style: "", favourite: false });
  const all = [e("g", "Goblin token", ["goblin", "monster"]), e("m", "Generic monster", ["monster"]), e("s", "Short sword", ["sword", "weapon"])];
  assert.deepEqual(matchPictures(all, hintsFor("Goblin Chief", "monster")).map((x) => x.id), ["g"]);
  assert.deepEqual(matchPictures(all, hintsFor("Mud Thing", "monster")).map((x) => x.id), ["m"], "falls back to what it is");
  assert.deepEqual(matchPictures(all, hintsFor("Swords of Doom", "weapon")).map((x) => x.id), ["s"], "plurals match");
  assert.deepEqual(matchPictures(all, hintsFor("Zzz", "table")), [], "nothing fits, nothing chosen");
});

test("importing stores a picture once with its tags, and later changes keep it in the library", async () => {
  const { backend, file } = setup();
  file("goblin");
  const id = (await backend.importPictureTagged({ name: "Goblin scout", tags: ["Goblin", "monster", "GOBLIN"], style: "cartoon" }))!;
  assert.ok(id);
  const lib = backend.pictureLibrary();
  assert.equal(lib.length, 1);
  assert.deepEqual(lib[0], { id, name: "Goblin scout", tags: ["goblin", "monster"], style: "cartoon", favourite: false });
  // The same file again is the same picture: stored once, tags added.
  file("goblin2");
  const again = await backend.importPictureTagged({ name: "", tags: ["boss"], style: "" });
  assert.equal(again, id);
  assert.deepEqual(backend.pictureLibrary()[0]!.tags, ["boss", "goblin", "monster"]);
  const starred = backend.tagPicture(id, { favourite: true, tags: ["Goblin", "Fighter"] });
  assert.deepEqual([starred.favourite, starred.tags], [true, ["goblin", "fighter"]]);
  assert.deepEqual(backend.pictureTags("goblin", "fi").suggested, ["fighter"]);
  assert.throws(() => backend.tagPicture("nope.png", {}), /isn't in the library/);
});

test("new things get a fitting picture in the same undo step, unless the setting is off", async () => {
  const { backend, file } = setup();
  const sys = backend.createSystem({ name: "d20 Basic", picture: null, start: "d20" });
  const world = backend.createWorld({ name: "Greyhollow", picture: null, systemId: sys });
  backend.open({ type: "world", id: world });
  file("goblin");
  const pic = (await backend.importPictureTagged({ name: "Goblin", tags: ["goblin", "monster"], style: "" }))!;
  const steps = backend.history().done.length;
  const g = backend.newInSection("monsters", "Goblin Boss");
  assert.equal(backend.history().done.length, steps + 1, "the picture isn't an extra step");
  assert.equal(backend.node(g).picture, pic);
  const other = backend.newInSection("monsters", "Ogre");
  assert.equal(backend.node(other).picture, pic, "falls back to the main tag of what it's filed as");
  assert.equal(backend.setAutoPictures(false).autoPictures, false);
  const plain = backend.newInSection("monsters", "Goblin Again");
  assert.equal(backend.node(plain).picture, null, "off means new nodes start with no picture");
});

test("library pictures draw on a map as stamps and floors, with data addresses for export", async () => {
  const { mapSvg, mapPictureIds } = await import("../src/ui/map-render.ts");
  const shape = (extra: object) => ({ id: "s", layer: "drawing", tool: "stamp", points: [100, 100], color: "#000", width: 2, fill: null, texture: null, stamp: null, text: null, size: 50, ...extra });
  const v = { id: "m", name: "M", text: "", picture: null, width: 400, height: 300, background: "#fff", grid: { kind: "square", size: 50, scale: "5 feet", show: true }, pins: [], shapes: [shape({ stamp: "pic:tree1.png" }), shape({ id: "f", tool: "fill", points: [0, 0, 400, 300], texture: "pic:grass2.png", stamp: null })], inside: [] };
  assert.deepEqual(mapPictureIds(v as never).sort(), ["grass2.png", "tree1.png"]);
  const live = mapSvg(v as never, { pictureHref: null });
  assert.match(live, /<image href="dmpic:\/\/pic\/tree1\.png"/);
  assert.match(live, /<pattern id="tx-pic_grass2_png"/);
  assert.match(live, /fill="url\(#tx-pic_grass2_png\)"/);
  const exported = mapSvg(v as never, { pictureHref: null, pictureHrefs: { "tree1.png": "data:image/png;base64,AAAA", "grass2.png": "data:image/png;base64,BBBB" } });
  assert.match(exported, /href="data:image\/png;base64,AAAA"/);
  assert.ok(!exported.includes("dmpic://"), "an export carries its pictures inside it");
});
