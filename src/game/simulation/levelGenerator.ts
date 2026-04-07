import { getAnimalProfile } from "../engine/animalRegistry";
import { defineLevel } from "../engine/levelDsl";
import { defaultModelRegistry } from "../engine/modelRegistry";
import type { AnimalDefinition, LevelDefinition, Placement, RhythmEvent, Vec2 } from "../types";

const generatedAnimalTypes = ["fox", "dog", "bee", "tiger", "parrot", "bunny"];
const palette = ["#ffaf45", "#58c4dd", "#ffc857", "#b8e986", "#ff7f7f", "#b291ff"];
const sharedOffsets = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
];

type AssignedEvent = {
  event: RhythmEvent;
  stepIndex: number;
};

type AnimalPlan = {
  animalType: string;
  timbre: string;
  perimeterSteps: number;
  startPhaseBeat: number;
  assignments: AssignedEvent[];
};

/** Builds a solvable level from a groove while encouraging shared space and larger overlapping loops. */
export function generateLevelFromGroove(id: string, rhythm: RhythmEvent[]): LevelDefinition {
  const loopBeats = Math.max(4, Math.ceil(Math.max(...rhythm.map((event) => event.beat), 0) + 1));
  const timbres = [...new Set(rhythm.map((event) => event.timbre))];
  const rng = createRng(hashSeed(`${id}:${JSON.stringify(rhythm)}`));
  const plans = timbres.flatMap((timbre) =>
    buildAnimalPlansForTimbre(
      rhythm.filter((event) => event.timbre === timbre).sort((left, right) => left.beat - right.beat),
      loopBeats,
      rng,
    ),
  );

  const center = { x: 0, y: 0 };

  const reservedPlacementCells = new Map<string, string>();
  const reservedPathCells = new Map<string, Set<string>>();
  const animals: AnimalDefinition[] = plans.map((plan, index) => {
    let waypoints = buildSharedLoopPath(plan.perimeterSteps, index, center, rng, 0);

    for (let attempt = 0; attempt < 32; attempt += 1) {
      const crossesExistingPlacement = waypoints.some((point) => {
        const cellKey = `${point.x},${point.y}`;
        const reservedTimbre = reservedPlacementCells.get(cellKey);
        return Boolean(reservedTimbre && reservedTimbre !== plan.timbre);
      });

      const placesOntoExistingPath = plan.assignments.some((assignment) => {
        const point = waypoints[assignment.stepIndex];
        const cellKey = `${point.x},${point.y}`;
        const pathTimbres = reservedPathCells.get(cellKey);
        return Boolean(pathTimbres && !pathTimbres.has(plan.timbre));
      });

      if (!crossesExistingPlacement && !placesOntoExistingPath) {
        break;
      }

      waypoints = buildSharedLoopPath(plan.perimeterSteps, index, center, rng, attempt + 1);
    }

    for (const point of waypoints) {
      const cellKey = `${point.x},${point.y}`;
      const timbres = reservedPathCells.get(cellKey) ?? new Set<string>();
      timbres.add(plan.timbre);
      reservedPathCells.set(cellKey, timbres);
    }

    for (const assignment of plan.assignments) {
      const point = waypoints[assignment.stepIndex];
      reservedPlacementCells.set(`${point.x},${point.y}`, plan.timbre);
    }

    return {
      id: `animal-${index + 1}`,
      name: `${plan.timbre} runner ${index + 1}`,
      animalType: plan.animalType,
      timbre: plan.timbre,
      path: {
        waypoints,
        startPhaseBeat: plan.startPhaseBeat,
      },
    };
  });

  const placementMap = new Map<string, Placement>();
  const inventoryCounts = new Map<string, number>();

  for (let animalIndex = 0; animalIndex < animals.length; animalIndex += 1) {
    const animal = animals[animalIndex];
    const plan = plans[animalIndex];
    for (const assignment of plan.assignments) {
      const point = animal.path.waypoints[assignment.stepIndex];
      const placementKey = `${plan.timbre}:${point.x},${point.y}`;
      if (!placementMap.has(placementKey)) {
        placementMap.set(placementKey, {
          blockId: `block-${plan.timbre}`,
          origin: point,
          rotation: 0,
        });
        inventoryCounts.set(plan.timbre, (inventoryCounts.get(plan.timbre) ?? 0) + 1);
      }
    }
  }

  const inventory = timbres.map((timbre, index) => ({
    id: `block-${timbre}`,
    name: `${timbre} pad`,
    width: 1,
    height: 1,
    timbre,
    quantity: inventoryCounts.get(timbre) ?? 0,
    canRotate: true,
    color: palette[index % palette.length],
  }));

  const normalized = normalizeGeneratedLayout(animals, [...placementMap.values()], 2);

  return defineLevel({
    id,
    name: `Generated ${id}`,
    description: "Auto-generated shared-space puzzle from groove",
    bpm: 112,
    loopBeats,
    board: {
      width: normalized.board.width,
      height: normalized.board.height,
    },
    animals: normalized.animals,
    inventory,
    targetRhythm: rhythm,
    judge: {
      beatTolerance: 0.12,
    },
    models: defaultModelRegistry,
    referenceSolution: normalized.placements,
  });
}

/** Splits one timbre lane into as few exact runner plans as the current animal profiles allow. */
function buildAnimalPlansForTimbre(events: RhythmEvent[], loopBeats: number, rng: () => number): AnimalPlan[] {
  const remaining = [...events];
  const plans: AnimalPlan[] = [];

  while (remaining.length > 0) {
    const plan = findBestSequence(remaining, loopBeats, rng);
    plans.push(plan);

    const assignedIds = new Set(plan.assignments.map((assignment) => assignment.event.id));
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      if (assignedIds.has(remaining[index].id)) {
        remaining.splice(index, 1);
      }
    }
  }

  return plans;
}

