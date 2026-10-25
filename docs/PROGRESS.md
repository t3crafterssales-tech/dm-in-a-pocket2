# Progress log

Newest first. Every session reads this after `CLAUDE.md`.

## Where we are

- **Done:** Milestone 1, the engine core (approved by Jeff, merged into `main`).
- **Done:** Milestone 2, files and saving (approved by Jeff, merged into `main`).
- **Also done (approved by Jeff, merged):** engine parts of milestones 5 and 6 (branch
  `engine-checks-and-book`): world-rule red flags, free yellow checks, plain-English sentences,
  and the rulebook builder. Built early because they need no installs.
- **Done:** Milestone 3, the desktop app shell (approved by Jeff, merged into `main`). The Windows
  installer builds at GitHub and all tests pass on Windows.
- **Done:** Milestone 4, the Rules tab and sheets (approved by Jeff on October 20, 2026, when he
  asked to go on to milestone 5; merged into `main`). He hasn't installed it yet, so anything he
  finds when he does gets fixed in milestone 5.
- **Done:** Milestone 5, the flag panel, recycle bin, undo and history on screen (approved by Jeff
  on October 20, 2026, when he asked for the next step; merged into `main`). Anything he finds when
  he installs it gets fixed in milestone 6.
- **Done:** Milestone 6, the rulebook export (PDF) and the small d20 starter (approved by Jeff on
  October 20, 2026, when he asked for the next step; merged into `main`). **First playable is
  complete.** Jeff hasn't installed it yet; anything he finds gets fixed in the next milestone.
- **Done:** Milestone 7, sharing and snapshots (approved by Jeff on October 20, 2026, when he said
  "next"; merged into `main`).
- **Done:** Milestone 8, Quick start, roll tables, lore pages, and the check categories with
  sliders (approved by Jeff on October 20, 2026, when he asked for milestone 10; merged into `main`).
- **Done:** Milestone 10, Table mode, Word export and the full SRD 5.2 (approved by Jeff on
  October 20, 2026, when he asked to build milestone 9; merged into `main`).
- **Built, waiting for Jeff to test:** Milestone 9, the AI. Tested with a pretend AI; Jeff's own
  Claude API key is needed only to try it for real.
- **Built, waiting for Jeff to test:** Milestone 11, the feel pass (branch `claude/feel-pass`,
  built on milestone 9 so both are tested together). See "Milestone 11: what Jeff can test".
- **Built, waiting for Jeff to test:** Version 2.1, modules and encounters (branch
  `claude/v2-modules`, built on the feel pass). See "Version 2.1: what Jeff can test".
- **Built, waiting for Jeff to test:** Versions 2.2 (characters), 2.3 (maps) and 2.4 (the DM's
  table), on `claude/v2-modules`. Every push there updates "Latest test version" on Releases.
- **Built, waiting for Jeff to test:** Version 2.5, players join on their own screens.
- **Built, waiting for Jeff to test:** Version 2.6 part 1: the welcome screen, sample valley, tour,
  first steps checklist, tips, Help (?), and the book designer in the Rulebook tab.
- **Built, waiting for Jeff to test (October 25):** the print shop screen. In the Rulebook tab, pick
  "Print shop" in the Book list: choose standees, round tokens, cards or initiative tent cards, tick
  what to print, set how many copies of each and the inches per square, see the pages, then Save as PDF
  or Print.
- **Built, waiting for Jeff to test (October 25):** the sheet designer. On a character's sheet,
  press "Design the sheet": groups (Name, Portrait, Combat, Abilities, Inventory, Trackers, Features,
  Appearance, Notes) are cards to drag, or to make wider and narrower by their right edge (or the
  small arrow buttons). A collapsible "What prints" panel has Check all and Uncheck all, an "Often
  kept in pencil" list, and a tick for every line; unticked lines print blank to write in, with a
  "hide" tick to leave them off the paper. Save this layout puts it in the Codex (and can make it the
  default for the game or world); "Use the system's" goes back. The same layout draws the sheet on
  screen. Preview, Print and Save as PDF work.
- **Next:** build the Windows installer so Jeff can download and run it. Nothing from versions 3, 4
  or 5 is being built.
- **Not in the sheet designer yet:** skills, saving throws, attacks and spells groups. A character's
  sheet doesn't carry those yet, so they appear when it does.

## Milestones to first playable

First playable = build a small game system by hand, fill it with monsters and items, see the
flags work and print a rulebook, with no AI (see `docs/design.md`, First playable checkpoint).

| # | Milestone | What Jeff can test |
| --- | --- | --- |
| 1 | Engine core: nodes, bricks, links, layers, variants, changes flowing down with the checklist, red flags, recycle bin with reconnect, undo and history, safe saving | Automatic tests, plus a plain-words report of each promise they prove |
| 2 | Files and saving: one archive per world with pictures, the main folder, constant saving, backups, crash recovery, one copy open at a time | Save, close, crash and reopen a world without losing anything |
| 3 | Desktop app shell: Electron window, home screen with Systems and Worlds shelves, New system and New world | Install and open the app on Windows |
| 4 | Rules tab and sheets: core check, abilities, resources, skills, conditions, free-text rules; Beings and Items with the library, drag and drop, Shift and Ctrl selection, Edit parent | Build a small system and a few monsters by hand |
| 5 | Flag panel, recycle bin, undo and history on screen; basic free yellow checks | Delete Strength, fix it, undo, restore |
| 6 | Rulebook export (PDF) and the small d20 starter | Print a rulebook from your own world |

