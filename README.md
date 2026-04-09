# AnimalGroove

AnimalGroove is a rhythm puzzle game built with `Vite + React + TypeScript + Three.js`.

Players reshape a grid-based field by moving existing percussion blocks. Animals move along looping paths, and when they step on blocks, those blocks trigger notes. The goal is to modify the terrain so the generated rhythm matches the target groove.

## Current Features

- Fullscreen Three.js board with floating HUD
- Scene-native drag and drop block movement
- Closed-loop jumping animal motion
- Global animal profiles with per-species weight, movement speed, and placeholder effect tags
- Per-note rhythm judging
- Separate hit / reference / wrong audio channels
- Example levels and offline simulation tools
- GitHub Pages deployment workflow

## Controls

- Drag placed blocks to move them around the board
- Press `R` while dragging to rotate
- Drag empty space to pan the camera
- Right drag empty space to orbit the camera
- Use the mouse wheel to zoom

## Animal Profiles

Animal species now have global, non-level-specific runtime properties:

- `weight`: scales the trigger loudness when that animal steps on a block
- `speed`: determines timing from actual path distance, not from waypoint count
- `effect`: reserved for future per-species sound coloration

Current runtime behavior uses `weight` and `speed`. `effect` is stored as data only for now.

## Development

Install dependencies:

```bash
npm install
```

Run the app locally:

```bash
npm run dev
```

Useful checks:

```bash
npm run test
npm run build
```

Tool scripts:

```bash
npm run groove
npm run solve
npm run generate-level
npm run generate-level-paths
```

## Project Structure

- `src/`: runtime game code, UI, rendering, simulation
- `src/game/assets/`: canonical 3D asset paths, shared registries, and cached model loading helpers
- `public/3Dmodels/Animals/`: animal model assets used by the game
- `scripts/`: CLI utilities for groove / level generation and solving
- `docs/level-generation.md`: notes on groove-first vs path-first generation
- `test/`: simulation tests
- `.codex/`: project-specific notes and agent memory

## Deployment

The project is configured for GitHub Pages through GitHub Actions.

Static model assets are served from `public/3Dmodels`, and model URLs are kept relative so Pages subpath deployment works correctly. Runtime code should reference them through the shared asset layer in `src/game/assets/`, rather than hardcoding paths inside scene or engine modules.

## Acknowledgements

- 3D models:
  - Cube Pets (2.0) created/distributed by Kenney ([www.kenney.nl](https://www.kenney.nl))
