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

    const lane = options.lanes[step % options.lanes.length];
    const timbre = options.timbres[(step + Math.floor(rng() * options.timbres.length)) % options.timbres.length];
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
