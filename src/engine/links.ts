import type { Id, Link, PathStep, Value } from "./types.ts";

export function isLink(v: unknown): v is Link {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    typeof (v as Link).link === "string" &&
    Object.keys(v).length === 1
  );
}

export function link(id: Id): Link {
  return { link: id };
}

function isAttachmentArray(v: unknown): v is { aid: Id }[] {
  return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "object" && x !== null && typeof (x as { aid?: unknown }).aid === "string");
}

/** Every link inside a value, with the path to reach it. Attachments are addressed by aid. */
export function findLinks(value: unknown, path: PathStep[] = []): { path: PathStep[]; to: Id }[] {
  const out: { path: PathStep[]; to: Id }[] = [];
  const walk = (v: unknown, p: PathStep[]) => {
    if (isLink(v)) {
      out.push({ path: p, to: v.link });
      return;
    }
    if (Array.isArray(v)) {
      if (isAttachmentArray(v)) v.forEach((a) => walk(a, [...p, { aid: a.aid }]));
      else v.forEach((x, i) => walk(x, [...p, i]));
      return;
    }
    if (typeof v === "object" && v !== null) {
      for (const [k, x] of Object.entries(v)) walk(x, [...p, k]);
    }
  };
  walk(value, path);
  return out;
}

function step(container: unknown, s: PathStep): unknown {
  if (container == null) return undefined;
  if (typeof s === "object") {
    if (!Array.isArray(container)) return undefined;
    return container.find((x) => (x as { aid?: Id }).aid === s.aid);
  }
  return (container as Record<string | number, unknown>)[s];
}

export function getAt(root: unknown, path: PathStep[]): unknown {
  let cur = root;
  for (const s of path) cur = step(cur, s);
  return cur;
}

/** Sets a value inside root (mutating it). Returns false if the path no longer exists. */
export function setAt(root: unknown, path: PathStep[], value: Value | undefined): boolean {
  if (path.length === 0) return false;
  const parent = getAt(root, path.slice(0, -1));
  const last = path[path.length - 1]!;
  if (parent == null || typeof parent !== "object") return false;
  if (typeof last === "object") return false;
  const obj = parent as Record<string | number, unknown>;
  if (value === undefined) delete obj[last];
  else obj[last] = value;
  return true;
}

export function samePath(a: PathStep[], b: PathStep[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
