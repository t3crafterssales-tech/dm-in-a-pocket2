// "Create from a document I wrote": reads the user's own text (a .txt, .md or Word .docx file)
// and cuts it into parts small enough for one AI job each, at paragraph breaks.

import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { readZip } from "../../storage/index.ts";

export const DOCUMENT_TYPES = [".txt", ".md", ".docx"];
const MAX_BYTES = 20 * 1024 * 1024;

export class DocumentError extends Error {}

/** The words of a Word file: each paragraph on its own line. */
export function docxText(bytes: Buffer): string {
  let xml: string;
  try {
    const doc = readZip(bytes).get("word/document.xml");
    if (!doc) throw new Error("no document");
    xml = doc.toString("utf8");
  } catch {
    throw new DocumentError("That Word file couldn't be read. Try saving it again, or as plain text.");
  }
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:instrText[^>]*>[\s\S]*?<\/w:instrText>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function readDocument(path: string): { name: string; text: string } {
  const ext = extname(path).toLowerCase();
  if (!DOCUMENT_TYPES.includes(ext)) throw new DocumentError("The app reads plain text (.txt, .md) and Word (.docx) files. Save a PDF as one of those first.");
  const bytes = readFileSync(path);
  if (bytes.length > MAX_BYTES) throw new DocumentError("That file is very large. Split it into smaller files first.");
  const text = ext === ".docx" ? docxText(bytes) : bytes.toString("utf8").replace(/\r\n/g, "\n").trim();
  if (!text) throw new DocumentError("That file has no words in it.");
  return { name: basename(path, ext), text };
}

/** Cuts text into parts of at most about `size` characters, never in the middle of a paragraph. */
export function splitDocument(text: string, size = 12000): string[] {
  const parts: string[] = [];
  let cur = "";
  for (const para of text.split(/\n(?=\s*\S)/)) {
    // A single paragraph longer than a part is cut at sentence ends.
    const pieces = para.length > size ? para.match(new RegExp(`[\\s\\S]{1,${size}}(?=[.!?]\\s|$)|[\\s\\S]{1,${size}}`, "g")) ?? [para] : [para];
    for (const p of pieces) {
      if (cur && cur.length + p.length + 1 > size) {
        parts.push(cur.trim());
        cur = "";
      }
      cur += (cur ? "\n" : "") + p;
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}
