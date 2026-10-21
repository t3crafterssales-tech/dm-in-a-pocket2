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
| `kind` | `ability`, `resource`, `skill`, `condition`, `rule`, `brick`, `being`, `item`, `lore`, `table`, `encounter` or `category` |
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

Items may also carry `material` (what it is made of, such as "Steel"), `handling` ("One-handed",
"Two-handed" or "Versatile") and `standardText` (the starter's description a copy can go back to,
milestone 11). Cost and weight stay text with their unit ("10 gp", "4 lb." or "1.8 kg"). Categories
may have the roles `race` and `class` as well as the five above, so races and classes are filed
apart from creatures. These are ordinary fields; older files without them still open.

A class (a being with `beingKind` "class") may have `maxLevel` (20 if not set) and one
`level_<attachment id>` number per feature, the level it is gained at. A rule with `method`
"pointBuy" is point buy for ability scores, with `points`, `scoreStart`, `scoreMax`, `scoreMin`
and `costs` ("flat" or "d20"). These are ordinary fields; older files without them still open.

## Encounters (version 2)

An encounter is a node of kind `encounter`, usually in a module. Its `text` is "What's really going
on" (the DM's notes, printed in the adventure booklet, which is a DM book). Its fields:

| Field | What it holds |
| --- | --- |
| `readAloud` | The boxed text read to the players. |
| `inside` | Link to the encounter it sits inside, or null for the top level. Belonging, not inheritance. |
| `order` | A number that sorts it among the encounters at its level. |
| `leadsTo` | A list of links to other encounters ("the tracks lead to the cave"). |
| `creatures` | A list of `{ being: link, count }`: the monsters and NPCs in it. |
| `treasure` | A list of links to items. |
| `handouts` | A list of links to lore pages (handouts are journal pages later). |
| `template` | As on any node: a ready-made encounter in the Codex's Encounters section. |

These are ordinary fields; older files without encounters still open.

## Characters (version 2)

A player character is a node of kind `being` with `beingKind` "character". Characters live in a
world (the party roster); modules borrow them. Their gear is attachments whose `brick` links an
item. Besides `hp`, `ac`, `speed`, `level` and the `score_<ability id>` values every being can have:

| Field | What it holds |
| --- | --- |
| `player` | The player's name, in words. Always prints, with a blank line if empty. |
| `race`, `class`, `background` | Links to the race (or subrace), class (or subclass) and background chosen. |
| `method` | How the scores were made: "pointBuy", "standard", "roll4d6", "roll3d6" or "own". |
| `hpNow` | Current hit points (the sheet's `hp` is the maximum). |
| `xp` | Experience points. |
| `gold` | Money, in words ("15 gp"). |
| `appearance` | `{ height, weight, age, hair, eyes, skin, marks, voice }`, each words; empty ones never print. |
| `extras` | A list of `{ section, label, value }`: fields added with + Add (by the system or the player). |
| `trackers` | A list of `{ id, name, max, value, look ("boxes", "number" or "bar"), refill ("short rest", "long rest", "award" or "never") }`. |
| `choices` | `{ <attachment id>: [links] }`: what was picked in each Choices box of the class or race. |
| `gearPictures` | True to show gear pictures on the sheet and in print. |
| `approved` | False while a character a player made waits for the DM's OK. |

A rule's `method` can also be "standard" (with `standardSet`, such as "15, 14, 13, 12, 10, 8"),
"roll4d6" (roll 4d6, keep the highest three, arrange as you like) or "roll3d6" (3d6 in order). A
resource's `recovery` can also be "award": it comes back only when the DM awards it (Inspiration).
A system can list extra character fields for everyone in a rule with `characterFields`: a list of
`{ section, label }`. These are ordinary fields; older files without them still open.

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
| `id`, `name`, `type` | `type` is `system`, `world` or `module` (version 2). |
| `base` | The layer underneath: a world's system, a system variant's parent system, or a module's world (or its system, for a setting-free module). Null for a starter system. Nothing is built on a module. |
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
| `Modules/<id>.dmmod` | One module (version 2): a ZIP holding `module.json` (the module's layer **plus a copy of its world and system chain**, its history and bin) and `pictures/`. When the world's and systems' own files are present, they win, as for worlds. |
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
