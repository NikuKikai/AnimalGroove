import { create } from "zustand";
import { ensembleLevel, tutorialLevel } from "../../data/levels";
import { evaluatePlacements, generateLevelFromPaths, solveLevel, validatePlacements } from "../simulation";
import type { LevelDefinition, Placement, SimulationResult } from "../types";

export type AudioChannelKey = "hit" | "reference" | "wrong";

export type AudioMixState = Record<AudioChannelKey, { volume: number; muted: boolean }>;

type GameState = {
  levels: LevelDefinition[];
  activeLevelId: string;
  generatedLevelId?: string;
  placements: Placement[];
  draggingBlockId?: string;
  draggingRotation: 0 | 90;
  dragPointer?: { x: number; y: number };
  isPlaying: boolean;
  showPaths: boolean;
  hintEnabled: boolean;
  currentBeat: number;
  simulation: SimulationResult;
  audioMix: AudioMixState;
  setActiveLevel: (levelId: string) => void;
  createRandomLevel: () => void;
  applySolution: () => void;
  setCurrentBeat: (beat: number) => void;
  togglePaths: () => void;
  setAudioVolume: (channel: AudioChannelKey, volume: number) => void;
  toggleAudioMute: (channel: AudioChannelKey) => void;
  startDrag: (blockId: string, pointer: { x: number; y: number }, rotation?: 0 | 90) => void;
  updateDragPointer: (pointer: { x: number; y: number }) => void;
  rotateDrag: () => void;
  endDrag: () => void;
  resetPlacements: () => void;
  placeBlock: (placement: Placement) => void;
  removePlacementAt: (x: number, y: number) => void;
};

const baseLevels = [tutorialLevel, ensembleLevel];

/** Resolves a level id to a concrete level definition. */
function getLevelById(levels: LevelDefinition[], levelId: string) {
  return levels.find((level) => level.id === levelId) ?? levels[0];
}

/** Computes the current judged simulation for a level and placement set. */
function computeSimulation(level: LevelDefinition, placements: Placement[]) {
  return evaluatePlacements(level, placements);
}

/** Builds a random but solvable test level and returns its generated identifier. */
function buildRandomLevel(serial: number) {
  const seed = Date.now() + serial * 9973;
  const loopBeatsOptions: readonly number[] = [6, 8];
  const loopBeats = loopBeatsOptions[seed % loopBeatsOptions.length] ?? 8;
  const levelId = `generated-${serial}`;
  const level = generateLevelFromPaths(levelId, {
    seed,
    loopBeats,
    animalCount: 2 + (seed % 2),
  });
  const bpm = 96 + (seed % 33);

  return {
    ...level,
    name: `Generated ${serial}`,
    description: `Random path-first test level ${serial}`,
    bpm,
  };
}

/** Central Zustand store for game state, placement state, and audio mix controls. */
export const useGameStore = create<GameState>((set, get) => {
  const initialLevel = baseLevels[0];
  const initialPlacements: Placement[] = [];

  return {
    levels: baseLevels,
    activeLevelId: initialLevel.id,
    placements: initialPlacements,
    draggingRotation: 0,
    isPlaying: true,
    showPaths: false,
    hintEnabled: false,
    currentBeat: 0,
    simulation: computeSimulation(initialLevel, initialPlacements),
    audioMix: {
      hit: { volume: 1.05, muted: false },
      reference: { volume: 0.18, muted: false },
      wrong: { volume: 0.4, muted: false },
    },
    setActiveLevel: (levelId) => {
      const nextLevel = getLevelById(get().levels, levelId);
      const placements: Placement[] = [];
      set({
        activeLevelId: nextLevel.id,
        placements,
        draggingBlockId: undefined,
        draggingRotation: 0,
        dragPointer: undefined,
        currentBeat: 0,
        simulation: computeSimulation(nextLevel, placements),
      });
    },
    createRandomLevel: () => {
      const generatedLevelId = get().generatedLevelId;
      const previousSerialMatch = generatedLevelId?.match(/(\d+)$/);
      const previousSerial = previousSerialMatch ? Number(previousSerialMatch[1]) || 0 : 0;
      const serial = previousSerial + 1;
      const nextLevel = buildRandomLevel(serial);
      const retainedLevels = get().levels.filter((level) => level.id !== get().generatedLevelId);
      const placements: Placement[] = [];

      set({
        levels: [...retainedLevels, nextLevel],
        generatedLevelId: nextLevel.id,
        activeLevelId: nextLevel.id,
        placements,
        draggingBlockId: undefined,
        draggingRotation: 0,
        dragPointer: undefined,
        currentBeat: 0,
        simulation: computeSimulation(nextLevel, placements),
      });
    },
    applySolution: () => {
      const level = getLevelById(get().levels, get().activeLevelId);
      const placements = level.referenceSolution ?? solveLevel(level).placements;
      set({
        placements,
        draggingBlockId: undefined,
        draggingRotation: 0,
        dragPointer: undefined,
        simulation: computeSimulation(level, placements),
      });
    },
    setCurrentBeat: (beat) => set({ currentBeat: beat }),
    togglePaths: () =>
      set((state) => {
        const next = !state.hintEnabled;
        return {
          hintEnabled: next,
          showPaths: next,
        };
      }),
    setAudioVolume: (channel, volume) =>
      set((state) => ({
        audioMix: {
          ...state.audioMix,
          [channel]: {
            ...state.audioMix[channel],
            volume,
          },
        },
      })),
    toggleAudioMute: (channel) =>
      set((state) => ({
        audioMix: {
          ...state.audioMix,
          [channel]: {
            ...state.audioMix[channel],
            muted: !state.audioMix[channel].muted,
          },
        },
      })),
    startDrag: (blockId, pointer, rotation = 0) =>
      set({
        draggingBlockId: blockId,
        draggingRotation: rotation,
        dragPointer: pointer,
      }),
    updateDragPointer: (pointer) => set({ dragPointer: pointer }),
    rotateDrag: () =>
      set((state) => ({
        draggingRotation: state.draggingRotation === 0 ? 90 : 0,
      })),
    endDrag: () =>
      set({
        draggingBlockId: undefined,
        dragPointer: undefined,
        draggingRotation: 0,
      }),
    resetPlacements: () => {
      const level = getLevelById(get().levels, get().activeLevelId);
      const placements: Placement[] = [];
      set({
        placements,
        simulation: computeSimulation(level, placements),
      });
    },
    placeBlock: (placement) => {
      const level = getLevelById(get().levels, get().activeLevelId);
      const placements = [...get().placements, placement];
      const validation = validatePlacements(level, placements);
      if (!validation.valid) {
        return;
      }
      set({
        placements,
        simulation: computeSimulation(level, placements),
      });
    },
    removePlacementAt: (x, y) => {
      const level = getLevelById(get().levels, get().activeLevelId);
      const blockMap = new Map(level.inventory.map((block) => [block.id, block]));
      const placements = get().placements.filter((placement) => {
        const block = blockMap.get(placement.blockId);
        if (!block) {
          return true;
        }

        const width = placement.rotation === 90 ? block.height : block.width;
        const height = placement.rotation === 90 ? block.width : block.height;
        return !(
          x >= placement.origin.x &&
          x < placement.origin.x + width &&
          y >= placement.origin.y &&
          y < placement.origin.y + height
        );
      });
      set({
        placements,
        simulation: computeSimulation(level, placements),
      });
    },
  };
});

/** Returns the fully resolved active level from a partial store snapshot. */
export function getActiveLevel(state: Pick<GameState, "activeLevelId" | "levels">) {
  return getLevelById(state.levels, state.activeLevelId);
}
