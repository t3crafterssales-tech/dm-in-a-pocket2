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
- **Built, waiting for Jeff to test:** Milestone 8, Quick start, roll tables, lore pages, and the
  check categories with sliders.
- **Next:** Milestone 9, the AI (needs Jeff's own Claude API key; see the table below).

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
