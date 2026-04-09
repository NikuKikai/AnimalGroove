import { getAnimalProfile } from "../engine/animalRegistry";
import { defineLevel } from "../engine/levelDsl";
import { defaultAnimalModelRegistry } from "../assets/modelAssets";
import type { AnimalDefinition, LevelDefinition, Placement, PlaceableBlock, Vec2 } from "../types";
import { evaluatePlacements } from "./judge";
import { sampleAnimalPathVisits } from "./utils";

const generatedAnimalTypes = ["fox", "dog", "bee", "tiger", "parrot", "bunny"];
const timbrePalette = {
  kick: "#ffaf45",
  snare: "#58c4dd",
  hat: "#ffc857",
};

type PathFirstGenerationOptions = {
  loopBeats?: number;
  animalCount?: number;
  seed?: number;
};

type CellVisit = {
  beat: number;
  animalId: string;
};

type CellStat = {
  cell: Vec2;
  visits: CellVisit[];
  animals: Set<string>;
  score: number;
};

type RectanglePlacementDraft = {
  origin: Vec2;
  width: number;
  height: number;
  timbre: "kick" | "snare" | "hat";
};

type CandidateRectangle = RectanglePlacementDraft & {
  score: number;
  center: Vec2;
};

/** Builds a level by generating animal paths first, then deriving blocks and groove from the resulting traffic. */
export function generateLevelFromPaths(id: string, options: PathFirstGenerationOptions = {}): LevelDefinition {
  const loopBeats = options.loopBeats ?? [6, 8][(options.seed ?? Date.now()) % 2];
  const animalCount = options.animalCount ?? 3;
  const rng = createRng(options.seed ?? hashSeed(id));
  const animals = buildAnimals(loopBeats, animalCount, rng);
  const cellStats = buildCellStats(animals, loopBeats);
  const placementDrafts = buildStructuredPlacements(cellStats, animals, loopBeats, rng);
  const { inventory, placements } = buildInventoryAndPlacements(placementDrafts);

  let level = defineLevel({
    id,
    name: `Generated ${id}`,
    description: "Auto-generated path-first puzzle",
    bpm: 112,
    loopBeats,
    board: { width: 1, height: 1 },
    animals,
    inventory,
    targetRhythm: [],
    judge: { beatTolerance: 0.12 },
    models: defaultAnimalModelRegistry,
    referenceSolution: placements,
  });

  const normalized = normalizeGeneratedLayout(level.animals, placements, inventory);
  level = defineLevel({
    ...level,
    board: normalized.board,
    animals: normalized.animals,
    referenceSolution: normalized.placements,
  });

  const simulation = evaluatePlacements(level, normalized.placements);
  const targetRhythm = simulation.producedTriggers
    .sort((left, right) => left.beat - right.beat || left.id.localeCompare(right.id))
    .map((trigger, index) => ({
      id: `path-note-${index}`,
      lane: trigger.timbre === "hat" ? "perc" : "drums",
      beat: Number(trigger.beat.toFixed(3)),
      timbre: trigger.timbre,
      velocity: Math.min(1.2, 0.6 + trigger.weight * 0.3),
    }));

  return defineLevel({
    ...level,
    targetRhythm,
  });
}

/** Builds several shared-space animal loops with mixed sizes and partial overlap. */
function buildAnimals(loopBeats: number, animalCount: number, rng: () => number) {
  const animals: AnimalDefinition[] = [];
  const occupied = new Set<string>();

  for (let index = 0; index < animalCount; index += 1) {
    const animalType = generatedAnimalTypes[index % generatedAnimalTypes.length];
    const profile = getAnimalProfile(animalType);
    const pathLength = Math.round(profile.speed * loopBeats);
    const path = buildRandomLoopPath(pathLength, occupied, rng, index);

    for (const point of path) {
      if (rng() < 0.55) {
        occupied.add(`${point.x},${point.y}`);
      }
    }

    animals.push({
      id: `animal-${index + 1}`,
      name: `${animalType} runner ${index + 1}`,
      animalType,
      timbre: ["kick", "snare", "hat"][index % 3],
      path: {
        waypoints: path,
        startPhaseBeat: Number((rng() * loopBeats).toFixed(2)),
      },
    });
  }

  return animals;
}

