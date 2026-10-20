# Progress log

Newest first. Every session reads this after `CLAUDE.md`.

## Where we are

- **Now:** Milestone 1, the engine core (branch `milestone-1-engine`).
- **Next:** Milestone 2, files and saving.

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

### 2026-10-20

- Repo set up: hard rules (`CLAUDE.md`), full design (`docs/design.md`), data format
  (`docs/data-format.md`), this log, README.
- Started milestone 1 on branch `milestone-1-engine`.

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
- 2026-10-20: The cloud session used for building cannot reach the npm package registry, so
  Electron (milestone 3) waits until a session can install packages. Milestones 1 and 2 need no
  installs.
