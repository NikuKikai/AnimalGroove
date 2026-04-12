import { describe, expect, it } from "vitest";
import { ensembleLevel, tutorialLevel } from "../src/data/levels";
import { evaluatePlacements, generateLevelFromGroove, generateLevelFromPaths, solveLevel } from "../src/game/simulation";
import type { LevelBlock, RhythmEvent } from "../src/game/types";

const tutorialKickPieces = tutorialLevel.blocks
  .filter((block: LevelBlock) => block.blockId === "sand-single")
  .map((block: LevelBlock) => block.pieceId);

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
      { id: "b", lane: "drums", beat: 2, timbre: "kick" },
      { id: "c", lane: "drums", beat: 1, timbre: "snare" },
      { id: "d", lane: "drums", beat: 3, timbre: "snare" },
      { id: "e", lane: "perc", beat: 0.5, timbre: "hat" },
    ];
    const level = generateLevelFromGroove("test", rhythm);
    const result = solveLevel(level);
    const pathCellUsage = new Map<string, number>();

    for (const animal of level.animals) {
      for (const point of animal.path.waypoints) {
        const key = `${point.x},${point.y}`;
        pathCellUsage.set(key, (pathCellUsage.get(key) ?? 0) + 1);
      }
    }

    expect(result.solvable).toBe(true);
    expect(level.referenceSolution).toBeDefined();
    expect(evaluatePlacements(level, level.referenceSolution ?? []).solved).toBe(true);
    expect(level.animals.every((animal) => animal.path.waypoints.length >= 3)).toBe(true);
    expect(level.animals.some((animal) => animal.path.waypoints.length > level.loopBeats)).toBe(true);
    expect([...pathCellUsage.values()].some((count) => count > 1)).toBe(true);
  });

  it("ensemble level reports simulation output", () => {
    const result = evaluatePlacements(ensembleLevel, ensembleLevel.referenceSolution ?? []);
    expect(result.targetNotes.length).toBeGreaterThan(0);
  });

  it("path-first generated level stays solvable and compact", () => {
    const level = generateLevelFromPaths("path-first-test", {
      seed: 42,
      loopBeats: 8,
      animalCount: 3,
    });
    const solution = level.referenceSolution ?? [];
    const result = evaluatePlacements(level, solution);
    const footprintArea = level.board.width * level.board.height;

    expect(solution.length).toBeGreaterThan(0);
    expect(result.solved).toBe(true);
    expect(level.targetRhythm.length).toBe(result.producedTriggers.length);
    expect(level.animals.some((animal, index, animals) =>
      animals.some((other, otherIndex) =>
        otherIndex > index && animal.path.waypoints.some((point) => other.path.waypoints.some((peer) => peer.x === point.x && peer.y === point.y)),
      ),
    )).toBe(true);
    expect(footprintArea).toBeLessThanOrEqual(225);
  });

  it("triggers adjacent same-block placements independently", () => {
    const result = evaluatePlacements(tutorialLevel, [
      { blockId: "sand-single", pieceId: tutorialKickPieces[0]!, origin: { x: 1, y: 1 }, rotation: 0 },
      { blockId: "sand-single", pieceId: tutorialKickPieces[1]!, origin: { x: 3, y: 1 }, rotation: 0 },
    ]);

    expect(result.producedTriggers).toHaveLength(2);
    expect(result.producedTriggers.map((trigger) => trigger.beat)).toEqual([0, 1]);
    expect(result.targetNotes.find((note) => note.beat === 0)?.state).toBe("matched");
    expect(result.extraTriggers).toHaveLength(1);
  });

  it("does not suppress a later correct trigger after an earlier wrong trigger of the same block type", () => {
    const result = evaluatePlacements(tutorialLevel, [
      { blockId: "sand-single", pieceId: tutorialKickPieces[0]!, origin: { x: 3, y: 1 }, rotation: 0 },
      { blockId: "sand-single", pieceId: tutorialKickPieces[1]!, origin: { x: 3, y: 3 }, rotation: 0 },
    ]);

    expect(result.producedTriggers).toHaveLength(2);
    expect(result.producedTriggers.map((trigger) => trigger.beat)).toEqual([1, 2]);
    expect(result.targetNotes.find((note) => note.beat === 2)?.state).toBe("matched");
    expect(result.extraTriggers).toHaveLength(1);
  });
});
