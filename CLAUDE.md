# DM in a Pocket: hard rules

Read this whole file before doing anything in this repo. It is the rulebook for the program itself.
The full design is in `docs/design.md`. What has been built, what is next and every technical
decision so far are in `docs/PROGRESS.md`. Read both at the start of every session.

## How to work in this repo

- The owner is Jeff (GitHub: t3crafterssales-tech). He is not a programmer. Explain things in plain words.
- Build in small steps. Every step has automatic tests, and all tests pass before the step is done.
- Run `npm test` (Node's built-in test runner, TypeScript run directly) and `npm run typecheck` after every change.
- Never change the data format in `src/engine/types.ts` without updating this file and
  `docs/data-format.md` first, and getting Jeff's OK.
- Record every technical decision as one plain line in `docs/PROGRESS.md` under "Decisions".
- Work on a branch per milestone. Jeff tests and approves at the end of each milestone, not each step.
- Anything that changes how the app looks, feels or works for the user, or what is in version 1,
  stops and asks Jeff (see Part 9 below).

The rules the program itself must follow, written before any code and read at the start of every build session. Being written part by part, starting October 20, 2026.

**Order of parts:** 1 Promises · 2 Saving and files · 3 Building blocks · 4 Systems and worlds · 5 History · 6 Flags · 7 The AI · 8 Sharing and upgrades · 9 Building rules.

## Part 1: Promises (locked)

1. Your worlds and systems live on your computer and you own them. You never need an account to use the app. An account is only for optional online extras such as a marketplace, and if you leave or cancel, every world and system you own still opens.
2. Everything works by hand. The AI is optional and only adds to what you can already do.
3. Nothing is destroyed without a way back. Deleting sends things to the recycle bin, and every change can be undone.
4. Nothing ever blocks you. A broken rule is flagged, but you can always save and keep working.
5. The AI never changes anything without showing you first; nothing happens until you accept.
6. Inside a system or a world, build in any order. The only fixed order is that a world needs a system.
7. The app never loses your work, even if it crashes or the power goes out.

**Familiarity (design philosophy).** Before inventing a new way to do something, copy what people already know: Shift-click and Ctrl-click to select, a recycle bin like Windows, notifications that work like email, Ctrl+Z to undo, linked values like linked spreadsheet cells. A new user should be able to guess how most things work. If a feature needs explaining, it should probably work more like something familiar.

## Part 2: Saving and files (locked)

- **One file per world**, with its pictures packed inside, so it can be copied, emailed or put on a USB stick with nothing left behind.
- **Saves itself constantly.** Every change is saved within a second or two; there is no Save button. Named snapshots give save points on top ("before I removed Strength").
- **Save indicator.** The app's logo pulses or glows briefly each time it saves, so the user can see at a glance that their work is safe.
- **One main folder**, like a Steam library (default Documents\\DM in a Pocket, changeable in settings), holding Systems and Worlds folders. The home screen shows whatever is in it. Pointing it at OneDrive or Dropbox syncs between computers without an account. Worlds and systems imported from other players go in their own folder inside it (home screen layout for My worlds and Other worlds to be designed later).
- **Automatic backups.** Kept quietly in a Backups folder: one per day for the last 7 days and one per week for the last month, about 11 per world at most; older ones are removed automatically. World settings lists them ("Yesterday, 3 days ago, last week"); restoring one first takes a snapshot of the current state, so a restore can be undone.
- **No history bloat.** Pictures are stored once and shared by every backup and snapshot instead of copied into each. Settings shows how much space history uses, with a Clean up button for old snapshots, and the app suggests a clean-up if snapshots grow large. User-made snapshots are otherwise kept until deleted.
- **Crash recovery.** After a crash or power cut the app reopens where the user was, with everything up to the last second or two saved, and a blue notice: "Recovered after an unexpected close."
- **One copy open at a time.** A world is marked in use while open. Opening it elsewhere (for example a laptop through Dropbox) offers Open read-only or Take over, which closes it on the other computer first, so two copies never save over each other.

## Part 3: Building blocks (locked)

- **Permanent hidden IDs.** Every node has a permanent ID that links point to, so renaming never breaks anything.
- **What every node carries:** ID, name, kind, category, picture, source (template or homemade), favourite, created and last-changed times, parent (if a variant) and its bricks.
- **One text box per node.** No separate secret GM notes: the app makes rulebooks and guides that anyone may read. Exception (version 2): an encounter also has read-aloud text for the players, and its text box is the DM's "What's really going on", because an adventure booklet is a DM book; at the table, permissions keep it off players' screens.
- **Bricks** store their type, values, links (by ID) and rulebook wording. An attached copy stores only what was changed on that sheet.
- **Anything attaches to anything.** The app never refuses an attachment; categories and sheets only suggest. Rules are written out, not run, so no combination can break a game.
- **Nesting and variants have no depth limit.** Bricks can nest inside bricks, and a variant can have variants (Elf → Wood Elf → Deep Wood Elf). The one thing the app prevents is a loop, such as A being a variant of B while B is a variant of A, because it has no meaning.
- **Kinds of node (version 1):** rules (abilities, resources, skills, conditions, general rules), bricks, beings (monsters, NPCs, characters, races, classes), items, lore (pages, places, factions) and roll tables. Version 2 adds encounters, maps, game-night sessions, journal pages, macros and sheet or book layouts, and player characters (beings of kind "character") gain the character builder's fields (approved by Jeff for all of version 2, October 21, 2026; see docs/data-format.md). New kinds can be added in later versions without breaking old files. Where something lives is the user's choice: mounts can be filed as items, with hit points and attacks attached, and the system can give that category a stat-block style sheet.
- **Links are one-way and "Used by" is worked out**, never stored, so the two can never disagree. Categories are stored by ID too, so renaming one never breaks what's filed in it.

## Part 4: Systems, worlds and modules (locked; modules added October 21, 2026 with Jeff's OK)

- **Every world's rules are a child of its system.** Changes made inside a world stay in that world. A world can be copied into a different system.
- **Modules (adventures) are the third layer: system → world → module.** A world module sits on a world; a setting-free module sits straight on a system. A module is locked to what it was made on: its world and system can never be swapped (Foundry works the same way). Changes made inside a module stay in it; changes flow down into it from its world and system as everywhere else. A setting-free module can be copied into any world on the same system ("Place in a world"). Nothing can be built on a module. Modules have their own shelf and their own files, which carry a copy of their world and system chain so they travel on their own.
- **Encounters** are the things a module is made of. An encounter can sit inside another encounter, any depth. "Inside" is belonging, not inheritance (not a variant). Deleting an encounter moves what was inside it up one level in its place; moving an encounter moves everything inside it.
- **Systems can have variants.** A system can be a variant of another (d20 Basic → My d20 → My d20 Space). Each variant sits on the Systems shelf as its own system with its own worlds, stores only its differences, and receives fixes from its parent unless it changed that part. Deleting a parent system promotes its variants the same way as bricks: each copies in what it inherited, then stands alone.
- **Changes only flow down, never up.** A child can never push its changes into a parent. Every parent knows its children. To share a rule, the user goes to the parent, makes the change there, and a checklist of its children appears (all ticked by default). Unticked children are protected: they keep the old version as their own setting, marked with a pencil. **Copy rule** on any child copies that rule so it can be pasted into the parent, which saves retyping while keeping the change deliberate. This applies to systems, variants, bricks and beings alike.
- **Edit parent without leaving.** Every child node has an Edit parent button (and Alt-click as the shortcut) that opens the parent's version of that same node in a pop-up over the current world, with no need to leave or hunt for it. The pop-up shows the child's version beside it with a "Use my version" button, which copies it across. Saving shows the checklist of children, with the current world already ticked. The change is still made at the parent, so changes still only flow down. This works for every parent and child at every level, including inside one world: editing one of 14 subraces, Edit parent opens the race, and the checklist lets the user pick the 5 subraces that get the change. In a longer family, an Up one level button in the pop-up steps to the grandparent.
- **Changes flow through every generation.** A parent's change reaches children, grandchildren and further, until it meets a node that set that value for itself (pencil mark); that node and everything below it keep their own value. Values the in-between node never touched still flow all the way down. Example: the Axe set its damage to d12, so changing the sword parent to d10 skips the Axe and its Double Axe, but adding fire damage to the sword reaches both.
- **The checklist shows the whole family tree**, indented, with notes such as "set its own damage" or "follows the Axe". Unticking a node protects its branch, unless a node below it is ticked individually.
- **Template parents.** A template is a parent that isn't a real item (for example Basic Melee Weapon) and holds the shared parts. Real items are its children and change only what makes them different. Templates stay out of the rulebook and item lists and live in a Templates group in the library. New items suggest their category's template in Variant of. **Change parent** moves one or many nodes under a different parent in one go; each keeps what makes it different and inherits the rest.

## Part 5: History (locked)

- **Every change is a recorded step:** what changed, its old value, when, and whether the user or the AI made it.
- **Undo and redo** with Ctrl+Z and Ctrl+Y. A bulk change (214 things swapped) is one step. AI changes undo exactly like the user's own.
- **History survives closing the app.** It is kept with the world, so tomorrow's Ctrl+Z can reach yesterday. A History list shows steps in plain words ("Removed Strength, 214 things affected"); clicking a line shows it or rolls back to it.
- **History has a size limit:** the last few thousand steps or about 30 days, whichever is smaller. Steps are small text, never pictures. Anything older is covered by automatic backups and snapshots.
- **Recycle bin keeps things until the user empties it,** like Windows. Each item remembers every link it had, so restoring can reconnect them. When the bin gets large, the app suggests a clean-up. Settings can turn on "empty items older than 30 days". Emptying the bin is the only truly permanent action in the app and always asks first.
- **Snapshots** are named by the user, hold the world and its system together, and are kept until deleted. Restoring a snapshot or a backup first takes a snapshot of the current state.

## Part 6: Flags (locked)

- **Colours:** red is broken, yellow looks off, blue is just so you know, green is fixed (with Undo).
- **Red comes from links and the user's own rules.** A red flag means a link points at nothing, or something breaks a world rule the user wrote ("no metal" and an Iron Helm exists). Both are found without AI, always accurately and instantly. Deliberate exceptions get "I meant that".
- **Yellow comes from free math checks and, optionally, the AI.** Free checks cost nothing and always run.
- **Free yellow checks:** balance (damage or hit points far off for a challenge rating), economy (a smaller or weaker item costs more than a bigger one in its category), filing (a weapon with no attack, a creature filed as an item), duplicate names, and empty sheets (no hit points or no attacks). "Normal" is always measured against the system's own content.
- **Check categories with on/off and a sensitivity slider.** Yellow checks are grouped into categories: Balance, Economy, Filing, and AI-only ones such as Lore consistency. In World settings each category can be ticked on or off and has its own slider (Relaxed, Normal, Strict). Check for errors uses the same ticks, so checking only Balance also costs less AI. The flag panel can be filtered by category too. Red flags can't be switched off by category, only ignored one by one.
- **Blue and green blocks** are kept as long as the history limit (about 30 days), so the panel never bloats.

## Part 7: The AI (locked)

- **A fixed list of named actions.** The AI can only use named actions such as change a value, add a brick, create a node or move to a category. Each one goes through the same preview, undo and history as the user's own changes. It can never rewrite a file directly.
- **The AI never deletes.** It can suggest a deletion, but only the user can click Delete.
- **Your key stays on your computer**, stored in the operating system's protected storage. Each AI job sends only what it needs: the World Notes, the recent chat and the nodes the job touches, never the whole world file.
- **The AI only acts when asked:** a prompt, Check for errors, or live checking switched on. No unprompted suggestions in version 1.
- **All-or-nothing jobs.** If the internet drops or the AI fails mid-job, nothing from that job is applied, and a blue notice says so. Offline, the AI buttons show "Offline" and everything else works as normal.
- **Model choice.** The app picks automatically: a quick, cheap Claude model for small edits and checks, a careful model for big creative jobs. Settings offers Automatic, Always quick or Always careful. Cost estimates name the model being used.
- **AI steps are labelled in History** with the request that caused them ("AI: all swords use Dexterity").

## Part 8: Sharing and upgrades (locked)

- **Files record the app version that made them.** A newer app upgrades an older file automatically after backing up the original. An older app opens a newer file read-only ("Made with a newer version. Update to edit it.") and never damages a file it doesn't fully understand.
- **What a shared world carries.** Always: the world, its system, its pictures and its World Notes. Never: the API key or settings. Left out unless the user ticks them: AI chat history, snapshots and undo history.
- **Importing never overwrites.** Systems have permanent IDs too. An imported world whose system is identical to one already on the shelf uses it; if it differs, the imported system arrives as its own copy ("d20 Basic (from Dave)").
- **Things remember who made them.** An optional author name in settings (no account needed) is stored on every world, system and node the user creates; imported things keep their maker's name. Lists gain a third filter, From others, beside Homemade and Template. The rulebook export can carry a "Created by" line.
- **Required credits are automatic.** Content from the SRD 5.2 is licensed under Creative Commons (CC-BY 4.0), so the rulebook export and shared files include its required attribution line automatically whenever that content is used.

## Part 9: Building rules (locked)

- **Every session starts by reading** this hard rules section and the design doc.
- **The data format never changes quietly.** If the code needs a different way of storing nodes or bricks, this file is updated first, with the user's OK.
- **Small steps, each tested** before the next begins.
- **Automatic tests guard the promises**, for example: deleting Strength flags every link; cutting power mid-save loses nothing; undo reverses a 214-item change in one step. They run after every change.
- **A progress log in the repo** records what was built, what's next and decisions made, so any session can pick up where the last stopped.
- **The user approves milestones, not every step.** Each milestone (for example "the flag panel works") is built, then tested by the user, who approves it or sends it back. Any decision that affects the design stops and asks, even mid-milestone.
- **Technology:** Electron desktop app for Windows, written in TypeScript. A world file is one archive holding the data and the pictures.
- **Who decides what (October 20, 2026).** Claude makes technical decisions without asking, as long as they keep every promise in Part 1. The user decides anything that changes how the app looks, feels or works for the person using it; anything that adds to or removes from version 1 or first playable; any change to the promises; and anything that would be hard to undo once real worlds exist. Every technical decision Claude makes is written in the progress log in one plain line, so the user can review and overrule it at any milestone.
