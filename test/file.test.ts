import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FORMAT_VERSION, OpenError, SAVING_SUFFIX, Workspace, openFile, redFlags, saveFile } from "../src/engine/index.ts";
import { makeFixture } from "./fixtures.ts";

const dir = () => mkdtempSync(join(tmpdir(), "dmip-"));

test("save and reopen: everything comes back, including undo history", () => {
  const f = makeFixture();
  f.ws.delete(f.sys, f.str);
  const path = join(dir(), "greyhollow.dmip");
  saveFile(path, f.ws.toFile());
  const opened = openFile(path);
  assert.equal(opened.readOnly, false);
  const ws = Workspace.fromFile(opened.data);
  assert.equal(redFlags(ws, f.world).length, 1);
  ws.undo();
  assert.equal(redFlags(ws, f.world).length, 0, "tomorrow's undo can reach yesterday");
});

test("the power going out in the middle of a save never loses the last good save", () => {
  const f = makeFixture();
  const path = join(dir(), "world.dmip");
  saveFile(path, f.ws.toFile());
  const good = readFileSync(path, "utf8");
  f.ws.setField(f.world, f.goblin, "hp", 99);
  assert.throws(() =>
    saveFile(path, f.ws.toFile(), {
      beforeSwap: () => {
        throw new Error("power cut");
      },
    }),
  );
  assert.equal(readFileSync(path, "utf8"), good, "the main file is untouched");
  const opened = openFile(path);
  assert.equal(opened.recovered, true);
  assert.equal(existsSync(path + SAVING_SUFFIX), false, "the half-finished save was cleared away");
});

test("a half-written save file is ignored and the last whole save opens", () => {
  const f = makeFixture();
  const path = join(dir(), "world.dmip");
  saveFile(path, f.ws.toFile());
  writeFileSync(path + SAVING_SUFFIX, '{"format":1,"layers":[{"id"');
  const opened = openFile(path);
  assert.equal(opened.recovered, true);
  assert.equal(Workspace.fromFile(opened.data).get(f.world, f.goblin)!.name, "Goblin");
});

test("a file made by a newer version opens read-only", () => {
  const path = join(dir(), "future.dmip");
  writeFileSync(path, JSON.stringify({ format: FORMAT_VERSION + 1, app: "9.0.0", layers: [], bin: [], history: [], redo: [] }));
  assert.equal(openFile(path).readOnly, true);
});

test("a damaged file gives a clear message instead of crashing", () => {
  const path = join(dir(), "broken.dmip");
  writeFileSync(path, "not a world");
  assert.throws(() => openFile(path), OpenError);
});
