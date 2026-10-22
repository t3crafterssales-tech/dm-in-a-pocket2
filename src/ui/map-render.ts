// Draws a map as SVG (version 2): the picture, fills, drawings, stamps, the grid, labels, DM notes
// and pins, in that order. The same drawing is used by the map editor, map export (PNG and PDF)
// and the adventure booklet, so they always match. Pure: no calls to the back end.

import type { MapView, Shape } from "../app/backend.ts";

export interface MapShow {
  grid: boolean;
  pins: boolean;
  labels: boolean;
  dm: boolean;
  drawing: boolean;
}

export const SHOW_ALL: MapShow = { grid: true, pins: true, labels: true, dm: true, drawing: true };

export const PIN_GLYPH: Record<string, string> = { house: "🏠", dragon: "🐉", sword: "⚔️", scroll: "📜", map: "🗺️", person: "👤", flag: "🚩", star: "★", skull: "💀", chest: "🧰", tree: "🌲", door: "🚪" };
export const PIN_NAMES: Record<string, string> = { house: "House", dragon: "Monster", sword: "Weapon or item", scroll: "Scroll", map: "Map", person: "Person", flag: "Flag", star: "Star", skull: "Danger", chest: "Treasure", tree: "Tree", door: "Door" };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Textures for Fill, drawn as small repeating tiles. */
function textureDefs(): string {
  return `
  <pattern id="tx-grass" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="#8fb36a"/><path d="M4 18l2-6M10 20l1-7M17 17l2-6M20 22l1-4" stroke="#5f8a3e" stroke-width="1.6" stroke-linecap="round"/></pattern>
  <pattern id="tx-water" width="40" height="20" patternUnits="userSpaceOnUse"><rect width="40" height="20" fill="#7fb0d6"/><path d="M0 10q5-5 10 0t10 0 10 0 10 0" fill="none" stroke="#cfe5f5" stroke-width="1.6"/></pattern>
  <pattern id="tx-stone" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="#b9b3a8"/><path d="M0 20h40M20 0v20M10 20v20M30 20v20" stroke="#8f887c" stroke-width="1.5"/></pattern>
  <pattern id="tx-wood" width="60" height="16" patternUnits="userSpaceOnUse"><rect width="60" height="16" fill="#b9874f"/><path d="M0 16h60M42 0v16" stroke="#8a5d2c" stroke-width="1.5"/><path d="M8 6q8 2 16 0" stroke="#a0713c" fill="none"/></pattern>
  <pattern id="tx-sand" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="#e3cf98"/><circle cx="5" cy="6" r="1" fill="#c6ae6e"/><circle cx="14" cy="13" r="1" fill="#c6ae6e"/><circle cx="9" cy="17" r=".8" fill="#c6ae6e"/></pattern>
  <pattern id="tx-lava" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="#b8321c"/><path d="M0 15q10 8 20 0t20 0M0 35q10-8 20 0t20 0" stroke="#f2a33a" stroke-width="3" fill="none"/></pattern>`;
}

function gridDefs(v: MapView): string {
  const g = v.grid;
  if (g.kind === "square") return `<pattern id="grid-pat" width="${g.size}" height="${g.size}" patternUnits="userSpaceOnUse"><path d="M ${g.size} 0 L 0 0 0 ${g.size}" fill="none" stroke="rgba(30,25,20,.35)" stroke-width="1"/></pattern>`;
  if (g.kind === "hex") {
    // Flat-topped hexes, size across the corners: columns 1.5 radii apart, every other one
    // shifted down half a hex. One tile holds a whole column and the halves around it.
    const r = g.size / 2;
    const h = Math.sqrt(3) * r;
    const hex = (cx: number, cy: number) => `<polygon points="${Array.from({ length: 6 }, (_, i) => `${(cx + r * Math.cos((Math.PI / 3) * i)).toFixed(1)},${(cy + r * Math.sin((Math.PI / 3) * i)).toFixed(1)}`).join(" ")}" fill="none" stroke="rgba(30,25,20,.35)" stroke-width="1"/>`;
    return `<pattern id="grid-pat" width="${(3 * r).toFixed(2)}" height="${h.toFixed(2)}" patternUnits="userSpaceOnUse">${hex(r, h / 2)}${hex(2.5 * r, 0)}${hex(2.5 * r, h)}${hex(-0.5 * r, 0)}${hex(-0.5 * r, h)}</pattern>`;
  }
  return "";
}

