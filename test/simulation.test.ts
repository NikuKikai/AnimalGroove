import { describe, expect, it } from "vitest";
import { ensembleLevel, tutorialLevel } from "../src/data/levels";
import { evaluatePlacements, generateLevelFromGroove, solveLevel } from "../src/game/simulation";
import type { RhythmEvent } from "../src/game/types";

describe("simulation", () => {
  it("solves the tutorial reference placements", () => {
    const result = evaluatePlacements(tutorialLevel, tutorialLevel.referenceSolution ?? []);
    expect(result.solved).toBe(true);
  });

  it("solver finds a valid solution for the tutorial", () => {
    const result = solveLevel(tutorialLevel);
    expect(result.solvable).toBe(true);
    expect(result.simulation?.solved).toBe(true);
  });

  it("generated level stays solvable from groove", () => {
    const rhythm: RhythmEvent[] = [
      { id: "a", lane: "drums", beat: 0, timbre: "kick" },
      { id: "b", lane: "drums", beat: 2, timbre: "snare" },
    ];
    const level = generateLevelFromGroove("test", rhythm);
    const result = solveLevel(level);
    expect(result.solvable).toBe(true);
  });

  it("ensemble level reports simulation output", () => {
    const result = evaluatePlacements(ensembleLevel, ensembleLevel.referenceSolution ?? []);
    expect(result.targetNotes.length).toBeGreaterThan(0);
  });
});
