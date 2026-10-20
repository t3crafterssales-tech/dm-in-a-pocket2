# Data format (format version 1)

This is how DM in a Pocket stores everything. The code version of this file is
`src/engine/types.ts`. Neither changes without the other, and neither changes without Jeff's OK
(hard rules, Part 9).

## The big idea in one paragraph

Everything is a **node** with a permanent hidden **ID**. A node points at another node only through
a **link** (`{ "link": "<id>" }`), never by name. Systems and worlds are **layers** stacked on top
of each other: a world's layer sits on its system's layer, which may sit on a parent system's
layer. A layer can add new nodes, change nodes from the layers below, or hide them. Inside a
layer, a node can also be a **variant** of another node (Wood Elf of Elf). In both cases a child
stores only what it changed, and everything else comes from below. That is what makes "changes
flow down" work.

## Nodes

| Field | What it holds |
| --- | --- |
| `id` | Permanent ID. Never changes, never reused. |
| `kind` | `ability`, `resource`, `skill`, `condition`, `rule`, `brick`, `being`, `item`, `lore`, `table` or `category` |
| `name` | Display name. Renaming never breaks anything, because links use the ID. |
| `category` | Link to a `category` node, or null. Categories are nodes, so they have IDs too. |
| `picture` | ID of a picture stored once in the file's picture store, or null. |
| `text` | The one text box (no secret GM notes). |
| `source` | `template`, `mine` or `others` |
| `author` | Optional maker's name. |
| `favourite` | Star on or off. |
| `template` | True for template parents (hidden from lists and the rulebook). |
| `created`, `changed` | Times in milliseconds. |
| `parent` | Link to the node this is a variant of, or null. |
| `fields` | Named values: numbers, text, links, lists. A variant stores only the fields it changed. |
| `attachments` | The bricks attached to this node (see below). A variant lists only its own; it also shows its parent's. |

Kind-specific meaning lives in `fields`. For example a being has `beingKind` (`monster`, `npc`,
`character`, `race`, `class`); a library brick has `type` (`attack`, `trait`, `spell`, `effect`,
`damage`, ...) and `wording` for the rulebook.

The field names that checks, sentences and the rulebook rely on (`beingKind`, `hp`, `cr`, `cost`,
`type`, `dice`, `forbid`, ...) are listed with explanations in `src/engine/conventions.ts`.
Spell bricks also carry `spellLevel` (0 for a cantrip), `school`, `castingTime`, `range`,
`components`, `duration`, `ritual` and `spellClasses`, which the rulebook's Spells chapter prints.
These are ordinary fields, so older files without them still open.

A node's `text` may hold several lines; each line prints as its own paragraph.

## Attachments (a brick on a sheet)

| Field | What it holds |
| --- | --- |
| `aid` | Permanent ID of this attachment. |
| `brick` | Link to the library brick or item it is a copy of. Null for a choice. |
| `name` | A name used on this sheet only, or null for the original's name. |
| `overrides` | Only the values changed on this sheet (the pencil marks). |
| `activation` | When it works: a list of triggers joined by `any` or `all`, with optional extra numbers. |
| `uses` | How often: a number or a formula, and per what (`long rest`, ...), or null. |
| `save` | A saving throw attached to it, or null. |
| `children` | Attachments nested inside this one. They happen only when this one happens. |
| `tiers` | Upgrade tiers (Evolved, Mastered). |
| `choice` | For "choose one of these": label, how many, can be chosen again, restrictions, options. |

## Layers (systems and worlds)

| Field | What it holds |
| --- | --- |
| `id`, `name`, `type` | `type` is `system` or `world`. |
| `base` | The layer underneath: a world's system, or a system variant's parent system. Null for a starter system. |
| `nodes` | Nodes that are new in this layer, stored in full. |
| `changes` | Changes to nodes from layers below, stored as only the changed parts. A change can also list `removedFields`: fields this layer took away so they follow the layer below again. |
| `hidden` | IDs of nodes from below that this layer has deleted (they are in the recycle bin). |

## Saved file

```json
{ "format": 1, "app": "0.1.0", "main": "<world or system id>", "layers": [...], "bin": [...], "history": [...], "redo": [...], "meta": {...} }
```

- **main** is the layer the file is about.
- **meta** holds home-screen details per layer: the card picture and when it last changed. System
  files carry it too. It also holds `flagPanel`, the flag panel's memory: `ignored` (flags the user
  ignored one by one), `ignoredKinds` (yellow warning kinds ignored world-wide), `seen` (flags no
  longer new) and `log` (the blue and green blocks from the last 30 days, each with its text, time,
  the nodes it was about and the undo step it made). None of it changes how nodes or bricks are
  stored, and a file without it simply has an empty panel memory.
- **meta** also holds `ai`, the AI's memory: `notes` (the World Notes, each `{ text, pinned }`;
  pinned lines are the user's and the AI never changes them) and `chat` (the conversation, each
  `{ role, text, time }`, with the proposal's plain-words lines and whether it was accepted). A
  shared file always carries the notes, and the chat only if ticked. The API key is never in any
  file in the main folder: it is kept in the operating system's protected storage.

## Files in the main folder

| Where | What |
| --- | --- |
| `Systems/<id>.dmsys` | One system: a ZIP holding `system.json` (that system's layer, its history and bin) and `pictures/`. |
| `Worlds/<id>.dmworld` | One world: a ZIP holding `world.json` (the world's layer **plus a copy of its whole system chain**, its history and bin) and `pictures/`. The copy lets a world travel on its own; when the system's own file is present, that file wins, so system changes made elsewhere flow in. |
| `Worlds/<id>.dmworld.lock` | Present while the world is open: which computer, which session, and a heartbeat time. |
| `Backups/<worldId>/<YYYY-MM-DD>.json` | Automatic backups: the world JSON only, pictures are not copied. |
| `Snapshots/<worldId>/<id>.json` | Named snapshots: name, time, and the world with its system chain. Pictures are not copied. |
| `.pictures/<hash>.<ext>` | Every picture, once, named by its content. |
| `Imported/` | Kept for worlds and systems from other people (not used yet: imported files go on the normal shelves for now, with their things marked as from others). |
| A shared `.dmworld` file | The same as a world file, made by Share: the world, its whole system chain, its pictures, and only if ticked its undo history (`history`, `redo`, `bin`) and a `snapshots/` folder of its snapshots. Never settings. |
| A shared `.dmsys` file | A system file with its parent systems in `layers`, so a variant can travel on its own. |
| `Recycle bin/<entryId>/` | Worlds and systems deleted from the home screen: an `entry.json` (what was deleted, when, and everything that went in with it) beside the moved `.dmworld` and `.dmsys` files. Deleting a system takes the worlds that use it, and the systems built on it, into the same entry, so they are restored together. Emptying the bin removes the entry and those worlds' backups and snapshots. |

Files and folders use permanent IDs as names, so renaming a world never moves a file.

- **format** is the data format version. An app opens any file with an equal or lower number
  (upgrading it after a backup) and opens a higher number read-only.
- **bin** holds deleted nodes, each with the links that pointed at it and any reconnect memory.
- **history** holds undo steps, each with a plain-words label, who made it (user or AI), its time,
  and the before and after of every node it touched.

## Rules the code enforces

- Links are the only references. "Used by" is always worked out from links, never stored.
- No variant loops (A a variant of B while B is a variant of A).
- Deleting never destroys: the node goes to the bin with its links remembered.
- A bulk change is one undo step.
- Saving writes a new file beside the old one and swaps it in, so a crash mid-save leaves the old
  file whole.
