export type Vec2 = {
  x: number;
  y: number;
};

export type RhythmEvent = {
  id: string;
  lane: string;
  beat: number;
  durationBeats?: number;
  timbre: string;
  velocity?: number;
};

export type AnimalPath = {
  waypoints: Vec2[];
  cycleBeats?: number;
  startPhaseBeat?: number;
};

export type AnimalDefinition = {
  id: string;
  name: string;
  animalType: string;
  path: AnimalPath;
};

export type AnimalProfile = {
  animalType: string;
  weight: number;
  speed: number;
  effect: string;
};

export type LevelBlock = {
  blockId: string;
  pieceId: string;
  name: string;
  width: number;
  height: number;
  canRotate?: boolean;
  color: string;
  initialPlacement: {
    origin: Vec2;
    rotation: 0 | 90;
  };
};

export type PlaceableBlock = LevelBlock;

export type BlockVisualKind = "terrain" | "button";

export type Placement = {
  blockId: string;
  pieceId: string;
  origin: Vec2;
  rotation: 0 | 90;
};

export type BoardDefinition = {
  width: number;
  height: number;
  blockedCells?: Vec2[];
};

export type StaticObstaclePlacement = {
  obstacleId: string;
  origin: Vec2;
  rotation: 0 | 90;
};

export type JudgeConfig = {
  beatTolerance: number;
};

export type ModelRegistry = Record<string, string>;

export type LevelDefinition = {
  id: string;
  name: string;
  description: string;
  bpm: number;
  loopBeats: number;
  board: BoardDefinition;
  animals: AnimalDefinition[];
  blocks: LevelBlock[];
  targetRhythm: RhythmEvent[];
  judge: JudgeConfig;
  models: ModelRegistry;
  staticObstacles?: StaticObstaclePlacement[];
  referenceSolution?: Placement[];
};

export type TriggerEvent = {
  id: string;
  beat: number;
  timbre: string;
  animalId: string;
  animalType: string;
  weight: number;
  effect: string;
  placementId: string;
  placementInstanceId: string;
  cell: Vec2;
};

export type NoteState = "pending" | "matched" | "missed" | "extra";

export type JudgedNote = RhythmEvent & {
  state: NoteState;
  matchedTriggerId?: string;
};

export type SimulationResult = {
  targetNotes: JudgedNote[];
  extraTriggers: TriggerEvent[];
  producedTriggers: TriggerEvent[];
  completion: number;
  solved: boolean;
};

export type GrooveGenerationOptions = {
  bpm: number;
  loopBeats: number;
  density: number;
  lanes: string[];
  timbres: string[];
  seed?: number;
};

export type SolveResult = {
  solvable: boolean;
  placements: Placement[];
  stats: {
    exploredStates: number;
    candidatePlacements: number;
    producedTriggers: number;
  };
  simulation?: SimulationResult;
};
