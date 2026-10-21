# Backlog (the back board)

Bugs and change ideas Jeff finds while using the app. Newest at the bottom. Nothing here is
worked on until Jeff says to tackle the backlog; then each item is triaged (bug fix, version 1
change, or later) and ticked off here when done.

## The big one (read this first)

**2026-10-21, Jeff, after using the app:** "Everything is there, and I'm sure everything works. But
it feels like I'm filling out a tax form instead of being creative. The screen and buttons are more
intimidating than anything. It doesn't seem natural. A lot of the time I think: what do I want to
do? I don't know what to do. I want to create a new sword, but... yikes."

This is the most important item on the board. The app works but doesn't yet feel like the design
promised ("as flexible as a pad of paper, a pencil and an eraser"; "familiar"; "three choices up
front, More options for the fine print"). Most of the smaller items below (9, 10, 14, 8, 1, 3, 6,
11 to 13) are symptoms of it. Before fixing them one by one, do a "feel" design pass with Jeff:
start from what the user wants to do ("make a sword") rather than from forms, show the creative
parts first (picture, name, a few words) and fold the mechanics away until asked for, and make
lists and libraries show only what fits. Pause new features (milestone 9, the AI) until this is
settled.

### Feel pass: Jeff's direction (2026-10-21)

- **Fix one example end to end, then apply it everywhere.** Pick one thing (a new battle axe or
  a new lantern), make creating it feel right, and use that as the pattern for every other area.
  It's one philosophy, not a hundred separate fixes.
- **Learn once, works everywhere** (like Foundry VTT: complicated at first, but once one part made
  sense, every other part worked the same way). Within a couple of minutes of looking at a
  screen, it should be clear what to do.
- **Flexible by picking, not typing.** Fewer click-in-a-box, type, press-Enter moments. Material
  is a common-materials list (wood, iron, steel, gold, bone, leather ...) plus Add; weight follows
  a pounds or kilograms setting; currencies are picked. Every drop-down keeps an Add or Other.
- **The Library becomes a Codex**, like Foundry's compendiums, on the right-hand side. It has
  sections: Spells live in Spells, Items in Items, Monsters in Monsters, and so on. Click a section
  to open it, then choose how to view it (alphabetical, by challenge rating, homemade or
  pre-made, or everything). Drag from the Codex onto the open sheet. Drag something from one Codex
  section into another to refile it (drop a weapon into Monsters, and now it's filed under
  Monsters).
- **Two columns, not three** (Jeff chose this): a big sheet in the middle, the Codex on the right.
  The separate left-hand list goes away.
- **Notifications tucked away.** A small strip at the bottom of a column shows the last two or
  three flags; clicking it opens a pop-up with all of them. (Jeff found fewer flags than expected
  while testing on purpose, and the odd-category flag worked straight away.)
- **Later: floating windows.** Pop-ups that can be dragged anywhere and kept open, for example a
  cleric sheet pinned in the top-left corner while writing lore.

