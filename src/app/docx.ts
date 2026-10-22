// The rulebook as a Word file (.docx), so people can change the layout themselves. A .docx is a
// ZIP of a few XML parts; this writes the smallest set Word, LibreOffice and Google Docs all open.
// Headings use Word's own Heading styles, so the navigation pane works, and every entry is a
// bookmark: the contents, the index and "See Poisoned (page 42)" are page-number fields.

import { writeZip } from "../storage/index.ts";
import type { BookData } from "./editing.ts";

type Entry = BookData["book"]["chapters"][number]["entries"][number];

const esc = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const run = (text: string, props = "") => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
const para = (style: string | null, inner: string, extra = "") => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${extra}</w:pPr>${inner}</w:p>`;
const pageBreak = `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
/** A field such as PAGEREF; `shown` is what appears until Word updates it. */
const field = (code: string, shown: string) =>
  `<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> ${code} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${run(shown)}<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
const link = (anchor: string, text: string) => `<w:hyperlink w:anchor="${anchor}" w:history="1">${run(text, `<w:rStyle w:val="Hyperlink"/>`)}</w:hyperlink>`;

/** Bookmark names must start with a letter and stay under 40 characters. */
function anchors() {
  const names = new Map<string, string>();
  return (key: string) => {
    let a = names.get(key);
    if (!a) names.set(key, (a = `n${names.size + 1}`));
    return a;
  };
}

/** Width and height of a PNG, JPEG or GIF, or null for anything Word may not show. */
export function pictureSize(b: Buffer): { w: number; h: number; ext: "png" | "jpeg" | "gif" } | null {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), ext: "png" };
  if (b.length > 10 && b.toString("latin1", 0, 3) === "GIF") return { w: b.readUInt16LE(6), h: b.readUInt16LE(8), ext: "gif" };
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1]!;
      const len = b.readUInt16BE(i + 2);
      // Start-of-frame markers hold the size (not DHT, JPG or DAC, which share the range).
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5), ext: "jpeg" };
      i += 2 + len;
    }
  }
  return null;
}

const PAGE = { Letter: { w: 12240, h: 15840 }, A4: { w: 11906, h: 16838 } };
const EMU_PER_INCH = 914400;

export function bookDocx(data: BookData, readPicture: (id: string) => Buffer | null): Buffer {
  const book = data.book;
  const anchor = anchors();
  const printed = new Set(book.index.map((i) => i.node));
  const media: { name: string; data: Buffer; rel: string }[] = [];
  const mediaFor = new Map<string, { rel: string; w: number; h: number } | null>();
  let bookmarkId = 0;
  let drawings = 0;
  const bookmark = (name: string, inner: string) => {
    const id = bookmarkId++;
    return `<w:bookmarkStart w:id="${id}" w:name="${name}"/>${inner}<w:bookmarkEnd w:id="${id}"/>`;
  };

  const picture = (id: string): string => {
    if (!mediaFor.has(id)) {
      const bytes = readPicture(id);
      const size = bytes ? pictureSize(bytes) : null;
      if (!bytes || !size || !size.w || !size.h) mediaFor.set(id, null);
      else {
        const rel = `rPic${media.length + 1}`;
        media.push({ name: `word/media/picture${media.length + 1}.${size.ext}`, data: bytes, rel });
        mediaFor.set(id, { rel, w: size.w, h: size.h });
      }
    }
    const m = mediaFor.get(id);
    if (!m) return "";
    // Up to 2 inches wide or 2.5 inches tall, keeping its shape.
    const scale = Math.min((2 * EMU_PER_INCH) / m.w, (2.5 * EMU_PER_INCH) / m.h);
    const cx = Math.round(m.w * scale);
    const cy = Math.round(m.h * scale);
    const n = ++drawings;
    return para(
      null,
      `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Picture ${n}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="Picture ${n}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${m.rel}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`,
    );
  };

  const entry = (e: Entry, depth: number): string => {
    let out = para(depth ? "Heading3" : "Heading2", bookmark(anchor(e.node), run(e.title)), `<w:keepNext/>`);
    if (e.picture) out += picture(e.picture);
    if (e.readAloud) for (const p of e.readAloud.split(/\n+/).filter((x) => x.trim())) out += para("ReadAloud", run(p.trim()));
    if (e.stats) out += para("Stats", run(e.stats));
    for (const p of e.paragraphs) out += para(null, run(p));
    const seen = e.mentions.filter((m) => data.names[m] && m !== e.node && printed.has(m));
    if (seen.length) {
      let inner = run("See ");
      seen.forEach((m, i) => {
        if (i) inner += run(i === seen.length - 1 ? " and " : ", ");
        inner += link(anchor(m), data.names[m]!) + run(" (page ") + field(`PAGEREF ${anchor(m)} \\h`, "?") + run(")");
      });
      out += para("See", inner + run("."));
    }
    return out + e.variants.map((v) => entry(v, depth + 1)).join("");
  };

  let body = "";
  // Cover (unless a front page is the cover), then the front pages' words, one page each.
  const made = book.credits.find((c) => c.startsWith("Created by"));
  if (data.plainCover !== false) {
    body += para("Title", run(book.title));
    body += para("Subtitle", run(book.subtitle));
    if (made) body += para("Subtitle", run(made));
    body += pageBreak;
  }
  for (const f of data.front ?? []) {
    for (const b of [...f.blocks].sort((x, y) => x.y - y.y || x.x - y.x)) if (b.type === "text" && b.text.trim()) for (const p of b.text.split(/\n\s*\n/)) body += para(null, run(p.trim()));
    body += pageBreak;
  }

  // Contents: each line is a link plus a page-number field, which every word processor fills in.
  const tocLine = (style: string, key: string, title: string) => para(style, link(anchor(key), title) + `<w:r><w:tab/></w:r>` + field(`PAGEREF ${anchor(key)} \\h`, "?"));
  if (data.contents !== false) {
    body += para("TOCHeading", run("Contents"));
    for (const c of book.chapters) {
      body += tocLine("TOC1", `c-${c.id}`, c.title);
      for (const e of c.entries) body += tocLine("TOC2", e.node, e.title);
    }
  }

  for (const c of book.chapters) {
    body += pageBreak;
    body += para("Heading1", bookmark(anchor(`c-${c.id}`), run(c.title)));
    for (const p of (c.text ?? "").split(/\n\s*\n/).filter((x) => x.trim())) body += para(null, run(p.trim()));
    for (const e of c.entries) body += entry(e, 0);
  }

  if (book.index.length) {
    body += pageBreak + para("Heading1", run("Index"));
    for (const i of book.index) body += para("IndexLine", link(anchor(i.node), i.term) + `<w:r><w:tab/></w:r>` + field(`PAGEREF ${anchor(i.node)} \\h`, "?"));
  }
  const credits = book.credits.filter((c) => !c.startsWith("Created by"));
  if (credits.length || made) {
    body += para("Heading2", run("Credits"));
    if (made) body += para(null, run(made));
    for (const c of credits) body += para(null, run(c));
  }

  const size = PAGE[data.pageSize] ?? PAGE.Letter;
  const NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${NS}><w:body>${body}<w:sectPr><w:footerReference w:type="default" r:id="rFooter"/><w:pgSz w:w="${size.w}" w:h="${size.h}"/><w:pgMar w:top="1260" w:right="1260" w:bottom="1260" w:left="1260" w:header="708" w:footer="600" w:gutter="0"/><w:titlePg/></w:sectPr></w:body></w:document>`;

  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:ftr ${NS}><w:p><w:pPr><w:jc w:val="center"/></w:pPr>${field("PAGE", "1")}</w:p></w:ftr>`;

  const heading = (id: string, name: string, size: number, level: number, before: number, extra = "") =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${before}" w:after="120"/><w:outlineLvl w:val="${level}"/></w:pPr><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:b/><w:color w:val="7A1F1F"/><w:sz w:val="${size}"/>${extra}</w:rPr></w:style>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:eastAsia="Georgia" w:cs="Georgia"/><w:sz w:val="21"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="3600" w:after="240"/><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:color w:val="7A1F1F"/><w:sz w:val="72"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:i/><w:sz w:val="32"/></w:rPr></w:style>
