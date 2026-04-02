import type { JudgedNote, LevelDefinition, Placement, SimulationResult, TriggerEvent } from "../types";
import { buildTriggerEvents } from "./utils";

export function judgeTriggers(
  level: LevelDefinition,
  producedTriggers: TriggerEvent[],
): SimulationResult {
  const targetNotes: JudgedNote[] = level.targetRhythm
    .map((note) => ({ ...note, state: "pending" }))
    .sort((left, right) => left.beat - right.beat);
  const extras: TriggerEvent[] = [];
  const unmatchedTargets = new Set(targetNotes.map((note) => note.id));

  for (const trigger of producedTriggers) {
    const match = targetNotes.find((note) => {
      if (!unmatchedTargets.has(note.id)) {
        return false;
      }

      if (note.timbre !== trigger.timbre) {
        return false;
      }

      return Math.abs(note.beat - trigger.beat) <= level.judge.beatTolerance;
    });

    if (match) {
      match.state = "matched";
      match.matchedTriggerId = trigger.id;
      unmatchedTargets.delete(match.id);
    } else {
      extras.push(trigger);
    }
  }

  for (const note of targetNotes) {
    if (note.state === "pending") {
      note.state = "missed";
    }
  }

  const matched = targetNotes.filter((note) => note.state === "matched").length;
  return {
    targetNotes,
    extraTriggers: extras,
    producedTriggers,
    completion: targetNotes.length === 0 ? 1 : matched / targetNotes.length,
    solved: matched === targetNotes.length && extras.length === 0,
  };
}

export function simulateLevel(level: LevelDefinition, placements: Placement[]): SimulationResult {
  return judgeTriggers(level, buildTriggerEvents(level, placements));
}

export function evaluatePlacements(level: LevelDefinition, placements: Placement[]) {
  return simulateLevel(level, placements);
}
