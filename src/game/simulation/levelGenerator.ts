import { getAnimalProfile } from "../engine/animalRegistry";
import { defineLevel } from "../engine/levelDsl";
import { defaultAnimalModelRegistry } from "../assets/modelAssets";
import type { AnimalDefinition, LevelDefinition, Placement, PlaceableBlock, RhythmEvent, Vec2 } from "../types";

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
  // The loop is represented as unit-length perimeter cells, so this also matches
  // the total geometric distance of the route.
  perimeterSteps: number;
  // This phase anchors step 0 to one concrete event beat.
  startPhaseBeat: number;
  assignments: AssignedEvent[];
};

/** Builds a solvable level from a groove while encouraging shared space and larger overlapping loops. */
export function generateLevelFromGroove(id: string, rhythm: RhythmEvent[]): LevelDefinition {
  const loopBeats = Math.max(4, Math.ceil(Math.max(...rhythm.map((event) => event.beat), 0) + 1));
  const timbres = [...new Set(rhythm.map((event) => event.timbre))];
  const rng = createRng(hashSeed(`${id}:${JSON.stringify(rhythm)}`));
  // First solve timing: partition target events into animal plans that can emit them exactly.
  const plans = timbres.flatMap((timbre) =>
    buildAnimalPlansForTimbre(
      rhythm.filter((event) => event.timbre === timbre).sort((left, right) => left.beat - right.beat),
      loopBeats,
      rng,
    ),
  );

  // Generate around the origin first, then pack the final result tightly afterward.
  const center = { x: 0, y: 0 };

  // Cells that are guaranteed to need a placed block for a specific timbre.
  const reservedPlacementCells = new Map<string, string>();
  // Cells already used by each path. Path overlap is allowed, but we still track timbre usage
  // so a new target block is not forced onto another timbre's route by accident.
  const reservedPathCells = new Map<string, Set<string>>();
  const animals: AnimalDefinition[] = plans.map((plan, index) => {
    let waypoints = buildSharedLoopPath(plan.perimeterSteps, index, center, rng, 0);

    for (let attempt = 0; attempt < 32; attempt += 1) {
      // A path may overlap another path, but it must not pass through a cell that is already
      // required as a different timbre's solution block.
      const crossesExistingPlacement = waypoints.some((point) => {
        const cellKey = `${point.x},${point.y}`;
        const reservedTimbre = reservedPlacementCells.get(cellKey);
        return Boolean(reservedTimbre && reservedTimbre !== plan.timbre);
      });

      // Symmetrically, the concrete solution cells for this plan should not be placed onto
      // another timbre's existing route, otherwise that foreign animal would create extras.
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

    // Record the full occupied route after the conflict search settles.
    for (const point of waypoints) {
      const cellKey = `${point.x},${point.y}`;
      const timbres = reservedPathCells.get(cellKey) ?? new Set<string>();
      timbres.add(plan.timbre);
      reservedPathCells.set(cellKey, timbres);
    }

    // Record only the cells that must become solution blocks.
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
      // If multiple same-timbre animals land on the same cell at their assigned beats,
      // keep one shared block there. This preserves the intended "one tile, many triggers" puzzle space.
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

  const normalized = normalizeGeneratedLayout(animals, [...placementMap.values()], inventory);

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
    models: defaultAnimalModelRegistry,
    referenceSolution: normalized.placements,
  });
}

/** Splits one timbre lane into as few exact runner plans as the current animal profiles allow. */
function buildAnimalPlansForTimbre(events: RhythmEvent[], loopBeats: number, rng: () => number): AnimalPlan[] {
  const remaining = [...events];
  const plans: AnimalPlan[] = [];

  while (remaining.length > 0) {
    // Greedily take the largest exact-fit subset each round. This biases the generator toward
    // fewer animals and therefore denser shared-space puzzles.
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
    // On generated loops we use unit-length steps, so speed * loopBeats must land on an integer
    // perimeter length. Odd perimeters are skipped because the current loop builder emits rectangles.
    const perimeterSteps = Math.round(profile.speed * loopBeats);
    if (Math.abs(perimeterSteps - profile.speed * loopBeats) > 1e-6 || perimeterSteps < 8 || perimeterSteps % 2 !== 0) {
      continue;
    }

    for (const seed of events) {
      const assignments: AssignedEvent[] = [];
      const usedSteps = new Set<number>();

      for (const event of events) {
        // Convert beat offsets into step offsets using the species speed.
        const rawStep = wrapBeat(event.beat - seed.beat, loopBeats) * profile.speed;
        const stepIndex = Math.round(rawStep);
        // Only accept exact fits. This keeps the generated reference solution lossless.
        if (Math.abs(rawStep - stepIndex) > 1e-4 || stepIndex < 0 || stepIndex >= perimeterSteps) {
          continue;
        }

        // One loop position can only carry one target event for this single animal plan.
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
      // Prefer plans that explain more notes. As a tiebreaker, slightly prefer longer loops
      // so the board does not collapse into lots of tiny circles.
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
  // A rectangle with side spans `spanX` and `spanY` has perimeter 2 * (spanX + spanY),
  // so we only need to split half the perimeter between the two axes.
  const preferredX = Math.max(minSpan, Math.round(halfPerimeter * (0.3 + rng() * 0.25)));
  const spanX = clamp(preferredX + ((index + attempt) % 3), minSpan, halfPerimeter - minSpan);
  const spanY = Math.max(minSpan, halfPerimeter - spanX);
  // Small deterministic offsets keep loops overlapping in one shared arena while still giving
  // retries somewhere else to go if they collide with protected cells.
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

/** Packs generated geometry into the smallest positive board rectangle that still contains routes and solved blocks. */
function normalizeGeneratedLayout(animals: AnimalDefinition[], placements: Placement[], inventory: PlaceableBlock[]) {
  // Everything is generated around the origin for convenience. Before returning the level,
  // translate the whole layout into positive board space and shrink the board to true occupied bounds.
  const inventoryById = new Map(inventory.map((block) => [block.id, block]));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const animal of animals) {
    for (const point of animal.path.waypoints) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }

  for (const placement of placements) {
    const block = inventoryById.get(placement.blockId);
    if (!block) {
      continue;
    }

    const width = placement.rotation === 90 ? block.height : block.width;
    const height = placement.rotation === 90 ? block.width : block.height;
    minX = Math.min(minX, placement.origin.x);
    minY = Math.min(minY, placement.origin.y);
    maxX = Math.max(maxX, placement.origin.x + width - 1);
    maxY = Math.max(maxY, placement.origin.y + height - 1);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return {
      board: { width: 1, height: 1 },
      animals,
      placements,
    };
  }

  const shiftX = -minX;
  const shiftY = -minY;

  return {
    board: {
      width: maxX - minX + 1,
      height: maxY - minY + 1,
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