/** Builds a spaced set of structured rectangles directly from path traffic statistics. */
function buildStructuredPlacements(
  cellStats: Map<string, CellStat>,
  animals: AnimalDefinition[],
  loopBeats: number,
  rng: () => number,
) {
  const candidates = enumerateCandidateRectangles(cellStats, animals, loopBeats, rng);
  const selected: CandidateRectangle[] = [];
  const targetCount = Math.min(Math.max(animals.length * 2, 5), 8);
  const shapeUsage = new Map<string, number>();
  const heatBuckets = bucketCandidatesByHeat(candidates);
  const spatialBuckets = bucketCandidatesByRegion(candidates);

  seedSelections(heatBuckets, selected, shapeUsage);
  seedSelections(spatialBuckets, selected, shapeUsage);

  while (selected.length < targetCount) {
    const best = chooseBestCandidate(candidates, selected, shapeUsage);
    if (!best) {
      break;
    }

    selected.push(best);
    const shapeKey = `${Math.min(best.width, best.height)}x${Math.max(best.width, best.height)}`;
    shapeUsage.set(shapeKey, (shapeUsage.get(shapeKey) ?? 0) + 1);
  }

  if (!selected.some((entry) => entry.width * entry.height === 1)) {
    const precise = candidates.find((entry) => entry.width === 1 && entry.height === 1 && !selected.some((picked) => rectanglesOverlap(picked, entry)));
    if (precise) {
      selected.push(precise);
    }
  }

  if (!selected.some((entry) => (entry.width === 1 && entry.height > 1) || (entry.height === 1 && entry.width > 1))) {
    const bridge = candidates.find(
      (entry) =>
        ((entry.width === 1 && entry.height > 1) || (entry.height === 1 && entry.width > 1)) &&
        !selected.some((picked) => rectanglesOverlap(picked, entry)),
    );
    if (bridge) {
      selected.push(bridge);
    }
  }

  ensureCoreTimbres(selected, candidates);
  return pruneRectangles(selected, animals, loopBeats);
}

/** Builds inventory block definitions and the matching reference placements from rectangle drafts. */
function buildInventoryAndPlacements(rectangles: RectanglePlacementDraft[]) {
  const grouped = new Map<string, { draft: RectanglePlacementDraft; quantity: number }>();

  for (const draft of rectangles) {
    const id = `${draft.timbre}-${draft.width}x${draft.height}`;
    const existing = grouped.get(id);
    if (existing) {
      existing.quantity += 1;
      continue;
    }

    grouped.set(id, { draft, quantity: 1 });
  }

  const inventory: PlaceableBlock[] = [...grouped.entries()].map(([id, entry]) => ({
    id,
    name: `${entry.draft.timbre} ${entry.draft.width}x${entry.draft.height}`,
    width: entry.draft.width,
    height: entry.draft.height,
    timbre: entry.draft.timbre,
    quantity: entry.quantity,
    canRotate: true,
    color: timbrePalette[entry.draft.timbre],
  }));

  const usage = new Map<string, number>();
  const placements: Placement[] = rectangles.map((draft) => {
    const id = `${draft.timbre}-${draft.width}x${draft.height}`;
    usage.set(id, (usage.get(id) ?? 0) + 1);
    return {
      blockId: id,
      origin: draft.origin,
      rotation: 0,
    };
  });

  return { inventory, placements };
}

/** Aggregates all animal visits by board cell and scores them for compact, shared block placement. */
function buildCellStats(animals: AnimalDefinition[], loopBeats: number) {
  const stats = new Map<string, CellStat>();

  for (const animal of animals) {
    for (const visit of sampleAnimalPathVisits(animal, loopBeats)) {
      const key = cellKey(visit.cell);
      const existing = stats.get(key) ?? {
        cell: visit.cell,
        visits: [],
        animals: new Set<string>(),
        score: 0,
      };
      existing.visits.push({ beat: visit.beat, animalId: visit.animalId });
      existing.animals.add(visit.animalId);
      stats.set(key, existing);
    }
  }

  for (const entry of stats.values()) {
    const sharedBonus = entry.animals.size > 1 ? 1.8 : 0;
    const beatBonus = entry.visits.reduce((sum, visit) => sum + rhythmWeight(visit.beat), 0);
    entry.score = entry.visits.length * 2.2 + sharedBonus + beatBonus;
  }

  return stats;
}

