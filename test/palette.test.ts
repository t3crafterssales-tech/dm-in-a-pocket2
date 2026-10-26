import { test } from "node:test";
import assert from "node:assert/strict";
import { matchCommands } from "../src/app/palette-match.ts";

const cmds = [
  { label: "New monster", words: "make create" },
  { label: "New weapon", words: "make create" },
  { label: "Go to Rulebook", words: "print book pdf" },
  { label: "Undo" },
];

test("the palette finds commands by any word in the label or its extra words", () => {
  assert.deepEqual(matchCommands(cmds, "new mon").map((c) => c.label), ["New monster"]);
  assert.deepEqual(matchCommands(cmds, "print").map((c) => c.label), ["Go to Rulebook"]);
  assert.deepEqual(matchCommands(cmds, "create").length, 2);
  assert.deepEqual(matchCommands(cmds, "zzz"), []);
  assert.equal(matchCommands(cmds, "").length, 4);
});

test("commands that start with the typed word come first", () => {
  const list = [{ label: "Go to Undo page" }, { label: "Undo" }];
  assert.equal(matchCommands(list, "undo")[0]!.label, "Undo");
});
