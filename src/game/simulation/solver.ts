import type { LevelBlock, LevelDefinition, Placement, SolveResult, Vec2 } from "../types";
import { simulateLevel } from "./judge";
import { rotateDimensions, validatePlacements } from "./utils";

type CandidatePlacement = Placement;

/** Enumerates every in-bounds placement for one concrete block instance. */
function enumeratePlacementsForBlock(level: LevelDefinition, block: LevelBlock): CandidatePlacement[] {
  const rotations: Placement["rotation"][] = block.canRotate === false ? [0] : [0, 90];
  const candidates: CandidatePlacement[] = [];

  for (const rotation of rotations) {
    const { width, height } = rotateDimensions(block, rotation);
    for (let y = 0; y <= level.board.height - height; y += 1) {
      for (let x = 0; x <= level.board.width - width; x += 1) {
        candidates.push({
          blockId: block.blockId,
          pieceId: block.pieceId,
          origin: { x, y },
          rotation,
        });
      }
    }
  }

  return candidates;
}

/** Orders concrete block instances so larger footprints are searched first. */
function sortBlocksForSearch(level: LevelDefinition) {
  return [...level.blocks].sort((left, right) => {
    const leftArea = left.width * left.height;
    const rightArea = right.width * right.height;
    return rightArea - leftArea || left.pieceId.localeCompare(right.pieceId);
  });
}

/** Searches for a solved arrangement of all movable block instances. */
export function solveLevel(level: LevelDefinition): SolveResult {
  if (level.referenceSolution) {
    const simulation = simulateLevel(level, level.referenceSolution);
    return {
      solvable: simulation.solved,
      placements: level.referenceSolution,
      stats: {
        exploredStates: 1,
        candidatePlacements: level.referenceSolution.length,
        producedTriggers: simulation.producedTriggers.length,
      },
      simulation,
    };
  }

  const blocks = sortBlocksForSearch(level);
  const candidates = new Map<string, CandidatePlacement[]>(
    blocks.map((block) => [block.pieceId, enumeratePlacementsForBlock(level, block)]),
  );
  let exploredStates = 0;
  const best = { score: -1, placements: [] as Placement[] };

  /** Explores concrete block arrangements depth-first until a valid full solution is found. */
  function search(
    index: number,
    placements: Placement[],
  ): { placements: Placement[]; simulation: ReturnType<typeof simulateLevel> } | undefined {
    exploredStates += 1;

    const validation = validatePlacements(level, placements);
    if (!validation.valid) {
      return undefined;
    }

    const simulation = simulateLevel(level, placements);
    if (simulation.solved && placements.length === blocks.length) {
      return { placements: [...placements], simulation };
    }

    if (simulation.completion > best.score) {
      best.score = simulation.completion;
      best.placements = [...placements];
    }

    if (index >= blocks.length) {
      return undefined;
    }

    const block = blocks[index];
    const blockCandidates = candidates.get(block.pieceId) ?? [];

    for (const candidate of blockCandidates) {
      const result = search(index + 1, [...placements, candidate]);
      if (result) {
        return result;
      }
    }

    return undefined;
  }

  const solved = search(0, []);
  const finalPlacements = solved?.placements ?? best.placements;
  const simulation = simulateLevel(level, finalPlacements);

  return {
    solvable: solved !== undefined && simulation.solved,
    placements: finalPlacements,
    stats: {
      exploredStates,
      candidatePlacements: [...candidates.values()].reduce((sum, entries) => sum + entries.length, 0),
      producedTriggers: simulation.producedTriggers.length,
    },
    simulation,
  };
}

/** Converts placements into a set of occupied board cell keys. */
export function placementsToCellSet(placements: Placement[], blocks: LevelBlock[]) {
  const blockMap = new Map(blocks.map((block) => [block.pieceId, block]));
  const cells = new Set<string>();

  for (const placement of placements) {
    const block = blockMap.get(placement.pieceId);
    if (!block) {
      continue;
    }

    const { width, height } = rotateDimensions(block, placement.rotation);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        cells.add(`${placement.origin.x + x},${placement.origin.y + y}`);
      }
    }
  }

  return cells;
}

/** Lists all non-blocked cells that belong to the playable board. */
export function findOpenCells(level: LevelDefinition): Vec2[] {
  const blocked = new Set((level.board.blockedCells ?? []).map((cell) => `${cell.x},${cell.y}`));
  const cells: Vec2[] = [];

  for (let y = 0; y < level.board.height; y += 1) {
    for (let x = 0; x < level.board.width; x += 1) {
      if (!blocked.has(`${x},${y}`)) {
        cells.push({ x, y });
      }
    }
  }

  return cells;
}
