import { create } from "zustand";
import { ensembleLevel, tutorialLevel } from "../../data/levels";
import { evaluatePlacements, generateLevelFromPaths, getInitialPlacements, solveLevel, validatePlacements } from "../simulation";
import type { LevelDefinition, Placement, SimulationResult } from "../types";

export type AudioChannelKey = "hit" | "reference" | "wrong";

export type AudioMixState = Record<AudioChannelKey, { volume: number; muted: boolean }>;
const AUDIO_MIX_STORAGE_KEY = "animal-groove-audio-mix";

/** Returns the default audio mix used when there is no persisted user preference. */
function getDefaultAudioMix(): AudioMixState {
  return {
    hit: { volume: 1.05, muted: false },
    reference: { volume: 0.18, muted: false },
    wrong: { volume: 0.4, muted: false },
  };
}

/** Attempts to load persisted audio mix preferences from localStorage. */
function loadPersistedAudioMix(): AudioMixState {
  if (typeof window === "undefined") {
    return getDefaultAudioMix();
  }

  try {
    const raw = window.localStorage.getItem(AUDIO_MIX_STORAGE_KEY);
    if (!raw) {
      return getDefaultAudioMix();
    }

    const parsed = JSON.parse(raw) as Partial<AudioMixState>;
    const defaults = getDefaultAudioMix();
    return {
      hit: {
        volume: typeof parsed.hit?.volume === "number" ? parsed.hit.volume : defaults.hit.volume,
        muted: typeof parsed.hit?.muted === "boolean" ? parsed.hit.muted : defaults.hit.muted,
      },
      reference: {
        volume: typeof parsed.reference?.volume === "number" ? parsed.reference.volume : defaults.reference.volume,
        muted: typeof parsed.reference?.muted === "boolean" ? parsed.reference.muted : defaults.reference.muted,
      },
      wrong: {
        volume: typeof parsed.wrong?.volume === "number" ? parsed.wrong.volume : defaults.wrong.volume,
        muted: typeof parsed.wrong?.muted === "boolean" ? parsed.wrong.muted : defaults.wrong.muted,
      },
    };
  } catch {
    return getDefaultAudioMix();
  }
}

/** Persists the current audio mix preferences to localStorage. */
function persistAudioMix(audioMix: AudioMixState) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(AUDIO_MIX_STORAGE_KEY, JSON.stringify(audioMix));
  } catch {
    // Ignore storage failures so audio controls remain functional.
  }
}

type GameState = {
  levels: LevelDefinition[];
  activeLevelId: string;
  generatedLevelId?: string;
  placements: Placement[];
  draggingPieceId?: string;
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
  startDrag: (pieceId: string, blockId: string, pointer: { x: number; y: number }, rotation?: 0 | 90) => void;
  updateDragPointer: (pointer: { x: number; y: number }) => void;
  rotateDrag: () => void;
  endDrag: () => void;
  resetPlacements: () => void;
  moveBlock: (placement: Placement) => void;
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
  const initialPlacements = getInitialPlacements(initialLevel);

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
    audioMix: loadPersistedAudioMix(),
    setActiveLevel: (levelId) => {
      const nextLevel = getLevelById(get().levels, levelId);
      const placements = getInitialPlacements(nextLevel);
      set({
        activeLevelId: nextLevel.id,
        placements,
        draggingPieceId: undefined,
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
      const placements = getInitialPlacements(nextLevel);

      set({
        levels: [...retainedLevels, nextLevel],
        generatedLevelId: nextLevel.id,
        activeLevelId: nextLevel.id,
        placements,
        draggingPieceId: undefined,
        draggingBlockId: undefined,
        draggingRotation: 0,
        dragPointer: undefined,
        currentBeat: 0,
        simulation: computeSimulation(nextLevel, placements),
      });
    },
    applySolution: () => {
      const level = getLevelById(get().levels, get().activeLevelId);
      const solvedPlacements = level.referenceSolution ?? solveLevel(level).placements;
      const currentByPiece = new Map(get().placements.map((placement) => [placement.pieceId, placement]));
      const solutionPieceIds = new Set(solvedPlacements.map((placement) => placement.pieceId));
      const placements = get().placements.map((placement) => {
        const solved = solvedPlacements.find((candidate) => candidate.pieceId === placement.pieceId);
        return solved ?? placement;
      });

      for (const solved of solvedPlacements) {
        if (currentByPiece.has(solved.pieceId)) {
          continue;
        }
        placements.push(solved);
      }

      for (const block of level.blocks) {
        if (solutionPieceIds.has(block.pieceId)) {
          continue;
        }
        if (placements.some((placement) => placement.pieceId === block.pieceId)) {
          continue;
        }
        placements.push(block.initialPlacement);
      }
      set({
        placements,
        draggingPieceId: undefined,
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
      set((state) => {
        const nextMix = {
          ...state.audioMix,
          [channel]: {
            ...state.audioMix[channel],
            volume,
          },
        };
        persistAudioMix(nextMix);
        return { audioMix: nextMix };
      }),
    toggleAudioMute: (channel) =>
      set((state) => {
        const nextMix = {
          ...state.audioMix,
          [channel]: {
            ...state.audioMix[channel],
            muted: !state.audioMix[channel].muted,
          },
        };
        persistAudioMix(nextMix);
        return { audioMix: nextMix };
      }),
    startDrag: (pieceId, blockId, pointer, rotation = 0) =>
      set({
        draggingPieceId: pieceId,
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
        draggingPieceId: undefined,
        draggingBlockId: undefined,
        dragPointer: undefined,
        draggingRotation: 0,
      }),
    resetPlacements: () => {
      const level = getLevelById(get().levels, get().activeLevelId);
      const placements = getInitialPlacements(level);
      set({
        placements,
        simulation: computeSimulation(level, placements),
      });
    },
    moveBlock: (placement) => {
      const level = getLevelById(get().levels, get().activeLevelId);
      const placements = get().placements.map((current) =>
        current.pieceId === placement.pieceId ? placement : current,
      );
      const validation = validatePlacements(level, placements);
      if (!validation.valid) {
        return;
      }
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
