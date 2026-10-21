// The data format, version 1. See docs/data-format.md.
// Do not change these shapes without updating docs/data-format.md and CLAUDE.md, and Jeff's OK.

export const FORMAT_VERSION = 1;
export const APP_VERSION = "0.1.0";

export type Id = string;

/** The only way one node points at another. */
export interface Link {
  link: Id;
}

export type Value =
  | string
  | number
  | boolean
  | null
  | Link
  | Value[]
  | { [key: string]: Value };

export type NodeKind =
  | "ability"
  | "resource"
  | "skill"
  | "condition"
  | "rule"
  | "brick"
  | "being"
  | "item"
  | "lore"
  | "table"
  | "encounter"
  | "map"
  | "journal"
  | "macro"
  | "session"
  | "layout"
  | "category";

export type Source = "template" | "mine" | "others";

export interface Activation {
  /** Triggers such as "always", "hit", "nat", "action", "custom". */
  when: string[];
  join: "any" | "all";
  /** For "nat": the lowest natural roll that triggers it. */
  natural?: number;
  /** For "custom": the user's own words. */
  custom?: string;
}

export interface Uses {
  /** A number, or a formula in the user's words such as "INT". */
  count: number | string;
  /** Per what, such as "long rest", or "" for no limit. */
  per: string;
}

export interface Save {
  ability: Link | null;
  dc: number | string;
  onSuccess: string;
}

export interface Tier {
  name: string;
  requirement: string;
  change: string;
}

export interface Choice {
  label: string;
  pick: number;
  again: boolean;
  restrict: string;
  options: Link[];
}

/** A brick attached to a sheet. Stores only what was changed on that sheet. */
export interface Attachment {
  aid: Id;
  brick: Link | null;
  name: string | null;
  overrides: Record<string, Value>;
  activation: Activation;
  uses: Uses | null;
  save: Save | null;
  children: Attachment[];
  tiers: Tier[];
  choice: Choice | null;
}

export interface NodeRecord {
  id: Id;
  kind: NodeKind;
  name: string;
  category: Link | null;
  picture: Id | null;
  text: string;
  source: Source;
  author: string | null;
  favourite: boolean;
  template: boolean;
  created: number;
  changed: number;
  parent: Link | null;
  fields: Record<string, Value>;
  attachments: Attachment[];
}

/** A change, made in a higher layer, to a node that lives in a lower layer. Only changed parts. */
export interface NodeChange {
  name?: string;
  category?: Link | null;
  picture?: Id | null;
  text?: string;
  favourite?: boolean;
  template?: boolean;
  parent?: Link | null;
  changed?: number;
  fields?: Record<string, Value>;
  /** Fields this layer removed, so the node follows its parent for them again. */
  removedFields?: string[];
  attachments?: Attachment[];
}

/** A module (version 2) is an adventure, built on a world or straight on a system. */
export type LayerType = "system" | "world" | "module";

export interface Layer {
  id: Id;
  type: LayerType;
  name: string;
  author: string | null;
  /** The layer underneath: a world's system, or a system variant's parent. */
  base: Id | null;
  nodes: Record<Id, NodeRecord>;
  changes: Record<Id, NodeChange>;
  hidden: Id[];
}

/** One place a link sits: which node, and the path inside it. */
export interface Slot {
  layer: Id;
  node: Id;
  /** Keys into the node. An `{ aid }` step picks an attachment by its id. */
  path: PathStep[];
}

export type PathStep = string | number | { aid: Id };

export interface BinEntry {
  id: Id;
  deleted: number;
  /** The layer the node was deleted from. */
  layer: Id;
  /** True if the node lived in this layer; false if it lived below and was only hidden here. */
  owned: boolean;
  node: NodeRecord;
  /** Links that pointed at the node when it was deleted. */
  pointedHere: Slot[];
  /** Links that were later moved to something else, so restore can offer to reconnect them. */
  moved: { slot: Slot; to: Id | null }[];
}

export interface Edit {
  layer: Id;
  /** "node" edits a node record; "change" edits a node change; "hidden" edits a hidden flag. */
  what: "node" | "change" | "hidden" | "bin";
  id: Id;
  before: unknown;
  after: unknown;
}

export interface Step {
  id: Id;
  label: string;
  by: "user" | "ai";
  time: number;
  edits: Edit[];
}

export interface SavedFile {
  format: number;
  app: string;
  /** The layer this file is about (the world, or the system for a system file). */
  main?: Id;
  layers: Layer[];
  bin: BinEntry[];
  history: Step[];
  redo: Step[];
}
