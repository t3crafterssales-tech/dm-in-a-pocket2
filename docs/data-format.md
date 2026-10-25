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
| `kind` | `ability`, `resource`, `skill`, `condition`, `rule`, `brick`, `being`, `item`, `lore`, `table`, `encounter`, `map`, `journal`, `macro`, `session`, `layout` or `category` |
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

## Maps (version 2)

A map is a node of kind `map`. Its `picture` is the picture it starts from (or none, for a map
drawn from scratch). Positions are in map units, where the map is `width` × `height` units and the
picture is stretched to fill it. Its fields:

| Field | What it holds |
| --- | --- |
| `width`, `height` | The map's size in units (the picture's own size in pixels when it was brought in). |
| `background` | A colour for a map with no picture, such as "#efe6d2". |
| `grid` | `{ kind: "none", "square" or "hex", size (units per square), scale (words, "5 feet"), show }`. |
| `pins` | A list of `{ id, x, y, link (or null), label, color, symbol }`. A pin's link can point at anything, including another map ("maps inside maps"). |
| `shapes` | A list of `{ id, layer ("drawing", "labels" or "dm"), tool ("room", "line", "brush", "fill", "stamp", "text"), points [x, y, ...], color, width, fill, texture, stamp, text, size }`. |

A map is "inside" another map when that map has a pin linking to it. Pins are links, so "Used by"
on anything shows the maps it is pinned on, and deleting something flags its pins red.

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
| `sheetLayout` | The player's own sheet layout (see Layouts below). Absent means "use the system's"; setting one makes it this character's own (the pencil mark). |
| `sheetUse` | A link to a `layout` node of kind "sheet" the character follows. Cleared when the character gets its own `sheetLayout`. |
| `conditions` | A list of `{ id, condition (link), left, unit ("rounds", "minutes", "hours", "save" or "removed"), counter, source }` on the character right now. |

A tracker can also have `lasts`: minutes one lasts once used (a torch burns for 60), which starts a
timer at the table.

A rule's `method` can also be "standard" (with `standardSet`, such as "15, 14, 13, 12, 10, 8"),
"roll4d6" (roll 4d6, keep the highest three, arrange as you like) or "roll3d6" (3d6 in order). A
resource's `recovery` can also be "award": it comes back only when the DM awards it (Inspiration).
A system can list extra character fields for everyone in a rule with `characterFields`: a list of
`{ section, label }`. These are ordinary fields; older files without them still open.

### Layouts (version 2, the sheet and book designers)

A `layout` node lives in the Codex under Sheet and book layouts and has `layoutKind`:

| `layoutKind` | Fields |
| --- | --- |
| "book" | `request`: the saved book choices (what goes in, front pages, contents and index). |
| "sheet" | `groups`: a list of `{ id, span }`, in order, where `id` is a sheet group ("name", "portrait", "combat", "abilities", "inventory", "trackers", "features", "appearance", "notes" or "section:<name>") and `span` is its width in twelfths of the page (3 to 12). `unticked`: line keys that print blank to write in. `hidden`: among those, the ones left off the paper completely. `isDefault`: true on the one layout every character without their own follows. |

| "soundboard" (version 3) | `buttons`: a list of `{ id, label, sound, loop }`. `sound` is a path inside the Sounds folder. It never shows in the Codex; Erase all buttons and every other change to it are ordinary undo steps. |

Line keys are stable words such as "hp", "ac", "ability:<id>", "tracker:<id>" and "extra:<section>:<label>".
A character's own `sheetLayout` holds the same `groups`, `unticked` and `hidden`. Whatever is stored,
the program repairs it to fit the character it is shown on (unknown groups dropped, new ones added at
the end), so older and shared files always open.

## The DM's table (version 2)

**Sessions.** One game night is a node of kind `session` in the module (or world) being played.
Playing never changes the world: a monster's damage lives in the session, not on its sheet.
Characters are the party's own, so their hit points, trackers and conditions change on them.

| Field | What it holds |
| --- | --- |
| `number`, `started`, `ended` | Session 7; when it began; when it was wrapped up (null while it can be resumed). |
| `pausedAt`, `pausedMs` | Version 3 session timer: when it was paused (null while it runs), and the total time paused before that. Older sessions without them read as never paused. |
| `present` | Links to the characters at the table tonight. |
| `lastTime` | "Last time…" text. |
| `encounter`, `starred` | The current encounter, and the ones expected tonight. |
| `clock` | The in-world time, in minutes from the start of the calendar. |
| `combat` | `{ active, round, turn, combatants: [...] }`. A combatant is `{ id, name, kind ("character", "monster" or "event"), ref (link), init, hidden, delayed, note, members: [{ id, name, hp, maxHp, ac, defeated, conditions }] }`. |
| `timers` | A list of `{ id, name, kind ("rounds", "world", "repeat" or "real"), left, every, table (link), endsAt, paused, remaining, sound, dmOnly }`. |
| `log` | What matters, in order: `{ time, kind, text }` ("Round 3: Mira dropped to 0 hit points"). |
| `defeated` | `{ being (link), count }`, for experience at the end of the night. |
| `made` | Links to things made up during the session, for "keep this?" at the end. |

