import { defineLevel } from "../engine/levelDsl";
import { defaultModelRegistry } from "../engine/modelRegistry";
import type { AnimalDefinition, LevelDefinition, Placement, RhythmEvent, Vec2 } from "../types";

const animalTypes = ["fox", "panda", "cat", "dog", "lion", "tiger"];
const palette = ["#ffaf45", "#58c4dd", "#ffc857", "#b8e986", "#ff7f7f", "#b291ff"];

/** Builds a basic solvable level scaffold from a target rhythm pattern. */
export function generateLevelFromGroove(id: string, rhythm: RhythmEvent[]): LevelDefinition {
  const loopBeats = Math.max(4, Math.ceil(Math.max(...rhythm.map((event) => event.beat), 0) + 1));
  const timbres = [...new Set(rhythm.map((event) => event.timbre))];
  const boardWidth = Math.max(4, loopBeats);
  const boardHeight = Math.max(timbres.length * 2 + 1, 5);

  const animals: AnimalDefinition[] = timbres.map((timbre, index) => {
    const y = index * 2 + 1;
    return {
      id: `animal-${timbre}`,
      name: `${timbre} runner`,
      animalType: animalTypes[index % animalTypes.length],
      timbre,
      path: {
        waypoints: buildLoopPath(loopBeats, y),
        cycleBeats: loopBeats,
      },
    };
  });

  const inventory = timbres.map((timbre, index) => ({
    id: `block-${timbre}`,
    name: `${timbre} pad`,
    width: 1,
    height: 1,
    timbre,
    quantity: rhythm.filter((event) => event.timbre === timbre).length,
    canRotate: true,
    color: palette[index % palette.length],
  }));

  const placements: Placement[] = rhythm.map((event) => {
    const timbreIndex = timbres.indexOf(event.timbre);
    const row = timbreIndex * 2 + 1;
    const path = buildLoopPath(loopBeats, row);
    const step = ((Math.round(event.beat) % loopBeats) + loopBeats) % loopBeats;
    const point = path[step];
    return {
      blockId: `block-${event.timbre}`,
      origin: point,
      rotation: 0,
    };
  });

  return defineLevel({
    id,
    name: `Generated ${id}`,
    description: "Auto-generated puzzle from groove",
    bpm: 112,
    loopBeats,
    board: {
      width: boardWidth,
      height: boardHeight,
    },
    animals,
    inventory,
    targetRhythm: rhythm,
    judge: {
      beatTolerance: 0.12,
    },
    models: defaultModelRegistry,
    referenceSolution: placements,
  });
}

/** Builds a closed waypoint loop used by generated runner animals. */
function buildLoopPath(loopBeats: number, y: number): Vec2[] {
  if (loopBeats <= 4) {
    return [
      { x: 0, y },
      { x: 1, y },
      { x: 1, y: y + 1 },
      { x: 0, y: y + 1 },
    ];
  }

  return [
    { x: 0, y },
    { x: 1, y },
    { x: 2, y },
    { x: 2, y: y + 1 },
    { x: 2, y: y + 2 },
    { x: 1, y: y + 2 },
    { x: 0, y: y + 2 },
    { x: 0, y: y + 1 },
  ].slice(0, loopBeats);
}
