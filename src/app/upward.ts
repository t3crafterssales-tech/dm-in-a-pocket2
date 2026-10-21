// Edit parent from a world up to its system. The change is made at the system, so changes still
// only flow down; a checklist of the system's worlds decides which get it. Unticked worlds keep
// the old value as their own (a pencil mark), written into their own files.

import { formulaText, isFormula, isLink } from "../engine/index.ts";
import type { Id, Value } from "../engine/index.ts";
import { Library, LibraryError, WorldLock, LOCK_STALE_MS } from "../storage/index.ts";
import type { Session } from "./session.ts";

export interface UpwardRow {
  key: string;
  label: string;
  /** Plain text of the system's value and this world's. */
  system: string;
  world: string;
  /** The raw values, for "Use my version". */
  systemValue: Value | null;
  worldValue: Value | null;
  /** Simple values (words and numbers) can be typed; others can only be copied up. */
  editable: boolean;
  differs: boolean;
}

export interface UpwardWorld {
  id: Id;
  name: string;
  current: boolean;
  /** False when it is open on another computer right now, so it can't be protected. */
  available: boolean;
  note: string | null;
}

export interface UpwardView {
  /** The parent layer the change is made in: the system (from a world), or a module's world or system. */
  systemId: Id;
  systemName: string;
  /** What the parent is, and what the open place is, for the window's words. */
  parentKind: "system" | "world";
  placeKind: "world" | "module";
  nodeId: Id;
  nodeName: string;
  rows: UpwardRow[];
  worlds: UpwardWorld[];
}

/** Plain names for values, as the sheets show them. */
export const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  text: "Description",
  label: "Short label",
  rangeMin: "Lowest score",
  rangeMax: "Highest score",
  bonus: "Bonus",
  maximum: "Maximum",
  start: "Starts",
  startValue: "Starting value",
  recovery: "Recovers",
  display: "Shown as",
  family: "How a check works",
  die: "Dice",
  target: "Target",
  stages: "Stages",
  duration: "Lasts",
  hp: "Hit points",
  ac: "Armour",
  speed: "Speed",
  cr: "Challenge",
  cost: "Cost",
  weight: "Weight",
  material: "Material",
  size: "Size",
  hitDie: "Hit die",
  level: "Level",
  dice: "Damage dice",
  damageType: "Damage type",
  wording: "What it does",
  ability: "Ability",
  condition: "Condition",
  amount: "Amount",
};

/** Values the window never shows as rows: they are how the app files things. */
const HIDDEN = new Set(["type", "beingKind", "section", "role", "under", "forbid", "exceptions", "license", "thresholds", "save", "books", "before", "bookPage"]);

function systemOf(session: Session): Id {
  if (session.type === "system") throw new LibraryError("This is the system itself. Its changes already reach its worlds.");
  const base = session.ws.layer(session.id).base;
  if (!base) throw new LibraryError(`This ${session.type} has nothing under it.`);
  return base;
}

/** A world or module built directly on a layer: the ones a change there reaches first. */
interface Child {
  id: Id;
  name: string;
  kind: "world" | "module";
  path: string;
}

function childrenOf(lib: Library, parent: Id): Child[] {
  return [
    ...lib.listWorlds().filter((w) => w.systemId === parent).map((w) => ({ id: w.id, name: w.name, kind: "world" as const, path: w.path })),
    ...lib.listModules().filter((m) => m.baseId === parent).map((m) => ({ id: m.id, name: m.name, kind: "module" as const, path: m.path })),
  ];
}

export function upwardView(lib: Library, session: Session, nodeId: Id): UpwardView {
  const ws = session.ws;
  const sys = systemOf(session);
  const inSystem = ws.get(sys, nodeId);
  const inWorld = ws.get(session.id, nodeId);
  if (!inSystem || !inWorld) throw new LibraryError(`That doesn't come from the ${ws.layer(sys).type}, so there is nothing to edit there.`);
  const words = (v: Value | undefined, key: string): string => {
    if (v === undefined || v === null || v === "") return "";
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
    if (isLink(v)) return ws.get(session.id, v.link)?.name ?? "[missing]";
    if (isFormula(v)) return formulaText(ws, session.id, v);
    if (key.startsWith("score_") && typeof v === "object" && !Array.isArray(v)) return String((v as Record<string, Value>).score ?? "");
    return "(set)";
  };
  const label = (key: string) => {
    if (key.startsWith("score_")) return ws.get(session.id, key.slice(6))?.name ?? "A score";
    return FIELD_LABELS[key] ?? key;
  };
  const keys = ["name", "text", ...new Set([...Object.keys(inSystem.fields), ...Object.keys(inWorld.fields)].filter((k) => !HIDDEN.has(k)))];
  const value = (n: typeof inSystem, k: string): Value | null => (k === "name" ? n.name : k === "text" ? n.text : (n.fields[k] ?? null));
  const rows = keys.map((k) => {
    const s = value(inSystem, k);
    const w = value(inWorld, k);
    const simple = (v: Value | null) => v === null || typeof v === "string" || typeof v === "number";
    return { key: k, label: label(k), system: words(s ?? undefined, k), world: words(w ?? undefined, k), systemValue: s, worldValue: w, editable: simple(s) && simple(w) && !k.startsWith("score_"), differs: JSON.stringify(s) !== JSON.stringify(w) };
  });
  const systemName = ws.layer(sys).name;
  const worlds = childrenOf(lib, sys)
    .map((w) => {
      const current = w.id === session.id;
      const held = current ? null : new WorldLock(w.path, lib.me, lib.now).read();
      const busy = !!held && held.session !== lib.me.session && held.machine !== lib.me.machine && lib.now() - held.heartbeat < LOCK_STALE_MS;
      return { id: w.id, name: w.kind === "module" ? `${w.name} (module)` : w.name, current, available: !busy, note: busy ? `Open on ${held!.machine} right now, so it will get the change` : null };
    })
    .sort((a, b) => Number(b.current) - Number(a.current) || a.name.localeCompare(b.name));
  const parentKind = ws.layer(sys).type === "world" ? "world" : "system";
  return { systemId: sys, systemName, parentKind, placeKind: session.type === "module" ? "module" : "world", nodeId, nodeName: inWorld.name, rows, worlds };
}