After first playable, the rest of version 1 (order proposed by Claude on October 20, 2026; the
free, no-AI work first, since the AI needs Jeff's API key and costs money on it; Jeff can reorder):

| # | Milestone | What Jeff can test |
| --- | --- | --- |
| 7 | Sharing and snapshots: Import, Share a world or system, named snapshots with restore and clean-up, author name and the From others filter | Send a world to yourself and import it; snapshot, change, restore |
| 8 | Quick start, roll tables, lore pages and templates, check categories with on/off and sliders | Build a quick game in 15 minutes; roll on a table |
| 9 | The AI: chat, Check for errors, bulk changes, World Notes, create from a prompt | Needs Jeff's Claude API key |
| 10 | The full SRD 5.2, Table mode and Word export | Run a game from the app |

## Log

### Version 2.1: what Jeff can test
- Home screen: a new **Modules** shelf. **New module** asks for a name, a picture and what it's
  built on: one of your worlds, or a system alone (a setting-free module).
- Open a module: it opens on the new **Adventure** tab. The front page has levels, party size,
  sessions and the hook.
- **+ Encounter** adds an encounter. Select one and **Add inside** to nest it (the cave, then its
  rooms). Numbers (1, 1.1, 1.2.1) update by themselves.
- Drag encounters in the tree: onto another to put it inside, or between two to reorder.
  Ctrl-click and Shift-click select several. Delete moves what was inside up a level; Ctrl+Z
  puts it back.
- In an encounter: read-aloud text, "What's really going on", and drag monsters, items, lore
  pages or other encounters in from the Codex (switch at the top of the right column). Creature
  counts have + and − buttons.
- The Codex has an **Encounters** section with four ready-made ones (Bandit ambush, Tavern brawl,
  Wolves at dusk, The rat cellar). Drag one into the tree; the module gets its own copy.
  **Save to the Codex** turns one of yours into a ready-made one.
- **Rulebook** tab in a module: **Adventure booklet** is the first choice. Front page, every
  encounter in order with read-aloud text in a shaded box, "See Wolf (page 5)", and appendices
  for the creatures, treasure and handouts used. Encounter numbers: all, top level only, or off.
  Saves as PDF or Word like the rulebook.
- Deleting a world warns which modules go with it; the recycle bin brings them back together.
  Share a module and import it on another computer: its world and system come with it.
- **Place in a world…** on a setting-free module's card copies it into one of your worlds on the
  same system; the original stays on the shelf.
- Inside a module, things from the world show **Edit in the world** (or Edit in the system for a
  setting-free module): the change is made underneath, and a checklist picks which modules get it.

### Version 2.2: what Jeff can test
- A new **Party** tab in every world (and module). **+ Character** opens the character builder:
  name and player, race (subraces underneath), class (subclasses, Choices boxes, starting level),
  background, ability scores, gear and money, then Finish with Appearance folded away.
- The **Method** drop-down starts with the game's own rule (the d20 starter now has "Making ability
  scores": the standard set). Point buy counts points left; 4d6 and 3d6 roll with the dice shown;
  Enter my own takes typed scores.
- **✨ Make it for me** fills every step with sensible choices in one click.
- The character sheet: hit points now and most, armour, speed, experience, money, scores with
  bonuses, trackers (Heroic Inspiration appears by itself with an Award button; add your own
  torches or arrows), Short rest and Long rest, features, choices, gear with pictures (drag from
  the Codex), Appearance, your own fields with + Add, and **Level up**.

### Version 2.3: what Jeff can test
- A new **Maps** tab. **+ Map** brings in a picture (or starts blank). The map tree on the right
  works like File Explorer: a map pinned on another sits under it.
- Tools across the top: Select, Pin, Room, Wall and line, Freehand brush, Fill (colours and
  textures: grass, water, stone, wood, sand, lava), Stamps (door, stairs, tree, table, building,
  mountain, chest, pillar), Text, Eraser and Ruler. Layers: Drawing, Labels and DM-only notes.
  Wheel zooms; drag empty space to look around; everything undoes.
- Drag anything from the Codex onto the map to pin it. Pins start black with a symbol for what
  they link to; click one to open it (a map opens with a breadcrumb back up); double-click to
  change its name, colour or symbol (pick several with Ctrl or Shift to change them together).
  Ctrl+D copies a pin with its link, Ctrl+Shift+D just its look; dropping on a pin relinks it.
- **Map settings**: size, background colour, square or hex grid with a scale ("5 feet").
- **Export…**: PNG or PDF, with ticks for grid, pins, labels, drawings and DM-only notes (off).
- The adventure booklet prints the module's maps with pins numbered like the encounters, and an
  encounter shows "On the map".

### Version 2.5: what Jeff can test
- **Party tab → The whole party**: **Add everyone from the roster** (or + Player) gives each
  player their own five-digit PIN. Pick their character and level (New player, Player, Trusted
  player, Assistant GM). **Permissions…** is the grid: click a square to change it, Deny all on a
  column or row, save person or table templates ("Thursday group").
- **Open the table to players**: shows the address and a QR code. On a phone or laptop on the same
  Wi-Fi, open the address in a browser and type the PIN (or press **QR** by a name: scanning it
  joins with the PIN already in). The first time, Windows asks to let DM in a Pocket use the
  network: choose Allow (private networks).
- On the phone: **Table** (Last time…, initiative with hidden monsters left out until their turn,
  monsters' health as words, dice with advantage and Only the DM or Blind rolls, roll tables if
  allowed), **Sheet** (hit points − and +, abilities to tap and roll, trackers), **Chat** (to
  Everyone or a whisper to anyone; /r 1d20+3 rolls), **Map**, **Journal** (what the DM showed
  them, and their own notes), **Party** and **Rules**.
- At the DM's table: a **Players** tool with green dots for who joined; whispers in the chat
  (To: a player); the 👁 on any pin and **Show to players…** on journal pages pop things up on
  players' screens; the Map tool's **Show to players…** puts the map live, with your marks and
  pointer pulses on their screens.
- Initiative gear: **Players move the turn on themselves** (each sees **End my turn** on their own
  turn), **Monsters always hidden**, and **Pop up the sheet** also opens the player's sheet.

### 2026-10-22 (version 2.5: players join)
- `src/app/players.ts` (levels, the grid, PINs, whispers, each player's screen, what they may
  do), `src/app/lan.ts` (the small web server on the home network), `src/engine/qr.ts`.
- `src/player/` is the player's page; `src/ui/players-panel.ts` and the Players tool.
- 272 automatic tests pass.

### Version 2.4: what Jeff can test
- A **DM's table** button at the top. **Begin session** picks who is at the table tonight and opens
  the table: tools in areas you can rearrange by dragging their title bars, with **+ Tool** and an
  arrangement menu (save, use, forget, reset).
- **Initiative**: Start fight rolls everyone, hidden monsters stay grey until revealed, damage box,
  conditions with rounds, Next turn, drag to reorder, events ("lair action at 20").
- **Dice**: any dice, advantage and disadvantage, saved rolls and macros, attacks, a deck of cards.
  Rolls go into the **Log and chat** (type /r 2d6+3 there too).
- **Clock**: game time with advance buttons, short and long rests for the party, timers (game time
  or real time with a chime), your own calendar from the gear.
- **Tables** (roll tables with "once only" rows and weights), **Journal** (tonight's page opens by
  itself), **Bookmarks**, **Party**, **Map** (point, draw and note marks), **Reference** and the
  **Codex**.
- **Wrap up** gives experience (absent players get a share you choose), "Everyone levels up", and
  asks whether to keep or remove things you made tonight.
- A new **Journal** tab: pages by category, text and picture blocks you drag and size, links,
  "Mentioned in", Make it a lore page or NPC, Print handout (plain, parchment or border), and a
  Campaign diary as PDF or Word. The journal stays private: Share leaves it out unless you tick it.
- **Pins**: Ctrl+Shift+P (or the pin button in the Codex) floats anything on screen; drag it,
  fold it, close it; double-click to open.

### 2026-10-22 (version 2.4: the DM's table)
- `src/app/table.ts` (sessions, initiative, conditions, clock, calendar, experience),
  `src/app/macros.ts`, `src/app/journal.ts`, `src/app/tablemeta.ts`.
- `src/ui/desk.ts` and the tools in `src/ui/tools/`; `src/ui/journal-editor.ts`,
  `src/ui/journal-tab.ts`, `src/ui/floating-pins.ts`.
- 265 automatic tests pass.

### 2026-10-21 (version 2.3: maps)
- `src/app/maps.ts` (pins, drawings, the map tree, measuring), `src/ui/map-render.ts` (one SVG
  drawing for the editor, export and booklet), `src/ui/maps-tab.ts`, `src/app/pdf-image.ts`.

### 2026-10-21 (version 2.2: the character builder)
- `src/engine/dice.ts`: dice for all of version 2 ("2d6 + 3", "4d6 keep 3", advantage).
- `src/app/characters.ts`: builder options read from the game, making characters, the sheet,
  trackers, rests, awards and level-ups. `src/ui/character-builder.ts` and `src/ui/party-tab.ts`.

### 2026-10-21 (version 2.1: modules and encounters)
- Engine: the `module` layer and the `encounter` kind, with the rules for what can sit on what.
- Storage: the Modules folder and `.dmmod` files, which carry their world and system.
- `src/app/encounters.ts`: the tree, numbering, moving, deleting with promotion, dropping things in,
  ready-made encounters.
- `src/ui/adventure-tab.ts`: the Adventure tab. `src/app/adventure-book.ts`: the booklet.
- The browser preview (`scripts/preview/server.ts`) now serves the book page too.
- 236 automatic tests pass.

### Milestone 11: what Jeff can test

Download the installer from the latest "Windows installer" run on the `claude/feel-pass` branch.
Make a **new** system from Generic d20 (the standard descriptions, materials and enchantments are in
the starter, so older systems don't have them), then a world on it. It opens straight away.

- **+ New → Weapon → Battleaxe.** Your own copy opens with its name selected: type a name. Click a
  damage chip, choose how it's held and a material (or + Add a material), step the weight and cost,
  switch lb/kg. Watch "How it prints in the rulebook" change as you go.
- **Add Flaming:** Codex → Enchantments, drag Flaming onto the axe. It lands under More → Enchantments.
- **A lantern:** + New → Gear, find "lantern", pick it. **A monster:** + New → Monster → Goblin Warrior.
- The Codex on the right: open a section, sort, Show "Made by me", drag something onto another
  section to move it (or hover and use Move to).
- Flags are the small strip under the Codex; click it for all of them.
- Ctrl+D with the mouse over something makes a variant (a connected copy); Ctrl+Shift+D makes
  your own separate copy; press ? for every shortcut.
- A class: hit die chips, + Add a choice, then drag options onto the Choices box.
- Rules → a new core check has standard wording; change "How a check works" and it follows.

### 2026-10-21 (milestone 11: the feel pass)

Built from `docs/FEEL-PASS.md` and the approved mockup, on branch `claude/feel-pass`.

- Part A: two columns (sheet, then the Codex with the flag strip), the Codex with sections, find,
  sort, show filter, drag to refile and Move to; floating pop-ups with a lifted shadow and blur.
- Part B: + New with "What do you want to make?" tiles and Start from / Start blank; the item sheet
  with standard descriptions, pickers, How it prints and More; Make my own copy for starter content.
- Part C: the same pattern for beings, spells and other bricks; hit die chips, Choices boxes with
  + Add a choice, races and classes filed under Race and Class, standard wording for core checks.
- Part D: the duplicates in Test World 1 came from Quick start run on a system that already had
  those rules. It now reuses them.
- Part E: Ctrl+D, Ctrl+N, Ctrl+Z/Y, Ctrl+F, ? for the list; Ctrl+C/V are left to the system.
- Also fixed: backups were labelled a day old in time zones behind UTC ("Yesterday" for today's).
- A browser preview of the real window (`scripts/preview/server.ts`) lets Claude look at screens
  in sessions that can't run Electron.

### 2026-10-20 (before Jeff's Ashen Vigil test: level tables, point buy, search)

- Class level tables: a class sheet shows levels 1 to 20 (or its own Levels number). Drag bricks
  from the Library onto a level to add them there, or drag a feature to another level; features
  dropped elsewhere wait under "No level yet". A subclass shows its parent's features at their
  levels and can move one for itself. The rulebook prints class features in level order
  ("Level 3. Sneak Attack: ...").
- Point buy with deficits: any written rule can be switched to "Point buy for ability scores":
  points, where every score starts, the highest you can buy, the lowest a score can go (below
  the start gives points back), and flat or d20-table costs. Character sheets show "Ability
  scores: 25 of 27 points spent, 2 left", in red when over or out of range. It prints in words.
- Search everything: a box in the top bar (Ctrl+F) finds anything by name, then by its words,
  says what it is and which tab it is on, and opens it there.

### 2026-10-20 (milestone 9: the AI)

- Part 1, the AI panel: a prompt line at the bottom of every world and system, with "Working on:"
  (the thing open in the editor, or the whole world; click to switch). The AI looks things up and
  proposes changes, shown as a list in plain words with Accept and Reject. Nothing changes before
  Accept; Accept is one undo step labelled "AI: <the request>" and marked as the AI's in History.
  The AI can't delete (it can only suggest), uses only the named actions (change values, make
  things, put bricks on sheets, change a brick on a sheet, file under a category, update the
  World Notes), and a job that fails halfway changes nothing. World Notes (lines you write are
  pinned), a chat saved with the world, cost estimates before big jobs, a monthly total, and
  Settings → AI for the key, the model choice and the cost warning. Tested with a pretend AI in
  the automatic tests and with a pretend Claude server in the real window.
- Part 2, checking: a Check for errors button (the spark at the top of the flag panel) has the AI
  review your own work against the ticked checks, including the new AI-only Lore consistency.
  What it finds arrives as yellow flags marked "Found by the AI", which work like any other
  (It's fine, Ignore all like this, filter by kind); the next check replaces them. Every flag's
  details have Ask AI, which proposes the most reasonable fix in the AI panel, with Show me other
  ideas. Live AI checking (Settings → AI, starts off, with a one-time tip) checks just what you
  changed, a few seconds after you stop, with the quick model.
- Part 3, building with the AI: Create from a document… reads your own .txt, .md or Word file and
  builds what it describes, part by part; Generate a whole system… builds a game from a sentence
  in seven sections. Each part is its own proposal with its cost shown first when it is over the
  warning, and a strip shows how far it has got, with Build next section and Stop.
- Not built yet from the design's AI list (smaller helpers, for after Jeff's testing): "AI: decide
  the rest" on a Rules tab section, "Ask AI to build this formula", the brick maker's
  multiple-choice questions, AI tagging of imported content, and converting numbers after the core
  check changes.

### Milestone 9: what Jeff can test

1. Without a key: the AI panel at the bottom says to add one, and everything else works.
2. Get a key (console.anthropic.com → Billing to add a few dollars → API Keys → Create Key) and
   paste it in Settings → AI, or the panel's Add key… button. Never paste it anywhere else.
3. Open a monster and ask "Make it sneakier". Read the list of changes, then Accept or Reject.
   Accept is one Ctrl+Z.
4. Ask "All swords use Dexterity" with Working on: whole world.
5. Press the spark at the top of the flag panel (Check for errors) after making a few things of
   your own. Double-click a yellow flag and try Ask AI.
6. Try Generate a whole system… in a new system from scratch, a section or two, then Stop.
7. Settings → AI shows this month's total; your Anthropic account shows the real bill.

### Milestone 10: what Jeff can test

1. New system → Generic d20. Beings → Monsters lists all 341 SRD monsters; open the Adult Red
   Dragon. Items has the weapons, armour, gear and magic items; Library → Spells has every spell.
2. Rulebook → Player's Handbook now has a Spells chapter. Try Save as Word…, open it in Word and
   choose Yes when it asks to update fields (that fills in the page numbers).
3. Make a world on it, then press Table mode at the top. Search "poison", click a monster, then
   Ctrl-click Poisoned to read both side by side. Star a few things and tick Starred only. Make a
   roll table in the Lore tab first to try Roll in the Tables tab. Edit goes back.

### 2026-10-20 (milestone 10: Table mode, Word export, full SRD 5.2)

- Part 1, Word export: the Rulebook tab has Save as Word… beside Save as PDF. The file has the
  cover, contents with page numbers, chapters (Word's own Heading styles, so the navigation pane
  works), stat lines, pictures, "See Poisoned (page 42)", the index and the credits. Checked by
  opening it in LibreOffice, which filled in every page number.
- Part 2, Table mode: a Table mode button in the top bar opens the world as a read-only reading
  view with tabs Rules, Monsters, Items and Tables. Search (Ctrl+F; "Also in Monsters (4)" when
  other tabs match), Starred only, stars on every entry, up to three entries side by side
  (Ctrl-click opens one beside the others, like a browser tab; "See Scimitar" links open things
  too), and a Roll button on tables that highlights the row it lands on. Edit goes back.
- Part 3, the full SRD 5.2: New system → Generic d20 now builds all of it: 341 monsters, 339
  spells, 38 weapons, 13 armours, 145 pieces of gear and poisons, 262 magic items, 9 species with
  their lineages, 12 classes with their subclasses and features, 4 backgrounds, 17 feats, the 15
  conditions in the SRD's own words, weapon properties and masteries, and languages. The
  rulebook gains a Spells chapter (Player's Handbook and Complete Rulebook); Table mode lists
  spells in its Rules tab. A fresh SRD system opens with no flags. Checked in the real window: it
  builds in under half a second, a 355-page Player's Handbook lays out in 1.5 seconds, and the
  whole SRD saves as a 515-page Word file.
- Made the engine much faster on big systems (opening a sheet went from 0.2 to 0.02 seconds) by
  not copying every record just to read it.

### 2026-10-20 (milestone 8: Quick start, lore, roll tables, check settings)

- Check settings (World or System settings): Balance, Economy and Filing each switch on or off,
  with a Relaxed / Normal / Strict slider. Red flags can't be switched off. The flag panel can show
  all flags, red only, or one kind. The home screen's counts follow each world's settings.
- The Lore tab: lore pages, places and factions (places and factions start with headings from
  their templates; headings can be renamed, added and removed), book pages (How to play, a
  foreword) with which books they appear in and the chapter they come before, and roll tables
  (dice such as d6, 2d6 or d100; rows with ranges, words and an optional link to anything; a Roll
  button). Lore and roll tables print in the rulebook's "The world" chapter.
- Quick start (`src/app/quickstart.ts`): after making a system from scratch, six questions, one
  click each, skippable: how checks work, which abilities, how harm works, heroic or gritty, grid
  or theatre of the mind, and magic. It builds ordinary rules in one undo step. It is also on the
  Rules tab of a system while nothing is picked.
- 174 automatic tests pass (6 new). Driven once in the real window here.

### Milestone 8: what Jeff can test

Make a new system From scratch and answer Quick start (try the underwater d100 game from the
design: d100, four abilities, wound boxes, gritty, theatre of the mind, mana). Add a faction and
a roll table in the Lore tab and press Roll. In System settings, switch a check off.

### 2026-10-20 (milestone 7: sharing and snapshots)

- Share (in World settings or System settings): saves one file to send. A world always carries
  its system chain and its pictures; undo history and snapshots only if ticked; never settings.
- Import (home screen top bar): never overwrites. A system identical to one on the shelf is shared;
  one with the same id that differs arrives as its own copy, "d20 Basic (from Jeff)"; a world
  already on the shelf arrives as "Greyhollow (copy)". Undo history only travels when nothing had
  to be renamed. Damaged files and files from a newer app are refused with a plain message, and
  nothing is half-imported.
- Your name (Settings): optional, no account. It goes on every world, system and thing you make
  and on the rulebook's Created by line. Imported things keep their maker's name and are marked
  as from others, unless they carry your own name (a file from your laptop).
- Lists in Beings and Items can show Everything, Homemade, From a starter or From others; sheets
  say "By Jeff" for things from others and "From the starter" for starter content.
- Snapshots (World settings): take one with a name, restore (a snapshot of now is taken first),
  delete, how much space history uses, and Clean up for the snapshots the app took by itself.
- 168 automatic tests pass (7 new). Driven in the real window here.

### Milestone 7: what Jeff can test

Put your name in Settings. In a world, take a snapshot, delete something, restore the snapshot.
Share the world, then Import the file on the home screen (it arrives as a copy). Send a file to
another computer if you have one.

### 2026-10-20 (milestone 6, step 2: the small d20 starter; first playable complete)

- Generic d20 now works in New system (`src/app/starters/d20.ts`): the d20 check; the six
  abilities in sheet order; hit points from Constitution with Unconscious at 0; the 18 skills; the
  15 conditions with short descriptions; short rules for initiative, turns, attacks, advantage,
  resting, coins, levels and spellcasting; library bricks for natural and weapon attacks, traits,
  effects (knocked prone, poison, paralysis), immunity to poison and two spells; 19 items (weapons
  under Melee, Light and Ranged, armour by weight, gear, a healing potion); 19 monsters, 3 NPCs,
  3 races and 2 classes. It shows off the features: Basic Melee Weapon is a template whose
  variants are the metal weapons, and Goblin Boss is a variant of Goblin.
- Everything in it is marked as SRD 5.2 content, so its rulebook prints the CC-BY credit line by
  itself. The rules text is short and written for the app.
- It opens with no red or yellow flags. Getting there improved one check: damage per round now
  counts carried weapons one at a time (the best one) while natural attacks all count, so a goblin
  with a scimitar and a bow isn't flagged as hitting twice as hard.
- 161 automatic tests pass (4 new). A d20 system was made in the real window here and its Monster
  Manual saved as a PDF and read back.

### First playable: what Jeff can test

Make a system from Generic d20 and a world on it; look through the Rules tab, the monsters and
items; build a monster of your own from library bricks; delete Strength and fix, undo and restore;
then go to the Rulebook tab, pick a book and Save as PDF.

### 2026-10-20 (milestone 6, step 1: the rulebook)

- The Rulebook tab: choose the book (Player's Handbook, Monster Manual, GM Guide, World Guide or
  Complete Rulebook), tick or untick chapters, print variants in full or as differences, monsters
  in order of challenge, a "Created by" line, and Letter or A4. The preview in the middle is the
  same page that becomes the PDF. Save as PDF… and Print….
- `src/book/`: the book page. It lays the book out into real pages (a cover, contents, a chapter
  per section, an index and credits), then fills in the page numbers: the contents, the index,
  and "See Poisoned (page 6)" under entries. Links in the PDF jump to the page.
- The plain-English summaries moved into the engine (`src/engine/rulestext.ts`), so the book
  prints exactly what each rule's editor says. The book builder now reads the Rules tab's values
  (it had guessed older names), prints short labels, keeps abilities in the order they were made,
  names effects ("Poison Bite. The target is Poisoned.") and points page references at what a
  brick links to, never at library bricks, which don't print.
- 157 automatic tests pass (3 new). A PDF was made and read back here, page by page.

### 2026-10-20 (milestone 5, step 4: world rules, and editing the system from a world)

- World rules have their own section at the end of the Rules tab: "Nothing may have [Material]
  equal to [Metal]" (or damage type, size, kind of being, or a value named by the user), with the
  deliberate exceptions listed and removable. Everything that breaks one is red, including things
  added later. Items' basic sheet gained a Material box for this.
- Edit in the system (beside "From the system" on rules, sheets and library bricks, inside a
  world): the system's version beside this world's, with Use my version, then a checklist of the
  system's worlds with this one ticked. Unticked worlds keep the old value as their own (written
  into their own files, with a pencil mark); values a world set itself are never touched; a world
  open on another computer right now can't be protected, so the checklist says it will get the
  change. The change is one undo step in this world.
- 154 automatic tests pass (6 new). Driven in the real window here.

### Milestone 5: what Jeff can test

Delete Strength, fix it, undo, restore: delete Strength in the Rules tab, double-click the red
flag, tick some, point them at another ability, leave the rest; then restore Strength from the
recycle bin (the bin button in the top bar) and reconnect. Make a new "Strength" while the old one
is in the bin. Open History (the clock button) and roll back. Add a "No metal" world rule and an
Iron Helm made of metal. In a world, use Edit in the system on a rule and untick another world.

Not in this milestone, still to come:
- Changes from a world reaching the worlds of a system's variants (Edit in the system covers the
  worlds directly on the system).
- AI-found flags, the check categories with on/off and sliders (after first playable).

### 2026-10-20 (milestone 5, step 3: History)

- History (the clock button in the top bar): every step in plain words, newest first, with when
  it happened, an AI label for AI steps, and "Removed Strength, 2 things affected" for removals.
  Clicking a line shows what it changed (with links to go to each) and offers Roll back to here.
  Rolled-back steps wait above as Undone, with Redo up to here. Roll back everything is there
  too. If a step can't be undone safely, rolling back stops there and says why.
- One brick dropped on several sheets now reads "Added Claw to 3 sheets".
- 148 automatic tests pass (4 new). Driven in the real window here.

### 2026-10-20 (milestone 5, steps 1 and 2: the flag panel and the world's recycle bin)

- `src/app/flagpanel.ts`: blocks in the design's order (red, yellow, blue, green) with a counter
  and "new until seen"; the fix-by-hand detail for a broken link (every affected thing with what
  on it is broken, tick any set, point them at something of the same kind or remove the link,
  repeat with the rest or leave them for later); "I meant that" for world rules; Ignore, Ignore
  all like this (yellow only, as the hard rules say), Show ignored and Switch back on; "It's fine"
  for yellow; green blocks for fixes, with Undo while they are the latest change; and a blue
  notice when flags clear by themselves ("1 flag cleared by "Restored Strength"").
- The world's recycle bin (the bin button in the top bar): restore brings back everything that
  still pointed at it, then a reconnect checklist offers back anything moved elsewhere meanwhile,
  marking ones changed again since. Making something with the name of a deleted thing asks
  "Restore Strength instead?". Emptying asks first and is the one permanent action.
- The panel's memory is saved with the world (see `docs/data-format.md`, meta).
- 144 automatic tests pass (11 new). Jeff's milestone 5 test (delete Strength, fix it, undo,
  restore) was driven in the real window here.

