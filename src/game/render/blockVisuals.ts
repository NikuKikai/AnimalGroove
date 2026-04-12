import { resolveBlockTimbre } from "../engine/blockTimbre";
import type { BlockVisualKind, PlaceableBlock } from "../types";

/** Returns the visual presentation mode for a block kind. */
export function getBlockVisualKind(block: Pick<PlaceableBlock, "blockId">): BlockVisualKind {
  const normalizedTimbre = resolveBlockTimbre(block.blockId).toLowerCase();
  return normalizedTimbre === "sand" || normalizedTimbre === "puddle" ? "terrain" : "button";
}
