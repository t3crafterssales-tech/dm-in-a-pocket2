import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Backend } from "../src/app/backend.ts";
import { DUCK, UNDERNEATH, cleanButtons, gainFor, guessCategory, soundName, soundPack } from "../src/app/sounds.ts";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "dmip-sounds-"));
  const picks: string[][] = [];
  const backend = new Backend({
    settingsPath: join(dir, "settings.json"),
    defaultFolder: join(dir, "DM in a Pocket"),
    machine: "home-pc",
    pickPicture: async () => null,
    pickSounds: async () => picks.shift() ?? [],
    pickFolder: async () => null,
    emit: () => {},
    timers: { set: () => 0, clear: () => {}, now: () => Date.now() },
  });
  const sys = backend.createSystem({ name: "d20 Basic", picture: null, start: "d20" });
  const world = backend.createWorld({ name: "Greyhollow", picture: null, systemId: sys });
  backend.open({ type: "world", id: world });
  return { backend, dir, picks };
}

test("the category is a behaviour: voice ducks the others, ambience sits underneath, music ducks nothing", () => {
  assert.equal(gainFor("music", []), 1);
  assert.equal(gainFor("ambience", []), UNDERNEATH);
  assert.equal(gainFor("music", ["music", "ambience"]), 1, "music ducks nothing, and nothing ducks it but a voice");
  assert.equal(gainFor("music", ["voice"]), DUCK);
  assert.equal(gainFor("ambience", ["voice"]), UNDERNEATH * DUCK);
  assert.equal(gainFor("voice", ["voice", "music"]), 1, "a voice is never turned down");
});

test("a first guess at a category comes from the folder and file name, and names read plainly", () => {
  assert.equal(guessCategory("Rain on a roof.mp3"), "ambience");
  assert.equal(guessCategory("Narrator/intro.wav"), "voice");
  assert.equal(guessCategory("Battle theme.ogg"), "music");
  assert.equal(soundName("Packs/Tavern Pack/old_crowd-loop.mp3"), "old crowd loop");
  assert.equal(soundPack("Packs/Tavern Pack/old_crowd-loop.mp3"), "Packs/Tavern Pack");
  assert.equal(soundPack("a.mp3"), "");
});

test("buttons from a file are cleaned: no duplicates, no junk", () => {
  assert.deepEqual(cleanButtons([{ id: "a", label: " Rain ", sound: "rain.mp3", loop: true }, { id: "a", label: "again" }, { label: "no id" }, 5, null, { id: "b", label: 7 }]), [
    { id: "a", label: "Rain", sound: "rain.mp3", loop: true },
    { id: "b", label: "", sound: "", loop: false },
  ]);
  assert.deepEqual(cleanButtons("nonsense"), []);
});

test("sounds are copied into the Sounds folder, never overwritten, and only real sound files are taken", async () => {
  const { backend, dir, picks } = setup();
  const src = join(dir, "My Rain.mp3");
  writeFileSync(src, "not really audio");
  picks.push([src]);
  assert.deepEqual(await backend.addSounds(), ["My Rain.mp3"]);
  assert.ok(existsSync(join(backend.soundsFolder(), "My Rain.mp3")));
  picks.push([src]);
  assert.deepEqual(await backend.addSounds(), ["My Rain 2.mp3"], "a second copy gets its own name");
  assert.equal(backend.addSoundData("../../evil name.ogg", new Uint8Array([1, 2, 3])), "evil name.ogg", "a dropped file can't escape the folder");
  assert.throws(() => backend.addSoundData("notes.txt", new Uint8Array(1)), /MP3, WAV, OGG or M4A/);
  // Files dropped in by hand in Windows show up, folders are packs.
  mkdirSync(join(backend.soundsFolder(), "Tavern Pack"));
  writeFileSync(join(backend.soundsFolder(), "Tavern Pack", "crowd.mp3"), "x");
  const lib = backend.soundLibrary();
  assert.deepEqual(lib.map((s) => s.id), ["evil name.ogg", "My Rain 2.mp3", "My Rain.mp3", "Tavern Pack/crowd.mp3"]);
  assert.equal(lib.find((s) => s.id === "Tavern Pack/crowd.mp3")!.pack, "Tavern Pack");
  assert.equal(lib.find((s) => s.id === "Tavern Pack/crowd.mp3")!.category, "ambience", "guessed from the name");
  assert.equal(backend.setSoundCategory("Tavern Pack/crowd.mp3", "music").category, "music");
  assert.equal(backend.soundLibrary().find((s) => s.id === "Tavern Pack/crowd.mp3")!.category, "music", "the choice sticks");
  assert.throws(() => backend.setSoundCategory("nope.mp3", "voice"), /isn't in the Sounds folder/);
  assert.equal(backend.sound("Tavern Pack/crowd.mp3")!.toString(), "x");
  assert.equal(backend.sound("../settings.json"), null, "only the Sounds folder can be read");
});

test("buttons are separate from sounds, several can share a file, and every change is one undo step", () => {
  const { backend } = setup();
  const steps = () => backend.history().done.length;
  const before = steps();
  const a = backend.addSoundButton("Rain", "rain.mp3", true);
  const b = backend.addSoundButton("", "rain.mp3");
  assert.equal(steps(), before + 2);
  assert.deepEqual(backend.soundButtons().map((x) => [x.label, x.sound, x.loop]), [["Rain", "rain.mp3", true], ["2", "rain.mp3", false]], "an empty name becomes a number");
  backend.setSoundButton(b, { label: "Drip", loop: true });
  assert.equal(backend.soundButtons()[1]!.label, "Drip");
  backend.removeSoundButton(a);
  assert.equal(backend.soundButtons().length, 1);
  backend.undo();
  assert.equal(backend.soundButtons().length, 2, "a deleted button comes back");
  assert.throws(() => backend.setSoundButton("nope", { label: "x" }), /isn't here/);
});

test("Erase all buttons clears the buttons, never the files, and Ctrl+Z brings them back", async () => {
  const { backend } = setup();
  backend.addSoundData("a.mp3", new Uint8Array([1]));
  backend.addSoundButton("A", "a.mp3");
  backend.addSoundButton("B", "a.mp3");
  assert.equal(backend.eraseSoundButtons(), 2);
  assert.deepEqual(backend.soundButtons(), []);
  assert.equal(backend.soundLibrary().length, 1, "the file stays");
  assert.equal(backend.eraseSoundButtons(), 0, "nothing to erase is no step");
  backend.undo();
  assert.equal(backend.soundButtons().length, 2);
  backend.redo();
  assert.equal(backend.soundButtons().length, 0);
});

test("the soundboard never shows up as a layout in the Codex or on the rulebook list", () => {
  const { backend } = setup();
  backend.addSoundButton("A", "a.mp3");
  const layouts = backend.codex().find((s) => s.key === "layouts")!;
  assert.equal(layouts.entries.length, 0);
});

test("floating buttons live in the table's memory, apart from the home buttons", () => {
  const { backend } = setup();
  const a = backend.addSoundButton("A", "a.mp3");
  backend.setTableMeta({ soundFloats: [{ id: "f1", button: a, x: 10, y: 20 }] });
  assert.equal(backend.tableMeta().soundFloats.length, 1);
  backend.setTableMeta({ soundFloats: [] });
  assert.equal(backend.soundButtons().length, 1, "taking it off the screen leaves the home copy");
});