/** Prefers cells that land on strong beats, backbeats, or steady subdivisions. */
function rhythmWeight(beat: number) {
  const fraction = Math.abs(beat - Math.round(beat));
  if (fraction < 0.001) {
    return 1.6;
  }

  if (Math.abs(fraction - 0.5) < 0.001) {
    return 1.1;
  }

  if (Math.abs(fraction - 0.25) < 0.001 || Math.abs(fraction - 0.75) < 0.001) {
    return 0.7;
  }

  return 0.2;
}

/** Collects traffic stats for every cell covered by a candidate rectangle. */
function collectRectangleStats(origin: Vec2, width: number, height: number, selectedCells: Map<string, CellStat>) {
  const stats: CellStat[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const stat = selectedCells.get(cellKey({ x: origin.x + x, y: origin.y + y }));
      if (stat) {
        stats.push(stat);
      }
    }
  }
  return stats;
}

/** Enumerates and scores many rectangle candidates so the final solution can mix bridge, overlap, and precise tiles. */
function enumerateCandidateRectangles(
  cellStats: Map<string, CellStat>,
  animals: AnimalDefinition[],
  loopBeats: number,
  rng: () => number,
) {
  const cells = [...cellStats.values()];
  if (cells.length === 0) {
    return [];
  }

  const candidates: CandidateRectangle[] = [];
  const widths = [1, 2, 3, 4];
  const heights = [1, 2, 3, 4];

  for (const anchor of cells) {
    for (const width of widths) {
      for (const height of heights) {
        for (let offsetY = 0; offsetY < height; offsetY += 1) {
          for (let offsetX = 0; offsetX < width; offsetX += 1) {
            const origin = { x: anchor.cell.x - offsetX, y: anchor.cell.y - offsetY };
            const stats = collectRectangleStats(origin, width, height, cellStats);
            if (stats.length === 0) {
              continue;
            }

            const area = width * height;
            if (area >= 5) {
              continue;
            }
            if (coversConsecutivePathPoints(origin, width, height, animals)) {
              continue;
            }
            const totalScore = stats.reduce((sum, entry) => sum + entry.score, 0);
            const sharedBonus = stats.some((entry) => entry.animals.size > 1) ? 2.2 : 0;
            const spreadBonus = stats.length >= 2 && area > stats.length ? 1.1 : 0;
            const sizeBonus = area === 1 ? 0.25 : area <= 4 ? area * 0.42 : area * 0.16;
            const singleSparsePenalty = area > 1 && stats.length === 1 ? 3.5 : 0;
            const emptyPenalty = (area - stats.length) * 0.25;
            const denseClusterPenalty = stats.length >= 3 && averagePairDistance(stats.map((entry) => entry.cell)) < 1.35 ? 1.35 : 0;
            const giantPenalty = area >= 9 ? 2.8 : area >= 6 ? 0.8 : 0;
            const score =
              totalScore +
              sharedBonus +
              spreadBonus +
              sizeBonus -
              singleSparsePenalty -
              emptyPenalty -
              denseClusterPenalty -
              giantPenalty +
              rng() * 0.05;
            if (score <= 0.2) {
              continue;
            }

            candidates.push({
              origin,
              width,
              height,
              timbre: chooseRectangleTimbre(stats, loopBeats, rng),
              score,
              center: {
                x: origin.x + (width - 1) / 2,
                y: origin.y + (height - 1) / 2,
              },
            });
          }
        }
      }
    }
  }

  const deduped = new Map<string, CandidateRectangle>();
  for (const candidate of candidates) {
    const key = `${candidate.origin.x},${candidate.origin.y},${candidate.width},${candidate.height},${candidate.timbre}`;
    const previous = deduped.get(key);
    if (!previous || candidate.score > previous.score) {
      deduped.set(key, candidate);
    }
  }

  return [...deduped.values()].sort((left, right) => right.score - left.score);
}

