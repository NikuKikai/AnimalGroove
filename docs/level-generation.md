# Level Generation Approaches

This project currently keeps two different level-generation pipelines on purpose so they can be compared side by side.

## 1. Groove-First

Source:
- `src/game/simulation/levelGenerator.ts`
- `scripts/generate-level-from-groove.ts`

High-level flow:
1. Start from an existing target groove.
2. Split notes by timbre.
3. For each timbre, search for an animal profile and loop size that can emit as many of those notes exactly as possible.
4. Build shared-space loops that satisfy those timing assignments.
5. Place blocks at the assigned loop positions.

Why keep it:
- It is useful when the rhythm is the main authored input.
- It is easier to reason about exact note coverage.
- It is a good baseline for verifying solver correctness.

Current tradeoff:
- Even after improvements, it still tends to feel more "rhythm-first" than "puzzle-space-first".

## 2. Path-First

Source:
- `src/game/simulation/pathFirstLevelGenerator.ts`
- `scripts/generate-level-from-paths.ts`

High-level flow:
1. Start by generating several random closed animal loops.
2. Keep them in one shared arena so they can overlap and cross.
3. Collect path traffic statistics from all animal visits.
4. Select a compact cluster of high-value cells.
5. Merge those cells into larger rectangles so the resulting block layout stays dense.
6. Assign timbres to those rectangles from the beat roles that pass through them.
7. Simulate the placed solution and derive the target groove from the produced triggers.

Why this exists:
- It prioritizes spatial puzzle structure first.
- It naturally creates overlapping routes and shared trigger cells.
- It encourages larger and denser block layouts instead of sparse isolated notes.

Current tradeoff:
- Musical quality is heuristic-driven rather than explicitly authored.
- It is harder to guarantee a specific groove character up front.

## Choosing Between Them

Use groove-first when:
- You already know the groove you want.
- You want to test note coverage logic.
- You want a more controlled rhythm target.

Use path-first when:
- You want richer board geometry first.
- You want overlapping loops and tighter block clusters.
- You want the puzzle layout to drive the resulting rhythm.
