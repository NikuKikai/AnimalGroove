# AnimalGroove Notes

## Product Shape
- Fullscreen Three.js scene.
- UI uses floating overlays only; gameplay interaction stays in 3D space.
- Inventory is not a DOM backpack. Loose blocks live in the reserve ring around the board.
- Animals move on closed loop paths with constant path-speed and jump-style motion.
- Animal species have global runtime profiles keyed by `animalType`.
- Global animal profile fields are `weight`, `speed`, and `effect`.
- Movement timing should come from path distance plus species speed, not from evenly distributing beats per waypoint.

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
- Animal `weight` scales trigger loudness. If two animals hit the same block at once, let the voices stack naturally instead of merging them.
- Animal `effect` exists as data already, but is still a dummy and should not silently start affecting sound without explicit implementation.

## Visual Rules
- Do not use Three `GridHelper`; draw the grid manually so board coordinates and visuals match exactly.
- Reserve pieces keep their real block colors and must not overlap visually.
- When stepped on, a block should depress quickly for a percussion-like hit accent.

## Dev Notes
- Avoid long-running `npm run dev` from the agent unless explicitly needed.
- Prefer terminating checks: `tsc -b`, `vitest run`, `vite build`.
- In this repo, the reliable commands are:
- `npm.cmd exec --cache .npm-cache tsc -b`
- `npm.cmd exec --cache .npm-cache vitest run`
- `npm.cmd exec --cache .npm-cache vite build`
- If local dependencies are broken, repair with `npm.cmd install --cache .npm-cache --include=dev`.
- Do not use bare `npm exec tsc`; npm may download the unrelated `tsc` package instead of TypeScript.
- Keep comments in code in English.
- Toggle buttons (Hint, Mute) should only signal state via styling; do not toggle their text.

## Deployment Notes
- For GitHub Pages, asset paths must not assume site-root `/...` URLs. Prefer page-relative paths for static assets that live under `public/`.
- Keep only one canonical model asset directory. In this repo it is `public/3Dmodels`; do not keep a duplicate root-level `3Dmodels`.
- GitHub Pages CI hit npm optional-dependency issues with Rollup. The repo currently works around this by:
- Using `npm install` in the Pages workflow instead of `npm ci`.
- Pinning `@rollup/rollup-linux-x64-gnu` in `optionalDependencies`.
- Three.js examples imports may need local `.d.ts` shims in strict TypeScript projects.
- Do not assume local build success means CI success when local `node_modules` has been partially damaged by interrupted npm commands or Windows file locks.
