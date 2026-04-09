# Level Block Instance Model

This document records the current level-authoring and runtime model after removing the old inventory / reserve concept.

## Core Shift

The game no longer treats blocks as items in a backpack.

Instead:

- A level owns a fixed set of concrete block instances.
- Every block instance already exists on the board at level start.
- The player solves the puzzle by moving those existing blocks to new positions.

This means the player is editing terrain, not spawning new terrain.

## Data Model

`LevelDefinition` now uses `blocks` instead of `inventory`.

Each block entry is a concrete instance:

- `blockId`
  - Type identifier.
  - Shared by multiple same-shape / same-timbre instances.
- `pieceId`
  - Concrete instance identifier.
  - Stable for the whole level.
- shape / timbre / color fields
  - Static definition data for that instance.
- `initialPlacement`
  - The authored starting position on the board.

`referenceSolution` is also piece-based, so each solved placement points to the same `pieceId`.

## Runtime Semantics

- Store state is initialized from `getInitialPlacements(level)`.
- Dragging a block does not create a copy.
- The dragged block keeps the same `pieceId`.
- On release, the runtime updates that same block instance to its new placement.

In rendering terms:

- `ThreeScene` keeps one block mesh per `pieceId`.
- Drag preview is rendered by updating that same block's render state and transform.
- There is no stash mesh set and no reserve terrain.

## Board Bounds

The board should be as small as possible while still containing:

- all animal path cells
- all block initial placements
- all reference-solution placements
- blocked cells, if any

The shared helper `materializeLevelLayout(...)` is responsible for:

- assigning stable `pieceId` values
- generating initial placements near the outside of the path area
- normalizing everything into a tight positive board rectangle

## Generation Rule

For generated levels:

- first derive or choose the solved block placements
- then place those same block instances around the outside of the path area
- keep initial placements close to the path bounds
- do not overlap the path itself
- do not overlap other initial blocks

This keeps the level readable while preserving the "modify existing terrain" fantasy.
