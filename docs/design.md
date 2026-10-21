# DM in a Pocket — Design Document

Oct 16, 2026 · @Jeff

## Vision

DM in a Pocket is a desktop app for building tabletop RPG systems and worlds, and it should feel as flexible as a pad of paper, a pencil and an eraser.

The feeling to capture: a kid on his bed in the 1980s, drawing maps and inventing game rules, erasing and redrawing without a second thought. Every feature is tested against one question: does this feel like erasing and redrawing, or like filling out a form?

A user can start anywhere. Pick a ready-made system and strip it down. Invent monsters before any rules exist. Draw the map first and write the lore later. Turn spells off for a desert planet, then switch them back on months later. The app keeps everything consistent and points out what needs attention, but never forces an order.

**Core value: flexible.** If they want to do it this way, fine. If they want to do it the other way, fine.

## Core philosophies

These five rules do not change. Every design decision is checked against them.

1. **You own your worlds.** Everything lives on the user's own computer. No account is needed to use the app. If a paid online service is ever cancelled, every world and system still opens, forever.
2. **Worlds save as one open file.** A world is a single file in a clean, documented format. People can always get their data out, and sharing works from day one by simply sending the file.
3. **AI is optional.** The user brings their own API key. With no key, every feature still works by hand, and the app still flags conflicts. AI only adds suggestions and does the tedious work faster.
4. **Any order, any time.** Unfinished is a normal state, not an error. Monsters can exist before a system does; a map can exist before any lore.
5. **Nothing is truly destroyed.** Erasing switches things off rather than deleting them. Removed parts can come back with their rules intact, and every change can be undone.

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

### Themes

- **Play it:** a character builder (race, class, background, point buy and Choices boxes walk a
  player through it, printable sheet out), an encounter builder ("a hard fight for four level 3
  heroes", using the same averages as the balance flags).
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

### The journal

- Write as you play, with links: typing a name links to that sheet.
- The table writes entries too: "Round 3: Mira dropped to 0 hit points", "Rolled on Rumours: the
  miller is lying", "Long rest, day 4". A session log with no typing.
- After the session, turn a note into a lore page or an NPC (the improvised innkeeper becomes part
  of the world).
- Ask the AI for a recap ("last session in a paragraph") to read out next time.
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
  Codex (with how hard the fight is), descriptions, pictures, maps, treasure and handouts.
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

### Open questions for version 2

- Ken and initiative: hidden completely, or seen but not run (no monster rolls, no monster hit
  points)?
- Remote play: run a relay for players in other houses (small monthly cost, maybe an optional
  extra), or start with same-network play only?
- The order of the themes, and which ones make version 2 rather than version 3.

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
