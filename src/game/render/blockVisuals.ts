import type { BlockVisualKind, PlaceableBlock } from "../types";

/** Returns the visual presentation mode for a block timbre. */
export function getBlockVisualKind(block: Pick<PlaceableBlock, "timbre">): BlockVisualKind {
  const normalizedTimbre = block.timbre.toLowerCase();
  return normalizedTimbre === "kick" || normalizedTimbre === "snare" ? "terrain" : "button";
}