/** Finds the largest exact event subset that can be produced by one animal profile and one shared loop. */
function findBestSequence(events: RhythmEvent[], loopBeats: number, rng: () => number): AnimalPlan {
  let bestScore = -Infinity;
  let bestPlan: AnimalPlan | undefined;

  for (const animalType of generatedAnimalTypes) {
    const profile = getAnimalProfile(animalType);
    const perimeterSteps = Math.round(profile.speed * loopBeats);
    if (Math.abs(perimeterSteps - profile.speed * loopBeats) > 1e-6 || perimeterSteps < 8 || perimeterSteps % 2 !== 0) {
      continue;
    }

    for (const seed of events) {
      const assignments: AssignedEvent[] = [];
      const usedSteps = new Set<number>();

      for (const event of events) {
        const rawStep = wrapBeat(event.beat - seed.beat, loopBeats) * profile.speed;
        const stepIndex = Math.round(rawStep);
        if (Math.abs(rawStep - stepIndex) > 1e-4 || stepIndex < 0 || stepIndex >= perimeterSteps) {
          continue;
        }

        if (usedSteps.has(stepIndex)) {
          continue;
        }

        usedSteps.add(stepIndex);
        assignments.push({ event, stepIndex });
      }

      if (assignments.length === 0) {
        continue;
      }

      assignments.sort((left, right) => left.stepIndex - right.stepIndex);
      const score = assignments.length * 100 + perimeterSteps * 0.35 - (generatedAnimalTypes.indexOf(animalType) * 0.2) + rng();
      if (score <= bestScore) {
        continue;
      }

      bestScore = score;
      bestPlan = {
        animalType,
        timbre: seed.timbre,
        perimeterSteps,
        startPhaseBeat: seed.beat,
        assignments,
      };
    }
  }

  if (bestPlan) {
    return bestPlan;
  }

  const fallbackEvent = events[0];
  return {
    animalType: "fox",
    timbre: fallbackEvent.timbre,
    perimeterSteps: Math.max(8, loopBeats * 2),
    startPhaseBeat: fallbackEvent.beat,
    assignments: [{ event: fallbackEvent, stepIndex: 0 }],
  };
}

/** Builds a larger rectangular loop in the common arena so animals can overlap and share trigger cells. */
function buildSharedLoopPath(
  perimeterSteps: number,
  index: number,
  center: Vec2,
  rng: () => number,
  attempt: number,
): Vec2[] {
  const halfPerimeter = perimeterSteps / 2;
  const minSpan = 2;
  const preferredX = Math.max(minSpan, Math.round(halfPerimeter * (0.3 + rng() * 0.25)));
  const spanX = clamp(preferredX + ((index + attempt) % 3), minSpan, halfPerimeter - minSpan);
  const spanY = Math.max(minSpan, halfPerimeter - spanX);
  const offset = sharedOffsets[(index + attempt) % sharedOffsets.length];
  const origin = {
    x: center.x - Math.floor(spanX / 2) + offset.x + Math.floor(attempt / sharedOffsets.length),
    y: center.y - Math.floor(spanY / 2) + offset.y + ((attempt % 2 === 0) ? 0 : -1),
  };

  return buildRectangleLoop(origin, spanX, spanY);
}

/** Builds a unit-step rectangular loop with exactly `2 * (spanX + spanY)` waypoint cells. */
function buildRectangleLoop(origin: Vec2, spanX: number, spanY: number) {
  const points: Vec2[] = [];

  for (let x = 0; x < spanX; x += 1) {
    points.push({ x: origin.x + x, y: origin.y });
  }

  for (let y = 0; y < spanY; y += 1) {
    points.push({ x: origin.x + spanX, y: origin.y + y });
  }

  for (let x = 0; x < spanX; x += 1) {
    points.push({ x: origin.x + spanX - x, y: origin.y + spanY });
  }

  for (let y = 0; y < spanY; y += 1) {
    points.push({ x: origin.x, y: origin.y + spanY - y });
  }

  return points;
}

/** Packs generated geometry into a tight positive board rectangle with configurable padding. */
function normalizeGeneratedLayout(animals: AnimalDefinition[], placements: Placement[], padding: number) {
  const allPoints = animals.flatMap((animal) => animal.path.waypoints).concat(placements.map((placement) => placement.origin));
  const minX = Math.min(...allPoints.map((point) => point.x));
  const maxX = Math.max(...allPoints.map((point) => point.x));
  const minY = Math.min(...allPoints.map((point) => point.y));
  const maxY = Math.max(...allPoints.map((point) => point.y));
  const shiftX = padding - minX;
  const shiftY = padding - minY;

  return {
    board: {
      width: maxX - minX + padding * 2 + 1,
      height: maxY - minY + padding * 2 + 1,
    },
    animals: animals.map((animal) => ({
      ...animal,
      path: {
        ...animal.path,
        waypoints: animal.path.waypoints.map((point) => ({
          x: point.x + shiftX,
          y: point.y + shiftY,
        })),
      },
    })),
    placements: placements.map((placement) => ({
      ...placement,
      origin: {
        x: placement.origin.x + shiftX,
        y: placement.origin.y + shiftY,
      },
    })),
  };
}

/** Wraps a beat offset into the loop range. */
function wrapBeat(beat: number, loopBeats: number) {
  const wrapped = beat % loopBeats;
  return wrapped < 0 ? wrapped + loopBeats : wrapped;
}

/** Clamps a numeric value to the provided inclusive range. */
function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Creates a deterministic numeric seed from a string payload. */
function hashSeed(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Creates a deterministic pseudo-random number generator from a seed. */
function createRng(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}
