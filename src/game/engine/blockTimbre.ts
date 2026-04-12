const explicitBlockTimbreMap: Record<string, string> = {
  "kick-pad": "kick",
  "snare-pad": "snare",
  "hat-bar": "hat",
  "hat-domino": "hat",
  "sand-tile": "sand",
  "sand-single": "sand",
  "puddle-tile": "puddle",
};

/** Resolves the timbre for a block kind from its block id. */
export function resolveBlockTimbre(blockId: string): string {
  const normalizedId = blockId.toLowerCase();
  if (explicitBlockTimbreMap[normalizedId]) {
    return explicitBlockTimbreMap[normalizedId];
  }

  const prefix = normalizedId.split("-")[0] ?? normalizedId;
  if (prefix === "kick" || prefix === "snare" || prefix === "hat" || prefix === "sand" || prefix === "puddle") {
    return prefix;
  }

  return "hat";
}

