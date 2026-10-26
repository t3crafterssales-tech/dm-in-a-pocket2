# DM in a Pocket — Design Document

Oct 16, 2026 · @Jeff

## Vision

DM in a Pocket is a desktop app for building tabletop RPG systems and worlds, and it should feel as flexible as a pad of paper, a pencil and an eraser.

The feeling to capture: a kid on his bed in the 1980s, drawing maps and inventing game rules, erasing and redrawing without a second thought. Every feature is tested against one question: does this feel like erasing and redrawing, or like filling out a form?

A user can start anywhere. Pick a ready-made system and strip it down. Invent monsters before any rules exist. Draw the map first and write the lore later. Turn spells off for a desert planet, then switch them back on months later. The app keeps everything consistent and points out what needs attention, but never forces an order.

**Core value: flexible.** If they want to do it this way, fine. If they want to do it the other way, fine.

**What this app is (Jeff, October 22, 2026).** An organized notebook and sketchbook with AI help. Not a virtual tabletop. An aid — a place to organize thoughts, ideas, drawings, maps and rules, all in one place, with AI available if wanted. It is not competing with Foundry VTT. It is the tool you use before you sit down at the table.

## Core philosophies

These five rules do not change. Every design decision is checked against them.

1. **You own your worlds.** Everything lives on the user's own computer. No account is needed to use the app. If a paid online service is ever cancelled, every world and system still opens, forever.
2. **Worlds save as one open file.** A world is a single file in a clean, documented format. People can always get their data out, and sharing works from day one by simply sending the file.
3. **AI is optional.** The user brings their own API key. With no key, every feature still works by hand, and the app still flags conflicts. AI only adds suggestions and does the tedious work faster.
4. **Any order, any time.** Unfinished is a normal state, not an error. Monsters can exist before a system does; a map can exist before any lore.
5. **Nothing is truly destroyed.** Erasing switches things off rather than deleting them. Removed parts can come back with their rules intact, and every change can be undone.

**As deep as you want it to be (Jeff, October 21, 2026).** The app is never too simple and never
forces depth. Build a complicated system if you want one, or a simple custom system in five
minutes with the fewest clicks. Not artsy? Everything comes with default art. Never use maps,
the journal or the tabletop if you'd rather keep notes on paper beside you. Play with 5 people
today, 14 next time and 2 after that, switching modules each time. Every feature is optional and
stays out of the way until wanted; the defaults always work on their own.

## Architecture: hub and spokes

One shared world file is the single source of truth, and every tool is a separate program that reads and writes it.

&#91;embedded content: hub and spokes · 1 world file, 6 tools\]

No tool owns the data. When one changes something, it announces it ("Item changed: Longsword") so the others can react. Each tool is useful on its own, so they can be built one at a time, starting with the system builder.

## Key concepts

Six ideas make the pencil-and-eraser feel possible.

**Systems and worlds are separate.** The home screen shows two shelves, like Foundry VTT: Systems (the rules) and Worlds (the setting, lore, maps, characters). A world uses a system, and one system can power many worlds. Templates use generic names ("d20 type", "d6 type") rather than trademarked ones.

**Templates are copied, never edited.** Picking a template makes the user's own copy. The original stays clean for next time.

**Everything tracks what it depends on.** Every rule, item and creature records what it uses: this attack uses Strength, this sword is made of metal. Removing something is then a lookup, not a guess. The app finds every affected piece instantly and reliably, with or without AI.

**Modules switch on and off.** Spells, vehicles, sanity and similar feature sets are modules. Switching one off hides it; switching it back on restores it with all its rules intact, then checks it against the world's current rules.

**World rules are permanent constraints.** "No metal", "no animals" or "desert planet" is stored on the world as a rule, not applied once as a find-and-replace. Anything added later, by hand or by AI, is checked against it.

**Status lights and sticky-note flags.** Each piece shows gray (sketched), amber (needs something) or green (ready to play). Flags read like friendly sticky notes, never red error messages: "Great goblins! They'll need stats once you pick a system."

## Data model: nodes and bricks

Everything in a system or world is a node, and bricks attached to a node give it all its characteristics. Decided October 19, 2026.

**Nodes.** A node on its own is nearly empty: a name, a category and a slot for bricks. A Longsword node carries a Weapon Attack brick (d20 + ability + proficiency, Strength, 1d8 slashing), a Versatile brick, a Material brick (Metal), a Physical brick (weight, cost) and a Proficiency Group brick (Martial Weapons).

**Links, not words.** A brick that uses Strength points to the Strength node, like a wire in Blender's node editor. It never stores the word. Deleting Strength means following every wire into it, so the app always knows exactly what broke.

**Parents and children.** Whatever sits at the top of a chain is a parent, so there are no orphan bricks. A one-off brick is simply a parent with no children yet. A child inherits everything from its parent and stores only its overrides, which are shown with a pencil mark. Parent changes flow down to every child except where the child overrode that value.

**Deleting a parent.** Its children are promoted. Each child first copies in the values it inherited, then cuts the link, so it keeps working exactly as before. When there are siblings, the app asks: each becomes an independent parent (the default), or the user picks one to become the new parent of the others.

**Removals and conflicts.** Deleting something lists everything that pointed at it ("Longsword, Greataxe, Athletics and 211 others used Strength"). For each, or all at once: swap to something else, remove the brick, or leave it broken. Broken pieces are flagged red but never block saving or other work. World rules such as "Material cannot be Metal" flag conflicts the same way.

**Categories.** Every node gets a category picked from drop-downs, up to three levels deep (Weapon → Melee → Metal). The category, never the name, decides what a thing is and where it shows up. A Sword Key filed under Item → Miscellaneous → Keys is not a weapon and gets no weapon bricks. The generic d20 system ships with a full category tree; from scratch starts with a small set (Weapon, Armour, Item, Creature, Spell). Every drop-down ends with "+ New category". Renaming a category updates everything in it; deleting one asks where its contents go, defaulting to a flagged Uncategorized. Version 1 uses folders (one home per node); tags are a later addition.

**Family and filing are separate.** The parent decides what a thing is made of; the category decides which list, module or rulebook chapter shows it. Five Goblin children refiled as NPCs still get the parent's stat changes, but appear in the NPC module, not the monster manual. A child starts with its parent's category, and changing it is an override. Odd combinations are allowed, such as a goblin filed under Weapons, with at most a soft "Intended?" note that can be silenced.

**Categories suggest bricks.** Filing something under Weapon → Melee offers the Weapon Attack brick; it never forces it.

**AI bulk changes use categories.** "All swords use Dexterity" means everything filed under Swords, never a name search. The AI always shows the list before changing anything ("I found 14 swords, go ahead?") and asks about children that have their own override.

**System versus world.** The system holds the rules, parent bricks and category list. The world holds the nodes that use them. Copying a world into a different system reconnects its links to the new system's bricks and categories, and anything that cannot connect appears in the conflict list.

## Screen layout and workspace

Every screen is a view of the same data, so the spokes interweave rather than stand apart. Discussed October 19, 2026.

**Version 1**

- A tab bar across the top: Rules, Creatures, Items, Lore and Rulebook. The early tabs are filtered views of nodes by category and get upgraded into full builders later without changing the layout.
- Movable panels: the AI and conflict notices, lists and editors are panels the user can dock left or right, resize or minimize. The layout is saved per user. Built on a ready-made docking library rather than written from scratch.
- Lists can be sorted and filtered: alphabetical, by challenge rating or other stat, by category, favourites (a star on any node), and homemade versus template content. Every node records whether it came from a template or was made by the user.
- Clicking anything in a list opens it in an editor panel.

**Later**

- Two or three builders open side by side, and floating windows.
- Drag and drop between screens. Dropping a node makes a link, not a copy: a goblin dropped on a map becomes a linked pin, on a lore page a clickable mention, in an encounter a member. Holding a key while dropping makes a child copy instead.

## The flag panel

Every problem or notice is a small colour-coded block in a scrollable panel on the right, sorted by colour. Discussed October 19, 2026; still being designed.

| Colour | Meaning | Example |
| --- | --- | --- |
| Red (top) | Broken: something can't work as written. Found through links, so it works without AI. | Longsword uses Strength, which no longer exists |
| Yellow (middle) | Looks off: nothing is broken, but something seems wrong. Simple math finds some; AI finds subtler ones. | This goblin deals three times the damage of other challenge 1/4 creatures |
| Blue | Just so you know: something the app did on its own. | 12 items moved to Uncategorized |
| Green (bottom) | Resolved: a fix that was accepted. Doubles as a history of changes. | Longsword now uses Dexterity |

**On each block:** Ignore, or double-click to open a detail pop-up.

**In the detail pop-up:**

- Go to it: opens the affected node in an editor panel.
- Fix by hand: drop-downs for the exact link that broke.
- Ask AI: the AI suggests the most reasonable fix, shown as a before-and-after preview. Nothing changes until the user clicks Accept. A "Show me other ideas" button asks for alternatives. Comes from the original DM in a Pocket, for when a user has designed themselves into a corner.
- Accept, or a hand fix, turns the block green and moves it to the bottom.

**Grouped by cause.** One block per cause, not per broken thing: "Strength removed: 214 things affected." Its pop-up lists every affected item with a checkbox, plus Select all and Unselect all. The user picks any set, applies one fix to it, then repeats with the rest: select all, untick six, fix 208, then fix the six by hand or with another rule. Or select two, fix those, and mark the rest. The counter drops as items are fixed, and the block turns green at zero.

**Marking the rest (red items).** A broken item can't simply be marked good, because its link still points at nothing. Two choices: Leave for later (stays counted, flagged on the item) or Remove the link (for example, the attack uses no ability at all), which is a real fix and turns green. Yellow items can be marked good directly.

**Without AI.** Red flags, blue notices and the math-based yellow warnings all still appear, because links and simple checks find them. Only the Ask AI button and the AI-found yellow warnings are missing. Every fix can be done by hand.

**Ignore.** Two buttons: Ignore (this one flag) and Ignore all like this (this kind of warning, world-wide). Both go to a hidden list behind a "Show ignored" link at the bottom of the panel, where any can be switched back on.

**Bringing something back (the recycle bin).** Deleted things go to a recycle bin, never straight to nothing, and each remembers every link it had and what each piece was changed to. Restoring Strength the next day opens the same checkbox pop-up in reverse: "214 things used Strength before it was removed. Reconnect them?" Items changed since then are marked so the user can check them before reconnecting. Creating a new node with the same name as a binned one asks: "You removed Strength yesterday. Restore it instead?"

**Always quiet.** No pop-ups, ever. Users often break things on purpose mid-build and fix them with a rule a minute later. New flags slide into place in the panel. A counter at the top shows the totals by colour (3 red · 14 yellow · 10 blue) plus how many are new.

**Flags clear themselves.** When a later change fixes something, its flag disappears on its own; nobody has to tick it off. One blue notice records it: "300 flags cleared by your new rule."

**New until seen.** Like email or phone notifications, a flag counts as new until the user has seen it. Once they look and close it, the "new" mark is gone, even if the flag itself hasn't been dealt with.

## Home screen

The app opens to two shelves of cards, Systems and Worlds, like Foundry VTT. Discussed October 19, 2026.

- **Cards.** A placeholder picture until the user uploads one. A world card shows its system's name (as the user named it) on the picture, plus a small flag count badge (2 red · 5 yellow). A system card shows "Used by 3 worlds".
- **Order.** Last opened first.
- **Actions.** Double-click opens. A delete button sends the card to the recycle bin after a confirmation. No right-click menu: name, picture, copy world and back up live in each world's own settings.
- **Deleting a system that worlds use.** The app warns ("3 worlds use this system") and asks: move those worlds to another system, delete them too, or cancel.

**New world** opens a short, strictly linear pop-up:

1. Name (required, even a single letter)
2. Upload image (optional, the only optional step)
3. Game system, chosen from a drop-down (required)

The New world button is greyed out until at least one system has been saved, with a hover hint: "Create a system first."

**New system** works the same way: name (required), picture (optional), and a starting point chosen from a drop-down, generic d20 or from scratch (required).

**Top bar.** Kept clean, with three items: Settings (Claude API key, cost warning threshold, live AI switch default, where files are saved), Recycle bin (restore deleted worlds and systems) and Import (open a world or system file). Themes are a later addition. Everything else happens inside a world or system, which opens full-screen like Foundry VTT.

## Inside a world

Opening a world shows one default layout. Discussed October 19, 2026.

- **Top:** tab bar (Rules, Creatures, Items, Lore, Rulebook), with a home button and world settings on the right.
- **Left:** list panel for the current tab, with sort, filter and favourites.
- **Centre:** editor; clicking something in the list opens it here with its bricks.
- **Right:** the flag panel.
- **Bottom:** the AI panel, collapsed to one prompt line until clicked.

Panels can still be moved, docked, resized and minimized in version 1, and the app remembers where they were put. A Reset layout button in world settings restores the default.

**Each world's system is a child of the original system.** The same parent/child rules as bricks apply. Changing a rule inside a world changes only that world's copy, stored as an override with a pencil mark. Changes never travel up: to share a rule with other worlds, the user edits the parent system and picks which children get it (see Hard rules, Part 4). World settings can list every difference from the parent system. (Changed October 20, 2026; replaces the earlier "Apply to all" prompt.)

## The node editor

It feels like a Foundry VTT item or actor sheet, not a Blender node-and-noodle canvas. "Node" is the idea underneath; the user never sees wires. Discussed October 19, 2026.