### 2026-10-20 (milestone 4: Jeff's answers, and finishing touches)

- Jeff's answers: yes to the undo and redo buttons beside Home; yes to one Create new pop-up with
  the variant choice inside it; yes to a variant not removing a brick it inherited.
- Jeff asked Claude to decide what still belongs in milestone 4. Decided: templates, starting a
  new sheet as a copy, and sorting by challenge now (all in first playable and small). Edit
  parent from a world up to its system moves to milestone 5, because it has to change other
  worlds' files safely. A system choosing what its own sheets show, and movable panels, come
  after first playable.
- Built: templates (Make it a template when creating, or Make template / Make it real on a
  sheet; kept out of the lists, the checks and the rulebook; shown in the library's Templates
  group; a new item filed under a category with a template suggests starting as its variant);
  "Start from" in Create new (nothing, a variant of a thing or a template, or a copy of a thing);
  and A to Z or By challenge for Monsters and NPCs.
- A new system made from scratch now starts with the design's small set of categories (Weapon,
  Armour, Item, Creature, Spell), so the first item can be filed as a Weapon straight away.
- 133 automatic tests pass (5 new). Driven in the real window here.

### 2026-10-20 (milestone 4, step 4: drilling in and Edit parent)

- `src/app/drill.ts`: one sheet's copy of a brick (its own name, values with pencil marks, when it
  works with several triggers joined by or/and, how often including formulas such as INT, a
  saving throw), bricks nested inside bricks, the family checklist with notes ("set its own
  Cost", "follows Axe"), and changing a parent with ticked and unticked children as one step.
- Screens: `src/ui/drill-dialog.ts` (click a brick card on a sheet) and `src/ui/edit-parent.ts`
  (the Edit parent button beside "Variant of", or Alt-click the sheet). Edit parent shows the
  parent's values beside this sheet's with "Use my version", Up one level for grandparents, then
  the checklist of the whole family, indented, with this sheet ticked. Unticking protects the
  branch below unless a node in it is ticked again on its own.
- Dropping a library brick onto a brick card nests it inside (Fire inside Knocked prone).
- 128 automatic tests pass (6 new, using the design's Big Shield and Sword, Axe and Double Axe
  examples). Driven in the real window here, end to end.

### Milestone 4: what Jeff can test

Build a small system and a few monsters by hand: add abilities, hit points as a formula, skills,
conditions and the core check in the Rules tab; make monsters with variants in Beings; make
bricks in the Library and drag them onto sheets (Ctrl/Shift to pick several, or several sheets
at once); click a brick on a sheet to change that copy; use Edit parent from a variant. Delete
Strength and watch the red flags, then Ctrl+Z.

Still to come (decided October 20, 2026):
- Milestone 5: Edit parent from a world up to its system.
- After first playable: a system choosing what its own sheets show (every system uses the basic
  sheets for now), and movable, dockable panels.
- Not yet scheduled: Change parent for many nodes at once, choice bricks and upgrade tiers on
  screen, and smart text.

### 2026-10-20 (milestone 4, step 3: the library, drag and drop, selection)

- `src/app/library.ts`: library bricks by type (attacks, spells, traits, effects, damage,
  immunities, ability bonuses, armour) plus items to carry as gear; each with its plain-English
  sentence; attaching many bricks to many sheets as one undo step; which section a brick lands in;
  and the smart-drop rule (a spell on an item asks when it works and how often).
- Screens: `src/ui/library-panel.ts`. The left panel switches between the tab's list and the
  Library. Library sections fold up and filter on their own. Click, Ctrl-click and Shift-click
  select, as in File Explorer, in both the library and the list. Drag onto the open sheet (or onto
  a name in the list), or press "Add to …". With several sheets selected in the list, a drop adds
  to all of them. Double-click a library brick to open the original; changing it changes every
  sheet that uses it.
- Sheets show their bricks as cards in the right section, with the sentence, "From Goblin" on
  inherited ones, a remove button with Undo, and [missing: Claw] in red if the original was deleted.
- 122 automatic tests pass (10 new). Driven in the real window here: dragging two bricks onto two
  selected goblins, and a spell onto a shield with the question answered by pressing Enter.

### 2026-10-20 (milestone 4, step 2: Beings and Items sheets)

- `src/app/sheets.ts`: the five kinds of being, the sheet each kind shows (header numbers,
  ability scores, sections), the starter categories (Weapon, Armour, Item, Creature, Spell) with
  + New category up to three levels deep, lists with variants indented under their parents to any
  depth, creating beings and items (optionally as a variant), and Detach.
- Screens: `src/ui/sheets-tab.ts`. Beings has the sub-tabs Characters, Classes, Races, Monsters
  and NPCs; Items are grouped by where they are filed. Lists filter by name and by favourites.
  A sheet has its picture, name, star, kind, Filed under, "Variant of" with Detach, the header
  numbers, the system's abilities as score boxes with the bonus worked out, its sections (empty
  until the library arrives in step 3), the description, and Used by.
