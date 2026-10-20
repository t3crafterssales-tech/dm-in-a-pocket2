# Progress log

Newest first. Every session reads this after `CLAUDE.md`.

## Where we are

- **Done:** Milestone 1, the engine core (approved by Jeff, merged into `main`).
- **Now:** Milestone 2, files and saving (branch `milestone-2-files`), waiting for Jeff's approval.
- **Next:** Milestone 3, the desktop app shell. Needs a session that can install packages (Electron).

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
- 2026-10-20: The cloud session used for building cannot reach the npm package registry, so
  Electron (milestone 3) waits until a session can install packages. Milestones 1 and 2 need no
  installs.