- **Start by copying.** A new monster can begin as a copy of an existing one, bringing all its bricks.
- **Drag bricks in.** A library list holds reusable bricks: attacks (Claw), spells (Fire Bolt, Shield), traits and more. Dragging one onto a sheet attaches it as a child: drag Claw onto a monster and it has a claw attack; drag Shield onto a sword and the sword takes on that protection.
- **Drill in to change one copy.** Opening an attached brick lets the user change its settings, or even rename it (a weaker "Warding Edge" made from the cleric's Shield), for that one sheet only. The library original is untouched.
- **Change the original to change everyone.** Editing Claw in the library updates every monster using it, except values a sheet has overridden.

**Where the library lives.** In the left panel, with a switch at the top between the current tab's list and the Library. Bricks are dragged left to centre onto the open sheet. The right side stays for flags only, so "what needs attention" never shares space with "what I can use". Like any panel, it can be moved.

**Building by dragging.** With a goblin open, the user opens several library lists at once (feats, features, special attacks, weapons, spells) as collapsible sections, each with its own filter (for example spells filtered to Mage) so the noise stays hidden. Dragging Club, then Pack Tactics, onto the sheet keeps adding bricks. Each brick card has a remove button, and removals can be undone.

**Smart drops.** If a dropped brick is complete, it just drops in. If it needs answers for this spot (Magic Missile dropped on a shield needs an activation and a number of uses), a small pop-up asks right there, with sensible defaults pre-filled so Enter accepts them.

**Many at once.** Ctrl-click and Shift-click select several bricks, even across different open lists (a sword, a feat, a special defence and a feature), and drag them in together. Selecting several nodes in the list panel (five goblin variants) and dropping onto any one of them adds the bricks to all of them. Any smart-drop questions are gathered into one pop-up, asked once for the whole group.

**Sheet layout.** A header that is always visible (picture, name, category and key numbers such as hit points, armour, speed and challenge rating), then sections. A monster sheet: Attacks and actions, Traits and features, Spells, Gear, Notes. Each node type gets its own sections (a sword has Enchantments instead of Spells and Gear). A dropped brick lands in the right section automatically by its category, so the user can drop anywhere on the sheet.

**Sheets come from the system.** Each system defines a sheet for each node type: which header numbers show and which sections appear, in what order. A survival system might show Sanity and Hunger instead of challenge rating. The generic d20 system ships with every sheet ready; from scratch starts with a basic set. In version 1, sheets are edited as simple lists with drop-downs (add, remove, reorder). Removing something from the system, such as Strength, removes it from every sheet header too, with a blue notice.

**One builder for every kind of being.** Monsters, NPCs, player characters, races and classes are all made in the same builder (name to be decided). The first choice is a drop-down: Monster, NPC, Character, Race or Class. The sheet then builds itself from the chosen system: its attributes, resources and sections appear automatically. Every sheet mixes open fields and drop-downs: picture, description, name, height range and so on. Lore links are dragged in: drop the Mirkwood Forest place onto a Race's Origin field. Rules can be typed ("+1 to Dexterity") or picked from drop-downs; it all ends up written out in the rulebook either way. Classes carry choice bricks ("choose one Technique: Classic, Battlemage or Warden"), with how many to pick, whether an option can be taken again, and optional restrictions.

**Smart text.** When typed rules mention something the system knows ("+1 to Dexterity"), the app underlines it and offers to turn it into a link with one click. Linked text joins the ripple and flag system; unlinked text stays plain prose.

**Creating one.** One tab holds monsters, NPCs, characters, races and classes; its list can be filtered by kind. Create new opens a short pop-up: name, and a drop-down of what it is (Dwarf → Race). Create opens the sheet with description boxes (origin, background) and spaces to drag in ability bonuses, feats and traits. Dragging in Stoneworking (+2) and drilling in to make it +3 changes only the dwarf's copy.

**Finding traits.** The library's Traits list is grouped so things are easy to find: Senses (Darkvision), Resistances and immunities (Immune to poison, which links to the Poisoned condition), Skills and proficiencies (Stoneworking), Movement (Climb speed) and Special abilities. Global search finds anything by name too.

**Variants (subclasses, subraces).** The Create new pop-up has a "Variant of…" option. A second pop-up asks what it's a variant of (Wood Elf → Elf). The new sheet starts as a linked child: it begins with everything the Elf has, tweaks are overrides, and later fixes to Elf flow down to Wood Elf. A Detach button turns it into a fully independent copy. The same works for subclasses and monster variants (Goblin → Cave Goblin).

**Tab name: Beings** (decided October 20, 2026), with sub-tabs along the top: Characters, Classes, Races, Monsters and NPCs.

## The Rules tab

Rules are nodes too, built from small bricks like everything else, so nothing is overwhelming. Discussed October 19, 2026.

**Sections:** Core check, Abilities, Resources, Skills, Conditions, Combat, Magic and powers, Advancement, Time and rest, Currency and economy. Sections are categories, so a "+ New section" can be added when an imported system needs one. Survival elements such as light and hunger fit into Resources and Time.

**Small rule nodes.** Each section lists small, separate rule nodes rather than one big page. Initiative is its own node. Movement is made of several (walking speed, climbing, swimming, flying, difficult terrain). Opening a rule node shows its bricks, the same way a monster sheet does.

**Design principle: a rulebook builder, not a game engine.** In version 1 nothing runs the rules automatically, so they don't need to be machine-perfect. Contradictions are flags, not crashes; the people at the table settle them, as with any printed rulebook. Goal: a quick game in about 15 minutes (an underwater alien-planet game on d100, minimal sheets, theatre of the mind), with every detail still tunable for those who want it.

- **Structured where it matters.** Things others depend on (abilities, resources, conditions, damage, saving throws) are drop-downs and links, so ripples and flags work.
- **Free text allowed.** Any rule node can be plain written prose (flanking, falling). It is still a node that can be moved, linked and exported.
- **Everything has a default.** Nothing is required; an unanswered question uses its default and never nags.
- **Three choices up front.** Each rule node shows its main decisions; "More options" reveals the fine print.
- **Style presets.** A few big questions set many small ones: "Grid tactical or theatre of the mind?" sets movement, ranges, reach and terrain; "Heroic or gritty?" sets healing, death and resting.
- **AI: decide the rest.** On any section, the AI fills the unanswered details to match the choices already made, with the usual preview.

**Core check.** Chosen from a drop-down of families, each with its own settings: roll over a target (d20 + bonus vs difficulty), roll under your stat, dice pool counting successes, 2d6 bands (full, partial, fail), percentile, step dice (d4 to d12), no dice (cards, tokens or narration), or Other. One main check per system; any rule node can use a different one (for example percentile for sanity). More families can be added as new systems are imported.

**Abilities.** Each ability node holds a name and short label (Strength, STR), a range (3 to 18, or 1 to 5), how it becomes a bonus (d20 style, score is the bonus, a lookup table, or not used) and a description.

**Generation method: once per system.** Rolling, point buy, a standard set or fixed values are set in one Character creation rule node. Any single ability can override it (for example Luck always rolled 3d6).

**Derived numbers live in Resources.** Hit points is a Resource node with a formula brick linking to Constitution, so deleting Constitution flags the formula red. Formulas are built from drop-down blocks (\[Constitution\] \[score\] \[+\] \[10\]), never typed, so the app always understands them. An "Ask AI to build this formula" helper turns complex wishes ("highest of Strength or Dexterity, plus level ÷ 2") into the same editable blocks.

**Resources.** Each resource node (hit points, mana, sanity, hunger, a torch's light) holds a name and label, a maximum (a formula or a fixed number), a starting value (full, empty or set), thresholds, recovery (per short rest, long rest, day, by spending something, or never, drawn from Time and rest) and how it shows on the sheet (number, bar, tick boxes or countdown). Thresholds can sit at any value, not only zero or max: Hunger 5 applies Hungry, Hunger 8 applies Starving.

**Conditions are nodes.** Starvation, Fatigue, Poisoned and the rest are nodes with their own bricks, linked from a resource threshold or anything else. Condition bricks include effects (−2 to all rolls), ticking effects (lose 2 hit points every hour), stages that worsen (fatigue levels 1 to 6), a saving throw to resist or end it (using the core check), and a duration or end trigger.

**Effects carry their own conditions.** Saving throws, conditions and effects are all nodes that attach to other nodes, and an attached node holds its own trigger and rules. A big shield gets one child, Knocked prone, and inside that child sit its condition (on a natural 19 or 20, set with the Activation drop-down) and, optionally, an attached Saving throw node (Strength, DC 13). There is no separate trigger node above it. A sword carrying Magic Missile can likewise get a Saving throw attached inside the spell. A saving throw node has drop-downs for which ability it uses, its difficulty (a fixed number or a formula) and what a success means (no effect, half effect, or other). Drowning, Freezing and Knocked prone are nodes like any condition.

**Many effects on one block.** A node can hold several attached effects, each with its own trigger and optional saving throw. Nesting decides timing: a node attached inside another fires only when its parent fires; side-by-side nodes fire independently. Example: Big Shield → Knocked prone (on a natural 19 or 20; Strength save, DC 13) → Fire, 1d6 (Dexterity save for half). The fire happens only when the knock-down triggers. Placed beside Knocked prone instead, the fire would follow its own trigger.

**Skills.** Each skill node holds a name, a linked ability (Stealth links to Dexterity) and a description. How characters improve (proficient or not, bought ranks, or improve by use) is set once per system, with per-skill overrides.

**Combat.** Built from small nodes. Initiative offers roll + bonus, side-based, fixed by a stat, popcorn, card draw, re-roll each round or once per fight, or Other. Turn structure offers action + bonus action + reaction + movement, three flexible actions, an action point pool, one action and a move, free-form, or Other. Each action (Attack, Dash, Dodge, Hide, Help, or new ones such as Shove) is its own node with bricks.

**Magic and powers.** A system can hold several casting method nodes, and each class links to the one it uses (wizards use slots, warlocks something else). Methods: spell slots refreshed on rest, mana or power points, prepared each day, roll to cast with mishaps, costs health or something else (blood, sanity, corruption), at will, none, or Other. Each method links to Resources, so mana or corruption is just a resource node. Spells are nodes with bricks (level or cost, range, duration, casting time, components) plus attached effect nodes using the same stacking as everything else: Fire Bolt holds Fire 1d10 with a Dexterity save, the same Fire node that can go on a shield.

**Advancement.** Methods: levels from experience points, milestones, XP from treasure, improve by use, spend points, none, or Other. Classes, ancestries and backgrounds are nodes that bundle bricks (an elf holds Darkvision, +2 Dexterity and a language). A class has a level table, and features are dragged onto its rows (Pack Tactics onto level 3).

**Core rule additions from the Ashen Vigil test (version 1).**

- **Choice bricks:** "choose one from this list" (pick a Technique at level 1) on class rows, ancestries, backgrounds or anywhere else.
- **Upgrade tiers:** a feature can have tiers (Evolved, then Mastered), each with its own requirement and changes.
- **Formulas in uses:** activation uses accept formulas (INT times per rest, minimum 1), not only fixed numbers.
- **Any/all conditions:** an activation can require several conditions, joined by any or all (flanked or unaware or below half health).
- **Point buy with deficits:** point buy can allow negative scores that grant extra points.
- **Roll tables:** a basic roll-table node (die size, ranges and results, results can link to nodes) for phobias, treasure, encounters and the like.
- **Lore templates:** lore pages can start from a template, such as a faction (history, structure, territory, allies, what it means to players).

**Plain-English summary.** Every chain shows a generated sentence at the top: "On a natural 19 or 20, the target must make a DC 13 Strength saving throw or be knocked prone." It confirms the chain does what the user meant, and the same sentences can feed the rulebook export.

**Activation.** Every attached brick has an Activation drop-down saying when it works, grouped so a long list stays easy to scan:

- Always: always on
- On an event: on hit, when hit, on a critical, when bloodied, when the wielder drops to 0
- By choice: action, bonus action, reaction
- Limited uses: once, twice or three times per day; per short rest; per long rest; limited charges with a recharge rule
- Other: the user defines a custom trigger

The options come from the system: rests appear only if the system has rests. A custom option such as "under a full moon" is added to the system once and then appears in every drop-down.

**Design principle: drop-downs should feel like they've thought of everything.** Seeing a full list sparks ideas ("I never thought of per short rest"). Every list is as complete as possible, with Other as the rare fallback.

**Green blocks** can be deleted from the panel or kept as a record of changes, and each offers Undo.

## The AI layer

The engine never needs AI to work; AI sits on top as a creative assistant that suggests, and the user decides.

- **Bring your own key.** The user enters their own API key, stored only on their computer. The app is only as powerful as the key attached to it, and the user pays for their own AI use.
- **Manual mode is the same app.** With no key, the AI buttons are simply greyed out. Conflict flagging, status lights and dependency tracking all still work, because they are part of the engine, not the AI.
- **Suggestions, not silent changes.** AI proposes fixes for flagged conflicts. The user accepts, edits or rejects each one, or tells the AI to apply its idea.
- **Safe actions only.** The in-app AI assistant cannot edit data freely. It calls specific, named actions (rename an attribute, add a monster, swap a material), each of which can be reviewed and undone.
- **Where AI shines:** tagging imported content (which items are metal), catching hidden effects the tags miss, and proposing creative rewrites that fit the world.
- **One AI panel that knows what you're looking at.** A dockable chat-style panel. A "Working on" line above the prompt box shows the target (Working on: Goblin, or Working on: whole world) and can be clicked to change. "Make this sneakier" with the Goblin open changes only the Goblin. Decided October 19, 2026.
- **Missing rules open the brick maker.** "All elves can see in the dark" with no darkvision rule opens a new brick, already named Darkvision, beside the AI's questions. The AI asks three or four multiple-choice questions at a time (with an "other" box and a "You decide" button), and each answer fills the brick's fields live. The user can type into the brick directly instead, or press "Just do it" to let the AI use its best guesses. The usual preview comes before anything is attached. Without AI, the same pre-named brick maker opens for the user to fill in by hand.
- **Cost warnings.** Small jobs just run. Jobs above a threshold the user sets in settings (for example $0.50) show an estimate first: "This touches 300 monsters, about $2.40. Go ahead?" Estimates are approximate. A running monthly total sits in a corner of the AI panel.
- **Creating from scratch (version 1).** Built in this order, each tested before the next: (1) from a prompt, single things and small batches ("10 swamp goblin variants"), shown as a checkbox preview list; (2) from a picture, such as a creature drawing becoming a node with stats and bricks; (3) a whole system from one prompt ("make me a cyberpunk RPG"), the hardest, which depends on the bricks being proven first.
- **When the AI checks for problems.** The free link and math checks always run. On top of that: a Live AI checking switch (on: the AI checks each change as it happens, only the changed piece and what touches it; off: no background AI cost; starts off, with a one-time tip when a key is first added), and a "Check for errors" button that reviews the whole system on demand, for example after designing 10 or 15 things. A whole-system check over the cost threshold shows its estimate first.
- **Chat history saved with the world.** One conversation per world, stored on the user's computer inside the world file. Close the app and pick up where you left off.
- **World Notes (version 1).** The AI keeps a short world notes file (tone, important facts such as "no oxygen in the water", key decisions) and reads it with the recent chat before every answer. It updates the notes when the user runs Check for errors, when an AI job changes the world, or on an "Update world notes" button, not on every save, to keep cost down. The user can read and edit the notes; lines the user writes are pinned and never overwritten by the AI. Because the notes carry the long-term memory, the AI only rereads the recent part of the chat, which keeps a long history cheap.

## Worked example: the no-metal world

A user starts from the d20 type, moves it to space, and adds the world rule "No metal: only wood." The app catches the effects in three layers.

| Layer | Examples | Caught by |
| --- | --- | --- |
| Tagged items | Swords, plate armor, chain mail | Engine, instantly, AI or not |
| Hidden metal | Horse bridle bits, nails, chains, lockpicks, cooking pots, coins (the whole gold-piece economy) | AI, or the user by hand |
| Ripple effects | Wood armor is weaker, so armor class needs rebalancing; the Heat Metal spell has no target; a rust monster is harmless (or becomes a wood-rot beast) | AI, or the user by hand |

Without AI, the app catches the first layer and says clearly that only tagged items were checked. With AI, all three layers arrive as sticky-note flags the user can accept, edit or reject. Because "No metal" stays on the world as a rule, a bridle added next year is flagged too.

## Version 1 scope

Version 1 proves the core loop: load a system, change something, see what breaks, fix it with or without AI help.

**In version 1**

- The hub: the shared file format for systems and worlds, with dependency tracking
- Home screen with the Systems and Worlds shelves; opens straight to it, no account
- Three starter templates: a modern d20 type, an old-school type, a simple d6 type
- System builder: stats, items, armor, creatures, modules on/off, world rules
- Conflict flags, status lights and full undo
- Optional AI: API key entry, suggested fixes, AI tagging of imported content
- Packaged as an installable Windows program

**Later**

- Lore builder, character maker, item maker as their own tools
- Map maker
- Printable PDF export with formatting
- Old-school type and d6 type starter templates, with original rules text
- Themes in settings
- Named layout presets and saved custom layouts
- Visual sheet designer: drag boxes to lay out a sheet
- Optional AI suggestions while building ("Elves usually have a language. Add Elvish?")
- Full drag-and-drop page designer for rulebooks

**Someday**

- Virtual tabletop for playing sessions
- Accounts, sharing worlds with friends, community marketplace (needs a server and a plan for copyrighted content)

## Version 2 (designing, October 21, 2026)

Version 1 builds a game. Version 2 takes it to the table: make a character, build a fight, test
the fight, run it, and print the pieces. Jeff wants all of the themes below; the order is still to
be decided. Nothing here is built yet, and nothing here changes the hard rules without Jeff's OK.

### Version 2 build order (agreed by Jeff, October 21, 2026)

1. Modules and encounters (the third layer, the encounter tree, the adventure booklet).
2. The character builder (the roster in the world, built from the system's rules).
3. Maps (pictures, pins, maps inside maps, drawing tools, export).
4. The DM's table on one screen (sessions, dice tray, initiative, timers, roll tables, journal).
5. Players join on their own screens (PINs, permissions, chat and whispers, live maps and marks).
6. The sheet designer and the book designer (one layout), and the print shop (paper pieces).

**Version 2's design is complete (October 21, 2026).** Each step above can ship as its own update
(2.1 modules, 2.2 the character builder...), so Jeff gets something new to use after each one.

**Version 3 (later):** mods and content packs, app themes and atmosphere (dark mode, parchment,
sci-fi; music and sounds at the table), the playtest simulator, more book layouts with fonts,
graphics, borders and dividers, sticker stock, and the AI's part in all of version 2 (decided after
Jeff has tried the version 1 AI). Version 2 keeps looks swappable so mods stay possible.

### The DM decides who sees what (rule, decided by Jeff, October 21, 2026)

Any question of the kind "should the assistant DM (or a player, or a watcher) see this?" is never
decided in the design. It becomes a choice for each DM: a column in the permissions grid, or a
setting, with a sensible default. Example: whether Ken, as assistant DM, sees initiative is the
Initiative column in the grid, not a design decision.

### Themes

- **Play it:** a character builder (race, class, background, point buy and Choices boxes walk a
  player through it, printable sheet out), an encounter builder (now the module's encounters and
  the Codex's ready-made encounters; no difficulty rating, the DM judges).
- **Test it:** a playtest simulator that plays a fight out a thousand times ("the party wins 82%
  of the time, usually with one hero down") and shows how a change moves that number.
- **Make it look like a book:** a drag-and-drop page designer, sheets you lay out yourself, app
  themes (dark, parchment, sci-fi), stock pictures and AI portraits on request.
- **The print shop:** paper standees and tokens sized to each creature, initiative and spell cards,
  and maybe 3D files (a mini's base with its name and armour on the rim). Could tie in with
  T3 Crafters ("buy the minis for this world").
- **Worlds that feel alive:** a map maker with pins that open places, factions and lore pages; an
  adventure planner whose encounters link to the world's things; timelines and family trees; more
  roll tables (rumours, loot, weather) that roll on each other.
- **More starting points and connections:** old-school and d6 starters, Foundry VTT export,
  importing a handbook you already wrote (PDF or Word).
- **The print shop, without selling (Jeff, October 21, 2026).** Jeff likes printing what's made in
  the app: fold-over standees, tokens, cards (spell, item, monster, condition, initiative), maps
  and the journal (already designed to export), and down the road **sticker stock**: high-quality
  pictures laid out for sticker sheets, to peel off and put on cardboard or 3D-printed signs. The
  T3 Crafters shop link is not wanted for now.
- **The far shelf:** the marketplace with accounts, and a full virtual tabletop.

### The DM's table

Table mode grows from a reading view into the screen the DM runs a game from. The key idea: **the
table reads the system.** Nobody builds a tracker; the trackers come from the rules already made.

- **Counters build themselves from resources.** Spell slots, ki, rage, sanity: each resource
  already has its maximum and when it comes back, so the table makes a counter for each, and
  Short rest and Long rest buttons refill the right ones.
- **Conditions count themselves down** from their durations and drop off when they end.
- **Hit points** show the way the system set them up: a number, a bar or wound boxes.
- **The initiative tracker follows the core check.** A d20 game rolls d20 plus the Dexterity
  bonus; a dice pool counts successes; a system that says "sides take turns" groups players and
  monsters. Drag in the party and monsters from the Codex; each brings its hit points, armour and
  attacks. Click an attack to roll it and put the damage on the target. (Jeff's idea from last
  year's DM in a Pocket: an initiative tracker that is dynamic to the system the user built.)
- **Timers and the clock:** round counters, torches burning down, "the ritual finishes in 3
  turns", an in-world clock (light and time matter in The Ashen Vigil). A timer can roll on a roll
  table when it runs out ("every 10 minutes underground, roll Wandering Monsters").
- **Roll tables** roll live, roll on each other, and can drop monsters straight into initiative.
- **Playing never changes the world.** A goblin dropping to 0 hit points must not change the Goblin
  sheet. Each play session is its own layer on top of the world (like a world on its system), so
  damage, used slots and timers live in the session. A session can be saved mid-fight and picked
  up next week.

### Arranging the DM's screen, and bookmarks (Jeff, October 21, 2026)

- **The DM arranges their own screen.** Tools are dragged by their title bar into place: a map in
  the left corner, the initiative tracker on the right with a timer under it, bookmarks below
  that. Tools snap into areas (left, right, top, bottom, middle, split as needed) rather than
  floating loose, so nothing gets lost behind something else. The arrangement is remembered, and
  can be saved under a name ("Combat", "Town", "Prep") to switch in one click.
- **Bookmarks** are a tool of their own, like bookmarks in a Player's Handbook or the inside of a
  DM screen. Drag anything into it: a rule (how movement works), a map, a tracker, a journal entry,
  a monster, an encounter. Each is a link; click it to open it, or hover to read it at a glance.
  Bookmarks can be grouped under headings and reordered by dragging.
- **Showing a rule to players (Jeff, October 21, 2026).** When there's an argument at the table, the
  DM shows the rule to players: the usual "Show to players" list, everyone ticked by default,
  untick anyone to leave out. It pops up on their screens as a small card they can drag around,
  minimize, and close with an X when they're done; it stays until they close it. Works for any
  block: a rule, a condition, a spell, a price list. Triggered by a small **Show** button (an eye)
  that appears on hover (decided by Jeff, October 21, 2026; Shift-click stays "select a run").
- **A Codex section or category can be bookmarked as a little table**, such as every potion with
  its price, so a price list is always one glance away.

### Pin anything to the screen (Jeff, October 21, 2026)

Anything in the app can be pinned to the screen: a rule, a lore page, a monster, a price list, a
help page or the hotkey list. A pin is a small card that floats over everything, can be dragged
anywhere, collapsed to a little tab and opened again, and **stays put while you move between
tabs, screens and tools**, until you close it. Closing a pin never touches the original; a pin is
only a link, so it always shows the latest version. Pins are remembered with the world (and the
DM's table), so they are there next time.

- **How to pin (decided by Jeff, October 21, 2026):** a pin button appears on hover, or press
  **Ctrl+Shift+P** (Ctrl+P stays Print, as in every Windows program). A small **X** closes a pin;
  **double-click** opens the pinned thing in full.
- **Pins and bookmarks are different:** bookmarks are a tidy list in one tool; pins float on top of
  whatever you're doing. This is the "floating, pinnable windows" idea parked in the feel pass.

### The initiative tracker (Jeff, October 21, 2026)

Foundry has dozens of mods that change how initiative works, so there is no one right way. Out of
the box the tracker has **many settings** (its gear), and the DM sets it up for their table.

- **Rolling:** roll once at the start of the fight and keep those numbers, or re-roll every round.
  The default comes from the game system; the DM can change it.
- **Monsters hidden until their turn:** everyone rolls, but players don't see where the goblin and
  the goblin leader sit in the order. When a hidden monster's turn comes, the names **slide apart
  and the monster's name squeezes in** between them with a little squash animation ("John's up
  next... nope, the goblin goes").
- **Always hidden:** monsters never show in the order at all, so the DM can let them act whenever
  they like, not following initiative.
- **Who moves it on:** anyone with permission on the tracker (the DM, an assistant GM, an
  initiative keeper, or every player). It's live for everyone: whoever clicks first, all screens
  update. A table rule "advance it yourself when your turn is done" is everyone having permission;
  each player then sees an **End my turn** button only on their own turn. (Jeff's own table: the
  tracker is open to everyone and players advance it themselves, so the DM is free to prepare
  speeches, role-play and think about tactics. Multitasking is the hardest part of DMing.)
- **Styles (each a setting, more from mods later):**
  - **List:** cards in a column at the side (the default).
  - **Carousel:** character portraits across the top; whoever's turn it is sits in the middle,
    large; on Next turn it slides aside and shrinks, and the next portrait slides in and grows.
  - **Pop up my sheet on my turn:** a player's character sheet opens on their screen when their
    turn comes.
- **A little information beside each name, chosen by the DM:** hit points, armour class, a Dexterity
  or saving throw bonus, anything from the sheet. Each can be switched on or off, for a quick
  glance ("what's its armour class again? 15"). What players see of monsters still follows
  permissions.
- **Show character names or player names** (a setting).
- **Each tool is its own little program inside the app (Jeff, October 21, 2026)**, so a tool can grow
  as deep as needed over time. Down the road the tracker gets **themes**: a drop-down of ready-made
  looks and layouts (Jeff will go through Foundry's initiative tracker mods for ideas to include),
  each with its own permissions and settings.
- **Glance info changes with the moment.** The DM can switch what shows mid-session: running a
  gauntlet where every trap is a Dexterity saving throw, show everyone's Dexterity save. Combos can
  be saved and named ("Gauntlet: Dex saves") to switch back in one click. Players can choose what
  shows on their own screen, within what the DM allows.
- **During a fight (decided by Jeff, October 21, 2026):**
  - **Groups (Jeff, October 21, 2026):** dragging a monster in asks **How many?** (a stepper) and
    **Separately or As a group**. Separately adds Goblin 1, Goblin 2, Goblin 3, Goblin 4, each
    rolling its own initiative. As a group adds one card where all four share one initiative; the
    card opens to show each goblin's own hit points, so damage still goes to the right one.
  - **Delay and ready:** drag a card to where it acts (anyone with permission); a Delay button
    sets a card aside until the player jumps back in.
  - **At 0 hit points:** follows the system's rule (unconscious, dying or dead); defeated monsters
    grey out and can be removed with one click.
  - **Event cards:** lair actions and timed events ("on 20, the ceiling drips acid") are cards
    with no creature, sitting at a set spot in the order, showing their reminder when reached.
  - Conditions show as icons and count down by themselves ("Poisoned ends"); damage and healing by
    clicking a card; reinforcements dragged in from the Codex mid-fight roll and slot in; a round
    counter at the top also ticks the timers; End fight logs the result in the journal and counts
    the defeated monsters toward the night's experience. All of it adjustable in the settings.

### The journal
- **Pages like a notebook (October 21, 2026),** in the usual tree: a Sessions group with one page per
  night made automatically, plus the DM's own pages ("Plot threads", "NPC voices", "Things the
  party owes").
- **Adding pages and categories (Jeff, October 21, 2026).** A new journal opens with **+ Add page**.
  Each page has a category drop-down in its top right corner (Session, Party notes, Lore,
  Treasure, Plot threads, NPCs, Quests, Rumours, Places...), ending with **+ New category**, and
  pages are grouped by category in the journal's tree. Moving a page is just changing its category
  (or dragging it to another group). Same pattern as categories everywhere else in the app.
- **Priority (Jeff, October 21, 2026).** Each page can have a priority number (1, 2, 3... as many as
  you like). Within a category, priority 1 pages stay at the top, then 2, and so on. Once a page
  is done with, give it priority 30 and it sinks to the bottom. Pages can also be starred as
  favourites and pinned to any screen, like anything else.
- **Categories have a priority too (Jeff, October 21, 2026),** so a full journal reads in the order
  the DM wants: Characters first, then Lore, then NPCs (everyone the party has ever met), and so on.
- **Each page can have a picture** that shows beside its name in the tree, so the NPC list shows
  the barmaid's and the town boy's faces at a glance.
- **Journal pages are things in the Codex** (a Journal section, visible only to who may see it), so
  they work like everything else: share, star, pin, delete to the recycle bin, copy, and bring
  into other worlds and modules.
- **Building a page from blocks (Jeff, October 21, 2026).** A new page is blank, with **+ Add**:
  - **Image:** opens a file browser, or just drop a picture onto the page. It can be resized to
    the page or any size.
  - **Text:** a text box appears and you type straight away. A few fonts, a few sizes and a few
    colours to start.
  Every block can be moved anywhere on the page and resized, like a scrapbook or OneNote: a
  picture of the town with notes underneath, or beside it. (On a phone, blocks stack in order.)
  This replaces "simple formatting" above. Exports and prints follow the page's layout.
- **A page can be just a picture (Jeff, October 21, 2026).** Drop a JPEG in and that's the page:
  the town, the mayor, the tavern. A run of picture pages works like a slideshow the DM walks the
  players through. Pages can be shared all at once on the honour system ("don't look ahead, you'll
  spoil it for yourself"), or kept hidden and revealed one at a time with a **Reveal** button on
  each page (the usual Show to players, everyone ticked), so nobody can peek.
- **A session page has two parts:** the DM's notes on top, and the table's log underneath.
- **The log keeps only what matters (Jeff):** fights started and ended, characters dropping,
  rewards, conditions, things shown and to whom, chat lines pinned. Not every dice roll. Each kind
  of entry can be switched on or off.
- **Links:** typing a name links to its page, and that page shows "Mentioned in: Session 3,
  Session 7". Ctrl+F searches every page.
- **Players keep their own private journal (Jeff).** The DM can see it (the DM always has
  everything); a player can share a page with others.
- **Handouts are made as journal pages (Jeff, October 21, 2026).** One place to make them: a page
  built from blocks (pictures and text). Showing a handout to players is showing that page.
- **Printing handouts with style (Jeff):** when a page is exported or printed, add a border, an
  old-paper look (aged parchment, stains, torn edges), a wax seal, a handwritten-style font. It
  uses more ink, so an **Ink saver** switch prints it plain.
- **Export as a campaign diary (Jeff):** PDF or Word through the same export screen as the
  rulebook, the story so far, session by session (DM-only pages left out unless ticked).

- Write as you play, with links: typing a name links to that sheet.
- The table writes entries too: "Round 3: Mira dropped to 0 hit points", "Rolled on Rumours: the
  miller is lying", "Long rest, day 4". A session log with no typing.
- After the session, turn a note into a lore page or an NPC (the improvised innkeeper becomes part
  of the world).
- Ask the AI for a recap ("last session in a paragraph") to read out next time.
- **Session recap template (Jeff, October 22, 2026).** After each session the DM can fill in a simple structured template — biggest moment, player of the game, what the party decided, what comes next, any notes for next time. The app does not listen or track automatically; the DM writes it by hand. It lives in the journal, can be exported and shared with the group, and gives the AI context for next session's prep. Simple, honest, no microphone required.
- **Private by default.** The journal is the DM's notebook, not a node's rulebook text, so the
  "no secret GM notes" rule doesn't apply to it. It is shared only through permissions, and left
  out of shared files unless ticked. (Decided by Jeff, October 21, 2026.)

### The party and permissions

- **A Party section in each world.** Each player is a person linked to the character they play,
  with a role: "Randy plays the cleric, Joe the wizard, Ken the thief and is my assistant DM." A
  player can change their own sheet and mark their own spell slots, not anyone else's.
- **Roles set the defaults, like Foundry:** DM (everything), Assistant DM (most things, any part
  can be switched off), Player (their own character plus what's shared), Watcher (sees the shared
  screen only).
- **One simple grid for exceptions.** People down the side; parts of the game across the top
  (characters, initiative, journal and notes, roll tables, monsters...). Each square is Hidden,
  Can see or Can change; clicking cycles it. Every column and every row has a Deny all button, so
  nobody clicks into each character or player. Example: Ken (assistant DM) can change the notes
  but initiative is hidden from him.
- **Share with…** on any one page or handout shares just that, without touching the grid.
- **Permission templates (Jeff, October 21, 2026).** Nobody sets permissions every session. Each
  person's permissions are remembered with the party. At the top of the permissions screen are
  saved templates the DM has named, and **+ New template** saves the current setup:
  - **Person templates** ("Assistant GM", "New player", "Trusted player"): pick one for a person
    and their whole row is set in one click.
  - **Table templates** ("Thursday group", "Convention one-shot"): the whole grid for a group,
    applied in one click.
  Templates can be edited, renamed and deleted (to the recycle bin), and changing one asks whether
  to update the people already using it, like the checklist for changes flowing down.
- **The permissions screen, like Foundry (Jeff, October 21, 2026).** Opening permissions in a
  module lists every player attached to it, each with a **level** picked from a drop-down. The app
  comes with these levels ready-made (they are the starting person templates, and can be changed):
  **New player** (their own character and nothing else; no other permissions), **Player**,
  **Trusted player**, **Assistant GM** and **DM**. A person's level carries over to the next
  module unless the DM changes it there. The grid underneath is only for exceptions.
- **The DM can always override, with no "are you sure?" (Jeff, October 21, 2026).** Showing or
  sending anything to anyone just happens, whatever their level: a New player can be sent a
  journal page they normally couldn't see. Sending it shares that one thing; their level and the
  grid are unchanged. (Like everything else, it shows in the session log.)
- **Always exactly one DM (rule, Jeff, October 21, 2026).** Every module and session has one DM,
  the absolute boss, never none and never two. The DM can't make themselves an assistant GM or a
  player. To change who runs the game (groups that take turns), **Hand over DM** moves the DM
  level to someone else in one step, and the old DM gets the level they pick, so there is never a
  moment without exactly one. There can be as many assistant GMs as the DM likes, all under the
  one DM: some tables make every player an assistant GM ("look it up yourself"), others keep
  everything with the DM. Both styles are fine; the app supports either with levels and table
  templates (for example a ready-made "Everyone trusted" table template).
- **An assistant GM can be given everything (Jeff, October 21, 2026).** With a few clicks (or an
  "All permissions" button on their row), an assistant GM can do everything the DM does, including
  changing other people's permissions if the DM allows it. Only the title differs. The one thing
  that stays with the DM alone is the DM seat itself: only the DM can Hand over DM, and nobody can
  lower the DM's own access, so the one-DM rule always holds.
- **The DM always has everything (rule, Jeff, October 21, 2026).** The DM's row in the grid is
  locked fully on and can't be changed: no setting ever hides initiative, a journal page or
  anything else from the DM. The DM can give anyone else the same powers.
- **Presets are logical starting points; adjusted ones become templates.** The ready-made levels
  are sensible, the DM adjusts them for their table, and saves the result as their own template so
  the tinkering is done once.
- **Adding from the Codex to your own character (Jeff, October 21, 2026).** A permission of its
  own, because players dragging Potions of Healing and magic items onto their own sheets is a real
  problem (seen in Foundry). New player: off. Player: off. Trusted player: on. Whatever the
  setting, the DM is told quietly when a player adds something to their own sheet (a blue note in
  the session log: "Joe added Potion of Healing"), never blocking anything. Telling the DM is
  itself a DM setting ("Tell me when players add things"), on by default.
- **Table jobs (Jeff, October 21, 2026).** The DM can hand a tool to anyone at the table, assistant
  GM or player, so the DM can focus on monsters and maps: "Fred runs initiative" (he clicks Next
  turn, and now it's Johnny's turn), "Johnny keeps the journal", "Fred tracks the party's gold".
  A job is simply "Can change" on that one tool for that person, shown as a small badge by their
  name (Initiative keeper, Scribe, Treasurer). Jobs are given in the Party screen or by dragging a
  tool onto a name, and go into templates like everything else. Whether the initiative keeper also
  sees hidden monsters is the DM's choice (hidden by default: they see "a hidden creature's turn").
  The party gets a shared **party gold** tracker for the treasurer.
- **The assistant GM can share what they can see (Jeff, October 21, 2026).** An assistant GM can
  show or send anything they are allowed to see, to any player, also with no confirmation: if Ken
  can see the journal, he can send a journal page to anyone. What is hidden from him he can't
  share: with initiative hidden, he can't show initiative to anyone. Players share nothing beyond
  their own things, unless a DM chooses to allow it (a column in the grid).
- **Joining with a PIN, no account (Jeff's idea, October 21, 2026).** The DM's app hosts the
  session. Each player gets their own random 5-digit PIN from the Party section; the PIN is both
  the key and who you are, so Ken's PIN opens Ken's view with Ken's permissions. PINs end with
  the session (or carry over if the DM chooses), can be re-rolled or revoked in one click, and
  lock after a few wrong tries. Players join in a web browser (laptop, tablet or phone, nothing to
  install) or a QR code on the DM's screen. Each player sees their own desktop: their character,
  the initiative as the DM allows, the journal pages and handouts shared with them.
- **Chat and whispers (October 21, 2026).** A typed chat for everyone in the session. A whisper
  goes only to the people you pick: click one or two names (or a "to: Randy, Joe" chip) and the
  message is marked as a whisper for them alone. Rolls post into the chat: open (everyone sees),
  DM only, or blind (the player rolls but only the DM sees the result, for perception and
  traps). Names in a message link to sheets and handouts, which open only if the reader has
  permission. In-character and out-of-character lines look different. The chat is saved with
  the session and its lines can be pinned into the journal. **The DM sees everything,
  including every whisper between players** (decided by Jeff, October 21, 2026). Players are told
  so, the way Foundry does it. Whether an assistant DM sees them is a column in the permissions
  grid, hidden by default.
- **Hidden monsters.** Monsters join initiative hidden; the DM reveals each one when it appears
  (or all at once). Players see monster health as words ("unhurt", "bloodied", "nearly down")
  unless the DM shares numbers. Hidden rolls stay on the DM's screen.
- **At home versus far away.** On the same home network, the DM's computer is reached directly and
  costs nothing. Players in other houses need a small relay in the middle, because home routers
  block incoming connections; the relay only matches a PIN to a session and passes messages, with
  no accounts. Running it has a small monthly cost, so remote play may be an optional extra.

### Tools (October 21, 2026)

Everything on the tabletop screen is a **tool**: the dice tray, initiative, timers, roll tables,
the journal, chat, handouts. Every tool works the same way, so it is learned once: it opens from
the tabletop, and has its own small settings (a gear on the tool) that change only that tool.
Settings can be the DM's for the whole table, or each player's own where it only affects their
screen. A tool is also the natural unit for mods later: a mod adds a tool, or adds to one.

Dice tray settings, for example: animation on or off, roll speed (fast to slow), sound on or
off, the dice colour, and later 3D dice and other flourishes (trails, sparks on a natural 20).
Turning animation off shows the result at once, for groups that want speed.

### The dice tray (designed with Jeff, October 21, 2026)

A tool on the tabletop screen only. A dice button opens a small tray that slides out.

- **Dice:** d4, d6, d8, d10, d12, d20, d100, and a coin for a coin flip. Click a die to add it
  (click d4 four times for 4d4), then + and a number for a bonus (1d6 + 6), then Roll. Typing a
  formula works too, for people who like typing.
- **Advantage and disadvantage** are buttons (roll twice, keep the higher or lower).
- **Colours:** six solid colours to start. Each player picks theirs, so their rolls show in their
  colour in the chat.
- **Saved rolls (templates):** name a roll and keep it, such as "Longsword attack": 1d8 + 4. One
  click rolls it and adds the bonus. Better still, the table reads the system: a character's
  attacks already know their dice and the Strength bonus, so their saved rolls make themselves
  from the sheet, and the player can add their own.
- **Macros: rolls that follow whoever they're for (Jeff, October 21, 2026).** A saved roll can use
  a stat instead of a number: "Constitution save against DC 13" is d20 + [Constitution save bonus]
  against 13, built from blocks like the formulas in the Rules tab (never typed). Then choose who
  it rolls for:
  - **Whoever's turn it is:** on Jacob's turn it uses Jacob's Constitution bonus; click Next turn
    and the same button uses the next character's.
  - **Everyone at once:** the whole party rolls together (a gauntlet of Dexterity-save traps).
  - **Who I pick:** click names.
  The chat shows each result with Pass or Fail against the DC. A macro is a button that can be
  bookmarked, pinned, or kept on the tracker; it works in any system, since the stat is a link to
  that system's own ability.
- **The macro builder (Jeff, October 21, 2026).** Macros are things like any other, kept in a
  Macros section of the Codex, and shared like anything else (Show to players, or permissions:
  "can use" or "can change"). A macro is a short recipe made of **blocks**, never code, like a
  phone's Shortcuts app. The blocks are the same fixed list of named actions the AI uses (Part 7),
  so every macro goes through undo and history, and a macro press is one undo step. Built in
  stages:
  1. **Roll macros** (first): dice, stats, who it's for, pass or fail against a number.
  2. **Action macros** (later): change a tracker ("use a torch": torches carried minus 1), change
     hit points ("short rest": everyone rolls their hit die and heals), add or remove a condition,
     post a message to the chat, show something to players.
  3. **If blocks** (later still): "if the save fails, add Poisoned".
  Ready-made macros come with the starters (Short rest, Long rest, Use a torch), so most people
  never open the builder.
- **Who sees it:** Public (everyone), Private (just me), DM only, or Blind (only the DM sees the
  result).
- **The chat keeps the history:** "Rob rolled 14", with the breakdown (d20 showed 10, + 4) a click
  away. Private and DM-only rolls show only to the people allowed to see them.
- **Cards (if easy):** a standard deck with draw and shuffle is simple enough for version 2; custom
  decks (tarot, a game's own cards) come later.

### Mods (later, planned for from the start)

Jeff can see the app getting mods, like Foundry. Start with **content packs** that add things
without running code: dice skins and colours, card decks, sound packs, themes, starter systems.
Mods that run their own code are a later step and need care, because code from a stranger can
damage files (Promise 7). Building the tray, themes and sounds so their looks can be swapped
keeps that door open.

### Modules: the adventures (proposed, October 21, 2026)

**Status: proposal. It adds a new kind of layer, which changes the hard rules (Part 4) and the
data format, so it needs Jeff's OK and a CLAUDE.md update before any code.**

Jeff calls adventures **modules**, as in the 80s. A module is a third layer:
**system → world → module.** "The Mill on Ash Creek" uses Greyhollow, which uses d20 Basic.

- **Locked to its world and system.** Once made, a module's world (and through it, its system) can
  never be swapped, as in Foundry: an adventure written for d20 can't be switched to an OSR or
  Pathfinder system. (Jeff, October 21, 2026.)
- **Changes inside stay inside.** Anything can be changed within the module (remove Strength for
  this adventure only) without touching the world or the system above it.
- **Changes flow down, never up**, as everywhere: a fix to the world's Goblin reaches every module
  in that world, unless the module set its own (pencil mark). Edit parent works from inside a
  module.
- **Only order matters, nothing blocks.** A module needs a world, as a world needs a system. The
  app never judges whether the world is "built enough" (Promise 4).
- **What a module adds:** encounters (nested, in story order) with read-aloud boxed text,
  monsters, handouts and maps tied to them, NPCs and monsters of its own, and its own
  printed adventure booklet.
- **Sessions run in a module.** A play session is a layer on top of the module, so playing never
  changes it; another group can run it fresh.
- **Sharing:** a shared module carries its world and system with it, as a shared world carries its
  system.
- **Two kinds (locked in by Jeff, October 21, 2026):**
  - **Setting-free module**, built straight on a system. It has everything in the system (the
    starter's monsters, spells, items, classes and rules) but none of any world's own places,
    NPCs or homebrew. Portable, like the 80s modules "suitable for any campaign".
  - **World module**, built on a world, using that world's towns, villains and history too.
  - **Place in a world:** a setting-free module can be copied into any world on the same system,
    which then lets it use that world's things. The system never changes (still locked), and the
    setting-free original stays as it was, so it can be placed in other worlds too. This is how a
    module is reused.
  - A world module can't simply drop its world: anything it used from the world would be missing,
    so the app flags those links red to fix rather than refusing (Promise 4).
- **A Modules shelf on the home screen**, beside Systems and Worlds. Clicking a module opens it with
  its world and system behind it.
- **Journals follow their layer (working idea, to settle later).** Notes written in a module stay
  with the module; notes written in the world stay with the world. Inside a module, the world's
  journal can be read (it flows down like everything else) but is changed in the world. A module
  note can be copied up to the world journal on purpose ("Add to the world journal"), never
  automatically, the same way Copy rule works.

### The module builder (October 21, 2026)

- A module opens like a world (same Codex, same tabs) with one new tab first: **Adventure**.
- **Front page:** title, cover picture, level range, party size, about how many sessions, and the
  hook (what's going on and why the heroes get involved).
- **Everything is an encounter (Jeff, October 21, 2026).** A tavern full of role-playing, an
  ambush outside the gates, an investigation, a dungeon: each is an encounter, one kind of card.
  Each encounter holds read-aloud text, "What's really going on" notes, monsters dragged from the
  Codex, descriptions, pictures, maps, treasure and handouts.
- **Encounters inside encounters, any depth.** The goblin ambush outside the gates holds the well
  beside the road; going down the well is its own encounter, inside the ambush. The cave holds
  Room 1, Room 2, Room 3... each a full encounter with its own notes, monsters and pictures.
  ("Inside" here is like a brick nested in a brick: it belongs to and prints with its encounter.
  It is not a variant, so nothing is inherited.)
- **"Leads to" links** join encounters that are separate: tracks from the ambush lead to the cave,
  which is its own encounter, not inside the ambush.
- **Printing follows the nesting:** 1. Goblin ambush, 1.1 The well; 2. The cave, 2.1 Room 1, 2.2
  Room 2... An encounter prints with everything inside it, and "Leads to" prints as "see 2. The
  cave".
- **The tree view, like File Explorer (Jeff, October 21, 2026).** The module's encounters show as a
  folder tree: the module at the top, its encounters under it, and a little arrow to open any
  encounter and see what's inside. Drag to rearrange: drop between two encounters to move it there
  (the first encounter can become the ninth), drop onto an encounter to put it inside. Shift and
  Ctrl select several to move together, and the numbers (1, 1.1, 2...) update by themselves. Each
  move is one undo step. An encounter always moves with everything inside it: drag encounter 2
  (with four encounters inside) into encounter 3, and encounter 3 becomes 2, the moved one becomes
  2.1, and its four become 2.1.1 to 2.1.4. "Leads to" links point by permanent ID, so "see 2" in
  the booklet always shows the current number.
- **Deleting an encounter never deletes what's inside it (Jeff, October 21, 2026).** The
  encounters inside move up one level into its place, in the same order, and are renumbered (delete
  2. The cave, and Room 1 to Room 5 become encounters 2 to 6). Same idea as deleting a parent
  promotes its variants. The deleted encounter goes to the recycle bin remembering what was inside
  it, so restoring it (or Ctrl+Z) puts them back inside.
- **The map view** shows encounters as boxes with "Leads to" as arrows, for seeing how the
  adventure branches.
- **The booklet:** the module prints as an adventure book (cover, introduction, encounters with
  boxed read-aloud text, then automatic appendices of every monster's stat block and the
  handouts), built like the rulebook.
- **New module (Jeff, October 21, 2026):** a pop-up like New world: name, cover picture, then
  "What is it built on?", a world (world module) or just a system (setting-free). It opens
  straight away.
- **Encounters in the Codex (Jeff, October 21, 2026):** an Encounters section holds ready-made
  encounters ("Tavern brawl", "Bandit ambush", "Collapsed bridge") made in the system or world.
  Drag one into a module's tree and it becomes that module's own copy, everything inside it
  included, to change freely. Any encounter can be saved to the Codex for reuse.
- **No difficulty rating (Jeff, October 21, 2026).** Encounters don't judge how hard a fight is;
  the DM does. (The playtest simulator, later, is where a DM can test a fight if they want to.)
- **The booklet uses the same export screen as the rulebook** (one more book type, "Adventure",
  beside the Player's guide and the Monster book), so it is learned once. One extra choice there:
  **encounter numbers** full (2.1.1), top level only (2), or off (Jeff, October 21, 2026). With
  numbers off, links read by name and page instead ("the tracks lead to The Cave, page 14").
- **A module booklet is a DM book** (decided by Jeff, October 21, 2026), so "What's really going
  on" belongs in it. At the table, the permissions keep secret parts off players' screens.
- **Running it:** the tabletop shows the current encounter, its read-aloud text and what's inside
  it; clicking Start fight drops its monsters into initiative, hidden until revealed. "Session"
  stays the word for a game night.

### Showing things to players (October 21, 2026)

Every handout, picture, map, note or journal page has a permission. **Show to players** opens a
small list of the party, all ticked; untick anyone who shouldn't see it and press Show. It pops up
on the screens of everyone ticked (and goes into their journal to look at again), and nobody else's.
Show to all is one click. Example: the party finds a note, but one player found it alone, so it is
shown to that player only; or everyone sees the map except the player whose character is blind.

### The session: one game night (October 21, 2026)

- **Prepare session:** tick who's coming tonight; the app opens at the encounter the group reached
  last time; star the encounters you expect to reach; PINs and the QR code ready.
- **Begin session:** players join with their PINs (a green dot by each name); "Last time…" shows
  on every screen (written by the DM, by the AI from the journal, or skipped); the session journal
  starts a fresh page ("Session 7, October 24").
- **During:** the tools, encounters, chat, dice and handouts as designed above.
- **Save and stop:** everything is kept exactly (hit points, initiative, timers, whose turn);
  Resume next week puts the table back mid-fight.
- **Wrap up:** experience (added up from the monsters defeated, changeable, with a milestone
  "everyone levels up" button), loot dragged onto characters, level-ups walked through on each
  player's screen, the session log saved with the module, and a "keep this?" prompt for anything
  made up on the spot (it becomes a real NPC in the module, or in the world).

**Flexible groups (locked in by Jeff, October 21, 2026).** The app never asks for the story to make sense: if the DM says a character is there, it's there; if not, it isn't. Many groups are drop-in (whoever can come brings their character). Four play a module and don't finish;
experience so far is divided. Next week Randy can't come, so his character sits out. The week
after, a new player joins with a brand new character. On the fifth night the DM wants something
new, so the same five characters start a different module. All of that must just work:

- **Characters live in the world, in the party roster** (everyone who has ever played there, like
  a guild hall). A module never owns characters; it borrows whoever is at the table.
- **Each session has its own table.** Prepare session ticks who is playing tonight. Anyone not
  ticked sits out: their character stays as it was, and the session log says "Randy sat out".
- **Experience and loot go to who was there** by default, divided among the characters at the
  table that night. A table that wants absent characters to keep up turns on "Absent characters
  share" in its settings.
- **New players join any time.** Add a character to the roster (from the character builder) and
  tick them for tonight. The DM can start them at the party's level, or at level 1.
- **Modules keep a bookmark.** Leaving a module unfinished saves where the group was (the
  encounter, and any fight in progress). The module shelf shows "Paused at 3.2 The Old Well";
  coming back resumes there, with whoever is at the table then.
- **Switching modules is just starting another one** with the same roster. A setting-free module
  is placed in the world when a party from that world starts it.
- **Levelling: the system sets the default (experience or milestones), each DM can switch.**
- **Level-ups: the DM approves** (players walk through it on their screen; it waits for an OK);
  trusted players can be set to level up on their own.

### The character builder (locked in by Jeff, October 21, 2026)

- **It builds itself from the system and world together** (locked in by Jeff). It only asks about
  what the game has: a d6 game with no feats never shows feats; a game without classes skips
  classes. Races, classes, backgrounds and gear come from the Codex.
- **A wizard, one step per screen:** name, picture and player; race (cards, subraces underneath);
  class (with its Choices boxes); ability scores; gear (starting kit or gold to spend); finish
  (the sheet, with How it prints, joining the roster).
- **The player makes it** on their own screen and the DM approves it; or **the DM makes it** for a
  drop-in or a pre-made character. **"Make it for me"** picks sensible choices in one click.
- **How ability scores are made lives in the game's rules** (Jeff, October 21, 2026), as a rule in
  the Abilities section of the Rules tab, the way point buy is today. Methods: point buy, a
  standard set of numbers, roll 4d6 and keep the highest three (arrange as you like), roll 3d6 in
  order (first roll Strength, second Dexterity, third Constitution...), or the system's own.
  Rolls happen in the dice tray for everyone to see.
- **At character creation, a Method drop-down defaults to the system's rule.** The DM can switch
  it for this character in one click ("this time, point buy"). A world or module can also change
  its own default, like any other rule.
- **Appearance folds away (Jeff, October 21, 2026).** One line, "Appearance", that opens to more:
  height, weight, age, hair, eyes, skin, distinguishing marks, voice and mannerisms. A fast
  character skips it; a meticulous player fills in everything.
- **Every section has + Add (Jeff, October 21, 2026).** The system's designer can add fields for
  everyone ("Scars", "Cybernetics"), and a player can add their own on their own sheet (three
  hair colours if they like). Added fields follow the same print rule below.
- **Gear shows its picture (Jeff, October 21, 2026).** Dragging a weapon or item onto a character
  can show the item's picture or icon beside it; a switch on the sheet turns pictures on or off
  (on screen and in print), for players who like to see their gear.
- **Trackers on the sheet (Jeff, October 21, 2026; details later).** The system's resources (spell
  slots, ki, hit points) appear as trackers by themselves; a player can also add their own custom
  tracker for anything (torches carried, arrows, rations, favours owed), choosing its name, its
  maximum, how it looks (boxes to tick, a number, a bar) and whether a rest refills it.
- **Inspiration and other awards (Jeff, October 21, 2026).** Many games let the DM reward good
  role-play with a point the player spends later: Inspiration in D&D (only one at a time, spent
  for advantage), Hero Points, Bennies, Fate points. This belongs in the **game system**, as a
  resource in the Rules tab: its name, its maximum (1 for Inspiration), that it starts empty, that
  it comes back only when the DM awards it, and what spending it does, in the system's own words.
  Version 1 can already make most of this; version 2 adds "the DM awards it" as a way a resource
  comes back. If the system has one, it appears on every character sheet as a tracker by itself,
  and the DM's table gets an Award button (one click gives Randy Inspiration; the chat says so).
  The d20 starter should include Heroic Inspiration.
- **Empty means it doesn't print (rule, Jeff, October 21, 2026).** The character sheet is laid out
  as if everything is filled in, and anything left empty disappears: no "Hair:" with a blank after
  it, the line just isn't there, so the sheet is sparser but never shows empty labels. The only
  exception is **player name and character name**, which always print (with a blank line to write
  on). Things the game needs, such as ability scores, are asked for; if one is left empty it is
  flagged, never blocked (Promise 4).
- **Level-ups reuse the same screens**, showing what the class gains at the new level.
- **Bringing in an existing character (Jeff, October 21, 2026).** The Method drop-down always has
  **Enter my own**: click a box and type the score, no rolling. With it, the builder can start at
  any level ("my 3rd level fighter"): it shows the class features up to that level and the choices
  made along the way, and hit points, gold and gear can be typed in. Later idea: the AI reads a
  photo or PDF of an old paper sheet and fills the builder in, for the player to check.

### Maps (started October 21, 2026)

A map is part of the world being designed, like a monster or a lore page. The virtual tabletop
(tokens, fog of war, lighting) is not part of this; Jeff isn't ready for a VTT yet.

**Jeff's answers:** all three kinds matter from the start (world and region, town and city,
dungeon and battle maps); bring in pictures **and** draw, together, in the first version;
printing at real size for miniatures is not needed (maps print in the booklet and on screen).

**Building order (proposed):**
1. A map is a picture (imported, or drawn in the app, or both: draw on top of a picture) with
   **pins** that link to places, lore pages, NPCs and encounters.
2. **Grid and scale:** square or hex, "1 square = 5 feet", "1 hex = 6 miles", and a ruler.
3. **A first, small set of drawing tools** (to be decided next), on a few fixed layers: the
   picture, the drawing, labels, and DM-only notes.
4. **Maps and encounters connect:** room pins are encounters in the tree, both ways; the booklet
   prints the map with its numbered rooms.
5. More drawing tools over time. Fog, tokens and lighting only if a tabletop is ever built.

**Decided with Jeff (October 21, 2026):**
- A map starts from a picture (JPEG, PNG and the like) brought in, which can be resized, with zoom
  in and out and dragging to move around.
- **Drag from the Codex onto the map** to place things, exactly as on a sheet: locations, lore
  pages, NPCs, monsters (a lair, a patrol), items (the buried treasure) and encounters. Each
  becomes a pin; clicking it opens that thing, and its page shows "On the map: Greyhollow town".
- **Pins can link to anything (Jeff, October 21, 2026)**, like wiki links: a lore note, another map,
  a character, a greatsword, an encounter, a rule. Click a pin to open what it links to;
  double-click it to change its name and its colour (six colours). A pin is drawn as a coloured
  marker with a small symbol for what it links to (a house, a dragon, a sword, a scroll, a map).
  Pins start **black** with the symbol for their kind; each pin's colour and symbol can be changed
  (make every pin a star if you like). Select several with Shift or Ctrl to change them together.
- **Copying, the Blender way (decided by Jeff, October 21, 2026), the same everywhere in the app:**
  **Ctrl+D is a connected copy** (an item or monster becomes a variant that keeps following the
  original; a pin keeps the same look and the same link). **Ctrl+Shift+D is a separate copy** (an
  item or monster becomes your own copy; a pin keeps the look but has no link, a map symbol just
  for looks). Any pin can be relinked by dropping something from the Codex onto it.
- **Maps inside maps:** a pin can open another map (world → region → town → building → room
  encounter), shown in the same File Explorer style tree, with a breadcrumb at the top to go back
  up ("Greyhollow region > Greyhollow town > The Mill").
- **The first drawing tools:** Room (drag a rectangle on the grid: floor and walls), Wall and line
  (walls, rivers, roads, borders), Freehand brush (coastlines, forests), Fill (colour or texture:
  grass, water, stone, wood), Stamps (doors, stairs, trees, tables, buildings, mountains; more
  from content packs later), Text labels, and Eraser. Everything undoes.
- **Showing a map live (Jeff, October 21, 2026).** "Show to players" (with the usual ticks) puts the
  map on players' screens, and it updates live. On top of it the DM has **table marks**, drawn on
  their own layer so they never touch the map itself:
  - a **pointer** (a pulse where you click: "the goblins are right here"),
  - a **highlighter** (a see-through marker, such as a green circle round the goblins),
  - **notes** (a short label stuck on the map).
  Marks are temporary by default and fade or clear with one button, or the DM ticks **Keep** and
  they are saved for the next session (with the module's play, never changing the world's map).
  Double-click any mark to select it and press Delete to erase it. Players can be allowed to use
  the pointer too (a permission).
  - **The marker (Jeff, October 21, 2026):** a pen with a thickness slider (from a thin pencil line
    to a fat marker), an opacity slider (100% solid, 50%, barely there), and five or six colours,
    black included. The highlighter is the same pen set see-through.
  - Later versions: stamps for marks (stars, arrows, little pictures). Not now.
- **Saving:** maps save themselves like everything else (no Save button, Part 2); a named snapshot
  marks a save point ("the town before the fire").
- **Export a map (Jeff, October 21, 2026):** to PDF (to keep or print, fitted to the page size
  chosen) or a picture (PNG). Ticks for what goes on it: the grid, pins, labels, kept table marks,
  and DM-only notes (off by default, so a player copy never gives away secrets).

### DM in a Pocket on a phone (Jeff, October 21, 2026; a later version)

The original dream: DM in a Pocket on an Android phone, taken camping, into the woods or to a
friend's house, with your worlds inside it, running with no computer and no internet (only the AI
needs internet). This will be done after version 2.

**Why it's possible:** the app is built with web technology (HTML, CSS, TypeScript), the same kind
that runs inside Android apps through a wrapper such as Capacitor. The engine (nodes, layers,
undo, flags, the rulebook) is plain TypeScript with no Windows or Electron in it. The world file
format is the same everywhere, so a world made on the PC opens on the phone and back again
(through a shared folder like Dropbox or OneDrive, or by sending the file).

**What has to change for the phone:**
- The few places that touch files (saving, the picture store, backups, the lock file, ids) go
  through one small "storage" layer, with a computer version and a phone version.
- A phone layout: one column at a time, with the Codex as its own tab (as the feel-pass mockup
  already did on narrow screens); everything big enough for a finger.
- Every hover and keyboard action needs a tap version: long-press instead of hover, a Copy menu
  instead of Ctrl+D, drag by holding.
- The Claude key goes in the phone's own protected storage (Android Keystore).
- Publishing on Google Play.

**It may not do everything.** The phone version might only cover what version 1 does (building and
reading a world, rolling, Table mode) while the PC grows on; that's still DM in a Pocket, in a
pocket, which is where the name came from.

**The name (open question).** "DM in a Pocket" is instantly understood, but "DM" is the D&D word;
"GM in a Pocket" fits every system; "World in a Pocket" is broader but less clear. Check for
trademarks and existing apps before publishing (a quick search on October 21, 2026 found no
"DM in a Pocket" app, but similar ones such as Pocket GM and Pocket Campaigns).

**A nice bonus:** at a campsite with no internet, the phone can still host a session on its own
Wi-Fi hotspot, and players join with their PINs.

**Phone-ready from now on (proposed rule):** keep the engine free of anything Windows-only, keep file
access behind one storage layer, and give every hover or shortcut a tap alternative, so the
Android version is a new shell, not a rewrite.

### Roll tables (Jeff, October 21, 2026)

Version 1 already has roll tables (Lore tab): a die (d6, 2d6, d100...), rows with ranges (1-3, 4-5,
6), text, and a result that can link to anything in the Codex. Version 2 makes them a big part of
the game:

- **Made in the system (or a world or module, like everything else)** from what's in the Codex;
  they flow down into every world and module, which can change their own copy.
- **A Roll tables section in the Codex:** pin, star, change, share, copy, and **drag straight into
  modules and encounters** ("Wandering monsters" inside 2. The cave).
- **Rolled live in the dice tray:** the result goes to the chat, with the usual who-sees-it choice.
- **Results can do things:** a monster result offers "Add to initiative" (with How many?), an item
  result offers "Give to..." a character, any result can be shown to players.
- **A row can roll on another table** ("roll on Treasure"), so tables chain.
- **Make a table from the Codex in one go:** pick a section and a filter (every challenge 1/4
  monster, every potion) and the rows fill themselves, evenly spread over the die; adjust after.
- **Only once (Jeff, October 21, 2026):** a tick on a row; once rolled it's crossed out until the DM
  resets the table (a unique treasure, a one-time event).
- **How common (Jeff, October 21, 2026):** each row is Common, Uncommon or Rare (or a number), and
  the app works out the ranges on the die. Typing ranges by hand still works.

### Timers and the in-world clock (Jeff, October 21, 2026)

- **Kinds of timer:** rounds ("the ritual finishes in 3 rounds", ticks with initiative); world time
  ("the torch burns for 1 hour", ticks with the clock); repeating ("every 10 minutes underground,
  roll Wandering Monsters", which rolls the table when it fires); and **real time** (a countdown on
  everyone's screen for a puzzle or a collapsing bridge, with a sound at the end; the DM can pause
  it).
- **The in-world clock:** date and time in the world, day or night, with advance buttons (+1 round,
  +10 minutes, +1 hour, Short rest, Long rest, a day of travel). Moving the clock moves everything
  tied to it: torches burn down, conditions run out, resources come back on rests, repeating
  timers fire.
- **Lighting a torch** (a tracker on the sheet) starts its timer by itself, which matters in games
  like The Ashen Vigil where light is life.
- **A simple custom calendar (Jeff):** name the months and weekdays, set how many days each has, add
  holidays. Defaults to a plain numbered calendar. Made in the system or world like anything else.
- **Moons, seasons and weather (Jeff):** one or more moons with their own cycles (werewolves care);
  seasons that change with the calendar; weather rolled each day from a weather roll table that
  depends on the season.
- Who sees which timers and the clock is the DM's choice.

### Conditions at a glance (Jeff, October 21, 2026)

Like coloured rings under miniatures on a real table: anyone can see at a glance who is stunned,
poisoned, paralysed, frozen or mind-controlled.

- **Each condition has a look**, set in the Rules tab with the condition itself: a colour and a
  small symbol (green drop for Poisoned, ice-blue snowflake for Frozen, purple swirl for Charmed).
  The starters come with looks for their conditions; a homemade condition picks its own.
- **Badges everywhere the character appears:** a coloured ring or badge on their initiative card,
  their character sheet, their portrait, and later their pin on a map, each with what's left
  ("2 rounds", "3 doses").
- **Durations:** rounds, minutes or hours of world time (so the clock counts them down), "until
  they save" (at the end of each turn the save macro pops up for that character, and a success
  removes it), or "until removed".
- **Counters:** a condition can have a number, such as a poison counter of 3 or Exhaustion 2; click
  plus or minus on the badge.
- **Putting one on:** drag a condition from the Codex onto a card or portrait, or click the card's +
  and pick it. Shift and Ctrl select several characters to give them all the same condition at
  once (the dragon's fear hits the whole party).
- **Hover a badge** to read the condition's rule and where it came from ("Paralysed by the ghoul,
  2 rounds left"). It drops off by itself when it runs out, with a note in the chat.
- Whether players can put conditions on their own characters (marking themselves Hidden) is the
  DM's choice, a column in the permissions grid.

### The first-time experience (Jeff, October 21, 2026)

- **A welcome screen:** "Welcome to DM in a Pocket: build any tabletop game, then run it." No
  account. Three big buttons: **Show me around**, **I know what I'm doing** (straight to the home
  screen, New system glowing), **Open the sample**.
- **A sample to explore (Jeff: a small fantasy valley):** a sample system (the d20 starter), a
  sample world (a valley with a town, a mill and a cave) and a short sample module: three or four
  encounters, an NPC or two, a map with pins, a roll table and a journal handout. Written for the
  app. Deleting it is one click; Help can bring it back.
- **Helpers (Jeff: all four):**
  - a **guided tour** of about six highlighted stops with speech bubbles, skippable, replayable from
    Help;
  - a **first steps checklist** in a corner that ticks itself off (make your first monster, copy a
    starter weapon and change it, roll on a table, print a page) and disappears when done or
    closed;
  - **tips on first use**: one small tip the first time each tool opens, with a Don't show tips
    switch;
  - **short how-to videos**, linked from Help and the tips (to be made later).
- **The first system, the user's choice, explained (Jeff):** two big cards, "Start from a ready game
  (d20)" and "Build my own with Quick start", each with one line on who it suits.

### The sheet designer (Jeff, October 21, 2026)

Kept deliberately simple: groups you drag around, not a full page designer.

- **A sheet is made of groups**, sorted behind the scenes: Name (character and player), Portrait,
  Abilities, Saving throws, Skills, Combat (hit points, armour, speed), Attacks, Spells, Inventory,
  Trackers, Features, Appearance, Notes. Each thing on a character belongs to one group, so related
  things always stay together. A system's own additions (Scars, Sanity) join a group or make one.
- **A default layout is made for you** from what the system has.
- **Drag a group to move it** (inventory at the top if you like) and drag its edge to make it wider
  or narrower. Text reflows to fit, like a web page, down to a sensible minimum width; the other
  groups slide out of the way.
- **Empty groups and lines disappear** (the empty-fields rule); character and player name always
  show.
- **What prints: a collapsible panel on the right (Jeff, October 21, 2026).** By default
  everything prints. The panel lists every group with its lines under it, each with a tick, plus
  **Check all** and **Uncheck all**. Unticked lines become **blank to write in** (the label and an
  empty box for pencil: spells, hit points, armour class...), with a small switch to **hide it
  completely** instead. It only changes the paper; everything stays with the character. A
  deliberate untick beats every other rule, so even the name can be left off. Things players often
  want in pencil are easy to find at the top of the panel: current and temporary hit points, armour
  class, spell slots used, spells, gold and coins, experience, ammunition and torches,
  conditions, Inspiration and the inventory list.
- **Save the layout, then print or export it** (PDF), over as many pages as it needs.
- **The same layout on screen (Jeff, October 21, 2026).** A player looking at their character sees
  this layout: the default one until they rearrange it, then their own. Screen and paper always
  match. (The print ticks only affect paper; on screen every value still shows.)
- **Sheet layouts live in the Codex (Jeff, October 21, 2026)**, in a Sheet layouts section, so a
  saved layout is shared, copied, starred and pinned like anything else, and can be used by other
  characters, worlds and systems.
- **Suggested by Claude:** the system's designer saves the default layout for everyone; a player can
  adjust the layout of their own sheet, which stays theirs (the usual pencil mark and "Use the
  system's" to go back).

### The book designer (Jeff, October 21, 2026)

Kept simple in version 2: **one layout**. Several layouts, fonts, graphics, borders and dividers to
drag in and resize come in a later version.

- **Books are picked from the Codex.** Presets as today (Player's guide, Monster book, Adventure
  booklet...): a monster manual picks the core rules for running monsters and the monster list.
- **Choose exactly what goes in:** a tick list like the journal's, with **Select all** and
  **Unselect all**, by section, category or single thing. A book of only Giants: unselect all
  monsters, tick the giants, and it's a monster manual of the giants in your world. A search box
  and the Codex filters help pick.
- **Front pages built from blocks** (like a journal page): a cover page, a credits or copyright
  page (the SRD credit line is still added automatically when needed), a foreword. Each has a
  **priority** that sets its place: the cover is 1, credits 2, and so on.
- **An index and contents are made automatically**; a tick decides whether they print.
- Book selections and front pages can be saved to the Codex and reused, like anything else.

### Navigation and flow pass (Jeff, October 25, 2026) — stage 1 built, the rest is still a draft

Jeff likes version 2 as it is. Before versions 4 and 5, this pass makes the program feel less clunky to move around in. It adds no new game features. **This is a draft for Jeff to mark up; nothing below is built until he approves it.** Anything that changes how the app looks or works stops and asks him first (CLAUDE.md, Part 9).

### 1. The first minutes (Jeff's answers, October 25)

- **After naming a system or world made from a ready-made start** (d20 and the others), the six Quick start questions do NOT appear. Instead a **"Where do you want to start?"** screen offers three big choices: **Look at the rules**, **Make a monster or item**, **Start a world**. The six questions appear only when the person chose to start from scratch, and are then framed as "Build the basics for me".
- **A short "What next?" card** sits in the empty middle of the Rules tab, and of the empty Beings, Items, Lore, Maps and Journal tabs. It goes away once the person has done something there.
- **The First steps checklist is tied to the real screens:** clicking a step takes the person to the right place and points at the button.
- **Traced (October 25):** the code only shows the six questions automatically after the "Bare bones (empty)" start, never after "Generic d20" or the other ready-made starts. Two likely causes of what Jeff saw: Bare bones was picked (it is the last item in the Starting point list), or he opened them from the **"Quick start…" button on the Rules tab's empty screen, which shows on every system, even one already full of d20 rules.** Fix: show that button only when a system has almost no rules, and replace it with the "What next?" card otherwise.

### 2. Bricks that look like bricks

- Every Codex entry (Strength, Ray of Frost, Greatsword) is drawn as its own **box with a slight shadow**, like a block sitting on a shelf, instead of a line in a list.
- One colour per kind (rules, beings, items, lore) so the kind shows at a glance.
- Jeff to see a picture of a few versions before the real screens change.

### 3. Open bricks are windows

- Opening a brick from the Codex opens it as a **window** that can be **moved, resized, and brought to the front** by clicking it. Several can be open and visible side by side (for example five at once, flipping between them to compare).
- Each window has **minimise and close buttons in its top-right corner**, always visible; the keys are a shortcut and never required.
- **Minimise** tucks the window into a **tray along the bottom**, like minimised windows in a browser. **Close** closes it. Edits already save within a second or two, so neither can lose work.
- **No hard cap.** A polite warning appears around 20 open or tucked windows; the real limit is what fits on the screen.
- An **Arrange** button tidies the open windows into a grid or a cascade, and **Tuck all away** clears a crowded screen.
- A window remembers its position and size the next time that brick opens.
- Same mechanism as the floating panels of version 3.
- **Decided (Jeff, October 25):** the middle area stays as the main thing being built (the goblin); bricks from the Codex open as floating windows over it. A window has a **"Pin to middle"** button for when that brick becomes the main work.
- **Decided:** in the Codex, **single-click selects, double-click opens** (like files on a desktop), Enter also opens the selected brick, and Shift-click or Ctrl-click picks several. Hovering shows "Double-click to open, drag to add". Inside a sheet's own sections, a single click on an attached card still opens it for editing, since nothing there is dragged.

### 4. Back and forward (never an undo)

- **Back and Forward buttons** next to Undo and Redo, clearly different from them. They move only the view (screen, tab, open thing), never the work.
- A trail of where the person has been: goblin sheet, then the "What do you want to make?" screen, then wherever before that.
- **Familiar shortcuts:** Alt+Left and Alt+Right, and the mouse side buttons.
- A **"Make another" button** on a freshly made sheet, and a **"Back to Beings" link** at the top of every sheet.
- **Decided (Jeff, October 25):** the trail remembers tabs as well as sheets, keeps up to about 50 steps, and resets when leaving a world. Windows and the tray are not part of the trail. The Recent list is what carries across worlds.

### 5. Left-hand hotkeys (proposed; Jeff has not changed any)

| Key | Does |
|---|---|
| Q | Tuck the open window away to the tray (soft close) |
| W | Close it for good (hard close) |
| E | Bring back the last one closed for good (like Ctrl+Shift+T) |
| A | Back |
| S | Forward |
| Z / X | Previous / next window in the tray |

- **While the cursor is in any text box, the letters just type** and the shortcuts are off (Jeff's rule). Esc or a click outside returns to shortcuts. A faint hint says "Press Esc for shortcuts".
- Press **?** for a cheat sheet. Hover tips show each button's key. A Settings checkbox turns the letter shortcuts off, and keys can be changed later.
- None clash with Ctrl+Z, Ctrl+Y, Ctrl+C, Ctrl+V or Ctrl+X.

### 6. The Codex follows the work, but never limits it

- Built October 25: clicking into a sheet section opens the matching Codex list (Settings checkbox turns it off).
- **To add:** that list is only a suggestion. A "Suggested" tab comes first, with an always-visible strip of all sections beside it, and anything can still be dragged onto any section of a sheet. Dynamic filtering in the Codex so what you need is a click away.

### 7. Journal pages: blocks must be easy to move and resize

- Today moving and resizing exist but are hidden: a 20-pixel handle at the top-left and a 12-pixel square at the bottom-right, only on hover, and photos ignore the mouse.
- **Change:** clicking a block selects it, with a clear outline and handles on all four corners and four sides that stay visible while selected. A photo can be dragged anywhere on it. A text block has a visible handle bar along the top. Arrow keys nudge a selected block, Delete sends it to the recycle bin, clicking empty page deselects.
- **The pointer changes shape:** a diagonal arrow on a corner, a left-right or up-down arrow on a side, a four-way cross on a movable body (a grabbing hand while dragging), and back to normal the moment the mouse leaves. Edge and corner targets are larger than the visible handles. The same applies to window edges.
- A photo arrives where it is dropped.

### 8. Other ideas Jeff approved

- **Breadcrumb line** at the top ("Greyhollow › Beings › Goblin"), every part clickable.
- **Recent list** (last 10 things opened) on the Home screen and in search.
- **Reopen where you left off:** the tab, the sheet and the tucked windows.
- **Plain-word names on buttons** where the app uses insider words, with a short "what's this?" hover.
- **Command palette (Ctrl+K):** type "new monster", "open Strength" or "print" and press Enter.
- **Right-click menus on every brick:** Open, Open beside, Duplicate, Make a variant, Add to current sheet, Delete.
- **Multi-select in the Codex** (Shift-click and Ctrl-click) with one bar of actions.
- **Drag target glow:** the matching sheet section lights up while a brick is dragged over it.
- **Calm, consistent confirmations** with Undo, and a "Show me" button after bulk or AI changes that highlights everything touched.
- **A quiet "Saved just now" line** in the footer beside the logo glow.
- **Bigger click targets and clearer focus outlines.**
- **Confirm only what cannot be undone;** everything else just happens with an Undo.
- **A "Why is this greyed out?" hover** on every disabled button.

### Stage 1 built (October 25) — for Jeff to test

Back and Forward buttons (and Alt+Left, Alt+Right, mouse side buttons); the breadcrumb line with a "Start something new" button on Beings and Items sheets; the Recent list (in the search box when it is empty, and a "Pick up where you left off" row on the Home screen); each world and system reopens on the tab and sheet it was left on; the "Where do you want to start?" screen on Rules and "What next?" on Lore; "Quick start" renamed "Build the basics for me…" and shown only on a system with five rules or fewer. **Built October 26 (branch claude/nav-windows):** brick boxes in the Codex (shadow plus a colour stripe: gold items, green beings, blue rules, purple lore), brick windows with Tuck away / Close / "Open in middle", move and resize, the tray with Arrange and "Tuck all away", single-click picks and double-click or Enter opens a window, and the hotkeys Q (tuck), W (close), E (bring back), Z and X (step through windows), with A and S for Back and Forward. **Also built October 26:** journal blocks (click to select, a top bar to move, a handle on every corner and side, a picture moves by its body, arrow keys nudge, Delete removes, Esc leaves the text, a dropped picture file lands where it is dropped), pointer shapes on journal blocks and on all edges of brick windows, the command palette (Ctrl+K), right-click menus on anything that stands for a brick, the Codex multi-select bar, the drag-target glow, a "Saved just now" line beside the logo, clearer focus outlines and bigger click targets, a "Greyed out" hover on disabled buttons, suggested Codex lists marked with a star and put first, and windows remembered per world (tucked ones stay tucked). **Not built:** the "Show me" button after bulk or AI changes, and the "one more item" Jeff still has to give.

### Suggested order to build (Jeff to approve)

1. Back and forward, breadcrumb, Recent, reopen where you left off.
2. Brick boxes, then brick windows with the tray and the hotkeys.
3. "Where do you want to start?" and the "What next?" cards.
4. Journal block handles and pointer shapes.
5. Command palette, right-click menus, multi-select bar, and the smaller polish items.

Jeff has said there is one more item still to come; it will be added here.

## Open questions for version 2

- Remote play: run a relay for players in other houses (small monthly cost, maybe an optional
  extra), or start with same-network play only?

## Version 3: a more immersive table (Jeff, October 22, 2026)

Version 3 expands what is already there and makes it more enjoyable: a more customizable,
better-looking workspace, more to choose from (more pictures), and one new feature, sound.

### Sound: music, ambience and voice (Jeff, October 22, 2026)

- **The app ships no music and no narration.** It is for any genre, so the user brings their own.
  Only a small starter set of ambient sounds comes with it (rain, wind, fire, tavern crowd, forest,
  cave drips, waves, thunder), and only truly free ones (CC0); any credit needed is added
  automatically, like the SRD's.
- **Bring your own files:** an Add sounds button and drag and drop (MP3, WAV, OGG, M4A). They live in
  a Sounds folder in the main folder, like Foundry's data folder; files dropped there in Windows
  show up in the app. Packs from others go in their own folder. Deleting files is done in Windows,
  the user's choice. No ElevenLabs link for now (maybe later, with the user's own key, like the AI).
- **A sound is a file plus a category: Music, Ambience or Voice.** The category is a behaviour, not
  a label: Voice turns the others down while it plays (ducking), Ambience sits underneath, Music
  ducks nothing. A voice clip filed as Music plays at full volume over everything.
- **Buttons are separate from sounds.** The user makes buttons (a name or a number) like macro
  buttons, each pointing at a sound; several buttons can use one file. Buttons live on the
  **soundboard**, a tool at the DM's table.
- **Floating buttons:** drag a button off the soundboard onto the screen; it floats and can be moved
  anywhere (like the pins from version 2.4), and the soundboard can be minimized. Deleting a
  floating button only takes it off the screen; its home copy stays on the soundboard.
- **Erase all buttons** on the soundboard clears the buttons, never the files, and is undoable with
  Ctrl+Z like everything else.

### Expanded starter system templates (Jeff, October 22, 2026)

Version 1 ships with one starter template: d20 Basic. Version 3 adds a small library so new users
have a familiar starting point for many kinds of game. Each template is a copy the user owns and
changes freely — not a licensed game, just a generic type that feels like a familiar system.

- **d20 Standard** — the existing template; fantasy, skills, classes, saving throws
- **d6 Pool** — roll a handful of d6s and count successes; feels like World of Darkness or Shadowrun
- **Percentile** — roll under a skill percentage; feels like Call of Cthulhu or old Warhammer RPG
- **2d6 Moves** — roll 2d6: 10+ succeed, 7–9 partial success, 6 and under something goes wrong;
  feels like Powered by the Apocalypse
- **d10 Chronicles** — dice pool counting tens; feels like the old Storyteller system
- **Bare bones** — completely empty, no assumptions, for building something entirely from scratch

New templates are added with each version so the library grows steadily. Templates use generic
names only — nothing trademarked.

**Import a friend's system** is already planned in the sharing rules (a system arrives as its own
copy with the maker's name on it). Version 3 makes this prominent on the New System screen so it
is easy to find. A full community library search — finding systems other DM in a Pocket users have
published — needs the online marketplace infrastructure and is planned for version 5–6; the
groundwork (permanent IDs, author names, version numbers) is already in place.

### The map picture library (Jeff, October 22, 2026)

- **A palette panel** beside the map maker: category tabs (Floors, Walls, Doors and windows, Nature,
  Water, Furniture, Buildings, Clutter and props, Effects, Symbols), thumbnails, a search box,
  Favourites and Recently used. Click a picture to pick it up, or drag it onto the map.
- **Pictures behave by kind**, set by their category: stamps (placed objects; mouse wheel turns,
  Shift and the wheel resizes), textures (fill an area with Fill or Room), walls and paths (drawn
  along a line, the picture repeating) and scatter (paint a forest, each tree a little different).
- **Styles:** every picture also has a style (Gothic, Cartoon, anything the user names), usually
  from its pack's folder name and changeable one by one. A style filter at the top of the palette
  shows one style or all; styles can be mixed on one map.
- **Where they live:** an Assets folder in the main folder; folders dropped in become a style and
  their subfolders categories. Packs from others, and Jeff's own library, sit in their own folders,
  like Foundry's modules. A shared world carries only the pictures its maps use, never the library.
- **House rules for packs:** 256 pixels per map square, transparent backgrounds, top-down with the
  same light direction, names like tree_oak_01.png (read to sort and label).
- **The starter set is free (CC0) packs** to begin with; every licence is checked when building
  (likely Kenney.nl and OpenGameArt's CC0 section; Forgotten Adventures can't be bundled). Nothing
  shipped is named after another company ("WoW style" is fine as a user's own label).

### Themes (Jeff, October 22, 2026)

- **Screen only.** Themes change only what appears on screen; print, PDF and rulebook export always
  use black text on white regardless of theme.
- **Five named themes ship with the app:** Default (the neutral dark look already there), Parchment
  (warm off-white light theme, cream and amber, good for daytime), Ink (pure black and white, high
  contrast, no colour), Ember (dark with deep red and rust accents, firelight feel), Steel (dark with
  cool blue-grey accents, calm and modern), Verdant (dark with muted forest green, earthy fantasy).
- **A theme sets five values:** background colour, panel colour, text colour, accent colour (buttons,
  links, highlights) and border colour. Every colour in the app derives from those five.
- **The picker** is a row of coloured circles or swatches in Settings. Click one and it applies
  instantly so the user sees it live before saving. The chosen theme is saved to settings and
  persists between sessions.

### Interface font size (Jeff, October 22, 2026)

- A **Small / Normal / Large** control in Settings scales all text in the app's menus, labels and
  panels at once. One CSS scaling step under the hood; every screen changes together.
- Built for people on small screens or who find small text hard to read. Has no effect on content
  inside nodes or on print output.

### Rich text editor (Jeff, October 22, 2026)

- **Every content text box** in the app — monster descriptions, lore pages, encounter text, journal
  entries — gets a full rich text editor instead of a plain text area.
- **The toolbar** above each text box includes: font family (a curated list of free fonts that ship
  with the app), font size for that paragraph, bold, italic, underline, strikethrough, text colour,
  headings H1 / H2 / H3, bullet lists, numbered lists, and left / centre / right alignment.
- **Flows into the rulebook export** exactly as written. A heading in a lore page becomes a heading
  in the printed book.

### Flexible panel layout (Jeff, October 22, 2026)

- **Drag any divider** between panels to resize. Double-click a divider to snap back to the default
  split. A small arrow button on any panel collapses it to a thin strip; clicking it again expands
  it.
- **Panels can be detached** and floated as their own small windows for second-monitor use (for
  example, the map on one screen and the DM's table on the other).
- **Panels keep their identity** — they move and resize but do not change type. The codex is always
  the codex; the flag panel is always the flag panel.
- **Built-in layout presets** switch the whole arrangement in one click: Builder (big editing area,
  codex on the side, default for making content), Game night (DM's table large, codex shrunk, for
  running a session), Writer (text editor fills the centre, everything else tucked away, for writing
  lore), Dual monitor (wide layout for extra screen space, two panels side by side).
- **Save your own presets** — name and save any arrangement, restore it any time, like named
  snapshots for the layout.

### The expanded picture library (Jeff, October 22, 2026)

The map picture library (above) handles images for the map maker. This section covers the library
for everything else — the picture that appears on a node (a goblin, a sword, a faction, a place).

- **Every node has a picture slot** with two options: Upload (a single file from the computer) and
  Browse library (the full library panel).
- **The library panel** is organised by tag, not fixed categories. Search by name or tag. Filter by
  style. Multiple images per subject — a goblin might have six variants (scrappy, armoured, shaman,
  boss). Supports JPEG, PNG and animated GIF.
- **The map library and the node library share the same folder and browser.** A dragon stamp on the
  map and a dragon picture on the creature node can be the same file, stored once.
- **Version 3 ships a starter set of free CC0 images** — hundreds, possibly thousands — pre-tagged
  and ready to use. Primary sources: OpenGameArt.org (RPG tokens, portraits, tilesets, CC0 and
  CC-BY), Kenney.nl (icons, sprites, top-down art, entirely CC0), Game-icons.net (4,000+ game icons,
  CC0), and Itch.io's free section. CC-BY content adds a credit line automatically in the app's
  about screen. Any required attribution is automatic, like the SRD's.
- **AI-assisted tagging** is used once at build time to tag the starter library; the user reviews
  and approves in batches.

### Auto-picture on node creation (Jeff, October 22, 2026)

- **Every node kind and category has a default image** mapped to it by tag. Create a sword and it
  gets the sword icon. Create a goblin and it gets the goblin token. Create a faction and it gets a
  banner symbol. This happens silently; the user never has to think about it.
- **A dropdown beside the picture** shows alternatives — only images whose tags match that node's
  category. Axes show axes; potions show potions; goblins show goblins. At the bottom of the
  dropdown are Upload your own and Browse full library for anything the automatic suggestions miss.
- **A setting in Settings: Add pictures automatically** (on by default). Turning it off means new
  nodes are created with no picture and the user fills them in at their own pace. Good for people
  who want full control or who are building a game where the fantasy defaults look wrong.

### Tag system for pictures (Jeff, October 22, 2026)

- **Every picture has one or more tags.** Tags are single words, always stored in lowercase
  (the app converts automatically so `Sword`, `SWORD` and `sword` are the same tag).
- **The import dialog** has a Name field, a Main tag field (one word, used first for auto-picture
  matching) and an Add tag button that adds as many extra single-word tag lines as the user wants.
  A small × on each line removes it. Five or more tags on one image is fine.
- **Each tag line has a dropdown** showing the most commonly used tags in the library, sorted by
  frequency. Typing narrows the list to matches (autocomplete). Suggestions are context-aware: if
  the main tag is `sword`, the second-line dropdown nudges toward `melee`, `weapon`, `blade`,
  `fantasy` first. The user can always type a brand-new word not in the list.
- **Users create new tags freely.** A new word typed into any tag line becomes a live tag the moment
  the image is saved. It appears in the filter panel and in dropdown suggestions for future imports,
  alongside all built-in tags, with no setup required.
- **The filter panel in the library browser** lists every tag alphabetically — built-in and
  user-created together. Click one to filter; click several to narrow further.
- **Autocomplete prevents near-duplicates.** Typing `wea` suggests the existing `weapon` tag before
  the user finishes typing, so `weapons` and `weapon` do not end up as separate tags by accident.

### Global search (Jeff, October 22, 2026)

- **One search box** at the top of the app finds anything across the whole world at once: node
  names, lore text, encounter descriptions, journal entries, everything.
- Results grouped by kind (Beings, Items, Lore, Encounters…). Clicking a result opens that node.
- Useful when a DM remembers writing something about a character weeks ago but cannot find where.

### Condition tracker (Jeff, October 22, 2026)

- **A row of condition icons** beside each creature in the initiative order during combat. The DM
  clicks an icon to apply a condition; clicks again to remove it.
- Conditions come from the system's own condition nodes (Poisoned, Stunned, Frightened,
  Concentrating, and any the user has made).
- **Players see conditions on their screen** as the condition name in plain words beside the
  creature's health.

### Session timer (Jeff, October 22, 2026)

- A **quiet clock on the DM's table** showing how long the current session has been running.
- Starts when Begin session is clicked, stops when the session ends. Can be paused and resumed.
- Easy to ignore if not needed; tucked in a corner next to the other table tools.

### Dice roller on the player's phone (Jeff, October 22, 2026)

- The **player screen** gets a dice roller: a row of die buttons (d4, d6, d8, d10, d12, d20, d100)
  and a modifier field.
- **Every roll appears in the shared chat log** on the DM's screen and on all other connected
  players' screens, with the roller's name, the formula and the result.
- Supports the same blind, whisper and public roll modes as the DM's table.
- Players do not need a separate dice app; everything stays in one place.

### World changelog (Jeff, October 22, 2026)

- A **plain-language summary** of recent changes to a world, auto-generated from its history.
  "Added 3 goblins. Changed sword damage from d6 to d8. Wrote the mill encounter."
- Shown at the top of the world on opening, collapsed after the first glance. Can be dismissed.
- Useful after a break of days or weeks when the DM cannot remember where they left off.

### Random generator button (Jeff, October 22, 2026)

- A **Generate button** on the DM's table, connected to the world's existing roll tables.
- The DM picks which tables to roll (NPC names, weather, random encounters, treasure), clicks
  Generate, and the results print into the session log instantly.
- No internet needed, no AI needed — pure dice logic using tables the DM already wrote.
- A quick Generate all option rolls every table ticked in a single click.

## Version 4: a world-aware AI partner (Jeff, October 22, 2026)

Version 4 makes the AI genuinely understand the world it is working in. Instead of a chat box that
knows general fantasy, it reads your actual world first — your races, factions, locations, tone and
rules — and creates things that fit what you have already built, not a generic template.

Everything in version 4 is switched on or off. None of it requires an API key to use the rest of
the app.

### World context document (Jeff, October 22, 2026)

- Before any generation job the app builds a short **world context summary** — your races, factions,
  major places, tone, any rules flagged as important — and sends it to the AI as context.
- This is never the whole world file, only the relevant pieces for that job, keeping it fast and
  cheap.
- The summary is readable by the user (shown in the AI panel as "What the AI knows about your
  world") and can be edited or added to by hand.
- The AI keeps this context across a session so it does not have to relearn the world on every
  prompt.

### The governing rule (Jeff, October 22, 2026)

**If you can build it by hand, the AI can build it for you.**

Every creation point in the app — monsters, items, races, locations, factions, lore pages,
encounters, rules, backgrounds, histories, roll tables, journal entries, all of it — has an AI
prompt option sitting beside the manual one. If the app lets you create it, the AI can draft it.
This future-proofs the design: when later versions add new node types, the AI prompt comes with
them automatically.

Two things never change regardless of which creation point is used:
1. Everything goes through preview and accept — the AI never creates anything silently.
2. All AI features are optional — no API key means no AI features, but everything else works
   exactly as normal.

### World-aware content generation (Jeff, October 22, 2026)

- From any node or from a prompt box the user can ask the AI to **create something new** that fits
  the world. Opening a location and typing "help me create a place in the northern part of my world
  influenced by the Vethkari" produces a result built from what the AI knows about the Vethkari,
  the north, and the tone of the world — not a generic answer.
- **Variants are world-aware too.** Typing "make a variant of the Folic tribe that is more aquatic"
  produces a new race already set as a child of the Folic tribe, with the right fields inherited
  and only the aquatic differences changed — because the AI knows the Folic tribe's stats, culture
  and the world's rules before it starts.
- The AI always generates **two or three versions** of anything creative so the user can pick,
  combine, or use one as a starting point. Each version has a short label describing its feel
  ("more militaristic", "ruined and forgotten", "active trade post"). The number of versions
  returned is set in Settings — default two, up to six.
- A **Create more** button generates fresh alternatives without losing the ones already shown.
- Accepting a version creates the node through the normal preview-and-accept flow, so it goes
  through undo and history exactly like a user-made change.
- The AI never creates anything silently; every result is a suggestion until the user accepts it.

### Voice input (Jeff, October 22, 2026)

- Any AI prompt box can accept **voice instead of typing.** Press and hold a microphone button,
  speak the prompt, release — the app transcribes it and treats it exactly like a typed prompt.
- The app never listens on its own; it only records while the button is held, so table chatter and
  background noise are never picked up accidentally.
- Voice uses the same API key as text, running the audio through a transcription step first and
  then passing the text to the AI as normal. The same preview-and-accept flow applies.
- Good for when hands are busy at the table or the user thinks faster out loud than by typing.

### AI picture generation (Jeff, October 22, 2026)

- Every node's picture slot has a **Generate picture** button beside Upload and Browse library.
  Clicking it opens a small prompt box — the user types a few words ("hunched goblin shaman, bone
  staff, swamp") and hits Generate.
- The AI uses the world context it already has plus those words to generate the image. The number
  of images returned is set in Settings — default one, up to six. Each result shows as a small
  card with an Accept button.
- A **Refine** prompt box lets the user add more words ("darker, more ragged") and generates a
  fresh batch without losing the ones already showing.
- Accepted images go into the node's picture slot and also into the picture library automatically,
  tagged with the words the user typed, so the library grows over time without extra work.
- **Image generation needs a separate API key** from a dedicated image service (such as OpenAI's
  image API), because Claude does not generate images. The user brings their own key, stored the
  same way as the Claude key. If no image key is set, the Generate picture button does not appear.
  This is an optional extra on top of the optional AI; the rest of the app is unaffected.

### Version 4 stress test: build a whole system from one prompt (Jeff, October 22, 2026)

The hardest thing version 4 should be able to handle: a user creates a blank world and types one
prompt — "Create me a world based on Lord of the Rings. D6 system, no d20. Four stats. Sound
epic." — and hits go.

**What the AI does, section by section:**
1. The system: four stats with epic LoTR-flavoured names, d6 dice rules, a core check mechanic,
   difficulty levels.
2. Races: Men, Elves, Dwarves, Hobbits, Orcs. Each with stats filled in and a description in an
   epic tone.
3. Monsters: a starter set — orcs, trolls, wraiths, wargs, spiders, a cave drake. Stat blocks
   built from the d6 system just made.
4. Items: weapons, armour and a magic item template that fit the world.
5. One or two starter locations matching the tone.

Each section is previewed and accepted before the next generates. The user ticks what they want,
changes what they do not, and moves on. Nothing is created silently.

**What it will not do perfectly on the first pass:** stat balance needs playtesting, monster
difficulty is an estimate, some names may need adjusting. The AI gets 80% of the way there in two
minutes; the user refines the rest. That is the right division of labour.

This stress test sets the bar for what version 4's AI must be capable of at its most ambitious.
Simpler prompts ("add ten monsters to my existing world") are easier; this is the hardest case.

## Version 6: the marketplace (Jeff, October 22, 2026)

Version 6 adds the online layer — a community and marketplace built on top of everything already
working. The app itself never requires it; it is an optional extra for people who want to share and
discover.

- **Community gallery on the home screen.** A simple feed of worlds and systems other users have
  shared publicly. Free to browse and download. Opening a shared world or system imports it exactly
  like a file share, with the maker's name attached.
- **The marketplace.** Creators can publish systems, worlds, modules, picture packs and sound packs
  for free or for a price they set. DM in a Pocket takes a small cut of paid sales. Everything sold
  carries a permanent licence so buyers keep it forever even if the seller removes it.
- **Search and discovery.** Filter by genre, system type, price, rating and style. A featured
  section highlights quality content. Community ratings are simple — thumbs up, no review text in
  version 1 of the marketplace to keep it clean.
- **Creator accounts are optional.** Browsing and downloading is free with no account. Uploading
  to share freely also has no account. Selling requires an account for payment purposes only.
- **Required credits travel automatically.** CC-BY content in a shared pack carries its credit
  line into everything that uses it, the same way SRD content already does.
- **Foundry VTT export (Jeff, October 22, 2026).** One button — with a few clarifying questions from the AI — exports any completed world and system as a clean, installable Foundry VTT package. Building a custom game system in Foundry from scratch requires JavaScript, JSON and weeks of work. DM in a Pocket does it visually, by hand or with AI, and hands the user a package that installs in two clicks. This app is not competing with Foundry; it is feeding it. Foundry users become customers because this solves their hardest problem. The export is a spoke on the hub-and-spokes architecture and can be built without changing anything else.

## Pricing (Jeff, October 22, 2026)

- **Free to download, no time limit.** One world, one system, full functionality, no AI. Everything
  works. The free version is a genuine, useful tool — not a crippled demo.
- **Twenty dollars, one time, unlocks everything.** Unlimited worlds and systems, all versions of
  the app forever, no subscription, no recurring charge, no account needed to use it.
- **AI costs whatever the user's API key costs.** The app never charges for AI separately; the user
  brings their own key and pays their provider directly. Cost estimates in the app keep surprises
  away.
- **Marketplace purchases are separate** and optional. Buying a content pack from another creator
  is a one-time purchase that lives on the user's computer forever.

## Idea parking lot

Good ideas that aren't for version 1 land here with a rough target version, so nothing gets lost and version 1 stays small.

| Idea | Target | Notes |
| --- | --- | --- |
| Virtual tabletop | Version 5–6 | Needs maps, characters and a stable engine first |
| Self-updater (an AI inside the app writes its next version) | Not needed | Claude Code now does this job from outside the app, with tests and git; an app rewriting itself can break itself with no way back |

## How we build it

The vision was never the problem last time; the process was. These rules fix what went wrong.

| Last time | This time |
| --- | --- |
| Code copied and pasted between chat and files | Claude writes the files directly and runs them |
| Decisions made from memory of old chats | Claude reads the real code every session |
| Chats ran out of room; summaries pasted into new chats | The project lives as files: rules file, code, progress log |
| Fix one bug, break six others | Automated tests run after every change |
| "You're 98% done!" | Progress = features whose tests pass, counted honestly |

- **Hard rules first.** A rules file defines the data format, how the tools talk, and what the engine must never do. Claude reads it at the start of every session and does not deviate from it.
- **Smallest working version first.** Build version 1 end to end, test it, then add features on top of something that works.
- **Git saves every version,** so nothing deleted or rewritten is ever lost.
- **Desktop program built with web technology** (Electron or Tauri): a real installable Windows .exe, built with the same kind of code that worked for TETHER.
- **The project lives on the user's computer,** worked on through Claude Code or the desktop app linked to a project folder, so the .exe can be built and run there.
- **The user is the tester.** Claude runs the engine and its tests; the user judges whether it feels fun and flexible.

## Stress test (October 19, 2026)

Ten imagined users walked through the design as it stands. Four reach their goal, five get most of the way, one fails; each run exposed a gap worth deciding.

| User | Goal | Result | Gap found |
| --- | --- | --- | --- |
| Speed runner | A playable alien-planet d100 game in 15 minutes | Partly: presets and "AI: decide the rest" get there, but from scratch opens on an empty Rules tab with no path through it | A skippable Quick start right after New system: the five or six big questions in order |
| Nitpicker | Exact grappling, encumbrance and falling rules | Yes: free-text rule nodes cover edge cases; drop-downs cover the rest | Every node needs a "Used by" list so they can see everywhere a rule matters |
| Demolisher | Turn the d20 template into a d6 dice pool, no Strength, no classes | Partly: removals ripple and flag well, but swapping the core check leaves every "DC 13" and "+5" as numbers that no longer mean anything, and nothing flags them | Changing the core check must flag every number tied to the old check and offer a conversion step (by hand or AI) |
| Total beginner | First homebrew game ever | Partly: the tools work, but words like node, brick, parent and override are jargon | Plain words in the interface, hover explanations with examples, and a small sample world to poke at |
| Converter | Rebuild their own existing rules (such as a Player's Handbook draft) | Yes, slowly by hand; much faster with AI from a prompt | "Create from a document I wrote": AI reads the user's own text and builds the nodes |
| Balancer | Make sure monsters are fair | Partly to yes: yellow math checks compare against the system's own averages, which only works once a system has enough content | Fine for version 1; the playtest simulator later closes the gap |
| Collaborator | Send a world to a friend | Fails: a world is a child of its system, so a world file alone arrives with no rules | A shared world must carry its system with it; Import matches or adds that system |
| Hoarder | Load all SRD content plus 2,000 homemade monsters | Yes: filters, grouped flags and the left panel cope | A search box that finds anything in the world by name or text |
| AI maximalist | "Make me a cyberpunk RPG" in one prompt | Yes, with care: one huge preview list of 800 items is unreviewable and costly | Whole-system generation runs section by section, each previewed and costed before the next |
| Indecisive | Try a big change, then go back days later | Mostly: recycle bin and undo cover single changes, not "the whole system as it was on Tuesday" | Named snapshots: save the system as it is before an experiment, restore it later |

**Decisions these raise:** Quick start; "Used by" lists; core-check conversion; plain-language interface and sample world; create from the user's own document; bundling the system with shared worlds; global search; section-by-section AI generation; named snapshots.

## Real-game test: The Ashen Vigil (October 19, 2026)

Rebuilding The Ashen Vigil from its Player's Handbook draft, version 1 as designed handles the rules and monsters almost completely, the lore as plain pages, and falls short on adventures, styled publishing and the character builder.

| Part of the game | Can version 1 build it? | Notes |
| --- | --- | --- |
| Core roll (1d20 + Attribute vs DC), advantage, natural 20 and 1 | Yes | Roll-over-target check; attributes are the bonus directly |
| The five rolls (Check, Defend, Attack, Casting, Sanity), player-facing defence | Yes | One main check plus rule nodes with their own formulas; monster sheets show Attack DC and Defense |
| Proficiency only when the task fits the class | Partly | A judgment call, so written as a free-text rule |
| Six attributes with point buy and deficits | Partly | Point buy needs a "deficits allowed" setting (take −2 to gain 2 points) |
| Derived values, inventory slots (10 + STR), Overburdened | Yes | Formula blocks, a resource, a threshold condition |
| Four classes with level tables, extra attacks, Sneak Attack dice | Yes | Class level tables with features dragged onto rows |
| "Choose one Technique", then Evolved and Mastered upgrades | Gap | Needs a choice brick (pick one from a list) and upgrade tiers on a feature |
| Limited powers: attribute times per rest, minimum 1 | Partly | Activation uses must accept a formula, not only fixed numbers |
| Sneak Attack when flanked, unaware or below half | Partly | Activation needs several conditions joined by any or all |
| Casting check, burn out vs fizzle, no roll for ally spells out of combat, Seared Spell | Mostly | Roll-to-cast method plus spell categories; the in/out-of-combat exceptions are free text |
| Spells and prayers in categories | Yes | Spell nodes filed by category |
| Weapons, armour (Defense bonus and Damage Reduction), currency, price index | Yes | Item bricks and tables |
| Initiative, surprise, Act and move, Close/Near/Far, 14 conditions, bleeding out | Yes | Theatre-of-mind preset, condition nodes, a resource threshold |
| Sanity, Spire Demons, familiarity, phobias, regaining sanity, daily cap, scarring | Mostly | Resource, thresholds and staged conditions work; the phobia and regaining tables need roll tables |
| Resting, light, air and ash, food and water, travel | Yes | Countdown resources and conditions |
| The Weeping Craft forging system | Partly | Materials and results as items; the step-by-step procedure is free text |
| Races with no mechanical effect | Yes | Ancestry nodes holding only lore |
| History, timeline, found documents, eight factions | Partly | Plain lore pages; factions would benefit from a template (history, structure, territory, allies) |
| Bestiary of 31 creatures | Yes | Creatures tab with system-defined stat blocks |
| Modules One and Two (adventures) | No | The adventure planner is a later spoke |
| Publishing in the handbook's style (two columns, carded stat blocks) | No | Version 1 export is a simple word-processor layout |
| Interactive character builder with PDF sheets | No | The character sheets spoke is later |
| Getting the existing 41 pages in | Slow by hand | "Create from a document I wrote" would make it a review job instead of days of typing |

**New gaps from this test:** choice bricks (pick one from a list); upgrade tiers on features; formulas in activation uses; any/all conditions on activation; point buy with deficits; basic roll tables in version 1 (phobias, treasure, encounters) rather than waiting for the random tables spoke; a faction template for lore.

**Approved for version 1 (October 19, 2026).** All fixes from both tests: Quick start after New system; "Used by" list on every node; core-check change flags tied numbers and offers conversion; plain-language interface, hover explanations and a sample world; create from a document the user wrote; shared worlds carry their system; global search; section-by-section whole-system generation; named snapshots; plus the seven core rule additions in the Rules tab.

## Rulebook export

The rulebook is written automatically from the system and world, and is what users walk away with. Being designed from October 20, 2026.

- **Choose the book.** Export starts by picking a book type: Player's Handbook, Monster Manual, GM Guide, World Guide or Everything. Each comes with a sensible set of chapters ticked, and any chapter can be ticked or unticked.
- **Formats.** PDF and Word (.docx). Word lets people adjust the layout themselves. Files can then be printed or read on a tablet or laptop.
- **Table mode (version 1, after first playable).** For people who would rather run a game from the app than from a printed book: the world opens in a read-only reading view with tabs (Rules, Monsters, Items, Tables), search, side-by-side panels, favourites and rolling on roll tables. Read-only so nothing changes by accident mid-game; an Edit button returns to the normal workspace. Not included: tracking hit points or initiative, maps, tokens or connected players, which belong to the virtual tabletop planned for version 5 or 6.
- **Book pages.** Free-text pages that exist only in a book (a foreword, How to play, a short mood-setting story, a found document) can be added anywhere and dragged into position. Each book type keeps its own pages. Chapters can be reordered by dragging.
- **Book styles (version 1).** A few simple choices: one or two columns, a few font pairings, an accent colour, a cover picture, and stat block styles (plain, boxed, or carded with a border and drop shadow). Node pictures appear in the book, such as a monster's portrait beside its stat block. A chosen look can be saved as a named style and reused for every book in the world. A full drag-and-drop page designer is for a later version; Word export covers total control until then.
- **Variants as differences, by default.** The parent is printed in full and each variant lists only what differs ("Wood Elf: as Elf, plus a climb speed of 35 feet"). A tick box per book switches to full entries, which suit a monster manual used mid-fight.
- **Automatic book parts.** Chapters follow the category tree, sorted alphabetically (or by challenge rating for monsters). Every book gets a table of contents, page numbers and an index. Links turn into page references automatically ("see Poisoned, page 42"), so the book stays cross-referenced without any extra work.

## First playable checkpoint

The first version the user can really use: build a small game system completely by hand, fill it with monsters and items, see the flags work and print a rulebook, with no AI. Everything the AI will later sit on is in it. Agreed October 20, 2026.

**In first playable**

- Home screen, new system and new world, the main folder, constant saving with the pulsing logo, crash recovery and daily backups
- The engine: nodes, bricks, links, parents and children, variants, templates, categories, changes flowing down with the checklist, and Edit parent
- The Rules tab: core check, abilities, resources, skills, conditions and free-text rules
- Sheets and the library: monsters, NPCs, characters, races, classes and items, with drag and drop and Shift or Ctrl selection
- Flags: red flags, the basic free yellow checks, the recycle bin with reconnect, and undo with history
- A simple rulebook export that can be printed or saved as a PDF
- A small d20 starter: the core rules plus a couple of dozen monsters and items

**After first playable, still in version 1**

- All the AI: chat, bulk changes, Check for errors, create from a document, whole-system generation, World Notes
- The full SRD 5.2 content
- Sharing and import, snapshots, Quick start, roll tables, lore templates, and the check categories with sliders
- Table mode and Word export

## Hard rules (first full draft, October 20, 2026)

The rules the program itself must follow, written before any code and read at the start of every build session. Being written part by part, starting October 20, 2026.

**Order of parts:** 1 Promises · 2 Saving and files · 3 Building blocks · 4 Systems and worlds · 5 History · 6 Flags · 7 The AI · 8 Sharing and upgrades · 9 Building rules.

### Part 1: Promises (locked)

1. Your worlds and systems live on your computer and you own them. You never need an account to use the app. An account is only for optional online extras such as a marketplace, and if you leave or cancel, every world and system you own still opens.
2. Everything works by hand. The AI is optional and only adds to what you can already do.
3. Nothing is destroyed without a way back. Deleting sends things to the recycle bin, and every change can be undone.
4. Nothing ever blocks you. A broken rule is flagged, but you can always save and keep working.
5. The AI never changes anything without showing you first; nothing happens until you accept.
6. Inside a system or a world, build in any order. The only fixed order is that a world needs a system.
7. The app never loses your work, even if it crashes or the power goes out.

**Familiarity (design philosophy).** Before inventing a new way to do something, copy what people already know: Shift-click and Ctrl-click to select, a recycle bin like Windows, notifications that work like email, Ctrl+Z to undo, linked values like linked spreadsheet cells. A new user should be able to guess how most things work. If a feature needs explaining, it should probably work more like something familiar.

### Part 2: Saving and files (locked)

- **One file per world**, with its pictures packed inside, so it can be copied, emailed or put on a USB stick with nothing left behind.
- **Saves itself constantly.** Every change is saved within a second or two; there is no Save button. Named snapshots give save points on top ("before I removed Strength").
- **Save indicator.** The app's logo pulses or glows briefly each time it saves, so the user can see at a glance that their work is safe.
- **One main folder**, like a Steam library (default Documents\\DM in a Pocket, changeable in settings), holding Systems and Worlds folders. The home screen shows whatever is in it. Pointing it at OneDrive or Dropbox syncs between computers without an account. Worlds and systems imported from other players go in their own folder inside it (home screen layout for My worlds and Other worlds to be designed later).
- **Automatic backups.** Kept quietly in a Backups folder: one per day for the last 7 days and one per week for the last month, about 11 per world at most; older ones are removed automatically. World settings lists them ("Yesterday, 3 days ago, last week"); restoring one first takes a snapshot of the current state, so a restore can be undone.
- **No history bloat.** Pictures are stored once and shared by every backup and snapshot instead of copied into each. Settings shows how much space history uses, with a Clean up button for old snapshots, and the app suggests a clean-up if snapshots grow large. User-made snapshots are otherwise kept until deleted.
- **Crash recovery.** After a crash or power cut the app reopens where the user was, with everything up to the last second or two saved, and a blue notice: "Recovered after an unexpected close."
- **One copy open at a time.** A world is marked in use while open. Opening it elsewhere (for example a laptop through Dropbox) offers Open read-only or Take over, which closes it on the other computer first, so two copies never save over each other.

### Part 3: Building blocks (locked)

- **Permanent hidden IDs.** Every node has a permanent ID that links point to, so renaming never breaks anything.
- **What every node carries:** ID, name, kind, category, picture, source (template or homemade), favourite, created and last-changed times, parent (if a variant) and its bricks.
- **One text box per node.** No separate secret GM notes: the app makes rulebooks and guides that anyone may read.
- **Bricks** store their type, values, links (by ID) and rulebook wording. An attached copy stores only what was changed on that sheet.
- **Anything attaches to anything.** The app never refuses an attachment; categories and sheets only suggest. Rules are written out, not run, so no combination can break a game.
- **Nesting and variants have no depth limit.** Bricks can nest inside bricks, and a variant can have variants (Elf → Wood Elf → Deep Wood Elf). The one thing the app prevents is a loop, such as A being a variant of B while B is a variant of A, because it has no meaning.
- **Kinds of node (version 1):** rules (abilities, resources, skills, conditions, general rules), bricks, beings (monsters, NPCs, characters, races, classes), items, lore (pages, places, factions) and roll tables. New kinds can be added in later versions without breaking old files. Where something lives is the user's choice: mounts can be filed as items, with hit points and attacks attached, and the system can give that category a stat-block style sheet.
- **Links are one-way and "Used by" is worked out**, never stored, so the two can never disagree. Categories are stored by ID too, so renaming one never breaks what's filed in it.

### Part 4: Systems and worlds (locked)

- **Every world's rules are a child of its system.** Changes made inside a world stay in that world. A world can be copied into a different system.
- **Systems can have variants.** A system can be a variant of another (d20 Basic → My d20 → My d20 Space). Each variant sits on the Systems shelf as its own system with its own worlds, stores only its differences, and receives fixes from its parent unless it changed that part. Deleting a parent system promotes its variants the same way as bricks: each copies in what it inherited, then stands alone.
- **Changes only flow down, never up.** A child can never push its changes into a parent. Every parent knows its children. To share a rule, the user goes to the parent, makes the change there, and a checklist of its children appears (all ticked by default). Unticked children are protected: they keep the old version as their own setting, marked with a pencil. **Copy rule** on any child copies that rule so it can be pasted into the parent, which saves retyping while keeping the change deliberate. This applies to systems, variants, bricks and beings alike.
- **Edit parent without leaving.** Every child node has an Edit parent button (and Alt-click as the shortcut) that opens the parent's version of that same node in a pop-up over the current world, with no need to leave or hunt for it. The pop-up shows the child's version beside it with a "Use my version" button, which copies it across. Saving shows the checklist of children, with the current world already ticked. The change is still made at the parent, so changes still only flow down. This works for every parent and child at every level, including inside one world: editing one of 14 subraces, Edit parent opens the race, and the checklist lets the user pick the 5 subraces that get the change. In a longer family, an Up one level button in the pop-up steps to the grandparent.
- **Changes flow through every generation.** A parent's change reaches children, grandchildren and further, until it meets a node that set that value for itself (pencil mark); that node and everything below it keep their own value. Values the in-between node never touched still flow all the way down. Example: the Axe set its damage to d12, so changing the sword parent to d10 skips the Axe and its Double Axe, but adding fire damage to the sword reaches both.
- **The checklist shows the whole family tree**, indented, with notes such as "set its own damage" or "follows the Axe". Unticking a node protects its branch, unless a node below it is ticked individually.
- **Template parents.** A template is a parent that isn't a real item (for example Basic Melee Weapon) and holds the shared parts. Real items are its children and change only what makes them different. Templates stay out of the rulebook and item lists and live in a Templates group in the library. New items suggest their category's template in Variant of. **Change parent** moves one or many nodes under a different parent in one go; each keeps what makes it different and inherits the rest.

### Part 5: History (locked)

- **Every change is a recorded step:** what changed, its old value, when, and whether the user or the AI made it.
- **Undo and redo** with Ctrl+Z and Ctrl+Y. A bulk change (214 things swapped) is one step. AI changes undo exactly like the user's own.
- **History survives closing the app.** It is kept with the world, so tomorrow's Ctrl+Z can reach yesterday. A History list shows steps in plain words ("Removed Strength, 214 things affected"); clicking a line shows it or rolls back to it.
- **History has a size limit:** the last few thousand steps or about 30 days, whichever is smaller. Steps are small text, never pictures. Anything older is covered by automatic backups and snapshots.
- **Recycle bin keeps things until the user empties it,** like Windows. Each item remembers every link it had, so restoring can reconnect them. When the bin gets large, the app suggests a clean-up. Settings can turn on "empty items older than 30 days". Emptying the bin is the only truly permanent action in the app and always asks first.
- **Snapshots** are named by the user, hold the world and its system together, and are kept until deleted. Restoring a snapshot or a backup first takes a snapshot of the current state.

### Part 6: Flags (locked)

- **Colours:** red is broken, yellow looks off, blue is just so you know, green is fixed (with Undo).
- **Red comes from links and the user's own rules.** A red flag means a link points at nothing, or something breaks a world rule the user wrote ("no metal" and an Iron Helm exists). Both are found without AI, always accurately and instantly. Deliberate exceptions get "I meant that".
- **Yellow comes from free math checks and, optionally, the AI.** Free checks cost nothing and always run.
- **Free yellow checks:** balance (damage or hit points far off for a challenge rating), economy (a smaller or weaker item costs more than a bigger one in its category), filing (a weapon with no attack, a creature filed as an item), duplicate names, and empty sheets (no hit points or no attacks). "Normal" is always measured against the system's own content.
- **Check categories with on/off and a sensitivity slider.** Yellow checks are grouped into categories: Balance, Economy, Filing, and AI-only ones such as Lore consistency. In World settings each category can be ticked on or off and has its own slider (Relaxed, Normal, Strict). Check for errors uses the same ticks, so checking only Balance also costs less AI. The flag panel can be filtered by category too. Red flags can't be switched off by category, only ignored one by one.
- **Blue and green blocks** are kept as long as the history limit (about 30 days), so the panel never bloats.

### Part 7: The AI (locked)

- **A fixed list of named actions.** The AI can only use named actions such as change a value, add a brick, create a node or move to a category. Each one goes through the same preview, undo and history as the user's own changes. It can never rewrite a file directly.
- **The AI never deletes.** It can suggest a deletion, but only the user can click Delete.
- **Your key stays on your computer**, stored in the operating system's protected storage. Each AI job sends only what it needs: the World Notes, the recent chat and the nodes the job touches, never the whole world file.
- **The AI only acts when asked:** a prompt, Check for errors, or live checking switched on. No unprompted suggestions in version 1.
- **All-or-nothing jobs.** If the internet drops or the AI fails mid-job, nothing from that job is applied, and a blue notice says so. Offline, the AI buttons show "Offline" and everything else works as normal.
- **Model choice.** The app picks automatically: a quick, cheap Claude model for small edits and checks, a careful model for big creative jobs. Settings offers Automatic, Always quick or Always careful. Cost estimates name the model being used.
- **AI steps are labelled in History** with the request that caused them ("AI: all swords use Dexterity").

### Part 8: Sharing and upgrades (locked)

- **Files record the app version that made them.** A newer app upgrades an older file automatically after backing up the original. An older app opens a newer file read-only ("Made with a newer version. Update to edit it.") and never damages a file it doesn't fully understand.
- **What a shared world carries.** Always: the world, its system, its pictures and its World Notes. Never: the API key or settings. Left out unless the user ticks them: AI chat history, snapshots and undo history.
- **Importing never overwrites.** Systems have permanent IDs too. An imported world whose system is identical to one already on the shelf uses it; if it differs, the imported system arrives as its own copy ("d20 Basic (from Dave)").
- **Things remember who made them.** An optional author name in settings (no account needed) is stored on every world, system and node the user creates; imported things keep their maker's name. Lists gain a third filter, From others, beside Homemade and Template. The rulebook export can carry a "Created by" line.
- **Required credits are automatic.** Content from the SRD 5.2 is licensed under Creative Commons (CC-BY 4.0), so the rulebook export and shared files include its required attribution line automatically whenever that content is used.

### Part 9: Building rules (locked)

- **Every session starts by reading** this hard rules section and the design doc.
- **The data format never changes quietly.** If the code needs a different way of storing nodes or bricks, this file is updated first, with the user's OK.
- **Small steps, each tested** before the next begins.
- **Automatic tests guard the promises**, for example: deleting Strength flags every link; cutting power mid-save loses nothing; undo reverses a 214-item change in one step. They run after every change.
- **A progress log in the repo** records what was built, what's next and decisions made, so any session can pick up where the last stopped.
- **The user approves milestones, not every step.** Each milestone (for example "the flag panel works") is built, then tested by the user, who approves it or sends it back. Any decision that affects the design stops and asks, even mid-milestone.
- **Technology:** Electron desktop app for Windows, written in TypeScript. A world file is one archive holding the data and the pictures.
- **Who decides what (October 20, 2026).** Claude makes technical decisions without asking, as long as they keep every promise in Part 1. The user decides anything that changes how the app looks, feels or works for the person using it; anything that adds to or removes from version 1 or first playable; any change to the promises; and anything that would be hard to undo once real worlds exist. Every technical decision Claude makes is written in the progress log in one plain line, so the user can review and overrule it at any milestone.

## The Dice Roller

The dice roller is a fully featured standalone tool built into DM in a Pocket. It is not tied to any version yet and will be slotted in when the time is right. It is designed to be the best dice roller that exists — not just adequate, but something players talk about.

### The 20 problems every bad roller has — and how this one fixes them

1. **Ads and paywalls.** Gone. One-time purchase, no locked features, no subscriptions.
2. **Ugly dice.** Fixed by the custom dice creator: color, pattern, opacity, material (wood, metal, stone, gem, plastic). The dice you build look like something you'd want to own.
3. **No dice personality.** Fixed by AI-generated dice sets. Describe your character or world in a sentence and it generates a matching set. "Dark elf assassin" gets black and purple with silver edges.
4. **Can't import custom dice.** Fixed. Import image files for faces, or import a full dice set someone else made and shared.
5. **Formulas disappear when you close it.** Fixed. Every formula is saved forever, named by you, tagged and stored in the universal codex.
6. **Re-entering the same roll every session.** Fixed by saved roll buttons. Your attack roll is one tap, always there.
7. **No shared rolls at the table.** Fixed by shared table mode. Everyone sees every roll on the same screen in real time.
8. **"I swear I rolled higher."** Fixed by full roll history. Every roll logged with formula, result, time and who rolled it.
9. **Secret rolls are impossible.** Fixed. The DM can mark any roll hidden — only they see the result; players see only "DM rolled."
10. **No connection to the character sheet.** Fixed. Stat blocks in DM in a Pocket already know their dice. Click the attack, it rolls with the right formula already loaded.
11. **Clunky on-the-fly modifiers.** Fixed. Quick modifier buttons appear after any roll: +1, +2, advantage, disadvantage, reroll lowest. One tap to adjust.
12. **No advantage/disadvantage built in.** Fixed. Every roll has a one-tap advantage and disadvantage toggle, rolls two dice and shows both results.
13. **Sound effects you can't turn off.** Fixed. Sound is off by default. When on, choose the sound: wood clatter, metal clink, or silence with just a number flash.
14. **Animations too slow.** Fixed. Default animation is fast and satisfying — under one second. Settings allow slower for flair or instant for speed.
15. **No exploding dice.** Fixed. Any die can be set to explode (roll max, roll again), with a cap so it never runs forever.
16. **Can't roll weird dice.** Fixed. d3, d5, d7, d14, d16, d24, d30, any number. If a system uses it, it exists.
17. **No macro support.** Fixed. A macro is a sequence: roll initiative for every creature in the encounter at once, one button.
18. **Sharing dice sets is impossible.** Fixed. Export a dice set as a file, share it with your group, they import it and have your exact set.
19. **Looks bad on a TV at the table.** Fixed. Table mode scales to a big screen — large readable numbers, big dice faces, designed to be seen from across the room.
20. **Works only online.** Fixed. Entirely local, entirely offline, always.

### The universal codex

Saved roll formulas do not belong to any world, system or module — they live in the universal codex, a personal library that is always available no matter what you have open. A formula saved once is accessible in every session, every world, every game.

- **Tags on formulas.** The same tag system used everywhere in the app applies here. A formula can be tagged "5e", "attack", "goblin", "trap" — any single lowercase word. Formulas are filtered and found by tag.
- **Formulas can be as complex as needed.** Conditional logic ("if the d20 equals 20, roll 2d6 instead of 1d6"), chained rolls, referenced stats, counters. The formula language handles anything a tabletop system can ask for.
- **Import from other players.** A player who builds a brilliant complex formula can export it and share it. Anyone can import it into their codex and use it as-is or adapt it.
- **Community formula packs.** Full formula libraries — "5e Fighter level 5 attack routine" — can be shared as a pack. Ties naturally into the version 6 marketplace.

### Pinned roll buttons

A saved formula can be dragged as a pin onto anything in the app — a journal entry, a map location, an encounter, a trap, a creature, a lore page. It sits there as a small dice icon until needed.

At the table, clicking a pin opens a dropdown before the roll:

- **Who does this apply to?** A list of every creature and player currently in the encounter, with Select All and Deselect All at the top.
- The DM picks the targets — the three players near the trap, not the rogue who stayed back.
- Roll. The formula runs once per selected target, shows each result individually, and logs them all in history with the target's name beside each result.

The dropdown is live — it reads whoever is actually in the encounter right now, not whoever was there when the pin was made. The DM building the module may not know who will be in the party when someone plays it.

**Additional pin behaviours:**
- A pin can auto-apply to all creatures of a certain kind — "all goblins in this encounter" — without picking each time.
- Pins can be hidden from players until the DM reveals them. A trap's roll formula is invisible until it triggers.
- A pin carries a label — "Trapdoor DC 14 Dexterity save" — so at the table everyone knows what just happened.
- Dice rolls can be linked to anything in the world just as any other value can be linked.

### Eight more gaps addressed

1. **Probability display.** Before rolling, show the odds: "35% chance of hitting AC 15." Toggle for players who want the math; hidden by default for casual players.
2. **Roll annotation.** When rolling, type a quick note: "attack on the goblin chieftain." Shows in the history log next to the result so the log tells a story.
3. **Conditional math.** "If the first d20 is 20, roll 2d6 instead of 1d6." Critical hits, fumble tables, abilities that change the dice mid-roll.
4. **Roll triggers.** Link a formula to a flag or condition. A Poisoned creature automatically rolls with disadvantage. The condition is already in the world; the roller reads it.
5. **Persistent counters.** Some systems track things between rolls: a spell slot used, a resource spent. The roller decrements a counter on the node when the roll is made.
6. **Roll templates for the community.** Full formula packs shared by players. Someone builds it once; everyone benefits. Feeds directly into the version 6 marketplace.
7. **Colorblind-friendly mode.** The dice creator generates beautiful color sets, but a colorblind player needs number and shape cues too. A setting adds symbols or patterns to die faces automatically.
8. **Roll request.** The DM sends a roll request to a specific player: "Roll Perception." It appears on their screen, they roll, and the result comes back to the DM automatically. No shouting across the table.

### Physics and the tray

The dice roller has a full physics simulation. Every setting is optional — players who want instant results skip all of this with one toggle.

**Physics sliders:**
- **Throw strength.** Gentle tumble to hard bounce off the tray walls. Default is a satisfying medium.
- **Gravity.** 1.0 is normal. Lower makes dice float and tumble slowly. Higher makes them slam down fast with less bounce.
- **Surface friction.** How quickly dice slow after landing. Low friction — they slide; high friction — they stop where they land.
- **Bounciness.** How much dice jump on impact. Marble feels different from felt.

**Tray types — each with its own default physics profile and sounds:**
- Wooden tray — medium bounce, warm clatter sound
- Green felt tray — low bounce, soft thud, classic casino feel
- Marble tray — high bounce, sharp crack, cold and heavy
- No tray — dice roll across the screen itself and fade at the edges
- Custom tray — the user uploads any background image

Each tray's physics profile is a starting point. Every slider can still be adjusted on top of it.

**Visual settings:**
- **Animation on/off.** One button for instant results with no animation — for speed play.
- **Tray size.** Click and drag to resize, or fullscreen for TV table mode.
- **Dice transparency.** From fully solid to nearly invisible, so the screen shows through underneath.
- **Dice size.** Larger for big screens or players who need it.
- **Lighting and shadow.** Dice cast a soft shadow on the tray surface. A moveable light source — overhead, top-left, dramatic side light — makes the dice look like they are physically sitting on a surface. Pure cosmetic, pairs with transparency.

**Sound settings:**
- Sound on/off
- Volume slider
- Sound tied to tray material — felt sounds different from marble
- Separate volume for roll sound versus result chime
- Import custom sound files

### Triggered animations and sounds

Every formula in the codex can have its own set of triggers — conditions that fire a special animation or sound when a specific result lands. Triggers are per-formula, not global. An attack roll can have a critical hit animation; a gold piece roll does not need one.

**Built-in trigger types:**
- **Critical hit.** You define the threshold — 19 and 20, or just 20, or whatever your system uses. When it lands: dice glow, shake, burst with light. Sound: dramatic horn, thunder crack, crowd cheer — you choose.
- **Critical miss.** Defined the same way. Sound: sad trombone, cracking sound, a pathetic rattle before settling on the one.
- **Maximum damage.** Every pip lit, a deep satisfying thud.
- **Minimum damage.** Quiet, a little sad.
- **Custom number trigger.** Define any result — "when I roll exactly 7, play this." Useful for systems with rules around specific numbers.

**Import your own.** Upload any audio file. Your table's inside joke, a famous movie line, anything. It plays every time that trigger fires.

## Open questions

**Decided (Oct 18, 2026)**

- [x] Version 1 starts with two options: a generic d20 type (with SRD 5.2 rules, monsters and items) or from scratch. Old-school and d6 type templates are early add-ons after version 1 (changed October 19, 2026)
- [x] Version 1 accepts Claude (Anthropic) API keys only; other providers go to the parking lot
- [x] Foundry VTT export is a later spoke, not the base of the system builder
- [x] Old rules file not found; this document is the blueprint
- [x] Electron for the desktop program (simpler toolchain than Tauri)
- [x] A world saves as one archive file holding its data and uploaded pictures
- [x] Data model locked: nodes and bricks, links not words, parent/child inheritance, three-level categories, system holds rules and world holds things (see Data model)

**Still open**

- [ ] Free, one-time purchase or subscription for the online extras, if it is ever sold?

## The change list ("the back board") — decided, NOT built yet

Jeff's rule (October 26, 2026): changes are collected here as a list and built together once he is happy with the whole list. Nothing below is code yet. Items come from the full review of the program (the ranked criticisms); we take them one at a time.

### Change 1: Plain words for newcomers (criticism #3, "too hard for a new person") — approved by Jeff, October 26

Use the plain words from the table below on every screen. Jeff's note on "Adventure": he grew up in the 80s, when a "module" was the story (a published adventure), and Foundry VTT calls its add-ons "modules" while a downloaded story is an adventure. So **Adventure** is the right word for the story that goes inside a world, and "Module" is kept only as the Designer word.

| Today | Plain word | Designer word (kept) |
|---|---|---|
| Codex | **Library** | Codex |
| Variant ("Make a variant") | **Linked copy** (follows the original) | Variant |
| Parent / child | **Original / copies** | Parent / child |
| Edit parent | **Edit the original** | Edit parent |
| Template | **Blueprint** | Template |
| Flags | **Checks** (a "heads-up") | Flags |
| System | **Game rules** | System |
| Module | **Adventure** | Module |
| Snapshot | **Save point** | Snapshot |
| Category | **Shelf** | Category |
| Layout | **Workspace** | Layout |
| Brick | **Brick** (kept; everyone knows building blocks) | Brick |

Unchanged everywhere: World, Rulebook, Encounter, Pin, Recycle bin, Journal, Maps.

How it is meant to work (still to confirm with Jeff where marked):
- All the words live in one list in the code, so the renaming is done once. Saved files and the internal names do not change, so there is no data-format change.
- A "Words" setting: Plain or Designer. **(Open: which one is the default for new installs, and whether there is a first-run question "Have you built a game before?". Claude suggests Plain by default plus the question.)**
- The first time a word appears, a short "What's this?" hover explains it. A glossary page in Help lists every term in both versions.
- A test checks that no old word is left on screen in Plain mode.
- Open worries Jeff may overrule: "Library" for Codex clashes a little with the existing picture library; "Shelf" for Category is the least certain choice.
- About a day of careful work, text only.

### Still to be turned into list items (from the ranked review, in order)
1. The product has no single clear purpose (the DM's table is about 11% of the code and contradicts "not a virtual tabletop").
2. Almost nobody has used it, and the screens have no automated tests.
3. ~~Too hard for a new person~~ (Change 1 above; a Simple mode and a first-game walkthrough are still to be decided).
4. No Foundry export.
5. No independent review of reliability and safety (power-cut test on Windows, big-world speed, local-network security, human code review, unsigned installer).
6. No price or business plan.
7. Windows only.
8. Pen-and-paper people are not welcomed (photo to journal page, blank worksheets, `[[` links).
9. Two very large code files are hard to maintain.
10. AI honesty and a single "hide all AI" switch.
11. Missing starter pictures and sounds; map walls, paths and scatter.
12. Loose ends (version 0.1.0, "Show me" after bulk or AI changes, floating panels stay in the window, Jeff's "one more item").
13. Accessibility has not been checked.
