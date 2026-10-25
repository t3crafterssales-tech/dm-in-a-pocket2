// The world context (version 4): a short summary of the world the AI is working in, so what it
// makes fits what is already there instead of being generic. Built from the world itself each
// time, plus anything the user writes by hand. Only this summary is sent, never the whole file.

import { toPlain } from "../../engine/richtext.ts";
import type { Id, Workspace } from "../../engine/index.ts";
import { F } from "../../engine/index.ts";
import { loreKindOf } from "../lore.ts";

export interface ContextPart {
  title: string;
  items: string[];
  /** How many more there are than the names listed. */
  more: number;
}

export interface WorldContext {
  /** The parts, for showing in the AI panel. */
  parts: ContextPart[];
  /** What the AI reads: the same thing as one piece of text. */
  summary: string;
}

const NAMES_PER_PART = 24;
const SUMMARY_MAX = 3500;

function part(title: string, names: string[]): ContextPart | null {
  if (!names.length) return null;
  const unique = [...new Set(names)];
  return { title, items: unique.slice(0, NAMES_PER_PART), more: Math.max(0, unique.length - NAMES_PER_PART) };
}

/** A few words of what a thing is like, so "the Vethkari" means something to the AI. */
function gist(text: string): string {
  const plain = toPlain(text).replace(/\s+/g, " ").trim();
  if (!plain) return "";
  const first = plain.split(/(?<=[.!?])\s/)[0] ?? plain;
  return first.length > 110 ? `${first.slice(0, 107)}…` : first;
}

export function buildContext(ws: Workspace, layerId: Id, placeName: string, placeType: string, notes: { text: string }[], about: string): WorldContext {
  const all = ws.list(layerId).filter((n) => !n.template);
  const named = (pick: (n: (typeof all)[number], f: Record<string, unknown>) => boolean, withGist = false) =>
    all
      .filter((n) => pick(n, ws.resolve(layerId, n.id)!.fields))
      .map((n) => {
        const g = withGist ? gist(n.text) : "";
        return g ? `${n.name} (${g})` : n.name;
      });
  const beings = (kind: string) => named((n, f) => n.kind === "being" && f[F.beingKind] === kind, true);
  const lore = (kind: string) => named((n, f) => n.kind === "lore" && loreKindOf(n, f as never) === kind, true);

  const parts = [
    part("Abilities", all.filter((n) => n.kind === "ability").map((n) => n.name)),
    part("Races", beings("race")),
    part("Classes", beings("class")),
    part("Factions", lore("faction")),
    part("Places", lore("place")),
    part("Characters of the world", beings("npc")),
    part("Monsters", beings("monster")),
    part("Roll tables", all.filter((n) => n.kind === "table").map((n) => n.name)),
  ].filter((p): p is ContextPart => !!p);

  const lines = [`This is the ${placeType} "${placeName}".`];
  for (const p of parts) lines.push(`${p.title}: ${p.items.join("; ")}${p.more ? `; and ${p.more} more` : ""}.`);
  const written = notes.map((n) => n.text.trim()).filter(Boolean);
  if (written.length) lines.push(`Things to remember (World Notes): ${written.join(" | ")}`);
  if (about.trim()) lines.push(`In the user's own words about this world: ${about.trim()}`);
  const summary = lines.join("\n");
  return { parts, summary: summary.length > SUMMARY_MAX ? `${summary.slice(0, SUMMARY_MAX - 1)}…` : summary };
}