- Pencil marks now cover variants too: "Use Goblin's" puts a value back to following the parent.
- 112 automatic tests pass (9 new), including the Part 4 rules: a parent's change reaches a variant
  unless it set that value itself, through every generation; Detach keeps everything as it was.

### 2026-10-20 (milestone 4, step 1: the Rules tab)

- `src/app/rules.ts`: the Rules tab's ten sections from the design (Core check, Abilities,
  Resources, Skills, Conditions, Combat, Magic and powers, Advancement, Time and rest, Currency
  and economy), plus sections of the user's own; each kind's defaults; and the plain-English
  summary at the top of each rule.
- `src/app/editing.ts`: the named actions for changing things (add, rename, change a value, use
  the system's value, move to a section, delete, undo, redo), each one step in history, and the
  views the window shows (a node with its links' names and Used by, the drop-down choices, flags).
- Screens: `src/ui/place.ts` (an open world or system) and `src/ui/rules-tab.ts` (sections on
  the left, the open rule in the middle, flags on the right).
- Each kind has its main choices up front and the fine print under More options: abilities
  (label, score range, how the bonus works), resources (label, maximum built from blocks such as
  [Constitution score] [+] [10], how it starts; recovery, display and thresholds that link to
  conditions), skills (linked ability), conditions (duration, saving throw; stages), the core
  check (the eight families and their settings), and free-text rules.
- Inside a world, a system rule changed there shows a pencil mark with "Use the system's".
- The red flags show in the flag panel straight away: deleting Constitution flags Hit points
  ("Constitution removed: 1 thing affected", with [missing: Constitution] in its formula), and
  Ctrl+Z puts it all back.
- 103 automatic tests pass (11 new). Driven in the real window here, which found and fixed two
  problems (a new rule's name box didn't get the cursor; a redraw could cut the logo's glow short).

### 2026-10-20 (milestone 3 approved)

- Jeff approved milestone 3 and all six open points as built: Generic d20 greyed out until the
  starter exists; "Move them to another system" greyed out until copying a world into another
  system exists; after creating a world the app stays on the home screen with the new card
  highlighted; renaming and pictures in World settings come later; the Recycle bin folder in the
  main folder; and the paper and leather-pocket look.

### 2026-10-20 (milestone 3)

- Milestone 3 written: the Electron desktop app.
  - `src/app/backend.ts`: everything the window can ask for (home screen, New system, New world,
    delete to the recycle bin, restore, empty, settings, opening worlds and systems, backups),
    plain TypeScript with no Electron in it so it is tested like the engine.
  - `src/app/session.ts`: one open world or system, with constant saving, the save signal for the
    pulsing logo, and the lock heartbeat every 15 seconds (finishing milestone 2's to-do list).
  - `src/app/settings.ts`: the app's own settings on this computer (main folder, last opened,
    and where the user is, for crash recovery).
  - `src/app/main.ts` and `preload.ts`: the Electron window, kept thin. `src/ui/`: the screens.
  - `src/storage/library.ts` gained the recycle bin for whole worlds and systems, card pictures
    for systems, and a way to read a world for its flag counts without opening it.
  - `scripts/build.mjs` builds the app; `npm start` runs it; `npm run dist` makes the installer.
    `.github/workflows/windows.yml` builds the installer on a Windows computer at GitHub.
- What the home screen does: two shelves of cards (Systems, Worlds), last opened first; a
  placeholder picture until one is chosen; world cards show their system's name and a flag count
  (2 red · 5 yellow); system cards show "Used by 3 worlds". Double-click (or Enter) opens. The
  bin button on a card asks, then sends it to the recycle bin; a notice offers Undo, and Ctrl+Z
  on the home screen does the same. Deleting a system that worlds use warns and lists them.
  Top bar: Import (greyed out until sharing), Recycle bin (with a count), Settings (main folder).
- New system and New world are short linear pop-ups: name (required), picture (optional), then
  the starting point or the game system. New world is greyed out with "Create a system first."
  until a system exists. Generic d20 is listed but greyed out until the d20 starter is built
  (milestone 6), so From scratch is the only choice for now.
- Opening a world or system fills the window: tabs (Rules, Creatures, Items, Lore, Rulebook),
  Home and World settings on the right, and the list, editor and flag panels, empty for now.
  World settings lists backups in plain words ("Yesterday") with Restore.
- Crash recovery works in the real app: killing the app while a world is open and starting it
  again reopens that world with the blue "Recovered after an unexpected close." notice.
- Open on another computer: the app offers Open read-only or Take over; the first computer
  switches to read-only at its next heartbeat and stops saving.
- 92 automatic tests pass (20 new). The app was also driven click by click in a real Electron
  window here, which found and fixed one bug (Enter in the name box skipped the picture step).
- Not checked here: the installer itself, which can only be built on Windows. The GitHub
  workflow builds it; Jeff's test is to install it and open it.
- Left for later, needing Jeff's decisions: "Move them to another system" when deleting a system
  (shown greyed out; it needs copying a world into a different system), renaming and changing the
  picture in World settings, Import, and what the AI part of Settings looks like.

### 2026-10-20 (checks and rulebook engine)

- While waiting for package access, built the engine parts of milestones 5 and 6:
  `src/engine/conventions.ts` (field names), `checks.ts` (world-rule red flags with "I meant
  that" exceptions; yellow checks for balance, economy and filing, with relaxed, normal and
  strict, each category switchable), `text.ts` (plain-English sentences, including nested
  bricks, saving throws, several triggers joined by or/and, uses with formulas, choices and
  upgrade tiers), `book.ts` (book types with their chapters, book pages placed between
  chapters, variants printed as differences or in full, monsters by challenge, links listed per
  entry for page references, index, and automatic credits including the SRD 5.2 line).
- 72 automatic tests pass.

### 2026-10-20 (milestone 2)

- Milestone 2 written: `src/storage/` (zip, atomic, lock, autosave, library), plus two engine
  additions: a change signal (`onChange`) for constant saving, and undo that refuses to overwrite
  something changed elsewhere since.
- 56 automatic tests pass. New ones cover: world files are standard ZIPs and damage is detected;
  the main folder layout and home-screen lists; save, close and reopen with undo history; system
  changes made inside a world reach other worlds; pictures stored once, carried inside the world
  file, and recovered if the picture store is lost; a world sent without its system brings it
  along; saving about a second after the last change and never waiting more than five; a failed
  save is retried and nothing is lost; a power cut mid-save keeps the last good save and the app
  reports it recovered; another computer gets read-only or takes over; an old lock from a
  stopped computer doesn't block; backups kept daily for a week and weekly for a month; backups
  don't copy pictures; restoring a backup or snapshot takes a snapshot first; snapshots hold
  the system too; undo never overwrites a change made elsewhere; newer files open read-only and
  are never saved over; damaged files give a clear message; ids can't reach outside the folder.
- Still to do for saving, in milestone 3 (needs the app running): the heartbeat timer that
  refreshes the lock every 15 seconds, and the pulsing logo wired to `onSaved`.

### 2026-10-20

- Repo set up: hard rules (`CLAUDE.md`), full design (`docs/design.md`), data format
  (`docs/data-format.md`), this log, README.
- Started milestone 1 on branch `milestone-1-engine`.
- Milestone 1 engine written: `src/engine/` (types, ids, links, workspace, flags, file).
  36 automatic tests pass, covering: links and Used by; systems, variants and worlds as layers;
  changes staying in a world; changes flowing down every generation; the checklist (unticked
  keeps the old value, branches protected, a grandchild ticked on its own); no variant loops;
  inherited bricks; deleting a parent promotes its variants; brick originals with unticked
  sheets; deleting Strength gives one grouped red flag for 214 links; fixing 214 is one undo
  step; fixes from a world stay in that world; restore and reconnect (flagging what changed
  since); undo of a delete; all-or-nothing steps; AI-labelled history; emptying the bin is
  permanent; history age limit; save and reopen with undo history; a power cut mid-save keeps
  the last good save; half-written saves ignored; newer files open read-only; damaged files
  give a clear message.
- Not yet in milestone 1: red flags for the user's own world rules ("no metal"); these come
  with the flag panel in milestone 5.

## Decisions

One plain line each. Jeff can overrule any of these at a milestone.

- 2026-10-20: The engine is plain TypeScript with no outside libraries, so it is easy to test and
  never breaks when a library changes.
- 2026-10-20: Tests use Node's built-in test runner, which runs TypeScript directly with nothing
  to install.
- 2026-10-20: Systems and worlds are stored as layers stacked on each other; a world's layer sits
  on its system's layer. This is how "every world's rules are a child of its system" works.
- 2026-10-20: Categories are nodes too, so they get permanent IDs and renaming one never breaks
  anything filed in it.
- 2026-10-20: The one way to point at another node is a link written as `{ "link": "<id>" }`.
  Because every link looks the same, the app can always find every link, which makes "Used by"
  and red flags reliable.
- 2026-10-20: Each undo step stores the before and after of only the nodes it touched, so a
  bulk change of 214 things is still one small step.
- 2026-10-20: Saving writes to a new file next to the old one, then swaps it in. A crash or power
  cut mid-save leaves the old file whole.
- 2026-10-20: When a world un-sets a field it had changed, the world stores "removed" for that
  field, so it follows its system again.
- 2026-10-20: Fixing a red flag from inside a world writes the fix into that world only; fixing it
  from the system fixes it for every world.
- 2026-10-20: Removing a broken link that is the brick of an attachment removes that attachment
  (the attack has nothing left to be a copy of). Undo puts it back.
- 2026-10-20 (Jeff may want to check): Emptying the recycle bin also clears undo history up to
  the last step that touched an emptied item, so undo can't quietly bring it back. This keeps
  "emptying the bin is the only truly permanent action" true.
- 2026-10-20: Undo history is kept for 30 days or 5,000 steps, whichever is smaller.
- 2026-10-20: Node's type definitions are borrowed from tools already on the build machine until
  packages can be installed; `package.json` lists them for any normal machine.
- 2026-10-20: World and system files are ordinary ZIP files (written by our own small ZIP code,
  no library), so they can be opened with any unzip tool in an emergency.
- 2026-10-20: Each world file carries a copy of its whole system chain, so a world can be sent
  on its own. When the system's own file is on the shelf, that file wins.
- 2026-10-20: Files are named by permanent ID, not by name, so renaming never moves a file.
- 2026-10-20: Pictures are named by their content, so the same picture is only ever stored once.
- 2026-10-20: Saving waits about 1 second after the last change, and never more than 5 seconds.
- 2026-10-20: A world's lock is refreshed every 15 seconds; a lock not refreshed for 2 minutes
  belongs to an app that stopped, and no longer blocks anyone.
- 2026-10-20: The app will run as a single copy per computer, so a leftover lock from the same
  computer always means the last session ended unexpectedly.
- 2026-10-20: "Take over" moves the lock at once; the other computer finds out at its next save
  or heartbeat and switches to read-only. Because saving is constant, it loses at most a few
  seconds of work.
- 2026-10-20: Backups are taken the first time a world is opened each day.
- 2026-10-20: Undo refuses, with a plain message, if something the step changed was changed
  again elsewhere (for example the system edited from another world). It never overwrites.
- 2026-10-20: Balance compares a monster with the middle value (median) of other monsters at the
  same challenge, so one odd monster doesn't make the normal ones look odd. It stays quiet until
  there are at least 3 others at that challenge.
- 2026-10-20: Sensitivity: a monster is flagged at 2.5x normal (relaxed), 1.75x (normal) or 1.3x
  (strict). A weaker weapon is flagged when it costs 2x (relaxed), 1.2x (normal) or 1x (strict)
  more than a stronger one in the same category.
- 2026-10-20: Duplicate names, empty sheets and oddly filed things are part of the Filing check
  category.
- 2026-10-20: World rules check the things in the world, not the library's original bricks.
- 2026-10-20: The SRD 5.2 credit line used is the standard Creative Commons wording; check it
  against the official SRD 5.2 document before the first public release.
- 2026-10-20: The cloud session used for building cannot reach the npm package registry, so
  Electron (milestone 3) waits until a session can install packages. Milestones 1 and 2 need no
  installs.
- 2026-10-20: Milestone 3's session could install packages. Only build tools are installed
  (Electron, electron-builder, esbuild), pinned to exact versions at least two weeks old. The app
  itself still uses no outside libraries.
- 2026-10-20: The screens are plain TypeScript building the page directly, with no framework
  (React and the like), to match the engine. Revisit at milestone 4 if the editor needs one.
- 2026-10-20: esbuild packs the TypeScript into three files for Electron (main process, preload,
  window). The engine and tests still run the TypeScript directly.
- 2026-10-20: The window has no access to files or Node. It can only call a fixed list of named
  back-end methods through one bridge, and pictures load through a private dmpic:// address that
  can only read the picture store.
- 2026-10-20: The app's own settings (main folder, last opened, where the user is) live in the
  app's settings folder on this computer, not in the main folder, so two computers sharing a
  Dropbox folder never overwrite each other's settings.
- 2026-10-20: "Last opened" is per computer. Things never opened on this computer sort by when
  they last changed. A newly created system or world counts as just opened.
- 2026-10-20: Crash recovery: the app notes which world or system is open and clears the note on
  going home or closing normally. Finding the note at start-up means an unexpected close, so the
  app reopens that place and shows the blue notice.
- 2026-10-20: Deleted worlds and systems go to a Recycle bin folder inside the main folder, as
  whole files, so restoring brings back everything including undo history. Deleting a system
  takes its worlds and the systems built on it into the same bin entry; restoring a world whose
  system was binned separately brings that system back too. (Jeff may want to check: this adds a
  folder to the main folder layout, documented in `docs/data-format.md`.)
- 2026-10-20: Emptying the bin also deletes those worlds' backups and snapshots. Pictures stay
  in the picture store for now; a Clean up for unused pictures comes with the history-space
  settings.
- 2026-10-20: Only one copy of the app runs per computer; starting it again brings the open
  window forward.
- 2026-10-20: Pictures can be PNG, JPG, GIF or WebP, up to 25 MB each.
- 2026-10-20: The Windows installer lets the user choose where to install, installs for the
  current user only (no administrator needed), and adds Start menu and desktop shortcuts. It is
  not code-signed yet, so Windows shows a warning the first time.
- 2026-10-20: The installer is built by GitHub Actions on a Windows computer on every push, after
  all tests pass, so Jeff can download it without setting anything up.
- 2026-10-20: A system opened on its own has no "one copy open" lock yet; only worlds do. Worth
  adding before systems are edited from two computers at once.
- 2026-10-20: Rules tab sections are category nodes under one "Rules" category, each built-in one
  marked with a section key, so renaming a section never breaks anything. They are made the first
  time something is added, in the same undo step. The rulebook finds the core check through it.
- 2026-10-20: Abilities, resources, skills and conditions always show in their own sections;
  only general rules can move between sections.
- 2026-10-20: New field names for rules are listed in `src/engine/conventions.ts` (label, score
  range, bonus, maximum, start, recovery, display, thresholds, family, die, target, stages,
  duration, save). Formulas are stored as blocks with links, so deleting an ability flags them.
- 2026-10-20: A value is saved when you leave its box or press Enter, as one undo step, rather
  than on every key press, so Ctrl+Z undoes a whole change.
- 2026-10-20: Ctrl+Z inside a text box undoes typing in that box, as everywhere else; outside a
  box it undoes the last change in the world.
- 2026-10-20: Deleting a rule doesn't ask first, because it goes to the recycle bin and a notice
  offers Undo (the "always quiet" flag design).
- 2026-10-20 (Jeff may want to check): Undo and Redo also have small arrow buttons in the top bar,
  beside Home, for anyone who doesn't know Ctrl+Z.
- 2026-10-20: The Creatures tab is now called Beings, following the October 20 design decision.
- 2026-10-20: Each ability score on a sheet is its own value, so a variant that changes only its
  Dexterity keeps following its parent's other scores, and deleting an ability flags every sheet.
- 2026-10-20: Abilities are listed in the order they were made (STR, DEX, CON...), not
  alphabetically; everything else is alphabetical.
- 2026-10-20: Until a system can edit its own sheets, every system uses the basic sheets in
  `src/app/sheets.ts` (monster: hit points, armour, speed, challenge; and so on).
- 2026-10-20 (Jeff may want to check): Create new is one short pop-up (name, what it is, Variant
  of…) instead of a second pop-up for "Variant of".
- 2026-10-20: New beings are filed under Creature and new items under Item, unless chosen
  otherwise. A variant starts in its parent's category.
- 2026-10-20: In the library, a single click selects (for dragging) and a double-click opens the
  original, like files in File Explorer. Some rarer library sections start folded.
- 2026-10-20: For now the only drop that asks questions is a spell on an item (when it works,
  how often). Other drops just land, with the sheet's copy following the original.
- 2026-10-20: A variant shows its parent's bricks but can't remove them; the message says to
  change the parent or Detach. (Removing an inherited brick from just one variant would need a
  new kind of stored value, which would be a data format change for Jeff to approve.)
- 2026-10-20: The library selection is kept while switching between the list and the library,
  so you can pick sheets in the list, then bricks in the library, then drop.
- 2026-10-20: Changing a brick on a sheet saves straight away, like everything else; setting a
  value back to the original's removes the pencil mark rather than storing a copy.
- 2026-10-20: Edit parent collects its changes and saves them only after the checklist, as one
  undo step. It covers a sheet's header numbers and ability scores for now.
- 2026-10-20: A variant's checklist row is greyed out when it set every changed value itself,
  since ticking it would make no difference.
- 2026-10-20: A copy of a variant stays a variant of the same parent (with the same own changes),
  so it looks the same and keeps getting the parent's changes; a copy of anything else stands alone.
- 2026-10-20: Setting up a new system's starter categories isn't an undo step; it is the starting
  point, like an empty page.
- 2026-10-20: Templates are opened from the library, not dragged onto sheets; a sheet uses a
  template by being its variant.
- 2026-10-20 (Jeff may want to check): The flag panel's memory (ignored flags, which are seen, the
  blue and green blocks) is kept in the world file's meta area, beside the card picture. It is
  not part of undo history; ignoring is undone with Show ignored, Switch back on.
- 2026-10-20: Clicking a flag goes to the first thing it's about; double-clicking opens the
  details and fixes (as in the design). Ignore and Undo appear on the block when pointed at.
- 2026-10-20: A green block's Undo only works while its change is the latest one, because undo
  goes back in order; otherwise it says to use History.
- 2026-10-20: In the reconnect checklist, things changed again since the fix start unticked.
- 2026-10-20 (Jeff may want to check): Items' basic sheet has a Material box, so "No metal" has
  something to check (the design's Longsword carries a Material of Metal).
- 2026-10-20: World rules match words without caring about capitals (Metal, metal, METAL).
- 2026-10-20: When the system is changed from inside a world, unticked worlds are protected by
  writing the old value into their own files at once. Undoing the change in this world puts the
  system back; the protected worlds then simply match the system again.
- 2026-10-20: The PDF is made by the app's own browser engine from the same page as the preview,
  with no outside library. Pages are laid out by the app so page numbers in the contents and index
  are exact.
- 2026-10-20 (Jeff may want to check): Each chapter starts on a new page, like a printed rulebook;
  one simple look for now (book styles, two columns, cover pictures and Word export come later).
- 2026-10-20: The page size defaults to Letter; A4 is a choice.
- 2026-10-20: The starter's monster and item numbers follow the SRD 5.2 in simplified form (for
  example ability bonuses aren't added into damage); check them against the official SRD 5.2
  before any public release, together with the credit wording.
- 2026-10-20: Starter content is marked as coming from a template ("source: template"), as the
  data format allows, so it can later be told apart from homemade content.
- 2026-10-20: The damage check counts natural attacks together but carried weapons one at a time.
- 2026-10-20: Light melee weapons have their own category (Weapon → Melee → Light) in the starter,
  because their prices are only fair when compared with each other.
- 2026-10-20 (Jeff may want to check): Imported worlds and systems go on the normal shelves for now,
  marked as from others, rather than in the Imported folder, because the home screen layout for
  "Other worlds" is still to be designed.
- 2026-10-20: Share and Import are in World or System settings and the home screen's Import button,
  as the design says (no right-click menus).
- 2026-10-20: Clean up removes only the snapshots the app took itself ("Before restoring …"); the
  user's own snapshots are kept until deleted, as Part 2 says.
- 2026-10-20: Check settings are kept with each world or system, with the flag panel's memory.
- 2026-10-20 (Jeff may want to check): Quick start has six questions (check, abilities, harm, heroic
  or gritty, grid or theatre, magic) and opens straight after New system From scratch; Generic d20
  doesn't need it.
- 2026-10-20: Lore page headings are stored with the page; the page's one text box is still there
  for anything else, and there are no secret notes.
- 2026-10-20: Rolling a table changes nothing, so it isn't an undo step and works in read-only worlds.
- 2026-10-20: The Word file is written by the app itself (a .docx is a ZIP of XML), with no outside
  library. Page numbers are Word fields that fill in when the file opens; Word may ask once to
  update fields, and Yes fills them in. Pictures go in if they are PNG, JPEG or GIF (WebP is left
  out of the Word file because older Word can't show it).
- 2026-10-20: Table mode shows the rulebook's own words (Complete Rulebook, variants in full), so
  what is read at the table is what prints. Lore pages, places and factions sit in the Rules tab
  under Lore, since the design lists only four tabs. Starring is the one thing that works there; it
  is an ordinary undo step.
- 2026-10-20: The SRD 5.2 content comes from the open 5e-database project (MIT licence; the content
  itself is CC-BY 4.0), converted once by scripts/srd-convert.mjs into src/app/starters/srd52.json,
  which is committed. The app never reaches the internet or that project. The official SRD PDF
  site can't be reached from the build machine. Its notice is in src/app/starters/SRD-SOURCE.md.
- 2026-10-20: The core rules text (the d20 check, combat, resting) stays the app's own short
  version; the data has no rules-chapter text. Conditions use the SRD's words.
- 2026-10-20: Monster actions become library bricks shared by name (one Bite, one Multiattack),
  with each monster's own dice and words kept on its sheet. Attacks the app understands get an
  ability, dice and damage type, so the free checks work on them; everything else (breath weapons,
  spellcasting) is kept word for word as a trait. A second brick with the same name gets a short
  note in the library ("Bite (trait)") while the sheet still says Bite.
- 2026-10-20: Untouched SRD content is the yardstick for the free yellow checks, not a suspect:
  homemade monsters and items are measured against it, but the SRD's own are not flagged (the
  app's damage estimate can't read Multiattack or breath weapons, which made 165 false flags). An
  SRD monster changed in a world is checked again.
- 2026-10-20: Spells are spell bricks with level, school, casting time, range, components and
  duration, and print in a new Spells chapter. Monster stat-block details (size, type, senses,
  languages, resistances, XP) go in the monster's text box. Class features and species traits go
  in their text box, a line each. Backgrounds, feats, weapon properties and languages are rules
  in the Rules tab. "Druid" the stat block is called "Druid (monster)" because Druid is a class.
- 2026-10-20: Magic items that come in +1, +2 and +3 are variants of a template ("Armor (magic,
  any bonus)").
- 2026-10-20: The engine's own look-ups read records without copying them (peek); list and
  resolve results are read-only, and changes still go through edit.
- 2026-10-20: The AI talks to Claude through Anthropic's own library (@anthropic-ai/sdk 0.131.0,
  pinned, bundled into the app), in the main process. The window never sees the key.
- 2026-10-20: The key is kept with Electron's safeStorage (on Windows, protected by the user's own
  login) in its own file in the app's data folder, never in settings or a world file. If a computer
  has no protected storage the app refuses to store it rather than keep it in plain text.
- 2026-10-20: Models: Claude Haiku 5.5 is "quick" and Claude Opus 5.5 is "careful". Automatic gives
  a request about one open thing the quick model and anything about the whole world the careful
  one. Careful requests turn on Anthropic's automatic fallback: if its safety checks decline, the
  same request is tried on another model.
- 2026-10-20: A proposal is checked by trying it out and putting everything back (nothing is saved
  and nothing goes in History), so the AI hears straight away if an action can't be done and can
  correct itself. Accept runs it again for real; if the world changed so it can't be done, nothing
  changes and the user is told to ask again.
- 2026-10-20: The AI is sent the World Notes, the last 10 chat messages and what it looks up; never
  the whole world file. A proposal waiting for Accept is not saved: closing the world drops it.
- 2026-10-20: Costs are worked out from what Claude reports for each reply. The monthly total is
  kept in this computer's settings; the real bill is on the user's Anthropic account.
- 2026-10-20: Check for errors sends the user's own things (made by hand or by others, changed in
  this world, or edited since the starter made them), newest first, at most 120, plus the world
  rules and the World Notes. Starter content is only looked up as needed, so a check of a fresh
  SRD system sends nothing and costs nothing.
