// A small QR code maker (version 2, for players joining the DM's table). Byte mode, medium error
// correction, sizes 1 to 10 (up to 213 letters), which is plenty for "http://192.168.1.20:7310".
// Follows the QR standard (ISO 18004) step by step: data bits, Reed-Solomon error correction,
// the fixed patterns, the zigzag placement and the best of the eight masks. No installs.

/** Medium error correction: codewords per block and number of blocks, for sizes 1 to 10. */
const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];

function rawModules(ver: number): number {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const n = Math.floor(ver / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (ver >= 7) r -= 36;
  }
  return r;
}

const dataCodewords = (ver: number) => Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver]! * BLOCKS[ver]!;

function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree: number): number[] {
  const out = new Array<number>(degree).fill(0);
  out[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      out[j] = gfMul(out[j]!, root);
      if (j + 1 < degree) out[j] = out[j]! ^ out[j + 1]!;
    }
    root = gfMul(root, 2);
  }
  return out;
}

/** The error-correction codewords for a block of data (exported for the tests). */
export function rsRemainder(data: number[], degree: number): number[] {
  const div = rsDivisor(degree);
  const out = new Array<number>(degree).fill(0);
  for (const b of data) {
    const factor = b ^ out.shift()!;
    out.push(0);
    div.forEach((c, i) => (out[i] = out[i]! ^ gfMul(c, factor)));
  }
  return out;
}

/** The 15 format bits for medium error correction and a mask (exported for the tests). */
export function formatBits(mask: number): number {
  const data = (0 << 3) | mask; // medium = 00
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

const bit = (x: number, i: number) => ((x >>> i) & 1) !== 0;

export interface QrCode {
  version: number;
  size: number;
  /** modules[y][x]: true is dark. */
  modules: boolean[][];
}

/** Makes the QR code for some text. Throws if it is too long (over 213 bytes). */
export function makeQr(text: string): QrCode {
  const bytes = [...new TextEncoder().encode(text)];
  let ver = 1;
  const need = (v: number) => 4 + (v < 10 ? 8 : 16) + bytes.length * 8;
  while (ver <= 10 && need(ver) > dataCodewords(ver) * 8) ver++;
  if (ver > 10) throw new Error("That's too long for a QR code.");

  // Data bits: byte mode, the length, the bytes, then the end marker and padding.
  const bits: number[] = [];
  const put = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  put(4, 4);
  put(bytes.length, ver < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  const capacity = dataCodewords(ver) * 8;
  put(0, Math.min(4, capacity - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

  // Error correction, block by block, then interleaved.
  const numBlocks = BLOCKS[ver]!;
  const eccLen = ECC_PER_BLOCK[ver]!;
  const rawCodewords = Math.floor(rawModules(ver) / 8);
  const numShort = numBlocks - (rawCodewords % numBlocks);
  const shortLen = Math.floor(rawCodewords / numBlocks);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, eccLen);
    if (i < numShort) dat.push(0);
    blocks.push([...dat, ...ecc]);
  }
  const all: number[] = [];
  for (let i = 0; i < blocks[0]!.length; i++)
    blocks.forEach((b, j) => {
      if (i !== shortLen - eccLen || j >= numShort) all.push(b[i]!);
    });

  // The fixed patterns.
  const size = ver * 4 + 17;
  const m: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fixed: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => {
    m[y]![x] = dark;
    fixed[y]![x] = true;
  };
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]] as const)
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
  const align: number[] = [];
  if (ver > 1) {
    const n = Math.floor(ver / 7) + 2;
    const step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
    align.push(6);
    for (let pos = size - 7; align.length < n; pos -= step) align.splice(1, 0, pos);
  }
  const last = align.length - 1;
  align.forEach((ax, i) =>
    align.forEach((ay, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }),
  );
  const drawFormat = (mask: number) => {
    const f = formatBits(mask);
    for (let i = 0; i <= 5; i++) set(8, i, bit(f, i));
    set(8, 7, bit(f, 6));
    set(8, 8, bit(f, 7));
    set(7, 8, bit(f, 8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(f, i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(f, i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(f, i));
    set(8, size - 8, true);
  };
  drawFormat(0);
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const v = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, bit(v, i));
      set(b, a, bit(v, i));
    }
  }

  // The zigzag: two columns at a time, from the bottom right, up and down.
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const up = ((right + 1) & 2) === 0;
        const y = up ? size - 1 - vert : vert;
        if (!fixed[y]![x] && i < all.length * 8) {
          m[y]![x] = bit(all[i >>> 3]!, 7 - (i & 7));
          i++;
        }
      }
  }

  // Try the eight masks and keep the one easiest to scan.
  const flip = (mask: number) => {
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        if (fixed[y]![x]) continue;
        const inv = [(x + y) % 2 === 0, y % 2 === 0, x % 3 === 0, (x + y) % 3 === 0, (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, ((x * y) % 2) + ((x * y) % 3) === 0, (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (((x + y) % 2) + ((x * y) % 3)) % 2 === 0][mask]!;
        if (inv) m[y]![x] = !m[y]![x];
      }
  };
  let best = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    flip(mask);
    drawFormat(mask);
    const s = penalty(m);
    if (s < bestScore) {
      best = mask;
      bestScore = s;
    }
    flip(mask);
  }
  flip(best);
  drawFormat(best);
  return { version: ver, size, modules: m };
}

/** How hard a pattern is to scan: long runs, 2×2 blocks, finder look-alikes and too much dark. */
function penalty(m: boolean[][]): number {
  const n = m.length;
  let score = 0;
  let dark = 0;
  const lines: boolean[][] = [];
  for (let y = 0; y < n; y++) lines.push(m[y]!);
  for (let x = 0; x < n; x++) lines.push(m.map((row) => row[x]!));
  for (const line of lines) {
    let run = 1;
    for (let i = 1; i <= n; i++) {
      if (i < n && line[i] === line[i - 1]) run++;
      else {
        if (run >= 5) score += run - 2;
        run = 1;
      }
    }
    const s = line.map((d) => (d ? "1" : "0")).join("");
    for (const pat of ["10111010000", "00001011101"]) for (let at = s.indexOf(pat); at >= 0; at = s.indexOf(pat, at + 1)) score += 40;
  }
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (m[y]![x]) dark++;
      if (y + 1 < n && x + 1 < n) {
        const c = m[y]![x];
        if (m[y]![x + 1] === c && m[y + 1]![x] === c && m[y + 1]![x + 1] === c) score += 3;
      }
    }
  const total = n * n;
  score += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;
  return score;
}

/** The QR code as an SVG picture, with the quiet border scanners need. */
export function qrSvg(text: string, pixels = 200): string {
  const q = makeQr(text);
  const border = 4;
  const dim = q.size + border * 2;
  let path = "";
  q.modules.forEach((row, y) => row.forEach((d, x) => d && (path += `M${x + border},${y + border}h1v1h-1z`)));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${pixels}" height="${pixels}" shape-rendering="crispEdges"><rect width="${dim}" height="${dim}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
