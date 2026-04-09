import type { Placement } from "../types";

export type PreviewPlacement = {
  placement: Placement;
  valid: boolean;
};

export type StashPiece = {
  pieceId: string;
  blockId: string;
  rotation: 0 | 90;
  worldX: number;
  worldZ: number;
};

export type HitPulse = {
  id: string;
  beat: number;
  state: "matched" | "wrong" | "empty";
  cell: { x: number; y: number };
};

export type SceneHit =
  | { kind: "stash"; pieceId: string; blockId: string }
  | { kind: "placement"; placement: Placement };
