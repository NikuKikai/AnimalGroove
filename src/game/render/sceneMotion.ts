import * as THREE from "three";
import { computePathMetrics } from "../simulation";

/** Computes a small lateral offset so overlapping debug paths remain visually separable. */
export function computePathOffset(waypoints: { x: number; y: number }[], index: number, strength: number) {
  const previous = waypoints[(index - 1 + waypoints.length) % waypoints.length];
  const next = waypoints[(index + 1) % waypoints.length];
  const tangent = new THREE.Vector2(next.x - previous.x, next.y - previous.y);
  if (tangent.lengthSq() < 1e-6) {
    return { x: 0, y: 0 };
  }

  tangent.normalize();
  return {
    x: -tangent.y * strength,
    y: tangent.x * strength,
  };
}

/** Samples an animal's closed-loop position and jump height at a beat. */
export function sampleAnimalPosition(
  waypoints: { x: number; y: number }[],
  speed: number,
  beat: number,
  startPhaseBeat: number,
) {
  const metrics = computePathMetrics(waypoints);
  if (metrics.totalLength === 0) {
    return { ...waypoints[0], jumpHeight: 0 };
  }

  const safeSpeed = Math.max(speed, 0.0001);
  const cycleBeats = metrics.totalLength / safeSpeed;
  const relativeBeat = cycleBeats <= 0 ? 0 : (((beat - startPhaseBeat) % cycleBeats) + cycleBeats) % cycleBeats;
  const traveledDistance = relativeBeat * safeSpeed;
  const targetDistance = ((traveledDistance % metrics.totalLength) + metrics.totalLength) % metrics.totalLength;
  let segmentIndex = 0;
  for (let index = 0; index < metrics.segmentLengths.length; index += 1) {
    if (targetDistance <= metrics.cumulativeLengths[index + 1]) {
      segmentIndex = index;
      break;
    }
  }

  const nextIndex = (segmentIndex + 1) % waypoints.length;
  const segmentStart = metrics.cumulativeLengths[segmentIndex];
  const segmentLength = metrics.segmentLengths[segmentIndex] || 1;
  const localT = (targetDistance - segmentStart) / segmentLength;
  const current = waypoints[segmentIndex];
  const next = waypoints[nextIndex];
  const jumpHeight = Math.sin(localT * Math.PI) * 0.55;

  return {
    x: THREE.MathUtils.lerp(current.x, next.x, localT),
    y: THREE.MathUtils.lerp(current.y, next.y, localT),
    jumpHeight,
  };
}

/** Computes positive wrapped beat delta within one loop. */
export function normalizedBeatDelta(currentBeat: number, targetBeat: number, loopBeats: number) {
  const raw = currentBeat - targetBeat;
  return raw >= 0 ? raw : raw + loopBeats;
}