/** Rejects rectangles that would fire on consecutive landings along the same animal path. */
function coversConsecutivePathPoints(origin: Vec2, width: number, height: number, animals: AnimalDefinition[]) {
  for (const animal of animals) {
    const waypoints = animal.path.waypoints;
    for (let index = 0; index < waypoints.length; index += 1) {
      const current = waypoints[index];
      const next = waypoints[(index + 1) % waypoints.length];
      if (isInsideRectangle(current, origin, width, height) && isInsideRectangle(next, origin, width, height)) {
        return true;
      }
    }
  }

  return false;
}

/** Checks whether one cell falls inside an axis-aligned rectangle footprint. */
function isInsideRectangle(cell: Vec2, origin: Vec2, width: number, height: number) {
  return (
    cell.x >= origin.x &&
    cell.x < origin.x + width &&
    cell.y >= origin.y &&
    cell.y < origin.y + height
  );
}

/** Splits candidates into score bands so blocks can be drawn from high, mid, and low complexity zones. */
function bucketCandidatesByHeat(candidates: CandidateRectangle[]) {
  if (candidates.length === 0) {
    return [];
  }

  const sorted = [...candidates].sort((left, right) => right.score - left.score);
  const highCut = Math.max(1, Math.floor(sorted.length * 0.2));
  const midCut = Math.max(highCut + 1, Math.floor(sorted.length * 0.55));

  return [sorted.slice(0, highCut), sorted.slice(highCut, midCut), sorted.slice(midCut)].filter((bucket) => bucket.length > 0);
}

