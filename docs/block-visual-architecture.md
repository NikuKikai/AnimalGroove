# Block Visual Architecture

This document summarizes the current rendering split between base terrain, terrain blocks, and button blocks.

## Overview

The game now treats placeable blocks as two visual families:

- Terrain blocks
  - Used by `kick` and `snare`.
  - Built from `public/3Dmodels/Blocks` tile models.
  - Visually replace the ground on the cells they occupy.
  - Do not depress when stepped on.
- Button blocks
  - Used by all other timbres for now.
  - Built from the legacy box mesh plus a top icon.
  - Rendered on top of the existing ground.
  - Depress briefly when triggered.

Both families still share the same gameplay semantics:

- They occupy placement cells in the puzzle logic.
- Animals can trigger them.
- They produce rhythm events.
- They can emit correct / wrong hit effects.

## Rendering Rule

Base terrain is split into two layers:

- Board terrain: grass tiles inside the playable board.
- Reserve terrain: open-path tiles in the inventory reserve area.

When a terrain block occupies a cell:

- The corresponding board or reserve base tile is omitted.
- The terrain block model becomes the only visible surface for that cell.

When a button block occupies a cell:

- The base tile remains visible.
- The button block is rendered above it as a separate object.

## Current Timbre Mapping

- `kick` -> terrain block
- `snare` -> terrain block
- all others -> button block

The mapping currently lives in `src/game/render/blockVisuals.ts`.

## Implementation Notes

- `src/game/render/threeScene.ts`
  - Rebuilds board and reserve terrain masks from current placements and reserve pieces.
  - Chooses the correct mesh factory for placed blocks, reserve blocks, and drag preview.
- `src/game/render/sceneMeshes.ts`
  - Contains the mesh factories for:
    - button blocks
    - terrain blocks
    - masked tiled terrain areas
- `src/game/render/blockVisuals.ts`
  - Defines the visual-kind policy.

## Design Intent

This split keeps gameplay-level block logic unified while allowing different presentation and feedback:

- Terrain blocks read as part of the ground.
- Button blocks read as interactive objects placed on top of the ground.
- Future block families can be added without changing placement or judge systems, as long as they map into a visual kind or a new render family.
