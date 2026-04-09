import type {
  AnimalDefinition,
  LevelBlock,
  LevelDefinition,
  Placement,
  TriggerEvent,
  Vec2,
} from "../types";
import { getAnimalProfile } from "../engine/animalRegistry";

export type OccupiedCell = {
  placement: Placement;
  block: LevelBlock;
  cell: Vec2;
};

/** Returns the axis-aligned size of a block after applying rotation. */
export function rotateDimensions(block: LevelBlock, rotation: Placement["rotation"]) {
  if (rotation === 90) {
    return { width: block.height, height: block.width };
  }

  return { width: block.width, height: block.height };
}

/** Returns blocked cells as a string-keyed set for quick lookup. */
export function getBlockedCellSet(level: LevelDefinition) {
  return new Set((level.board.blockedCells ?? []).map((cell) => `${cell.x},${cell.y}`));
}

/** Builds a map from piece id to block definition. */
export function getBlockMap(level: LevelDefinition) {
  return new Map(level.blocks.map((block) => [block.pieceId, block]));
}

/** Returns the authored initial placements for a level. */
export function getInitialPlacements(level: LevelDefinition): Placement[] {
  return level.blocks.map((block) => ({
    blockId: block.blockId,
    pieceId: block.pieceId,
    origin: block.initialPlacement.origin,
    rotation: block.initialPlacement.rotation,
  }));
}

/** Expands a placement into the cells covered by its footprint. */
export function placementFootprint(block: LevelBlock, placement: Placement): Vec2[] {
  const { width, height } = rotateDimensions(block, placement.rotation);
  const footprint: Vec2[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      footprint.push({ x: placement.origin.x + x, y: placement.origin.y + y });
    }
  }

  return footprint;
}

/** Validates placements for bounds, overlap, blocked cells, and inventory counts. */
export function validatePlacements(level: LevelDefinition, placements: Placement[]) {
  const blockMap = getBlockMap(level);
  const blocked = getBlockedCellSet(level);
  const seenPieces = new Set<string>();
  const occupied = new Map<string, OccupiedCell>();

  for (const placement of placements) {
    const block = blockMap.get(placement.pieceId);
    if (!block) {
      return { valid: false, reason: `Unknown block piece: ${placement.pieceId}` };
    }

    if (block.blockId !== placement.blockId) {
      return { valid: false, reason: `Block id mismatch for piece: ${placement.pieceId}` };
    }

    if (placement.rotation === 90 && block.canRotate === false) {
      return { valid: false, reason: `Block cannot rotate: ${placement.pieceId}` };
    }

    if (seenPieces.has(placement.pieceId)) {
      return { valid: false, reason: `Duplicate block piece: ${placement.pieceId}` };
    }
    seenPieces.add(placement.pieceId);

    for (const cell of placementFootprint(block, placement)) {
      if (cell.x < 0 || cell.x >= level.board.width || cell.y < 0 || cell.y >= level.board.height) {
        return { valid: false, reason: `Block out of bounds: ${placement.pieceId}` };
      }

      const key = `${cell.x},${cell.y}`;
      if (blocked.has(key)) {
        return { valid: false, reason: `Block on blocked cell: ${placement.pieceId}` };
      }

      if (occupied.has(key)) {
        return { valid: false, reason: `Block overlap at ${key}` };
      }

      occupied.set(key, { placement, block, cell });
    }
  }

  return { valid: true, occupied };
}

type PathVisit = {
  beat: number;
  cell: Vec2;
  animalId: string;
};

type PathMetrics = {
  totalLength: number;
  segmentLengths: number[];
  cumulativeLengths: number[];
};

