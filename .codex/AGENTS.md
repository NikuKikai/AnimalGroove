# AnimalGroove Notes

## Product Shape
- Fullscreen Three.js scene.
- UI uses floating overlays only; gameplay interaction stays in 3D space.
- Inventory is not a DOM backpack. Loose blocks live in the reserve ring around the board.
- Animals move on closed loop paths with constant path-speed and jump-style motion.

## Interaction Rules
- Drag reserve blocks or already placed blocks directly in the scene.
- Placement snaps to board cells.
- Invalid overlap preview shows red; releasing in an invalid state cancels the move.
- `R` rotates the block while dragging.
- Right click removes a placed block.
- Text should remain non-selectable.

## Audio Rules
- WebAudio unlock on first pointer interaction anywhere.
- Trigger notes when an animal enters a block footprint, not per internal cell traversal.
- Matched notes should not double-play reference plus hit audio.
- Tone scheduling must always use strictly increasing times to avoid runtime crashes.

## Visual Rules
- Do not use Three `GridHelper`; draw the grid manually so board coordinates and visuals match exactly.
- Reserve pieces keep their real block colors and must not overlap visually.
- When stepped on, a block should depress quickly for a percussion-like hit accent.

## Dev Notes
- Avoid long-running `npm run dev` from the agent unless explicitly needed.
- Prefer terminating checks: `tsc -b`, `vitest run`, `vite build`.
- Keep comments in code in English.
