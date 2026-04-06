import type {
  AnimalDefinition,
  LevelDefinition,
  Placement,
  PlaceableBlock,
  TriggerEvent,
  Vec2,
} from "../types";

export type OccupiedCell = {
  placement: Placement;
  block: PlaceableBlock;
  cell: Vec2;
};

/** Returns the axis-aligned size of a block after applying rotation. */
export function rotateDimensions(block: PlaceableBlock, rotation: Placement["rotation"]) {
  if (rotation === 90) {
    return { width: block.height, height: block.width };
  }

  return { width: block.width, height: block.height };
}

/** Returns blocked cells as a string-keyed set for quick lookup. */
export function getBlockedCellSet(level: LevelDefinition) {
  return new Set((level.board.blockedCells ?? []).map((cell) => `${cell.x},${cell.y}`));
}

/** Builds a map from inventory block id to block definition. */
export function getInventoryMap(level: LevelDefinition) {
  return new Map(level.inventory.map((block) => [block.id, block]));
}

/** Expands a placement into the cells covered by its footprint. */
export function placementFootprint(block: PlaceableBlock, placement: Placement): Vec2[] {
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
  const inventoryMap = getInventoryMap(level);
  const blocked = getBlockedCellSet(level);
  const usedCounts = new Map<string, number>();
  const occupied = new Map<string, OccupiedCell>();

  for (const placement of placements) {
    const block = inventoryMap.get(placement.blockId);
    if (!block) {
      return { valid: false, reason: `Unknown block: ${placement.blockId}` };
    }

    if (placement.rotation === 90 && block.canRotate === false) {
      return { valid: false, reason: `Block cannot rotate: ${placement.blockId}` };
    }

    usedCounts.set(placement.blockId, (usedCounts.get(placement.blockId) ?? 0) + 1);
    if ((usedCounts.get(placement.blockId) ?? 0) > block.quantity) {
      return { valid: false, reason: `Block quantity exceeded: ${placement.blockId}` };
    }

    for (const cell of placementFootprint(block, placement)) {
      if (cell.x < 0 || cell.x >= level.board.width || cell.y < 0 || cell.y >= level.board.height) {
        return { valid: false, reason: `Block out of bounds: ${placement.blockId}` };
      }

      const key = `${cell.x},${cell.y}`;
      if (blocked.has(key)) {
        return { valid: false, reason: `Block on blocked cell: ${placement.blockId}` };
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
  const { waypoints, cycleBeats, startPhaseBeat = 0 } = animal.path;
  if (waypoints.length === 0) {
    return [];
  }

  const metrics = computePathMetrics(waypoints);
  const visits: PathVisit[] = [];
  const limit = includeTerminalLoop ? loopBeats + 1e-6 : loopBeats - 1e-6;

  for (let index = 0; index < waypoints.length; index += 1) {
    const distanceFraction =
      metrics.totalLength === 0 ? index / waypoints.length : metrics.cumulativeLengths[index] / metrics.totalLength;
    const beat = wrapBeat(startPhaseBeat + distanceFraction * cycleBeats, loopBeats);
    if (beat >= limit && !includeTerminalLoop) {
      continue;
    }

    visits.push({
      beat,
      cell: waypoints[index],
      animalId: animal.id,
    });
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
    const visits = sampleAnimalPathVisits(animal, level.loopBeats);
    let previousPlacementInstanceId: string | undefined;
    for (const visit of visits) {
      const key = `${visit.cell.x},${visit.cell.y}`;
      const hit = validation.occupied.get(key);
      const currentPlacementInstanceId = hit ? placementInstanceKey(hit.placement) : undefined;

      if (!hit) {
        previousPlacementInstanceId = undefined;
        continue;
      }

      if (currentPlacementInstanceId === previousPlacementInstanceId) {
        continue;
      }

      previousPlacementInstanceId = currentPlacementInstanceId;

      triggers.push({
        id: `${animal.id}-${hit.placement.blockId}-${visit.beat.toFixed(3)}-${visit.cell.x}-${visit.cell.y}`,
        beat: visit.beat,
        timbre: hit.block.timbre,
        animalId: animal.id,
        placementId: hit.placement.blockId,
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
  return `${placement.blockId}:${placement.origin.x}:${placement.origin.y}:${placement.rotation}`;
}