/** Samples the beat positions where an animal reaches its waypoint cells. */
export function sampleAnimalPathVisits(
  animal: AnimalDefinition,
  loopBeats: number,
  includeTerminalLoop = false,
): PathVisit[] {
  const { waypoints, startPhaseBeat = 0 } = animal.path;
  if (waypoints.length === 0) {
    return [];
  }

  const metrics = computePathMetrics(waypoints);
  const speed = Math.max(getAnimalProfile(animal.animalType).speed, 0.0001);
  const visits: PathVisit[] = [];
  const seen = new Set<string>();
  const epsilon = includeTerminalLoop ? 1e-3 : 1e-6;
  const limit = loopBeats + epsilon;
  const cycleBeats = metrics.totalLength / speed;
  if (cycleBeats <= 0) {
    return [];
  }

  for (let index = 0; index < waypoints.length; index += 1) {
    const waypointDistance = metrics.cumulativeLengths[index];
    const firstBeat = startPhaseBeat + waypointDistance / speed;
    const minCycle = Math.ceil((0 - firstBeat) / cycleBeats);
    const maxCycle = Math.floor((limit - firstBeat) / cycleBeats);

    for (let cycle = minCycle; cycle <= maxCycle; cycle += 1) {
      const beat = firstBeat + cycle * cycleBeats;
      if (beat < -epsilon || beat > limit) {
        continue;
      }

      const wrappedBeat = wrapBeat(beat, loopBeats);
      const visitKey = `${wrappedBeat.toFixed(6)}:${waypoints[index].x},${waypoints[index].y}`;
      if (seen.has(visitKey)) {
        continue;
      }

      seen.add(visitKey);
      visits.push({
        beat: wrappedBeat,
        cell: waypoints[index],
        animalId: animal.id,
      });
    }
  }

  return visits.sort((left, right) => left.beat - right.beat);
}

/** Builds trigger events from animal visits over placed blocks. */
export function buildTriggerEvents(level: LevelDefinition, placements: Placement[]): TriggerEvent[] {
  const validation = validatePlacements(level, placements);
  if (!validation.valid || !validation.occupied) {
    return [];
  }

  const triggers: TriggerEvent[] = [];
  const sortedAnimals = [...level.animals].sort((left, right) => left.id.localeCompare(right.id));

  for (const animal of sortedAnimals) {
    const profile = getAnimalProfile(animal.animalType);
    const visits = sampleAnimalPathVisits(animal, level.loopBeats);
    for (const visit of visits) {
      const key = `${visit.cell.x},${visit.cell.y}`;
      const hit = validation.occupied.get(key);

      if (!hit) {
        continue;
      }

      triggers.push({
        id: `${animal.id}-${hit.placement.pieceId}-${visit.beat.toFixed(3)}-${visit.cell.x}-${visit.cell.y}`,
        beat: visit.beat,
        timbre: hit.block.timbre,
        animalId: animal.id,
        animalType: animal.animalType,
        weight: profile.weight,
        effect: profile.effect,
        placementId: hit.placement.pieceId,
        placementInstanceId: placementInstanceKey(hit.placement),
        cell: visit.cell,
      });
    }
  }

  return triggers.sort((left, right) => left.beat - right.beat);
}

/** Wraps a beat value into the level loop range. */
export function wrapBeat(beat: number, loopBeats: number) {
  const wrapped = beat % loopBeats;
  return wrapped < 0 ? wrapped + loopBeats : wrapped;
}

/** Computes segment and cumulative distances for a closed waypoint loop. */
export function computePathMetrics(waypoints: Vec2[]): PathMetrics {
  const segmentLengths: number[] = [];
  const cumulativeLengths: number[] = [0];
  let totalLength = 0;

  for (let index = 0; index < waypoints.length; index += 1) {
    const current = waypoints[index];
    const next = waypoints[(index + 1) % waypoints.length];
    const length = Math.hypot(next.x - current.x, next.y - current.y);
    segmentLengths.push(length);
    totalLength += length;
    cumulativeLengths.push(totalLength);
  }

  return {
    totalLength,
    segmentLengths,
    cumulativeLengths,
  };
}

/** Produces a stable identifier for a concrete placed block instance. */
export function placementInstanceKey(placement: Placement) {
  return `${placement.pieceId}:${placement.origin.x}:${placement.origin.y}:${placement.rotation}`;
}
