import type { RhythmEvent, TriggerEvent } from "../../game/types";

/** Collects deterministic lane order for timeline rows. */
export function collectTimelineLanes(targetRhythm: RhythmEvent[], producedTriggers: TriggerEvent[]) {
  const preferred = ["kick", "snare", "hat"];
  const seen = new Set<string>();
  const lanes: string[] = [];

  for (const lane of preferred) {
    if (targetRhythm.some((entry) => entry.timbre === lane) || producedTriggers.some((entry) => entry.timbre === lane)) {
      seen.add(lane);
      lanes.push(lane);
    }
  }

  for (const lane of targetRhythm.map((entry) => entry.timbre).concat(producedTriggers.map((entry) => entry.timbre))) {
    if (!seen.has(lane)) {
      seen.add(lane);
      lanes.push(lane);
    }
  }

  return lanes;
}

/** Computes an event-level IoU rhythm score using one-to-one timbre-aware matching. */
export function computeCurveMatchPercent(target: RhythmEvent[], produced: TriggerEvent[], loopBeats: number) {
  if (target.length === 0 && produced.length === 0) {
    return 100;
  }

  const tolerance = Math.max(0.08, loopBeats * 0.02);
  const usedProduced = new Set<string>();
  let matchedCount = 0;

  for (const note of target) {
    let best: TriggerEvent | undefined;
    let bestDistance = Infinity;

    for (const trigger of produced) {
      if (usedProduced.has(trigger.id) || trigger.timbre !== note.timbre) {
        continue;
      }

      const distance = wrappedBeatDistance(note.beat, trigger.beat, loopBeats);
      if (distance < bestDistance && distance <= tolerance) {
        best = trigger;
        bestDistance = distance;
      }
    }

    if (!best) {
      continue;
    }

    usedProduced.add(best.id);
    matchedCount += 1;
  }

  const misses = Math.max(0, target.length - matchedCount);
  const extras = Math.max(0, produced.length - matchedCount);
  if (misses === 0 && extras === 0) {
    return 100;
  }
  const union = target.length + produced.length - matchedCount;
  const iou = union <= 0 ? 0 : matchedCount / union;
  return Math.max(0, Math.min(100, iou * 100));
}

/** Builds a closed area path for target pulses using event velocity as height. */
export function buildPulseAreaPath(
  events: RhythmEvent[],
  loopBeats: number,
  viewWidth: number,
  viewHeight: number,
  normalizer: number,
) {
  return buildPulsePath(events, loopBeats, viewWidth, viewHeight, normalizer, "area", (event) => event.velocity ?? 1);
}

/** Builds a stroke-only pulse path for produced notes using animal weight as height. */
export function buildPulseLinePath(
  events: TriggerEvent[],
  loopBeats: number,
  viewWidth: number,
  viewHeight: number,
  normalizer: number,
) {
  return buildPulsePath(events, loopBeats, viewWidth, viewHeight, normalizer, "line", (event) => event.weight);
}

function buildPulsePath<T extends RhythmEvent | TriggerEvent>(
  events: T[],
  loopBeats: number,
  viewWidth: number,
  viewHeight: number,
  normalizer: number,
  mode: "area" | "line",
  getAmplitude: (event: T) => number,
) {
  const baseline = viewHeight - 1;
  const pulseBeatWidth = Math.max(0.08, loopBeats * 0.018);
  const segments: Array<{ leftBeat: number; rightBeat: number; amplitude: number }> = [];

  for (const event of events) {
    const amplitudeRaw = getAmplitude(event);
    const amplitude = Math.max(0.15, Math.min(1, amplitudeRaw / normalizer));
    const wrapped = buildWrappedPulseSegments(event.beat, pulseBeatWidth * 0.5, loopBeats);
    for (const segment of wrapped) {
      segments.push({
        leftBeat: segment.leftBeat,
        rightBeat: segment.rightBeat,
        amplitude,
      });
    }
  }

  const sorted = segments.sort((left, right) => left.leftBeat - right.leftBeat);
  let path = `M 0 ${baseline}`;

  for (const segment of sorted) {
    const topY = baseline - segment.amplitude * (viewHeight - 7);
    const leftX = (segment.leftBeat / loopBeats) * viewWidth;
    const rightX = (segment.rightBeat / loopBeats) * viewWidth;
    path += ` L ${leftX.toFixed(2)} ${baseline} L ${leftX.toFixed(2)} ${topY.toFixed(2)} L ${rightX.toFixed(2)} ${topY.toFixed(2)} L ${rightX.toFixed(2)} ${baseline}`;
  }

  path += mode === "area" ? ` L ${viewWidth} ${baseline} Z` : ` L ${viewWidth} ${baseline}`;
  return path;
}

/** Returns circular beat distance inside a looping timeline. */
function wrappedBeatDistance(left: number, right: number, loopBeats: number) {
  const raw = Math.abs(left - right) % loopBeats;
  return Math.min(raw, loopBeats - raw);
}

/** Splits one centered pulse into one or two in-range segments for looping timelines. */
function buildWrappedPulseSegments(centerBeat: number, halfWidth: number, loopBeats: number) {
  const left = centerBeat - halfWidth;
  const right = centerBeat + halfWidth;
  if (left >= 0 && right <= loopBeats) {
    return [{ leftBeat: left, rightBeat: right }];
  }

  if (left < 0) {
    return [
      { leftBeat: 0, rightBeat: right },
      { leftBeat: loopBeats + left, rightBeat: loopBeats },
    ];
  }

  if (right > loopBeats) {
    return [
      { leftBeat: left, rightBeat: loopBeats },
      { leftBeat: 0, rightBeat: right - loopBeats },
    ];
  }

  return [{ leftBeat: 0, rightBeat: 0 }];
}