- **Mockup v1** (2026-10-21): `docs/mockups/feel-mockup-v1.html`, a clickable HTML mockup of the
  battle-axe flow (also published as a claude.ai artifact for Jeff's phone). Not the real app.
  Assumptions Jeff hasn't confirmed yet: both routes to make something (a "What do you want to
  make?" start screen and copying from the Codex); the sheet shows picture, name and one line
  first, then the main pickers, a live "How it prints" preview, and folds properties,
  enchantments and notes under More. Once Jeff is happy with the feel, port it into `src/ui/`.

## Items

| # | Date | Type | What Jeff said | Notes | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | 2026-10-20 | Change | Every type of roll should come with a default description. The user can change it, delete it and write their own, or leave it as is, and whatever is there is what gets printed. | Seen on the Rules tab, Core check: "Roll under your stat" has an empty Description box ("Write the rule out in your own words"). Each core-check family (and likely other rules) needs default wording that fills the box and the rulebook. Screenshot: `backlog-images/2026-10-20-core-check.png` | Built in milestone 11 (the feel pass), waiting for Jeff to test. |
| 2 | 2026-10-20 | Bug (spotted by Claude in Jeff's screenshot) | Not reported by Jeff. | In "Test World 1", every ability appears twice (Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma), and so do Hit points, Spell slots and Unconscious. The flag panel shows 13 yellow "2 things are called ..." flags. Looks like the starter rules were added twice (maybe Quick start run on top of the Generic d20 starter, or the starter loaded twice). Check with Jeff how the world was made. Same screenshot. | Cause found and fixed in milestone 11: Quick start made a second copy of rules the system already had. It now reuses them. Test World 1 keeps its existing duplicates; delete the extra ones (or ask Claude to). |
| 3 | 2026-10-20 | Change | "Dice rolled" should be a drop-down with choices, not a typing box. | Rules tab, Core check: the "Dice rolled" field is a free text box showing "d20". Make it a drop-down of common dice (d4, d6, d8, d10, d12, d20, d100, 2d6, 3d6, pools, and so on), with "Other" for custom. Same screenshot as item 1. | Built in milestone 11 (the feel pass), waiting for Jeff to test. |
| 4 | 2026-10-20 | Change | Creating a new system or world should take you straight into it. Right now it goes back to the home screen and you have to double-click the new card to open it. | Applies to both New system and New world. After Create, open the new one directly. | Built in milestone 11 (the feel pass), waiting for Jeff to test. |
| 5 | 2026-10-20 | Change (bigger, needs triage) | Get stock pictures for all items, monsters, characters and so on. | Things to settle when this is tackled: where pictures come from and their licence (free-to-use sources such as public-domain or CC0 art, art Jeff draws himself, or AI-generated images), whether they ship inside the app or download on demand (341 SRD monsters plus items would make the installer large), and a fallback placeholder picture per kind (monster, item, race, class, place). Pictures are already stored once and shared, so adding them won't bloat backups. | Open |
| 6 | 2026-10-20 | Change | When making a new class, Hit die should be a drop-down picker with all the choices. | Class sheet shows "Hit die" as a typing box ("d8"). Make it a drop-down (d4, d6, d8, d10, d12, d20, plus Other). Same idea as item 3, so the two can share one dice picker. Screenshot: `backlog-images/2026-10-20-new-class.png` | Built in milestone 11 (the feel pass), waiting for Jeff to test. |
| 7 | 2026-10-20 | Bug | A new class should automatically be filed under Class. | In the same screenshot, "demon hunter" (a Class, variant of Rogue) is "Filed under: Creature". A new being's category should default to match its kind (Class, Race, Monster, NPC, Character). Check whether variants copy the parent's filing, and whether Rogue itself is filed wrongly. | Built in milestone 11 (the feel pass), waiting for Jeff to test. |
| 8 | 2026-10-20 | Change | Jeff wasn't sure what the Choices box on a class sheet is for. | It holds "choose one of these" options (for example "At level 1, choose one Technique: Classic, Battlemage or Warden"). The box only says "Drag bricks from the Library", which doesn't explain that. Give it its own plain hint and a "+ Add a choice" button that asks what is being chosen and how many, then lets you pick the options. Same screenshot as item 6. | Built in milestone 11 (the feel pass), waiting for Jeff to test. |
| 9 | 2026-10-21 | Change (layout, needs Jeff's OK on details) | The list (items, beings) and the Library shouldn't share one switch where you see one or the other. Put the Library on the right-hand side with the flags: Library at the top, Flags squeezed into less than half of that column underneath. Then the list sits on the left and the Library on the right, both visible at once. | This changes the default layout from the design doc (left: list or library switch; right: flags). Panels are already movable, so this mainly changes the default. Pair with item 10. Screenshot of the current switch: `backlog-images/2026-10-20-new-class.png` (Beings / Library buttons, top left). | Built in milestone 11 (the feel pass), waiting for Jeff to test. |
| 10 | 2026-10-21 | Change | The Library needs filters. It's a long, intimidating list (179 attacks alone in the screenshot). You should be able to show only, say, weapons or spells. | Filter by type (attacks, weapons, spells, traits, effects, conditions ...), and probably by source (template, homemade, from others) and favourites, on top of the text filter that exists now. Collapsible groups that start closed would also help. | Built in milestone 11 (the feel pass), waiting for Jeff to test. |
| 11 | 2026-10-21 | Change | Cost: keep the typing box for the number, with a drop-down beside it listing all the game's currencies (cp, sp, gp ...). | Currently one box holding "75 gp". The currency list should come from the system's own currencies, so a homemade game shows its own coins. Screenshot: `backlog-images/2026-10-21-chain-mail.png` | Built in milestone 11 (the feel pass), waiting for Jeff to test. |
| 12 | 2026-10-21 | Change | Weight: a system setting to switch between metric and imperial. | Currently a typing box holding "55 lb.". Split into a number plus a unit that follows the system setting (lb or kg). Same screenshot. | Built in milestone 11 as an lb/kg switch beside every weight (remembered on this computer); each weight is saved with its unit, so the rulebook prints what was entered. Jeff to confirm whether it should be per game instead. |
| 13 | 2026-10-21 | Change | Material should be a drop-down with choices, plus an Add button for materials not in the list (for example vorpal stone). | Currently a typing box ("Metal"). A material added once should join the system's list and appear in every material drop-down (same pattern as custom triggers). Links up with world rules like "no metal". Same screenshot. | Built in milestone 11 (the feel pass), waiting for Jeff to test. |
| 14 | 2026-10-21 | Change (important) | Too confusing inside a sheet. Opening the list shows everything, not the choices that make sense for this item. Lists should be dynamic and only show what belongs to that list. | Read as: with Chain Mail (armour) open, the Library shows every brick in the system (Lightning Breath, Luring Song, Mind Invasion ...), none of which fit armour. The Library and drop-downs should follow what is open and which section you are filling: armour shows armour properties, enchantments and materials; an Attacks section shows attacks; a class shows class features. "Show everything" stays one click away, because anything may still attach to anything (hard rule). Pairs with item 10 (filters) and item 9 (layout). Confirm with Jeff that "the list" means the Library. Same screenshot as item 11. | Built in milestone 11 (the feel pass), waiting for Jeff to test. |
| 15 | 2026-10-21 | Change | Main items and monsters should come with a standard description. If it's good enough, leave it (or copy it); otherwise write your own. Leaving the longsword's description alone should be fine. | Tried in the mockup (v3): a copy of a starter item shows its "Standard description" with a "Write my own" link; writing your own gives a "Back to the standard description" link; whatever is there is what prints. Same idea as item 1 (default text for roll types). The full SRD 5.2 content needs standard descriptions for its items and monsters. Jeff also liked floating pop-ups with shadows (added to the mockup). | Built in milestone 11 (the feel pass), waiting for Jeff to test. |
| 16 | 2026-10-21 | Change | Add shortcuts and hotkeys. Example: with the mouse over a brick (or item), Ctrl + left-click makes a copy of it as a child (variant) of the original. | Clash to settle with Jeff: Ctrl-click already means "select several" (hard rules, Familiarity). Options: Ctrl+drag to copy (like Windows Explorer), Ctrl+D to duplicate, or a right-click "Make a variant". Alt-click is already Edit parent. Make a full hotkey list (undo, redo, new, search, copy, delete, open Codex section ...) and show it on a "?" key. **Decided 2026-10-21:** Ctrl+D (mouse over a brick or item) makes a child copy of the whole thing. Ctrl+C and Ctrl+V stay as normal text copy and paste, like Word. Hotkeys should match Word and Windows wherever possible. | Built in milestone 11 (Ctrl+D, Ctrl+N, Ctrl+Z/Y, Ctrl+F, and ? for the list), waiting for Jeff to test. |
| 17 | 2026-10-21 | Change | The program needs a how-to guide: a Help button at the top where you can look up how to do anything ("how do I duplicate that?") and every hotkey and command at a glance. | A searchable Help guide inside the app, written in plain words, with the shortcut list (today's "?" pop-up) as one page of it. Each screen could have a small "?" that opens the guide at that screen's page. Fits version 1 polish, before version 2. | Open |
