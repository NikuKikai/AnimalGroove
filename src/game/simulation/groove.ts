import type { GrooveGenerationOptions, RhythmEvent } from "../types";

/** Creates a deterministic pseudo-random number generator from a seed. */
function createRng(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

/** Generates a simple step-based groove using weighted random density. */
export function generateGroove(options: GrooveGenerationOptions): RhythmEvent[] {
  const rng = createRng(options.seed ?? 1337);
  const subdivision = 0.25;
  const steps = Math.round(options.loopBeats / subdivision);
  const notes: RhythmEvent[] = [];
  const density = Math.min(1, Math.max(0.1, options.density));

  for (let step = 0; step < steps; step += 1) {
    const beat = step * subdivision;
    const strongBeat = step % 4 === 0;
    const offBeat = step % 2 === 0;
    const threshold = strongBeat ? density + 0.2 : offBeat ? density * 0.8 : density * 0.45;

    if (rng() > threshold) {
      continue;
    }

    const timbre = pickTimbre(options.timbres, rng);
    const lane = inferLaneFromTimbre(timbre, options.lanes);
    notes.push({
      id: `groove-${step}`,
      lane,
      beat,
      timbre,
      velocity: strongBeat ? 1 : 0.8,
    });
  }

  return notes;
}

/** Picks one timbre using a weighted distribution that favors drum timbres over foley timbres. */
function pickTimbre(timbres: string[], rng: () => number) {
  if (timbres.length === 0) {
    return "kick";
  }

  const weighted = timbres.map((timbre) => ({
    timbre,
    weight: getTimbreWeight(timbre),
  }));
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = rng() * totalWeight;
  for (const entry of weighted) {
    cursor -= entry.weight;
    if (cursor <= 0) {
      return entry.timbre;
    }
  }
  return weighted[weighted.length - 1].timbre;
}

/** Returns a stable generation weight for one timbre family. */
function getTimbreWeight(timbre: string) {
  switch (timbre.toLowerCase()) {
    case "kick":
      return 1.55;
    case "snare":
      return 1.3;
    case "hat":
      return 1.1;
    case "sand":
      return 0.55;
    case "puddle":
      return 0.5;
    case "leaf":
      return 0.42;
    default:
      return 0.9;
  }
}

/** Resolves a lane from timbre first, then falls back to configured lanes. */
function inferLaneFromTimbre(timbre: string, lanes: string[]) {
  const normalized = timbre.toLowerCase();
  if (normalized === "sand" || normalized === "puddle" || normalized === "leaf") {
    return lanes.includes("foley") ? "foley" : lanes[0] ?? "foley";
  }
  if (normalized === "hat") {
    return lanes.includes("perc") ? "perc" : lanes[0] ?? "perc";
  }
  return lanes.includes("drums") ? "drums" : lanes[0] ?? "drums";
}