/** A stamp at x, y, size units across. */
export function stampSvg(kind: string, x: number, y: number, size: number, color: string): string {
  const s = size / 2;
  const at = `transform="translate(${x} ${y})"`;
  const c = esc(color);
  switch (kind) {
    case "door":
      return `<g ${at}><rect x="${-s}" y="${-s / 4}" width="${size}" height="${s / 2}" fill="#9a6a3a" stroke="${c}" stroke-width="2"/><path d="M${-s} ${-s / 4} A ${size} ${size} 0 0 1 ${s} ${-s / 4}" fill="none" stroke="${c}" stroke-width="1" stroke-dasharray="3 3"/></g>`;
    case "stairs":
      return `<g ${at}><rect x="${-s}" y="${-s}" width="${size}" height="${size}" fill="#e8dfcd" stroke="${c}" stroke-width="2"/>${Array.from({ length: 5 }, (_, i) => `<line x1="${-s}" x2="${s}" y1="${-s + ((i + 1) * size) / 6}" y2="${-s + ((i + 1) * size) / 6}" stroke="${c}" stroke-width="1.5"/>`).join("")}</g>`;
    case "tree":
      return `<g ${at}><circle r="${s}" fill="#4f7d3a" stroke="#2f5022" stroke-width="2"/><circle r="${s * 0.55}" cx="${-s * 0.25}" cy="${-s * 0.2}" fill="#6a9a4c"/></g>`;
    case "table":
      return `<g ${at}><rect x="${-s}" y="${-s * 0.6}" width="${size}" height="${s * 1.2}" rx="3" fill="#a9763f" stroke="${c}" stroke-width="2"/></g>`;
    case "building":
      return `<g ${at}><path d="M${-s} ${s}V${-s * 0.2}L0 ${-s}L${s} ${-s * 0.2}V${s}Z" fill="#c9b08a" stroke="${c}" stroke-width="2"/><rect x="${-s * 0.25}" y="${s * 0.3}" width="${s * 0.5}" height="${s * 0.7}" fill="${c}"/></g>`;
    case "mountain":
      return `<g ${at}><path d="M${-s} ${s * 0.7}L${-s * 0.2} ${-s * 0.8}L${s * 0.3} ${s * 0.1}L${s * 0.55} ${-s * 0.3}L${s} ${s * 0.7}Z" fill="#9b8f7e" stroke="${c}" stroke-width="2"/><path d="M${-s * 0.45} ${-s * 0.3}L${-s * 0.2} ${-s * 0.8}L${s * 0.02} ${-s * 0.35}" fill="#f4f1ea"/></g>`;
    case "chest":
      return `<g ${at}><rect x="${-s * 0.8}" y="${-s * 0.5}" width="${s * 1.6}" height="${s}" rx="3" fill="#8a5a2b" stroke="${c}" stroke-width="2"/><line x1="${-s * 0.8}" x2="${s * 0.8}" y1="${-s * 0.1}" y2="${-s * 0.1}" stroke="#e0b44a" stroke-width="2"/></g>`;
    case "pillar":
      return `<g ${at}><circle r="${s * 0.7}" fill="#d8d2c4" stroke="${c}" stroke-width="2"/></g>`;
    default:
      return `<g ${at}><circle r="${s * 0.5}" fill="${c}"/></g>`;
  }
}

export function shapeSvg(sh: Shape, interactive: boolean): string {
  const p = sh.points;
  const data = interactive ? ` data-shape="${esc(sh.id)}"` : "";
  const fill = sh.texture ? `url(#tx-${esc(sh.texture)})` : sh.fill ? esc(sh.fill) : "none";
  const dm = sh.layer === "dm" ? ` stroke-dasharray="8 5" opacity=".85"` : "";
  const c = esc(sh.layer === "dm" ? sh.color || "#7b3fa0" : sh.color);
  switch (sh.tool) {
    case "room": {
      const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = p;
      return `<rect${data} x="${Math.min(x1, x2)}" y="${Math.min(y1, y2)}" width="${Math.abs(x2 - x1)}" height="${Math.abs(y2 - y1)}" fill="${sh.fill || sh.texture ? fill : "rgba(255,255,255,.55)"}" stroke="${c}" stroke-width="${sh.width}"${dm}/>`;
    }
    case "fill": {
      const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = p;
      return `<rect${data} x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" fill="${fill}"/>`;
    }
    case "line":
    case "brush": {
      const pts = [];
      for (let i = 0; i + 1 < p.length; i += 2) pts.push(`${p[i]},${p[i + 1]}`);
      const closed = sh.fill || sh.texture;
      return closed ? `<polygon${data} points="${pts.join(" ")}" fill="${fill}" stroke="${c}" stroke-width="${sh.width}" stroke-linejoin="round"${dm}/>` : `<polyline${data} points="${pts.join(" ")}" fill="none" stroke="${c}" stroke-width="${sh.width}" stroke-linecap="round" stroke-linejoin="round"${dm}/>`;
    }
    case "stamp":
      return `<g${data}>${stampSvg(sh.stamp ?? "", p[0] ?? 0, p[1] ?? 0, sh.size, sh.color)}</g>`;
    case "text":
      return `<text${data} x="${p[0] ?? 0}" y="${p[1] ?? 0}" font-family="Georgia, serif" font-size="${sh.size}" fill="${c}" stroke="#fffaf0" stroke-width="${Math.max(2, sh.size / 8)}" paint-order="stroke"${sh.layer === "dm" ? ' font-style="italic"' : ""}>${esc(sh.text ?? "")}</text>`;
  }
}

