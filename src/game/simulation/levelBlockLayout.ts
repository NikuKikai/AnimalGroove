import type { AnimalDefinition, LevelBlock, Placement, Vec2 } from "../types";

export type LevelBlockDraft = {
  blockId: string;
  name: string;
  width: number;
  height: number;
  timbre: string;
  canRotate?: boolean;
  color: string;
  solutionOrigin: Vec2;
  solutionRotation: 0 | 90;
  includeInSolution?: boolean;
};

type MaterializedLevelLayout = {
  animals: AnimalDefinition[];
  blocks: LevelBlock[];
  board: {
    width: number;
    height: number;
    blockedCells?: Vec2[];
  };
  referenceSolution: Placement[];
};

type LayoutOptions = {
  blockedCells?: Vec2[];
  rng?: () => number;
};

/** Builds concrete block instances with authored initial placements around the outside of the path area. */
export function materializeLevelLayout(
  animals: AnimalDefinition[],
  blockDrafts: LevelBlockDraft[],
  options: LayoutOptions = {},
): MaterializedLevelLayout {
  const rng = options.rng ?? Math.random;
  const pathCells = buildPathCellSet(animals);
  const initialPlacements = createInitialPlacements(blockDrafts, pathCells, options.blockedCells ?? [], rng);
  const blocks: LevelBlock[] = blockDrafts.map((draft, index) => {
    const pieceId = `${draft.blockId}-${index}`;
    const initialPlacement = initialPlacements[index];
    return {
      blockId: draft.blockId,
      pieceId,
      name: draft.name,
      width: draft.width,
      height: draft.height,
      canRotate: draft.canRotate,
      color: draft.color,
      initialPlacement: {
        origin: initialPlacement?.origin ?? draft.solutionOrigin,
        rotation: initialPlacement?.rotation ?? draft.solutionRotation,
      },
    };
  });

  const referenceSolution: Placement[] = blockDrafts
    .map((draft, index) => ({ draft, index }))
    .filter(({ draft }) => draft.includeInSolution !== false)
    .map(({ draft, index }) => ({
      blockId: draft.blockId,
      pieceId: `${draft.blockId}-${index}`,
      origin: draft.solutionOrigin,
      rotation: draft.solutionRotation,
    }));

  return normalizeLevelLayout(animals, blocks, referenceSolution, options.blockedCells ?? []);
}

/** Collects every waypoint cell that belongs to any animal path. */
function buildPathCellSet(animals: AnimalDefinition[]) {
  const cells = new Set<string>();
  for (const animal of animals) {
    for (const point of animal.path.waypoints) {
      cells.add(cellKey(point));
    }
  }
  return cells;
}

/** Places all block instances near the path bounds while keeping them off the path and off each other. */
function createInitialPlacements(
  drafts: LevelBlockDraft[],
  pathCells: Set<string>,
  blockedCells: Vec2[],
  rng: () => number,
) {
  const pathPoints = [...pathCells].map(parseCellKey);
  const occupied = new Set(blockedCells.map(cellKey));
  const initialPlacements: Array<{ origin: Vec2; rotation: 0 | 90 }> = [];

  if (pathPoints.length === 0) {
    return drafts.map((draft, index) => ({
      origin: { x: index * (draft.width + 1), y: 0 },
      rotation: 0 as const,
    }));
  }

  const bounds = computeBounds(pathPoints);
  const sortedDrafts = [...drafts.entries()].sort((left, right) => {
    const leftArea = left[1].width * left[1].height;
    const rightArea = right[1].width * right[1].height;
    return rightArea - leftArea || left[0] - right[0];
  });

  for (const [draftIndex, draft] of sortedDrafts) {
    const candidate = findInitialPlacement(draft, bounds, pathCells, occupied, rng);
    initialPlacements[draftIndex] = candidate;
    for (const cell of getFootprintCells(draft, candidate.origin, candidate.rotation)) {
      occupied.add(cellKey(cell));
    }
  }

  return initialPlacements;
}

/** Picks one initial placement candidate from a shuffled set of nearby outer-ring positions. */
function findInitialPlacement(
  draft: LevelBlockDraft,
  bounds: Bounds,
  pathCells: Set<string>,
  occupied: Set<string>,
  rng: () => number,
) {
  const rotations: Array<0 | 90> = draft.canRotate === false ? [0] : [preferOuterRotation(draft), alternateRotation(preferOuterRotation(draft))];
  const candidates: Array<{ origin: Vec2; rotation: 0 | 90; score: number }> = [];

  for (const rotation of rotations) {
    for (const origin of enumerateOuterRingOrigins(bounds, draft, rotation)) {
      if (!isValidInitialPlacement(draft, origin, rotation, pathCells, occupied)) {
        continue;
      }

      const distanceScore = distanceToBounds(origin, draft, rotation, bounds);
      candidates.push({
        origin,
        rotation,
        score: distanceScore + rng() * 0.35,
      });
    }
  }

  if (candidates.length > 0) {
    candidates.sort((left, right) => left.score - right.score);
    return candidates[Math.min(3, candidates.length - 1)];
  }

  let fallbackOrigin = { x: bounds.maxX + 2, y: bounds.maxY + 2 };
  while (!isValidInitialPlacement(draft, fallbackOrigin, 0, pathCells, occupied)) {
    fallbackOrigin = { x: fallbackOrigin.x + 1, y: fallbackOrigin.y + 1 };
  }
  return { origin: fallbackOrigin, rotation: 0 as const };
}

