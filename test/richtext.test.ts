import { test } from "node:test";
import assert from "node:assert/strict";
import { RICH_FONTS, RICH_MARK, cleanRich, fromEditor, isRich, toEditable, toPlain, units } from "../src/engine/richtext.ts";

test("only a short list of tags and styles survives, whatever is pasted in", () => {
  const dirty = `<p onclick="x()">Hi <script>alert(1)</script><b>there</b> <a href="javascript:x">link</a></p><img src=x onerror=y><iframe></iframe>`;
  const clean = cleanRich(dirty);
  assert.ok(!/script|onclick|onerror|iframe|href|<img|<a /.test(clean), clean);
  assert.match(clean, /<strong>there<\/strong>/);
  assert.match(clean, /link/, "the words of a dropped tag stay");
});

test("styles are limited to colour, our fonts, sizes and alignment", () => {
  const f = RICH_FONTS[0]!.css;
  const html = `<p style="text-align:center; position:fixed; background:red"><span style="color: rgb(255, 0, 0); font-family: Georgia, 'Times New Roman', serif; font-size: 18px; behavior:url(x)">Red</span><span style="font-family: Comic Sans; font-size: 900px; color: expression(x)">no</span></p>`;
  const clean = cleanRich(html);
  assert.match(clean, /<p style="text-align: center">/);
  assert.match(clean, new RegExp(`<span style="color: #ff0000; font-family: ${f.replace(/[()']/g, "\\$&")}; font-size: 18px">Red</span>`));
  assert.ok(!/position|background|behavior|expression|Comic|900px/.test(clean), clean);
});

test("loose text gets paragraphs, unclosed tags are closed, text is escaped, and entities read right", () => {
  assert.equal(cleanRich("just words"), "<p>just words</p>");
  assert.equal(cleanRich("<p>one<strong>two"), "<p>one<strong>two</strong></p>");
  assert.equal(cleanRich("<p>1 &lt; 2 &amp; 3 &gt; 2</p>"), "<p>1 &lt; 2 &amp; 3 &gt; 2</p>");
  assert.equal(cleanRich("<p>a &lt;b&gt; c</p>"), "<p>a &lt;b&gt; c</p>");
  assert.equal(cleanRich("<p>5 &#60; 6 &nbsp;x</p>"), "<p>5 &lt; 6  x</p>");
});

test("headings, lists and alignment are blocks; lists must hold items", () => {
  const clean = cleanRich("<h1>Title</h1><ul><li>One</li><li>Two</li></ul><ol><li>First<li>Second</ol><h4>nope</h4>");
  assert.equal(clean, "<h1>Title</h1><ul><li>One</li><li>Two</li></ul><ol><li>First</li><li>Second</li></ol><p>nope</p>");
});

test("plain text stays plain: nothing formatted means nothing changes", () => {
  assert.equal(isRich("Hello"), false);
  assert.equal(toPlain("Hello\nworld"), "Hello\nworld");
  assert.equal(fromEditor("<p>Hello</p><p>world</p>"), "Hello\n\nworld");
  assert.equal(fromEditor("<p>a &amp; b</p>"), "a & b");
  assert.equal(fromEditor("<p>one<br>two</p>"), "one\ntwo");
  assert.equal(fromEditor(""), "");
  assert.equal(toEditable("One\n\nTwo"), "<p>One</p><p>Two</p>");
  assert.equal(toEditable("a < b"), "<p>a &lt; b</p>");
});

test("formatting is stored with a marker, round-trips, and reads as plain words everywhere else", () => {
  const stored = fromEditor("<h2>The Mill</h2><p>It is <strong>very</strong> old.</p><ul><li>Rats</li><li>Dust</li></ul><ol><li>Knock</li></ol>");
  assert.ok(stored.startsWith(RICH_MARK));
  assert.ok(isRich(stored));
  assert.equal(fromEditor(toEditable(stored)), stored, "opening and closing the editor changes nothing");
  assert.equal(toPlain(stored), "The Mill\n\nIt is very old.\n\n• Rats\n\n• Dust\n\n1. Knock");
  const u = units(stored);
  assert.deepEqual(u.map((x) => [x.tag, x.marker]), [["h2", null], ["p", null], ["li", "•"], ["li", "•"], ["li", "1."]]);
  assert.equal(u[1]!.html, "It is <strong>very</strong> old.");
  assert.deepEqual(units("One\nTwo").map((x) => x.plain), ["One", "Two"], "plain text: each line is a paragraph, as before");
});

test("alignment is kept per block and a heading or list is never lost to plain", () => {
  const stored = fromEditor(`<p style="text-align:center">Middle</p>`);
  assert.ok(isRich(stored), "centred text is formatting");
  assert.equal(units(stored)[0]!.align, "center");
  assert.ok(isRich(fromEditor("<h1>Big</h1>")));
  assert.ok(isRich(fromEditor("<ul><li>x</li></ul>")));
});
