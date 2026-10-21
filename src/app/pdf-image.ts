// A small PDF writer for pictures (version 2): each page is one JPEG fitted to the page, used to
// export maps, and by the print shop. Nothing to install; a PDF is plain text plus the pictures.

import { pictureSize } from "./docx.ts";

export type PageSize = "Letter" | "A4";

const SIZES: Record<PageSize, [number, number]> = { Letter: [612, 792], A4: [595.28, 841.89] };

/**
 * One page per JPEG. Each page turns sideways when the picture is wider than tall, and the
 * picture is fitted inside half-inch margins, keeping its shape.
 */
export function imagesPdf(jpegs: Buffer[], size: PageSize = "Letter", margin = 36): Buffer {
  const objects: (string | Buffer)[] = [];
  const add = (o: string | Buffer) => (objects.push(o), objects.length);
  const catalog = add("");
  const pagesObj = add("");
  const pageIds: number[] = [];
  for (const jpeg of jpegs) {
    const dim = pictureSize(jpeg);
    if (!dim || dim.ext !== "jpeg") throw new Error("Only JPEG pictures can go into this PDF.");
    let [pw, ph] = SIZES[size];
    if (dim.w > dim.h) [pw, ph] = [ph, pw];
    const scale = Math.min((pw - 2 * margin) / dim.w, (ph - 2 * margin) / dim.h);
    const w = dim.w * scale;
    const hgt = dim.h * scale;
    const x = (pw - w) / 2;
    const y = (ph - hgt) / 2;
    const img = add(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${dim.w} /Height ${dim.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, "latin1"), jpeg, Buffer.from("\nendstream", "latin1")]));
    const content = `q ${w.toFixed(2)} 0 0 ${hgt.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`;
    const contentObj = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${pw.toFixed(2)} ${ph.toFixed(2)}] /Resources << /XObject << /Im0 ${img} 0 R >> >> /Contents ${contentObj} 0 R >>`));
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${pageIds.map((p) => `${p} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1")];
  let offset = parts[0]!.length;
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(offset);
    const body = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, "latin1"), typeof o === "string" ? Buffer.from(o, "latin1") : o, Buffer.from("\nendobj\n", "latin1")]);
    parts.push(body);
    offset += body.length;
  });
  const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)].join("");
  parts.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${offset}\n%%EOF\n`, "latin1"));
  return Buffer.concat(parts);
}
