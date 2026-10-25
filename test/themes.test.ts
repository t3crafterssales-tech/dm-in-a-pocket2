import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SettingsFile } from "../src/app/settings.ts";
import { THEMES, TEXT_SIZES, accentInk, contrast, isDark, statusColours, textSizeFor, themeFor, themeVariables } from "../src/app/themes.ts";

test("six themes ship, each with five colours, and the default is first", () => {
  assert.deepEqual(THEMES.map((t) => t.id), ["default", "parchment", "ink", "ember", "steel", "verdant"]);
  for (const t of THEMES) for (const k of ["background", "panel", "text", "accent", "border"] as const) assert.match(t[k], /^#[0-9a-f]{6}$/, `${t.id} ${k}`);
});

test("on every theme the text is comfortable to read on the background and the panel", () => {
  for (const t of THEMES) {
    assert.ok(contrast(t.text, t.background) >= 7, `${t.id}: text on background`);
    assert.ok(contrast(t.text, t.panel) >= 7, `${t.id}: text on panel`);
    assert.ok(contrast(accentInk(t.accent), t.accent) >= 4.5, `${t.id}: writing on the accent`);
    const s = statusColours(t);
    for (const [name, c] of Object.entries(s)) assert.ok(contrast(c, t.panel) >= 3, `${t.id}: ${name} on the panel`);
  }
});

test("Ink is pure black and white, and the dark themes are dark", () => {
  const ink = themeFor("ink");
  assert.deepEqual([ink.background, ink.text], ["#ffffff", "#000000"]);
  assert.deepEqual(THEMES.filter(isDark).map((t) => t.id), ["ember", "steel", "verdant"]);
});

test("a theme becomes the window's values, and anything unknown is the default", () => {
  assert.equal(themeFor("nonsense").id, "default");
  assert.equal(themeFor(undefined).id, "default");
  const v = themeVariables(themeFor("ember"));
  assert.equal(v["--paper"], "#1b1311");
  assert.equal(v["--ink"], "#f1e4dc");
  assert.deepEqual(TEXT_SIZES.map((s) => s.id), ["small", "normal", "large"]);
  assert.equal(textSizeFor("huge"), "normal");
  assert.equal(textSizeFor("large"), "large");
});

test("the chosen look is kept between sessions, and damaged settings fall back safely", () => {
  const dir = mkdtempSync(join(tmpdir(), "dmip-look-"));
  const path = join(dir, "settings.json");
  const a = new SettingsFile(path);
  assert.deepEqual([a.data.theme, a.data.textSize], ["default", "normal"]);
  a.update((s) => ((s.theme = "verdant"), (s.textSize = "large")));
  const b = new SettingsFile(path);
  assert.deepEqual([b.data.theme, b.data.textSize], ["verdant", "large"]);
  writeFileSync(path, JSON.stringify({ theme: "gone", textSize: 99 }));
  const c = new SettingsFile(path);
  assert.deepEqual([c.data.theme, c.data.textSize], ["default", "normal"]);
});