- 2026-10-20: The AI's findings are kept in the flag panel's memory with the world, and a check
  replaces the findings of the categories it covered; a live check replaces those about the things
  it looked at. A check can't change anything: it has only look-up, report and World Notes actions.
- 2026-10-20: Live checking waits 6 seconds after the last change, never runs for the AI's own
  changes or in read-only worlds, and if it fails a blue notice says so and nothing is applied.
- 2026-10-20: Create from a document reads .txt, .md and .docx (the words only, no pictures);
  a PDF must be saved as one of those first. Documents are cut into parts of about 12,000
  characters at paragraph breaks, and each part is one job with its own proposal.
- 2026-10-20: Whole-system generation uses a fixed plan of seven sections rather than letting the
  AI plan, so the user always knows what comes next and can stop between sections. A section is
  used up only once it runs; an estimate the user cancels leaves it waiting.
- 2026-10-20: A feature's level on a class is a value on the class, one per feature
  (level_<attachment id>), so a subclass inherits its parent's levels and can change one for
  itself. Removing a feature from a class forgets its level.
- 2026-10-20: Point buy is a rule whose method is "pointBuy", with points, scoreStart, scoreMax,
  scoreMin and costs; the d20 table is 1 point a step to 13, then 2. A system uses its first point
  buy rule. Sheets only show the total; nothing is blocked (Promise 4).
