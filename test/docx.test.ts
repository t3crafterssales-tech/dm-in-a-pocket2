import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Backend } from "../src/app/backend.ts";
import { pictureSize } from "../src/app/docx.ts";
import { readZip } from "../src/storage/index.ts";

/** A 3 × 2 PNG: just enough header for its size to be read. */
function png(w: number, h: number): Buffer {
  const b = Buffer.alloc(40);
  b.writeUInt32BE(0x89504e47, 0);
  b.writeUInt32BE(0x0d0a1a0a, 4);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "latin1");
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "dmip-docx-"));
  const picFile = join(dir, "ogre.png");
  writeFileSync(picFile, png(300, 200));
  const backend = new Backend({
    settingsPath: join(dir, "settings.json"),
    defaultFolder: join(dir, "DM in a Pocket"),
    machine: "home-pc",
    pickPicture: async () => picFile,
    pickFolder: async () => null,
    emit: () => {},
    timers: { set: () => 0, clear: () => {}, now: () => Date.now() },
  });
  const sys = backend.createSystem({ name: "Pocket d20", picture: null, start: "d20" });
  const world = backend.createWorld({ name: "Greyhollow & Co", picture: null, systemId: sys });
  backend.open({ type: "world", id: world });
  return { dir, backend };
}

test("the rulebook saves as a Word file with headings, stat lines, the index and the SRD credit", async () => {
  const { dir, backend } = setup();
  const ogre = backend.addBeing({ name: "Swamp <Ogre>", kind: "monster", variantOf: null });
  backend.setPicture(ogre, await backend.pickPicture());
  const file = join(dir, "book.docx");
  assert.equal(await backend.bookWord({ type: "monsters", author: "Jeff" }, file), file);

  const parts = readZip(readFileSync(file));
  for (const p of ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/_rels/document.xml.rels", "word/footer1.xml"]) assert.ok(parts.has(p), p);
  const doc = parts.get("word/document.xml")!.toString();
  assert.match(doc, /<w:pStyle w:val="Title"\/><\/w:pPr><w:r><w:t xml:space="preserve">Greyhollow &amp; Co</);
  assert.match(doc, /Created by Jeff\./);
  assert.match(doc, /Swamp &lt;Ogre&gt;/, "names are escaped");
  assert.match(doc, /w:val="Heading1"/);
  assert.match(doc, /w:val="Stats"/);
  assert.match(doc, /Creative Commons/, "the SRD credit is there because starter content is used");
  assert.match(doc, /w:val="TOC1"/, "the contents");

  // Every page reference and link points at a bookmark that exists.
  const marks = new Set([...doc.matchAll(/w:bookmarkStart w:id="\d+" w:name="([^"]+)"/g)].map((m) => m[1]));
  const refs = [...doc.matchAll(/PAGEREF (\S+)/g), ...doc.matchAll(/w:anchor="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length > 20);
  for (const r of refs) assert.ok(marks.has(r), `bookmark ${r}`);

  // The ogre's picture is packed inside, sized to keep its shape.
  const media = [...parts.keys()].filter((k) => k.startsWith("word/media/"));
  assert.equal(media.length, 1);
  assert.match(parts.get("word/_rels/document.xml.rels")!.toString(), /Target="media\/picture1\.png"/);
  const [, cx, cy] = doc.match(/<wp:extent cx="(\d+)" cy="(\d+)"/)!;
  assert.equal(Math.round((Number(cx) / Number(cy)) * 100), 150);
});

test("Save as Word does nothing when the dialog is cancelled", async () => {
  const { backend } = setup();
  assert.equal(await backend.bookWord({ type: "players" }), null);
});

test("picture sizes are read from PNG, GIF and JPEG headers; other kinds are left out", () => {
  assert.deepEqual(pictureSize(png(3, 2)), { w: 3, h: 2, ext: "png" });
  const gif = Buffer.from("GIF89a\x05\x00\x07\x00\x00\x00\x00", "latin1");
  assert.deepEqual(pictureSize(gif), { w: 5, h: 7, ext: "gif" });
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x20, 0x00, 0x40, 0x03, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(pictureSize(jpeg), { w: 64, h: 32, ext: "jpeg" });
  assert.equal(pictureSize(Buffer.from("RIFF....WEBP")), null);
});