/** Splits candidates into coarse spatial regions so the final layout cannot collapse into a single hotspot. */
function bucketCandidatesByRegion(candidates: CandidateRectangle[]) {
  if (candidates.length === 0) {
    return [];
  }

  const center = {
    x: candidates.reduce((sum, candidate) => sum + candidate.center.x, 0) / candidates.length,
    y: candidates.reduce((sum, candidate) => sum + candidate.center.y, 0) / candidates.length,
  };
  const buckets = new Map<string, CandidateRectangle[]>();

  for (const candidate of candidates) {
    const horizontal = candidate.center.x < center.x ? "left" : "right";
    const vertical = candidate.center.y < center.y ? "top" : "bottom";
    const key = `${horizontal}-${vertical}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(candidate);
    buckets.set(key, bucket);
  }

  return [...buckets.values()]
    .map((bucket) => bucket.sort((left, right) => right.score - left.score))
    .sort((left, right) => right[0].score - left[0].score);
}

/** Seeds selections from several buckets while respecting overlap and shape diversity. */
function seedSelections(
  buckets: CandidateRectangle[][],
  selected: CandidateRectangle[],
  shapeUsage: Map<string, number>,
) {
  for (const bucket of buckets) {
    const seeded = chooseBestCandidate(bucket, selected, shapeUsage);
    if (!seeded) {
      continue;
    }

    selected.push(seeded);
    const shapeKey = `${Math.min(seeded.width, seeded.height)}x${Math.max(seeded.width, seeded.height)}`;
    shapeUsage.set(shapeKey, (shapeUsage.get(shapeKey) ?? 0) + 1);
  }
}

/** Chooses the best next rectangle under spacing and shape-diversity constraints. */
function chooseBestCandidate(
  candidates: CandidateRectangle[],
  selected: CandidateRectangle[],
  shapeUsage: Map<string, number>,
) {
  let best: CandidateRectangle | undefined;
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    if (selected.some((entry) => rectanglesOverlap(entry, candidate))) {
      continue;
    }

    const shapeKey = `${Math.min(candidate.width, candidate.height)}x${Math.max(candidate.width, candidate.height)}`;
    const diversityPenalty = (shapeUsage.get(shapeKey) ?? 0) * 1.2;
    const spacingPenalty = selected.reduce((sum, entry) => sum + rectangleSpacingPenalty(entry, candidate), 0);
    const effectiveScore = candidate.score - spacingPenalty - diversityPenalty;
    if (effectiveScore > bestScore) {
      bestScore = effectiveScore;
      best = candidate;
    }
  }

  return bestScore < 0.35 ? undefined : best;
}

/** Ensures the final selection includes kick and snare when the candidate pool allows it. */
function ensureCoreTimbres(selected: CandidateRectangle[], candidates: CandidateRectangle[]) {
  const required: Array<"kick" | "snare"> = ["kick", "snare"];

  for (const timbre of required) {
    if (selected.some((entry) => entry.timbre === timbre)) {
      continue;
    }

    const replacement = candidates.find(
      (entry) =>
        entry.timbre === timbre &&
        !selected.some((picked) => picked !== entry && rectanglesOverlap(picked, entry)),
    );
    if (!replacement) {
      continue;
    }

    const removableIndex = selected.findIndex((entry) => entry.timbre === "hat");
    if (removableIndex >= 0) {
      selected.splice(removableIndex, 1, replacement);
    } else {
      selected.push(replacement);
    }
  }
}

/** Assigns an instrument role to one rectangle from the beats that pass through it. */
function chooseRectangleTimbre(stats: CellStat[], loopBeats: number, rng: () => number): "kick" | "snare" | "hat" {
  const kickAnchors = [0, loopBeats / 2];
  const snareAnchors = [loopBeats / 4, (loopBeats * 3) / 4];
  let kickScore = 0;
  let snareScore = 0;
  let hatScore = 0;

  for (const stat of stats) {
    for (const visit of stat.visits) {
      const beat = visit.beat;
      const nearestKick = Math.min(...kickAnchors.map((anchor) => circularDistance(beat, anchor, loopBeats)));
      const nearestSnare = Math.min(...snareAnchors.map((anchor) => circularDistance(beat, anchor, loopBeats)));
      kickScore += Math.max(0, 1.3 - nearestKick * 2.5);
      snareScore += Math.max(0, 1.1 - nearestSnare * 2.4);
      hatScore += 0.45 + (Math.abs(beat * 4 - Math.round(beat * 4)) < 0.001 ? 0.6 : 0);
    }
  }

  kickScore += 0.2 + rng() * 0.08;
  snareScore += 0.16 + rng() * 0.08;
  hatScore += rng() * 0.06;

  if (kickScore >= snareScore && kickScore >= hatScore) {
    return "kick";
  }

  if (snareScore >= hatScore) {
    return "snare";
  }

  return "hat";
}

/** Removes some rectangles if the derived groove would become too dense for a readable puzzle. */
function pruneRectangles(rectangles: RectanglePlacementDraft[], animals: AnimalDefinition[], loopBeats: number) {
  const drafts = [...rectangles];
  const maxNotes = Math.max(6, Math.round(loopBeats * 1.25));
  while (drafts.length > 1) {
    const { inventory, placements } = buildInventoryAndPlacements(drafts);
    const level = defineLevel({
      id: "prune-check",
      name: "Prune Check",
      description: "Temporary generation check",
      bpm: 112,
      loopBeats,
      board: { width: 32, height: 32 },
      animals,
      inventory,
      targetRhythm: [],
      judge: { beatTolerance: 0.12 },
      models: defaultAnimalModelRegistry,
      referenceSolution: placements,
    });
    const simulation = evaluatePlacements(level, placements);
    const noteCount = simulation.producedTriggers.length;
    const rhythmPenalty = evaluateRhythmDistribution(simulation.producedTriggers.map((trigger) => trigger.beat), loopBeats);
    if (noteCount <= maxNotes && rhythmPenalty <= 2.35) {
      break;
    }

    drafts.sort((left, right) => rectangleRemovalScore(left, animals, loopBeats) - rectangleRemovalScore(right, animals, loopBeats));
    drafts.shift();
  }

  return drafts;
}

/** Penalizes candidates that stack too tightly around already selected rectangles. */
function rectangleSpacingPenalty(left: CandidateRectangle, right: CandidateRectangle) {
  const centerDistance = manhattan(left.center, right.center);
  if (centerDistance <= 2) {
    return 7.5;
  }
  if (centerDistance <= 4) {
    return 3.6;
  }
  if (centerDistance <= 6) {
    return 1.3;
  }
  return 0;
}

/** Tests whether two rectangle placements overlap on the board. */
function rectanglesOverlap(left: RectanglePlacementDraft, right: RectanglePlacementDraft) {
  return !(
    left.origin.x + left.width <= right.origin.x ||
    right.origin.x + right.width <= left.origin.x ||
    left.origin.y + left.height <= right.origin.y ||
    right.origin.y + right.height <= left.origin.y
  );
}

/** Scores rectangles for pruning: remove giant generic blocks before more characterful smaller ones. */
function rectangleRemovalScore(rectangle: RectanglePlacementDraft, animals: AnimalDefinition[], loopBeats: number) {
  const area = rectangle.width * rectangle.height;
  const localPenalty = evaluateRectangleDensity(rectangle, animals, loopBeats);
  const elongatedBonus = rectangle.width === 1 || rectangle.height === 1 ? -1.2 : 0;
  const giantPenalty = area >= 9 ? 4 : area >= 6 ? 1.5 : 0;
  return area + giantPenalty + elongatedBonus + localPenalty;
}

/** Penalizes rectangles whose local traffic is already machine-gun dense or too temporally clustered. */
function evaluateRectangleDensity(rectangle: RectanglePlacementDraft, animals: AnimalDefinition[], loopBeats: number) {
  const beats: number[] = [];
  for (const animal of animals) {
    for (const visit of sampleAnimalPathVisits(animal, loopBeats)) {
      if (
        visit.cell.x >= rectangle.origin.x &&
        visit.cell.x < rectangle.origin.x + rectangle.width &&
        visit.cell.y >= rectangle.origin.y &&
        visit.cell.y < rectangle.origin.y + rectangle.height
      ) {
        beats.push(visit.beat);
      }
    }
  }

  return evaluateRhythmDistribution(beats, loopBeats);
}

/** Scores whether note beats are too clustered or leave too much empty time in the loop. */
function evaluateRhythmDistribution(beats: number[], loopBeats: number) {
  if (beats.length <= 1) {
    return 0;
  }

  const sorted = [...beats].sort((left, right) => left - right);
  const gaps: number[] = [];
  let densePenalty = 0;

  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    const next = index === sorted.length - 1 ? sorted[0] + loopBeats : sorted[index + 1];
    const gap = next - current;
    gaps.push(gap);
    if (gap < 0.34) {
      densePenalty += (0.34 - gap) * 8;
    }
  }

  const longestGap = Math.max(...gaps);
  const emptyPenalty = longestGap > loopBeats * 0.4 ? (longestGap - loopBeats * 0.4) * 2.6 : 0;
  return densePenalty + emptyPenalty;
}

/** Computes the average pairwise Manhattan distance inside one set of cells. */
function averagePairDistance(cells: Vec2[]) {
  if (cells.length <= 1) {
    return 0;
  }

  let total = 0;
  let pairs = 0;
  for (let left = 0; left < cells.length; left += 1) {
    for (let right = left + 1; right < cells.length; right += 1) {
      total += manhattan(cells[left], cells[right]);
      pairs += 1;
    }
  }

  return total / Math.max(1, pairs);
}

/** Generates one random self-avoiding closed loop and softly biases later loops toward existing traffic. */
function buildRandomLoopPath(length: number, occupied: Set<string>, rng: () => number, index: number) {
  const radius = Math.max(4, Math.ceil(length / 4));

  for (let attempt = 0; attempt < 160; attempt += 1) {
    const start = {
      x: Math.round((rng() - 0.5) * 4) + (index % 2),
      y: Math.round((rng() - 0.5) * 4) - (index % 3),
    };
    const path = searchLoopPath(length, start, occupied, radius + attempt % 3, rng);
    if (path) {
      return path;
    }
  }

  return buildFallbackRectangle(length, index);
}

/** Backtracks a grid walk until it closes into a simple cycle with the requested number of cells. */
function searchLoopPath(length: number, start: Vec2, occupied: Set<string>, radius: number, rng: () => number) {
  const path: Vec2[] = [start];
  const visited = new Set([cellKey(start)]);
  let exploredStates = 0;
  const maxExploredStates = Math.max(1800, length * 140);

  function dfs(): boolean {
    exploredStates += 1;
    if (exploredStates > maxExploredStates) {
      return false;
    }

    const current = path[path.length - 1];
    const remainingEdges = length - path.length;

    if (path.length === length) {
      return manhattan(current, start) === 1;
    }

    const candidates = getNeighborCells(current)
      .filter((candidate) => !visited.has(cellKey(candidate)))
      .filter((candidate) => Math.abs(candidate.x - start.x) <= radius && Math.abs(candidate.y - start.y) <= radius)
      .filter((candidate) => {
        const distanceToStart = manhattan(candidate, start);
        return distanceToStart <= remainingEdges && (remainingEdges - distanceToStart) % 2 === 0;
      })
      .sort((left, right) => scoreCandidate(right, occupied, start, rng) - scoreCandidate(left, occupied, start, rng));

    for (const candidate of candidates) {
      path.push(candidate);
      visited.add(cellKey(candidate));
      if (dfs()) {
        return true;
      }
      path.pop();
      visited.delete(cellKey(candidate));
    }

    return false;
  }

  return dfs() ? path : undefined;
}

/** Scores one loop extension candidate, favoring moderate overlap and central shared-space motion. */
function scoreCandidate(candidate: Vec2, occupied: Set<string>, start: Vec2, rng: () => number) {
  const overlapBonus = occupied.has(cellKey(candidate)) ? 1.4 : 0;
  const centerBias = -manhattan(candidate, start) * 0.08;
  return overlapBonus + centerBias + rng() * 0.2;
}

/** Returns the four orthogonal neighbor cells around one grid point. */
function getNeighborCells(cell: Vec2) {
  return [
    { x: cell.x + 1, y: cell.y },
    { x: cell.x - 1, y: cell.y },
    { x: cell.x, y: cell.y + 1 },
    { x: cell.x, y: cell.y - 1 },
  ];
}

/** Falls back to an offset rectangle when the random loop search cannot close cleanly. */
function buildFallbackRectangle(length: number, index: number) {
  const half = Math.max(4, Math.floor(length / 2));
  const width = Math.max(2, Math.floor(half / 2));
  const height = Math.max(2, half - width);
  const origin = { x: index - Math.floor(width / 2), y: -Math.floor(height / 2) };
  const points: Vec2[] = [];

  for (let x = 0; x < width; x += 1) {
    points.push({ x: origin.x + x, y: origin.y });
  }
  for (let y = 0; y < height; y += 1) {
    points.push({ x: origin.x + width, y: origin.y + y });
  }
  for (let x = 0; x < width; x += 1) {
    points.push({ x: origin.x + width - x, y: origin.y + height });
  }
  for (let y = 0; y < height; y += 1) {
    points.push({ x: origin.x, y: origin.y + height - y });
  }

  return points.slice(0, length);
}

/** Packs generated geometry into the smallest positive board rectangle that still contains routes and solved blocks. */
function normalizeGeneratedLayout(animals: AnimalDefinition[], placements: Placement[], inventory: PlaceableBlock[]) {
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

/** Computes Manhattan distance on the board grid. */
function manhattan(left: Vec2, right: Vec2) {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

/** Computes wrapped beat distance for groove-role scoring. */
function circularDistance(left: number, right: number, loopBeats: number) {
  const raw = Math.abs(left - right) % loopBeats;
  return Math.min(raw, loopBeats - raw);
}

/** Builds a stable key for one grid cell. */
function cellKey(cell: Vec2) {
  return `${cell.x},${cell.y}`;
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
