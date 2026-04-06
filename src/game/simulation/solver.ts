import type { LevelDefinition, Placement, PlaceableBlock, SolveResult, Vec2 } from "../types";
import { simulateLevel } from "./judge";
import { rotateDimensions, validatePlacements } from "./utils";

type CandidatePlacement = Placement;

/** Enumerates all in-bounds placements for a single inventory block. */
function enumeratePlacementsForBlock(level: LevelDefinition, block: PlaceableBlock): CandidatePlacement[] {
  const rotations: Placement["rotation"][] = block.canRotate === false ? [0] : [0, 90];
  const candidates: CandidatePlacement[] = [];

  for (const rotation of rotations) {
    const { width, height } = rotateDimensions(block, rotation);
    for (let y = 0; y <= level.board.height - height; y += 1) {
      for (let x = 0; x <= level.board.width - width; x += 1) {
        candidates.push({
          blockId: block.id,
          origin: { x, y },
          rotation,
        });
      }
    }
  }

  return candidates;
}

/** Orders blocks so larger pieces are searched earlier. */
function sortBlocksForSearch(level: LevelDefinition) {
  return [...level.inventory].sort((left, right) => {
    const leftArea = left.width * left.height;
    const rightArea = right.width * right.height;
    return rightArea - leftArea || left.id.localeCompare(right.id);
  });
}

/** Searches for a placement set that solves the given level. */
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
    blocks.map((block) => [block.id, enumeratePlacementsForBlock(level, block)]),
  );
  let exploredStates = 0;
  const best = { score: -1, placements: [] as Placement[] };

  /** Explores block placement combinations depth-first until a solution is found. */
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
    if (simulation.solved) {
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
    const blockCandidates = candidates.get(block.id) ?? [];

    const skip: { placements: Placement[]; simulation: ReturnType<typeof simulateLevel> } | undefined =
      search(index + 1, placements);
    if (skip) {
      return skip;
    }

    for (let count = 1; count <= block.quantity; count += 1) {
      const partialPlacements = choosePlacements(blockCandidates, count);
      for (const choice of partialPlacements) {
        const result: { placements: Placement[]; simulation: ReturnType<typeof simulateLevel> } | undefined =
          search(index + 1, [...placements, ...choice]);
        if (result) {
          return result;
        }
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

/** Produces k-combinations from an item list. */
function choosePlacements<T>(items: T[], count: number, start = 0, current: T[] = [], output: T[][] = []) {
  if (current.length === count) {
    output.push([...current]);
    return output;
  }

  for (let index = start; index < items.length; index += 1) {
    current.push(items[index]);
    choosePlacements(items, count, index + 1, current, output);
    current.pop();
  }

  return output;
}

/** Converts placements into a set of occupied board cell keys. */
export function placementsToCellSet(placements: Placement[], inventory: PlaceableBlock[]) {
  const blockMap = new Map(inventory.map((block) => [block.id, block]));
  const cells = new Set<string>();

  for (const placement of placements) {
    const block = blockMap.get(placement.blockId);
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