- 2026-10-20: Search ranks exact names, then names that start with the words (shorter first),
  then everything whose text or values mention them, at most 40 shown with a count of the rest.
  The box is kept across redraws so typing is never interrupted.
- 2026-10-21: Milestone 11 is built on the milestone 9 branch with main merged in, so the AI and
  the feel pass are tested together.
- 2026-10-21: "Make my own copy" of starter content makes an independent copy (not a variant), so
  every picker works on it; it keeps the starter's description as `standardText` to go back to.
  Ctrl+D makes a variant, whose inherited attack is changed through Edit parent as before.
- 2026-10-21: Picker lists (materials, coins, damage types) are drawn from what the game already
  uses plus a starter list, so "+ Add" needs no separate list to store: a new material appears in
  every list as soon as one thing uses it.
- 2026-10-21: Weight units are an app setting on this computer (lb or kg); each weight is saved with
  its unit, so the rulebook prints exactly what was entered.
- 2026-10-21: An unchanged copy of starter content isn't flagged by the balance and price checks,
  since normal is measured against the system's own content.
- 2026-10-21: Races and classes are filed under new Race and Class top categories; the filing check
  accepts beings under Creature, Race, Class or Character.
- 2026-10-21: Starter equipment descriptions and the six enchantments are written for DM in a
  Pocket (not SRD text), in `src/app/starters/descriptions.ts` and `d20.ts`.
