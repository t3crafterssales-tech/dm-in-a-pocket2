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
- **In progress:** Milestone 4, the Rules tab and sheets (branch
  `claude/electron-desktop-app-shell-2arspv`, the branch this build session is allowed to use).
  Steps 1 to 3 of 4 done: the Rules tab, the Beings and Items sheets, and the library with drag
  and drop and Shift/Ctrl selection. Next: drilling into a brick on a sheet, and Edit parent with
  the checklist of children.

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

## Log

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