${heading("Heading1", "heading 1", 40, 0, 0, `<w:smallCaps/>`)}
${heading("Heading2", "heading 2", 28, 1, 300)}
${heading("Heading3", "heading 3", 24, 2, 200, `<w:i/>`)}
<w:style w:type="paragraph" w:styleId="TOCHeading"><w:name w:val="TOC Heading"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:color w:val="7A1F1F"/><w:sz w:val="40"/><w:smallCaps/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9710"/></w:tabs><w:spacing w:after="60"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TOC2"><w:name w:val="toc 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9710"/></w:tabs><w:spacing w:after="40"/><w:ind w:left="240"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Stats"><w:name w:val="Stat line"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:top w:val="single" w:sz="6" w:space="2" w:color="7A1F1F"/><w:bottom w:val="single" w:sz="6" w:space="2" w:color="7A1F1F"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="F4ECDD"/></w:pPr><w:rPr><w:b/><w:sz w:val="19"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ReadAloud"><w:name w:val="Read aloud"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="6" w:color="7A1F1F"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="F4ECDD"/><w:spacing w:after="0"/><w:ind w:left="160"/></w:pPr><w:rPr><w:i/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="See"><w:name w:val="See also"/><w:basedOn w:val="Normal"/><w:rPr><w:i/><w:sz w:val="19"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="IndexLine"><w:name w:val="Index line"/><w:basedOn w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9710"/></w:tabs><w:spacing w:after="20"/></w:pPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="000000"/></w:rPr></w:style>
</w:styles>`;

  // Word asks once to update the fields, which fills in the contents and page numbers.
  const settings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:updateFields w:val="true"/><w:defaultTabStop w:val="720"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;

  const rel = (id: string, type: string, target: string) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`;
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel("rStyles", "styles", "styles.xml")}${rel("rSettings", "settings", "settings.xml")}${rel("rFooter", "footer", "footer1.xml")}${media.map((m) => rel(m.rel, "image", m.name.slice(5))).join("")}</Relationships>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel("rDoc", "officeDocument", "word/document.xml")}<Relationship Id="rCore" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(`${book.title}: ${book.subtitle}`)}</dc:title>${made ? `<dc:creator>${esc(made.replace(/^Created by\s*/, "").replace(/\.$/, ""))}</dc:creator>` : ""}</cp:coreProperties>`;
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;

  const B = (s: string) => Buffer.from(s, "utf8");
  return writeZip([
    { name: "[Content_Types].xml", data: B(types) },
    { name: "_rels/.rels", data: B(rootRels) },
    { name: "docProps/core.xml", data: B(core) },
    { name: "word/document.xml", data: B(document) },
    { name: "word/styles.xml", data: B(styles) },
    { name: "word/settings.xml", data: B(settings) },
    { name: "word/footer1.xml", data: B(footer) },
    { name: "word/_rels/document.xml.rels", data: B(docRels) },
    ...media.map((m) => ({ name: m.name, data: m.data })),
  ]);
}
