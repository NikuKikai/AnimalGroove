# AnimalGroove

AnimalGroove is a rhythm puzzle game built with `Vite + React + TypeScript + Three.js`.

Players drag percussion blocks onto a grid-based field. Animals move along looping paths, and when they step on placed blocks, those blocks trigger notes. The goal is to arrange the blocks so the generated rhythm matches the target groove.

## Current Features

- Fullscreen Three.js board with floating HUD
- Scene-native drag and drop block placement
- Closed-loop jumping animal motion
- Per-note rhythm judging
- Separate hit / reference / wrong audio channels
- Example levels and offline simulation tools
- GitHub Pages deployment workflow

## Controls

- Drag blocks from the reserve ring onto the board
- Drag placed blocks to move them
- Press `R` while dragging to rotate
- Right click a placed block to remove it

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
```

## Project Structure

- `src/`: runtime game code, UI, rendering, simulation
- `public/3Dmodels/`: animal model assets used by the game
- `scripts/`: CLI utilities for groove / level generation and solving
- `test/`: simulation tests
- `.codex/`: project-specific notes and agent memory

## Deployment

The project is configured for GitHub Pages through GitHub Actions.

Static model assets are served from `public/3Dmodels`, and model URLs are kept relative so Pages subpath deployment works correctly.

## Acknowledgements

- 3D models:
  - Cube Pets (2.0) created/distributed by Kenney ([www.kenney.nl](https://www.kenney.nl))