**Journal pages** are nodes of kind `journal`: `category` (words), `priority` (a number; 1 first),
`blocks` (a list of `{ id, type ("text" or "image"), x, y, w, h, text, font, size, color, picture }`
on a page 800 units wide), `session` (a link, for a session's page), `owner` (a player's name for a
private player journal, or null for the DM's), `shared` (names it is shared with), `revealed`.
The journal is the DM's notebook, so it is private: it is left out of shared files unless ticked.

**Macros** are nodes of kind `macro`: `blocks` (a list of `{ type ("dice", "stat" or "number"),
dice, ability (link), use ("bonus" or "score"), value, op ("+" or "-") }`), `against` (a number to
meet or beat, or null), `who` ("me", "turn", "everyone" or "pick"), `see` ("public", "private",
"dm" or "blind").

**Conditions** can have a `look`: `{ color, symbol }`. **Roll tables** gain `used` (row numbers
already rolled for rows marked `once`), and each row can have `once` (true) and `weight`
("common", "uncommon", "rare" or a number). A row whose result links to another table rolls it
too. **A calendar** is a rule with `calendar`: `{ months: [{ name, days }], weekdays: [names],
holidays: [{ month, day, name }], moons: [{ name, cycle, offset }], seasons: [{ name, month, day,
weather (link to a table) }], year }`.

The table's chat and rolls, the arrangement of the DM's screen, bookmarks and floating pins are
kept with the file like the AI's chat (`table` in the file's meta), not in undo history.

**Players (version 2.5)** are kept there too, never in undo history:
- `people`: `{ id, name, pin (five digits, or "" when revoked), character (an id or null), level
  ("new", "player", "trusted" or "assistant"), grid (exceptions: part → "hidden", "see" or
  "change"), color, notes (their own journal) }`. The parts are characters, initiative, hidden,
  monsters, journal, tables, codex, codexAdd, pointer, whispers and share. The DM is whoever runs
  the app and is not in the list.
- `templates`: `{ name, kind ("person" or "table"), level, grid, people: [{ name, level, grid }] }`.
- `shown`: `{ id, node, to (person ids; empty is everyone), time }`, what players were shown.
- `live`: `{ map (id or null), to, marks }`, the map on players' screens and the marks over it.
- A chat line gains `from` (the person's id) when a player wrote it.

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


## The picture library (version 3)

Pictures stay stored once, by content, in `<main folder>/.pictures/`. Beside them sits `index.json`:
one entry per picture id with `name`, `tags` (single lowercase words; the first is the main tag),
`style` and `favourite`. It belongs to the person's library, not to any world or system file, so it
is never shared with a world (a world carries only the pictures it uses) and a missing or damaged
index just means "no tags yet". Nodes still hold a plain `picture` id; nothing in `types.ts` changed.

On a map, a shape's `stamp` or `texture` can be `pic:<picture id>` to use a library picture as a
stamp or a repeating floor. Older apps show an unknown stamp as a plain dot.

Setting `autoPictures` (settings file, default on): new things made from "Start blank" get the first
picture whose main tag (then any tag) matches a word of the name, then what it is filed as.


## Sound (version 3)

Sound files are the person's own, in `<main folder>/Sounds/` (folders inside are packs from others).
`Sounds/sounds.json` holds each file's category (`music`, `ambience` or `voice`) once it has been set;
until then the category is guessed from the file's path. Files and categories belong to the person's
library, not to any world, so a shared world carries its buttons but not the sounds; a button whose file
is missing shows as missing and everything else works. The soundboard's buttons are one `layout` node
(see Layouts). Buttons dragged onto the screen are remembered in the table's memory as `soundFloats`:
`{ id, button, x, y }`, where `button` is a soundboard button's id. They are only copies.

## Rich text (version 3)

A node's one text box can now carry formatting. No field was added: a formatted text is the same `text` string, starting with the marker `<!--rt-->` followed by a small cleaned-up piece of HTML (paragraphs, headings 1 to 3, bullet and numbered lists, bold, italic, underline, strikethrough, colour, font, size, alignment). Text with no formatting is still saved as plain text exactly as before, so old files and old apps read it unchanged. Anything pasted in is cleaned down to only these parts. Everything that needs plain words (search, AI, the Word export) turns it back to plain text first. Fonts are the ones already on the computer.