/**
 * Makes the change at the system. Unticked worlds keep the old value as their own. Returns what
 * happened in plain words.
 */
export function changeInSystem(lib: Library, session: Session, nodeId: Id, changes: Record<string, Value | null>, ticked: Id[]): { label: string; kept: string[]; couldNot: string[] } {
  if (session.readOnly) throw new LibraryError(session.readOnlyReason ?? "This world is read-only.");
  const view = upwardView(lib, session, nodeId);
  const sys = view.systemId;
  const ws = session.ws;
  const keys = Object.keys(changes).filter((k) => k === "name" || k === "text" || /^[A-Za-z][A-Za-z0-9_]*$/.test(k));
  if (!keys.length) throw new LibraryError("Nothing was changed.");
  const before = ws.get(sys, nodeId)!;
  const old = (k: string): Value | undefined => (k === "name" ? before.name : k === "text" ? before.text : before.fields[k]);
  const tickedSet = new Set(ticked);
  const label = `Changed ${view.nodeName} in ${view.systemName}`;

  ws.transact(label, () => {
    // The world's own current values, before the system changes underneath it.
    const mine = ws.get(session.id, nodeId)!;
    ws.edit(sys, nodeId, (r) => {
      for (const k of keys) {
        const v = changes[k];
        if (k === "name") r.name = String(v ?? r.name);
        else if (k === "text") r.text = String(v ?? "");
        else if (v === null || v === undefined) delete r.fields[k];
        else r.fields[k] = structuredClone(v);
      }
    });
    if (!tickedSet.has(session.id)) {
      // This world keeps what it showed before.
      ws.edit(session.id, nodeId, (r) => {
        for (const k of keys) {
          if (k === "name") r.name = mine.name;
          else if (k === "text") r.text = mine.text;
          else if (mine.fields[k] === undefined) delete r.fields[k];
          else r.fields[k] = structuredClone(mine.fields[k] as Value);
        }
      });
    }
  });
  // The system file must hold the new value before the other worlds are opened.
  session.saveNow();

  const kept: string[] = [];
  const couldNot: string[] = [];
  const kinds = new Map(childrenOf(lib, sys).map((c) => [c.id, c.kind]));
  for (const w of view.worlds) {
    if (w.current || tickedSet.has(w.id)) continue;
    if (!w.available) {
      couldNot.push(w.name);
      continue;
    }
    const open = kinds.get(w.id) === "module" ? lib.openModule(w.id) : lib.openWorld(w.id);
    try {
      if (open.readOnly) {
        couldNot.push(w.name);
        continue;
      }
      const layer = open.ws.layer(w.id);
      const own = layer.nodes[nodeId] ?? null;
      const ch = layer.changes[nodeId] ?? null;
      const setsItself = (k: string) => (own ? true : k === "name" ? ch?.name !== undefined : k === "text" ? ch?.text !== undefined : ch?.fields?.[k] !== undefined);
      const pin = keys.filter((k) => !setsItself(k));
      if (pin.length) {
        open.ws.transact(`Kept its own ${view.nodeName} when ${view.systemName} changed`, () =>
          open.ws.edit(w.id, nodeId, (r) => {
            for (const k of pin) {
              const v = old(k);
              if (k === "name") r.name = String(v);
              else if (k === "text") r.text = String(v ?? "");
              else if (v === undefined) delete r.fields[k];
              else r.fields[k] = structuredClone(v);
            }
          }),
        );
        lib.saveWorld(open);
      }
      kept.push(w.name);
    } finally {
      lib.close(open);
    }
  }
  return { label, kept, couldNot };
}
