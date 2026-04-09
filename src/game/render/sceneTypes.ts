import type { Placement } from "../types";

export type PreviewPlacement = {
  placement: Placement;
  valid: boolean;
};

export type HitPulse = {
  id: string;
  beat: number;
  state: "matched" | "wrong" | "empty";
  cell: { x: number; y: number };
};

export type SceneHit = { kind: "placement"; placement: Placement };
