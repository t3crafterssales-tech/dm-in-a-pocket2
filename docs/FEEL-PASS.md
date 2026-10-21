# Milestone 11: the feel pass (work order)

Written October 21, 2026, from Jeff's first real use of the app and the mockup he approved.
Read `docs/BACKLOG.md` (especially "The big one") and open `docs/mockups/feel-mockup-v1.html` in a
browser before starting. Jeff's verdict on the mockup: "this is perfect, I love it, it has a great
feel." The real app should look and behave like it.

**The problem:** everything works, but the app feels like filling out a tax form. Too many typing
boxes, everything shown at once, lists that don't fit what you're doing, no clear first step.

**The rule for this milestone:** get one example (making a battle axe) to feel right, then apply
the same pattern everywhere. Learn it once, and it works the same in every part of the app.

## Order of work

Build on top of the milestone 9 branch (`claude/electron-desktop-app-shell-2arspv`) so the AI
panel and this work don't conflict; Jeff tests both together.

### Part A: layout (backlog 9, 10, 14)
- Two columns: the open sheet in the middle, the **Codex** on the right. The left-hand list goes.
- The Codex replaces the Library: sections (Weapons, Armour, Gear, Enchantments, Spells,
  Monsters, Races, Classes, Conditions, Lore ...). Open a section, then sort (A to Z, cost,
  challenge) and show (everything, made by me, starter only), with a find box. Drag onto the
  sheet; drag onto another section to refile; a small "Move to" menu does the same without
  dragging.
- The Codex follows what's open: an armour sheet's "add enchantment" opens Enchantments, an
  Attacks section opens attacks. "Show everything" stays one click away.
- Flags shrink to a strip at the foot of the Codex showing the last two or three; clicking opens
  a pop-up with all of them.
- Pop-ups float: layered shadow, lift-in animation, dimmed and slightly blurred page behind.

### Part B: the item pattern (the battle axe)
- A **+ New** button and a start screen: "What do you want to make?" with big tiles (Weapon,
  Armour, Gear, Spell, Monster, Race, Class, Lore page). Each tile then offers ready-made starting
  points ("Start from Battleaxe", "Start blank"). Copying from the Codex reaches the same sheet.
- New systems and worlds open straight away after Create (backlog 4).
- The sheet: picture, name and description first. Starter content has a **standard
  description**; copies show it marked "Standard description" with "Write my own"; own text
  gets "Back to the standard description"; whatever is there prints (backlog 15, 1).
- The few things you'd change, as **pickers, not typing**: damage dice as chips (backlog 3, 6),
  damage type, how it's held, material from a list with "+ Add a material" that joins every list
  (backlog 13), weight with a number stepper and a lb/kg setting (backlog 12), cost with a stepper
  and a currency picker from the system's own coins (backlog 11). Every picker keeps an Add or
  Other.
- A live "How it prints in the rulebook" box.
- Everything else (properties, enchantments, notes, rules detail) folded under **More**.
- Starter content can't be changed in place: "Make my own copy".

### Part C: apply the pattern everywhere
- Monsters, NPCs, characters: challenge, hit points and armour as steppers; attacks added from
  the Codex.
- Races and classes: hit die as a picker (backlog 6); new classes filed under Class automatically
  (backlog 7); the Choices box explains itself and has "+ Add a choice" (backlog 8).
- Spells, conditions, lore pages: same top (picture, name, description), same pickers, same More.
- Rules tab: each core-check family and rule type comes with default wording that fills the
  description and the rulebook (backlog 1).

### Part D: fixes
- Backlog 2: duplicated abilities, Hit points, Spell slots and Unconscious in Jeff's Test World 1.
  Find the cause (Quick start on top of the d20 starter, or the starter loading twice) and fix.

### Part E: hotkeys (backlog 16)
- Ctrl+D with the mouse over a brick or item: make a child copy (variant) of the whole thing.
- Ctrl+C / Ctrl+V: normal text copy and paste, exactly like Word. Ctrl+Z / Ctrl+Y undo and redo.
- Match Word and Windows shortcuts wherever possible; a "?" key shows the full list.

### Not in this milestone
- Stock pictures (backlog 5) and floating, pinnable windows: later.

## Done means
Jeff can, within a couple of minutes of opening a world, make a new battle axe, a new lantern and
a new monster without typing anything except names, and it never feels like a form.