/** Builds a sequence of outer-ring origins around the path bounds, close to but outside the route area. */
function enumerateOuterRingOrigins(bounds: Bounds, draft: LevelBlockDraft, rotation: 0 | 90) {
  const { width, height } = rotateDimensions(draft, rotation);
  const origins: Vec2[] = [];

  for (let ring = 1; ring <= 4; ring += 1) {
    const minX = bounds.minX - ring - width + 1;
    const maxX = bounds.maxX + ring;
    const minY = bounds.minY - ring - height + 1;
    const maxY = bounds.maxY + ring;

    for (let x = minX; x <= maxX; x += 1) {
      origins.push({ x, y: minY });
      origins.push({ x, y: maxY });
    }
    for (let y = minY + 1; y < maxY; y += 1) {
      origins.push({ x: minX, y });
      origins.push({ x: maxX, y });
    }
  }

  return dedupeOrigins(origins);
}

/** Rejects initial placements that overlap paths, blocked cells, or already occupied initial cells. */
function isValidInitialPlacement(
  draft: LevelBlockDraft,
  origin: Vec2,
  rotation: 0 | 90,
  pathCells: Set<string>,
  occupied: Set<string>,
) {
  for (const cell of getFootprintCells(draft, origin, rotation)) {
    const key = cellKey(cell);
    if (pathCells.has(key) || occupied.has(key)) {
      return false;
    }
  }
  return true;
}

/** Normalizes animals, initial placements, solutions, and blocked cells into a tight positive board rectangle. */
function normalizeLevelLayout(
  animals: AnimalDefinition[],
  blocks: LevelBlock[],
  referenceSolution: Placement[],
  blockedCells: Vec2[],
): MaterializedLevelLayout {
  const allPoints: Vec2[] = [];

  for (const animal of animals) {
    allPoints.push(...animal.path.waypoints);
  }

  for (const block of blocks) {
    allPoints.push(...getFootprintCells(block, block.initialPlacement.origin, block.initialPlacement.rotation));
  }

  for (const placement of referenceSolution) {
    const block = blocks.find((entry) => entry.pieceId === placement.pieceId);
    if (!block) {
      continue;
    }
    allPoints.push(...getFootprintCells(block, placement.origin, placement.rotation));
  }

  allPoints.push(...blockedCells);
  const bounds = computeBounds(allPoints);
  const shiftX = -bounds.minX;
  const shiftY = -bounds.minY;

  return {
    board: {
      width: bounds.maxX - bounds.minX + 1,
      height: bounds.maxY - bounds.minY + 1,
      blockedCells: blockedCells.length > 0
        ? blockedCells.map((cell) => ({ x: cell.x + shiftX, y: cell.y + shiftY }))
        : undefined,
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
    blocks: blocks.map((block) => ({
      ...block,
      initialPlacement: {
        ...block.initialPlacement,
        origin: {
          x: block.initialPlacement.origin.x + shiftX,
          y: block.initialPlacement.origin.y + shiftY,
        },
      },
    })),
    referenceSolution: referenceSolution.map((placement) => ({
      ...placement,
      origin: {
        x: placement.origin.x + shiftX,
        y: placement.origin.y + shiftY,
      },
    })),
  };
}

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

/** Computes the axis-aligned bounds of a set of cells. */
function computeBounds(points: Vec2[]): Bounds {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return { minX, minY, maxX, maxY };
}

/** Computes the current footprint size for one draft under a specific rotation. */
function rotateDimensions(block: { width: number; height: number }, rotation: 0 | 90) {
  if (rotation === 90) {
    return { width: block.height, height: block.width };
  }
  return { width: block.width, height: block.height };
}

/** Enumerates the integer cells covered by one block footprint. */
function getFootprintCells(
  block: { width: number; height: number },
  origin: Vec2,
  rotation: 0 | 90,
) {
  const { width, height } = rotateDimensions(block, rotation);
  const cells: Vec2[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      cells.push({ x: origin.x + x, y: origin.y + y });
    }
  }
  return cells;
}

/** Prefers rotations whose long edge runs tangentially to the outer ring. */
function preferOuterRotation(block: { width: number; height: number }): 0 | 90 {
  return block.width >= block.height ? 0 : 90;
}

/** Returns the opposite orthogonal rotation. */
function alternateRotation(rotation: 0 | 90): 0 | 90 {
  return rotation === 0 ? 90 : 0;
}

/** Estimates how far one candidate origin sits from the path bounds. */
function distanceToBounds(origin: Vec2, block: { width: number; height: number }, rotation: 0 | 90, bounds: Bounds) {
  const { width, height } = rotateDimensions(block, rotation);
  const leftGap = Math.max(0, bounds.minX - (origin.x + width - 1));
  const rightGap = Math.max(0, origin.x - bounds.maxX);
  const topGap = Math.max(0, bounds.minY - (origin.y + height - 1));
  const bottomGap = Math.max(0, origin.y - bounds.maxY);
  return leftGap + rightGap + topGap + bottomGap;
}

/** Deduplicates repeated origin candidates emitted by overlapping rings. */
function dedupeOrigins(origins: Vec2[]) {
  const seen = new Set<string>();
  const deduped: Vec2[] = [];
  for (const origin of origins) {
    const key = cellKey(origin);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(origin);
  }
  return deduped;
}

/** Serializes one grid cell into a stable string key. */
function cellKey(cell: Vec2) {
  return `${cell.x},${cell.y}`;
}

/** Parses a string cell key back into numeric coordinates. */
function parseCellKey(key: string): Vec2 {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
}
