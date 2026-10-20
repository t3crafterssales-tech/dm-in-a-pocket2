# DM in a Pocket

A desktop app for building tabletop RPG systems and worlds. It should feel as flexible as a pad
of paper, a pencil and an eraser: build rules, monsters, items and lore in any order, remove
something and see exactly what it affects, and print the result as a rulebook. Everything works
by hand; AI help is optional, using your own Claude key.

Your worlds live on your computer and you own them.

## Where things are

- `CLAUDE.md`: the hard rules the program must follow
- `docs/design.md`: the full design
- `docs/data-format.md`: how everything is stored
- `docs/PROGRESS.md`: what has been built, what is next, and every technical decision
- `src/engine/`: the engine (nodes, bricks, links, layers, flags, undo, recycle bin)
- `src/storage/`: the main folder, world files, constant saving, backups, snapshots, locking
- `test/`: automatic tests that guard the promises

## Running the tests

Needs Node.js 22.18 or newer. No installs needed.

```
npm test
npm run typecheck
```

`npm run typecheck` needs TypeScript (`npm install -g typescript`).
