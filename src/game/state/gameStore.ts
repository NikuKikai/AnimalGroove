import { create } from "zustand";
import { ensembleLevel, tutorialLevel } from "../../data/levels";
import { evaluatePlacements, validatePlacements } from "../simulation";
import type { LevelDefinition, Placement, SimulationResult } from "../types";

export type AudioChannelKey = "hit" | "reference" | "wrong";

export type AudioMixState = Record<AudioChannelKey, { volume: number; muted: boolean }>;

type GameState = {
  levels: LevelDefinition[];
  activeLevelId: string;
  placements: Placement[];
  draggingBlockId?: string;
  draggingRotation: 0 | 90;
  dragPointer?: { x: number; y: number };
  isPlaying: boolean;
  showPaths: boolean;
  currentBeat: number;
  simulation: SimulationResult;
  audioMix: AudioMixState;
  setActiveLevel: (levelId: string) => void;
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

const levels = [tutorialLevel, ensembleLevel];

function getLevelById(levelId: string) {
  return levels.find((level) => level.id === levelId) ?? levels[0];
}

function computeSimulation(level: LevelDefinition, placements: Placement[]) {
  return evaluatePlacements(level, placements);
}

export const useGameStore = create<GameState>((set, get) => {
  const initialLevel = levels[0];
  const initialPlacements: Placement[] = [];

  return {
    levels,
    activeLevelId: initialLevel.id,
    placements: initialPlacements,
    draggingRotation: 0,
    isPlaying: true,
    showPaths: true,
    currentBeat: 0,
    simulation: computeSimulation(initialLevel, initialPlacements),
    audioMix: {
      hit: { volume: 1.05, muted: false },
      reference: { volume: 0.18, muted: false },
      wrong: { volume: 0.4, muted: false },
    },
    setActiveLevel: (levelId) => {
      const nextLevel = getLevelById(levelId);
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
    setCurrentBeat: (beat) => set({ currentBeat: beat }),
    togglePaths: () => set((state) => ({ showPaths: !state.showPaths })),
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
      const level = getLevelById(get().activeLevelId);
      const placements: Placement[] = [];
      set({
        placements,
        simulation: computeSimulation(level, placements),
      });
    },
    placeBlock: (placement) => {
      const level = getLevelById(get().activeLevelId);
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
      const level = getLevelById(get().activeLevelId);
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

export function getActiveLevel(state: Pick<GameState, "activeLevelId">) {
  return getLevelById(state.activeLevelId);
}