- 2026-10-21: Backup days are read as noon UTC so "Today" is today in every time zone.
- 2026-10-21: The window imports shared lists from `src/app/codex-lists.ts`, which has no imports,
  so nothing from the back end is bundled into the window.
- 2026-10-21: Jeff chose Blender-style copy keys for the whole app: Ctrl+D a connected copy (a
  variant), Ctrl+Shift+D a separate copy (your own copy). Ctrl+Shift+D is in the feel-pass build.
- 2026-10-21: Jeff approved modules and encounters in the data format (a new layer type `module`
  and a new node kind `encounter`). CLAUDE.md Part 3 and 4 and docs/data-format.md updated first.
  Version 2 is built on branch `claude/v2-modules`, made from `claude/feel-pass`.
- 2026-10-21: An encounter's monsters, treasure and handouts are ordinary link fields, not
  attachments, because attachments are bricks on a sheet; links still give red flags and Used by.
- 2026-10-21: The adventure booklet is built in `src/app/adventure-book.ts` on the rulebook's own
  pages, so preview, PDF and Word file all work alike; entries gain an optional `readAloud` box.
- 2026-10-21: In the booklet, creatures are written "Wolf ×3" so no name needs a plural.
- 2026-10-21: The booklet's appendices print each creature, treasure and handout once, by name;
  the SRD credit is added when any of them is SRD content.