/** The whole map as SVG text. `pictureHref` gives the picture's address (a data address for export). */
export function mapSvg(v: MapView, opts: { pictureHref: string | null; show?: MapShow; interactive?: boolean; selected?: Set<string>; pinScale?: number; numbers?: boolean }): string {
  const show = opts.show ?? SHOW_ALL;
  const sel = opts.selected ?? new Set<string>();
  const ps = (opts.pinScale ?? 1) * Math.max(14, Math.min(v.width, v.height) / 45);
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${v.width} ${v.height}" width="${v.width}" height="${v.height}" class="map-svg">`);
  parts.push(`<defs>${textureDefs()}${gridDefs(v)}</defs>`);
  parts.push(`<rect width="${v.width}" height="${v.height}" fill="${esc(v.background)}"/>`);
  if (opts.pictureHref) parts.push(`<image href="${esc(opts.pictureHref)}" xlink:href="${esc(opts.pictureHref)}" x="0" y="0" width="${v.width}" height="${v.height}" preserveAspectRatio="none"/>`);
  const visible = (s: Shape) => (s.layer === "dm" ? show.dm : s.layer === "labels" ? show.labels : show.drawing);
  // Fills go underneath everything else drawn.
  for (const s of v.shapes.filter((x) => x.tool === "fill" && visible(x))) parts.push(shapeSvg(s, !!opts.interactive));
  for (const s of v.shapes.filter((x) => x.tool !== "fill" && x.tool !== "text" && visible(x))) parts.push(shapeSvg(s, !!opts.interactive));
  if (show.grid && v.grid.kind !== "none" && v.grid.show) parts.push(`<rect width="${v.width}" height="${v.height}" fill="url(#grid-pat)" pointer-events="none"/>`);
  for (const s of v.shapes.filter((x) => x.tool === "text" && visible(x))) parts.push(shapeSvg(s, !!opts.interactive));
  if (show.pins)
    for (const p of v.pins) {
      const color = p.missing ? "#b93a2e" : esc(p.color);
      const ring = sel.has(p.id) ? `<circle r="${ps * 1.25}" cy="${-ps * 1.55}" fill="none" stroke="#2f6fb0" stroke-width="${ps / 5}"/>` : "";
      const glyph = p.target?.number && opts.numbers !== false ? `<text y="${-ps * 1.2}" text-anchor="middle" font-family="Segoe UI, sans-serif" font-weight="700" font-size="${ps * 0.95}" fill="#fff">${esc(p.target.number)}</text>` : `<text y="${-ps * 1.2}" text-anchor="middle" font-size="${ps * 0.95}" fill="#fff">${PIN_GLYPH[p.symbol] ?? "★"}</text>`;
      const label = p.label || p.target?.name || "";
      const labelSvg = label && show.labels ? `<text y="${ps * 0.95}" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="${ps * 0.8}" fill="#1f1b16" stroke="#fffaf0" stroke-width="${ps / 4}" paint-order="stroke">${esc(label)}</text>` : "";
      parts.push(
        `<g${opts.interactive ? ` data-pin="${esc(p.id)}" class="map-pin"` : ""} transform="translate(${p.x} ${p.y})">${ring}<path d="M0 0 C ${-ps * 0.4} ${-ps * 0.6} ${-ps} ${-ps * 1} ${-ps} ${-ps * 1.55} A ${ps} ${ps} 0 1 1 ${ps} ${-ps * 1.55} C ${ps} ${-ps * 1} ${ps * 0.4} ${-ps * 0.6} 0 0 Z" fill="${color}" stroke="#fffaf0" stroke-width="${ps / 8}"/>${glyph}${labelSvg}</g>`,
      );
    }
  parts.push(`</svg>`);
  return parts.join("");
}

// ---------- Table marks (drawn over a map at the table, never part of it) ----------

export interface Mark {
  kind: "pen" | "note";
  points: number[];
  color: string;
  width: number;
  opacity: number;
  text: string;
}

export function marksSvg(marks: Mark[]): string {
  return marks
    .map((m) => {
      if (m.kind === "note") return `<text x="${m.points[0]}" y="${m.points[1]}" font-family="Segoe UI, sans-serif" font-size="${Math.max(14, m.width * 4)}" fill="${m.color}" stroke="#fffaf0" stroke-width="4" paint-order="stroke">${m.text.replace(/</g, "&lt;")}</text>`;
      const pts: string[] = [];
      for (let i = 0; i + 1 < m.points.length; i += 2) pts.push(`${m.points[i]},${m.points[i + 1]}`);
      return `<polyline points="${pts.join(" ")}" fill="none" stroke="${m.color}" stroke-opacity="${m.opacity}" stroke-width="${m.width}" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join("");
}