- 2026-10-21: Place in a world makes a new module file built on the world (a new id); the module's
  own nodes and changes are copied as they are, and its undo history starts fresh.
- 2026-10-21: Edit parent from a module goes to the layer directly underneath (its world, or its
  system if setting-free); the checklist lists the worlds and modules built directly on that layer.
- 2026-10-21: Jeff approved every version 2 data change that follows the locked design in one go;
  each is still written into CLAUDE.md and docs/data-format.md first.
- 2026-10-21: Player characters are beings of kind "character" with the builder's fields; their
  gear is attachments linking items, so Used by and red flags work as for monsters.
- 2026-10-21: Backgrounds are read from rules named "Background: ..." (how the d20 starter files
  them); a game without them skips that step.
- 2026-10-21: Hit points: the class's hit die at its highest at level 1, then its average rounded
  up plus the Constitution bonus each level; without a hit die, the game's Hit points resource.
- 2026-10-21: The game's award resources (recovery "award") appear on every sheet as trackers.
- 2026-10-21: Maps are nodes of kind "map"; pins and drawings are lists in its fields, so every
  change is one undo step and pins are ordinary links (Used by, red flags).
- 2026-10-21: A map is drawn as SVG; export draws that SVG onto a canvas in the window and the
  back end writes PNG, or a PDF with the picture as a JPEG (a small PDF writer, no installs).
- 2026-10-21: Fill colours or textures a room or closed shape; on empty space it fills the whole
  map (a texture) or sets its background colour (a colour). There is no flood fill of drawings.
- 2026-10-22: Table things that aren't the game (chat, tool layout, bookmarks, pins, journal
  categories) are kept in the file's meta like the AI chat, so they never fill undo history.
- 2026-10-22: A game night is a node of kind "session" holding combat, timers, the log and the
  clock; monster damage lives there, while characters keep their own hit points and conditions.
- 2026-10-22: Each game night gets a journal page made with it, starting with an empty text block.
- 2026-10-22: Sharing leaves journal pages and game nights out unless "Include my journal" is ticked.
- 2026-10-22: Players join through a small web server inside the app (Node's own http, port 7310
  or the next free one), on the home network only. Playing from other houses needs a relay later.
- 2026-10-22: A PIN is both the key and who you are; five wrong PINs from one device wait five
  minutes. A re-rolled or revoked PIN closes that person's screens at once.
- 2026-10-22: The DM is whoever runs the app and always has everything; "Hand over DM" is done by
  giving the world file to the next DM, so there is never more than one.
- 2026-10-22: The New player level can see the initiative order (otherwise nothing but their own
  character), so they know when it's their turn.
- 2026-10-22: Players' screens fetch their whole state when anything changes (at most ten times a
  second); each player's state is filtered by their permissions in the DM's app, so hidden things
  never leave the DM's computer.
- 2026-10-22: Players' blind rolls show "?" to them; DM-only and blind rolls are never sent to others.
- 2026-10-22: A shown map leaves out the DM-only layer and the map's own notes.
- 2026-10-22: The QR code maker is written here (byte mode, medium error correction); checked
  against the standard's worked example and by reading the codes back with a scanner.
- 2026-10-22: Version 3 design session with Jeff: themes (screen only, five named colour schemes),
  interface font size (Small/Normal/Large), rich text editor in every content text box, flexible
  resizable panel layout with named presets, expanded picture library with CC0 starter set
  (OpenGameArt, Kenney, Game-icons.net), auto-picture on node creation with per-category defaults,
  quick-swap dropdown showing matching-tag alternatives only, single-word lowercase tag system with
  autocomplete, global search across the whole world, condition tracker on initiative order, session
  timer, dice roller on the player phone screen, world changelog from history, random generator
  button tied to roll tables. All written into docs/design.md.
- 2026-10-22: Version 4 design session with Jeff: governing rule ("anything you can build by hand
  the AI can build for you"), world context document, world-aware generation with variants,
  multi-version results with Create more, voice input (press-and-hold, never always-on), AI picture
  generation with a separate optional image API key, number-of-versions setting (default 1, up to
  6). All written into docs/design.md.
- 2026-10-22: Added expanded starter system templates to version 3 (d20 Standard, d6 Pool,
  Percentile, 2d6 Moves, d10 Chronicles, Bare bones); community library search parked in version
  5-6. Added version 4 stress test: build a whole LoTR-style d6 system from one prompt.
  Design sessions for versions 3 and 4 complete. Coding resumes when Jeff's usage resets Sunday.
- 2026-10-22: Pricing decided: free download with one world/system, $20 one-time unlocks
  everything, no subscription. AI costs are the user's own API key only. Version 6 planned as
  the marketplace and community gallery. Written into docs/design.md.
- 2026-10-22: Dice roller designed as a standalone section in docs/design.md, not tied to any version yet. Covers: 20 bad-roller problems and fixes, custom dice creator (color/pattern/opacity/material), AI-generated dice sets, universal formula codex with tags and import, shared table mode, full roll history, pinned roll buttons on any node (live target dropdown), conditional math, roll triggers linked to conditions, persistent counters, probability display, roll annotation, roll request from DM to player, colorblind-friendly mode, community formula packs, TV table mode. Will be slotted into a version when the time is right.
- 2026-10-22: Dice roller physics, tray and triggered animations designed and written into docs/design.md. Physics: throw strength, gravity, friction, bounciness. Trays: wood, felt, marble, none, custom — each with own sound and physics profile. Visual: animation toggle, tray resize, dice transparency, dice size, lighting and shadow. Triggered animations and sounds per formula: critical hit, critical miss, max damage, min damage, custom number, importable audio files.
- 2026-10-22: Vision statement updated: app is an organized notebook and sketchbook with AI help, not a virtual tabletop. Foundry VTT export added to version 6: one button exports a completed world/system as an installable Foundry package, feeding Foundry users rather than competing with them. Session recap template added to journal section: DM-filled structured template after each session, no automatic tracking.
- 2026-10-25: The print shop's pick screen lives in the Rulebook tab as one more choice in the Book list, so it shares the preview, PDF and Print buttons. Its list of printable things reuses the rulebook's contents list (`shopChoices`), and looking at it writes nothing to history. Copies are capped at 50 per thing and the square size is kept between half an inch and two inches.
- 2026-10-25: The sheet layout is plain data: the groups in order with a width out of twelve, plus the unticked and hidden line keys. It is stored as ordinary fields on a `layout` node (kind "sheet") in the Codex or on the character (`sheetLayout`, `sheetUse`), so no change to the saved-file format was needed beyond the notes added to docs/data-format.md.
- 2026-10-25: Screen and paper use the same layout, and paper packs groups into rows of twelve the same way the screen grid places them, so they always match. The print ticks only change paper; on screen every value still shows.
- 2026-10-25: Any stored layout is repaired to fit the character it is shown on (unknown groups dropped, new ones added at the end, widths kept between 3 and 12), so a layout from another game or an older file can never break a sheet.
- 2026-10-25: Order of which layout applies: the character's own, then one picked from the Codex, then the default layout (marked in the Codex), then the plain layout. Each change is one undoable step.
