import { useEffect, useMemo, useRef, useState } from "react";
import { AudioEngine } from "../game/audio/audioEngine";
import { Transport } from "../game/engine/transport";
import type { HitPulse, PreviewPlacement } from "../game/render/threeScene";
import { placementKey, ThreeScene } from "../game/render/threeScene";
import { getActiveLevel, useGameStore } from "../game/state/gameStore";
import { sampleAnimalPathVisits, validatePlacements } from "../game/simulation";
import type { Placement } from "../game/types";

const audioEngine = new AudioEngine();

type LoadingState = {
  active: boolean;
  progress: number;
  label: string;
};

type DragSession = {
  originalPlacement: Placement;
};

type CameraSession = {
  mode: "pan" | "rotate";
};

/** Hosts the Three.js board scene and coordinates pointer input, transport, and audio playback. */
export function BoardView() {
  const mountRef = useRef<HTMLDivElement>(null);
  const transportRef = useRef<Transport | null>(null);
  const sceneRef = useRef<ThreeScene | null>(null);
  const levelRef = useRef(
    getActiveLevel({
      activeLevelId: useGameStore.getState().activeLevelId,
      levels: useGameStore.getState().levels,
    }),
  );
  const dragSessionRef = useRef<DragSession | null>(null);
  const cameraSessionRef = useRef<CameraSession | null>(null);
  const dragPointerRef = useRef<{ x: number; y: number } | undefined>(undefined);
  const previewRef = useRef<PreviewPlacement | undefined>(undefined);
  const lastBeatRef = useRef(0);
  const audioReadyRef = useRef(false);
  const audioTriggerRef = useRef(new Set<string>());
  const pulseMapRef = useRef(new Map<string, HitPulse>());
  const loadRequestRef = useRef(0);
  const pressedPlacementIdsRef = useRef(new Set<string>());

  const [preview, setPreview] = useState<PreviewPlacement | undefined>(undefined);
  const [loading, setLoading] = useState<LoadingState>({
    active: true,
    progress: 0,
    label: "Loading scene",
  });

  const activeLevelId = useGameStore((state) => state.activeLevelId);
  const levels = useGameStore((state) => state.levels);
  const placements = useGameStore((state) => state.placements);
  const draggingBlockId = useGameStore((state) => state.draggingBlockId);
  const showPaths = useGameStore((state) => state.showPaths);
  const currentBeat = useGameStore((state) => state.currentBeat);
  const simulation = useGameStore((state) => state.simulation);
  const audioMix = useGameStore((state) => state.audioMix);
  const setCurrentBeat = useGameStore((state) => state.setCurrentBeat);
  const moveBlock = useGameStore((state) => state.moveBlock);
  const startDrag = useGameStore((state) => state.startDrag);
  const rotateDrag = useGameStore((state) => state.rotateDrag);
  const endDrag = useGameStore((state) => state.endDrag);
  const level = getActiveLevel({ activeLevelId, levels });

  /** Clears the transient drag preview after level changes or drag completion. */
  const clearPreview = () => {
    previewRef.current = undefined;
    setPreview(undefined);
  };

  /** Pushes one fully assembled render snapshot into the Three.js scene. */
  const renderScene = (
    activeLevel: typeof level,
    beat: number,
    nextPlacements: Placement[],
    nextPreview: PreviewPlacement | undefined,
    nextPressedPlacementIds: Set<string>,
  ) => {
    sceneRef.current?.update(
      activeLevel,
      beat,
      nextPlacements,
      useGameStore.getState().showPaths,
      nextPressedPlacementIds,
      [...pulseMapRef.current.values()],
      nextPreview,
    );
  };

  // Trigger: whenever the resolved active level changes. Purpose: keep imperative callbacks reading the latest level via ref.
  useEffect(() => {
    levelRef.current = level;
  }, [level]);

  // Trigger: whenever HUD audio controls change. Purpose: push the latest mix into the audio engine.
  useEffect(() => {
    audioEngine.setMix(audioMix);
  }, [audioMix]);

  const animalVisits = useMemo(
    () => level.animals.flatMap((animal) => sampleAnimalPathVisits(animal, level.loopBeats)),
    [level],
  );
  const occupiedCells = useMemo(() => buildOccupiedCellSet(level, placements), [level, placements]);
  const pressedPlacementIds = useMemo(() => {
    const pressed = new Set<string>();
    for (const trigger of simulation.producedTriggers) {
      const delta = normalizedBeatDelta(currentBeat, trigger.beat, level.loopBeats);
      if (delta >= 0 && delta <= 0.22) {
        const placement = placements.find((item) => placementKey(item) === trigger.placementInstanceId);
        if (placement) {
          pressed.add(placementKey(placement));
        }
      }
    }
    return pressed;
  }, [currentBeat, level, placements, simulation.producedTriggers]);

  // Trigger: once on mount. Purpose: create the Three.js scene, transport, and all global input listeners.
  useEffect(() => {
    // Scene bootstrap: mount the renderer into the host element.
    const scene = new ThreeScene();
    sceneRef.current = scene;
    if (mountRef.current) {
      scene.mount(mountRef.current);
    }

    // Transport bootstrap: tick the beat clock and request scene redraws.
    const transport = new Transport(level.bpm, level.loopBeats);
    transportRef.current = transport;
    const unsubscribe = transport.subscribe((beat) => {
      setCurrentBeat(beat);
      const activeLevel = levelRef.current;
      renderScene(activeLevel, beat, useGameStore.getState().placements, previewRef.current, pressedPlacementIdsRef.current);
    });

    const dom = scene.getDomElement();

    // Audio unlock gate: Web Audio becomes available after the first explicit gesture.
    const unlockAudio = async () => {
      if (!audioReadyRef.current) {
        await audioEngine.start();
        audioReadyRef.current = true;
      }
    };

    // Pointer down routing: either start a camera gesture or grab an existing block instance.
    const handlePointerDown = async (event: PointerEvent) => {
      await unlockAudio();
      if (event.button !== 0 && event.button !== 2) {
        return;
      }

      const hit = scene.pickSceneObject(event.clientX, event.clientY);
      if (!hit || event.button === 2) {
        const mode = event.button === 2 ? "rotate" : "pan";
        cameraSessionRef.current = { mode };
        scene.beginCameraDrag(mode, event.clientX, event.clientY);
        return;
      }

      dragSessionRef.current = {
        originalPlacement: hit.placement,
      };
      dragPointerRef.current = { x: event.clientX, y: event.clientY };
      clearPreview();
      startDrag(hit.placement.pieceId, hit.placement.blockId, { x: event.clientX, y: event.clientY }, hit.placement.rotation);
    };

    // Pointer move: update either the camera drag or the discrete placement preview.
    const handlePointerMove = (event: PointerEvent) => {
      const state = useGameStore.getState();
      if (!state.draggingBlockId || !state.draggingPieceId) {
        if (cameraSessionRef.current) {
          scene.updateCameraDrag(event.clientX, event.clientY);
        }
        return;
      }

      dragPointerRef.current = { x: event.clientX, y: event.clientY };
      const activeLevel = levelRef.current;
      const cell = scene.getCellFromPointer(event.clientX, event.clientY, activeLevel);
      if (!cell) {
        if (!previewRef.current) {
          return;
        }
        clearPreview();
        renderScene(activeLevel, useGameStore.getState().currentBeat, useGameStore.getState().placements, undefined, pressedPlacementIdsRef.current);
        return;
      }

      const draggingBlockId = state.draggingBlockId;
      const draggingPieceId = state.draggingPieceId;
      if (!draggingBlockId || !draggingPieceId) {
        return;
      }

      const nextPlacement: Placement = {
        blockId: draggingBlockId,
        pieceId: draggingPieceId,
        origin: cell,
        rotation: state.draggingRotation,
      };
      const currentPreview = previewRef.current;
      if (
        currentPreview &&
        currentPreview.placement.blockId === nextPlacement.blockId &&
        currentPreview.placement.pieceId === nextPlacement.pieceId &&
        currentPreview.placement.rotation === nextPlacement.rotation &&
        currentPreview.placement.origin.x === nextPlacement.origin.x &&
        currentPreview.placement.origin.y === nextPlacement.origin.y
      ) {
        return;
      }
      const nextPreview: PreviewPlacement = {
        placement: nextPlacement,
        valid: validatePlacements(activeLevel, replacePlacement(useGameStore.getState().placements, nextPlacement)).valid,
      };
      if (isSamePreview(previewRef.current, nextPreview)) {
        return;
      }
      setPreview(nextPreview);
      previewRef.current = nextPreview;
      renderScene(activeLevel, useGameStore.getState().currentBeat, useGameStore.getState().placements, nextPreview, pressedPlacementIdsRef.current);
    };

    // Pointer up finalize: commit the preview by moving the same block instance, or leave it untouched.
    const handlePointerUp = () => {
      const state = useGameStore.getState();
      if (cameraSessionRef.current) {
        cameraSessionRef.current = null;
        scene.endCameraDrag();
      }

      if (!state.draggingBlockId || !state.draggingPieceId) {
        return;
      }

      const activePreview = previewRef.current;
      if (activePreview?.valid) {
        moveBlock(activePreview.placement);
      }

      dragSessionRef.current = null;
      clearPreview();
      endDrag();
    };

    // Context menu: keep right click reserved for camera rotation and prevent the browser menu.
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    // Wheel: zoom the camera while preserving the current target.
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      scene.zoomCamera(event.deltaY);
    };

    // Keyboard: rotate the dragged block and refresh the preview against the same grid cell.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "r" || !useGameStore.getState().draggingBlockId || !useGameStore.getState().draggingPieceId) {
        return;
      }

      event.preventDefault();
      const state = useGameStore.getState();
      const rotation = state.draggingRotation === 0 ? 90 : 0;
      rotateDrag();

      const pointer = dragPointerRef.current;
      if (!pointer) {
        return;
      }

      const activeLevel = levelRef.current;
      const cell = scene.getCellFromPointer(pointer.x, pointer.y, activeLevel);
      if (!cell) {
        clearPreview();
        renderScene(activeLevel, useGameStore.getState().currentBeat, useGameStore.getState().placements, undefined, pressedPlacementIdsRef.current);
        return;
      }

      const draggingBlockId = state.draggingBlockId;
      const draggingPieceId = state.draggingPieceId;
      if (!draggingBlockId || !draggingPieceId) {
        return;
      }

      const nextPlacement: Placement = {
        blockId: draggingBlockId,
        pieceId: draggingPieceId,
        origin: cell,
        rotation,
      };
      const nextPreview: PreviewPlacement = {
        placement: nextPlacement,
        valid: validatePlacements(activeLevel, replacePlacement(useGameStore.getState().placements, nextPlacement)).valid,
      };
      setPreview(nextPreview);
      previewRef.current = nextPreview;
      renderScene(activeLevel, useGameStore.getState().currentBeat, useGameStore.getState().placements, nextPreview, pressedPlacementIdsRef.current);
    };

    // Window resize: keep the renderer and camera projection aligned with the viewport.
    const handleResize = () => scene.resize();

    // Event wiring.
    window.addEventListener("pointerdown", unlockAudio);
    dom.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    dom.addEventListener("contextmenu", handleContextMenu);
    dom.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);

    // Start the beat transport after all listeners are live.
    transport.start();

    // Cleanup: remove listeners and dispose scene resources.
    return () => {
      unsubscribe();
      window.removeEventListener("pointerdown", unlockAudio);
      dom.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      dom.removeEventListener("contextmenu", handleContextMenu);
      dom.removeEventListener("wheel", handleWheel);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
      transport.dispose();
      scene.dispose();
    };
  }, [endDrag, moveBlock, rotateDrag, setCurrentBeat, startDrag]);

  // Trigger: whenever the active level changes. Purpose: async-load scene assets, reset transport, and clear transient caches.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) {
      return;
    }

    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    setLoading({
      active: true,
      progress: 0,
      label: "Loading scene",
    });

    const load = async () => {
      await scene.loadLevel(level, (progress) => {
        if (loadRequestRef.current !== requestId) {
          return;
        }
        setLoading({
          active: true,
          progress,
          label: "Loading scene",
        });
      });

      if (loadRequestRef.current !== requestId) {
        return;
      }

      setLoading({
        active: false,
        progress: 1,
        label: "Ready",
      });
    };

    void load();
    transportRef.current?.updateConfig(level.bpm, level.loopBeats);
    transportRef.current?.reset();
    lastBeatRef.current = 0;
    audioTriggerRef.current.clear();
    pulseMapRef.current.clear();
    clearPreview();
  }, [level]);

  // Trigger: whenever the full level list changes. Purpose: preload all referenced animal models for faster subsequent switches.
  useEffect(() => {
    const modelPaths = levels.flatMap((entry) =>
      entry.animals
        .map((animal) => entry.models[animal.animalType])
        .filter((path): path is string => Boolean(path)),
    );

    void ThreeScene.preloadModels(modelPaths);
  }, [levels]);

  // Trigger: whenever beat-driven visual state changes. Purpose: render the latest frame immediately.
  useEffect(() => {
    pressedPlacementIdsRef.current = pressedPlacementIds;
    renderScene(level, currentBeat, placements, preview, pressedPlacementIds);
  }, [currentBeat, level, placements, preview, pressedPlacementIds, showPaths]);

  // Trigger: whenever beat or judged output changes. Purpose: drive note audio and per-animal landing pulse state.
  useEffect(() => {
    if (currentBeat < lastBeatRef.current) {
      audioTriggerRef.current.clear();
      pulseMapRef.current.clear();
    }

    for (const trigger of simulation.producedTriggers) {
      if (!crossedBeat(lastBeatRef.current, currentBeat, trigger.beat)) {
        continue;
      }

      if (audioTriggerRef.current.has(trigger.id)) {
        continue;
      }

      audioTriggerRef.current.add(trigger.id);
      const matched = simulation.targetNotes.some((note) => note.matchedTriggerId === trigger.id);
      pulseMapRef.current.set(trigger.animalId, {
        id: trigger.animalId,
        beat: trigger.beat,
        state: matched ? "matched" : "wrong",
        cell: trigger.cell,
      });
      if (audioReadyRef.current) {
        audioEngine.playTrigger(trigger, matched);
      }
    }

    for (const visit of animalVisits) {
      if (!crossedBeat(lastBeatRef.current, currentBeat, visit.beat)) {
        continue;
      }
      if (occupiedCells.has(`${visit.cell.x},${visit.cell.y}`)) {
        continue;
      }

      pulseMapRef.current.set(visit.animalId, {
        id: visit.animalId,
        beat: visit.beat,
        state: "empty",
        cell: visit.cell,
      });
    }

    const pulseDurationBeats = 0.52;
    for (const [pulseId, pulse] of pulseMapRef.current) {
      if (normalizedBeatDelta(currentBeat, pulse.beat, level.loopBeats) > pulseDurationBeats) {
        pulseMapRef.current.delete(pulseId);
      }
    }

    if (audioReadyRef.current) {
      for (const note of simulation.targetNotes) {
        if (crossedBeat(lastBeatRef.current, currentBeat, note.beat)) {
          audioEngine.playReference(note, note.state);
        }
      }
    }

    lastBeatRef.current = currentBeat;
  }, [animalVisits, currentBeat, level.loopBeats, occupiedCells, simulation]);

  return (
    <section className="board-shell">
      <div
        className={`scene-mount ${loading.active ? "is-loading" : ""} ${draggingBlockId ? "is-dragging" : ""}`}
        ref={mountRef}
      />
      {loading.active ? (
        <div className="scene-loading" aria-live="polite">
          <div className="scene-loading-bar">
            <span className="scene-loading-fill" style={{ width: `${Math.round(loading.progress * 100)}%` }} />
          </div>
          <span className="scene-loading-label" title={loading.label}>
            {Math.round(loading.progress * 100)}%
          </span>
        </div>
      ) : null}
    </section>
  );
}

/** Detects whether a looping playback cursor crossed a target beat this frame. */
function crossedBeat(previous: number, current: number, target: number) {
  const epsilon = 0.0001;
  if (current >= previous) {
    return target > previous - epsilon && target <= current + epsilon;
  }

  return target > previous - epsilon || target <= current + epsilon;
}

/** Computes a positive wrapped beat delta inside the current loop. */
function normalizedBeatDelta(currentBeat: number, targetBeat: number, loopBeats: number) {
  const raw = currentBeat - targetBeat;
  return raw >= 0 ? raw : raw + loopBeats;
}

/** Replaces one existing placement by piece id while preserving the rest of the array. */
function replacePlacement(placements: Placement[], nextPlacement: Placement) {
  return placements.map((placement) =>
    placement.pieceId === nextPlacement.pieceId ? nextPlacement : placement,
  );
}

/** Builds a cell-key set for all occupied board cells in the current placement state. */
function buildOccupiedCellSet(level: ReturnType<typeof getActiveLevel>, placements: Placement[]) {
  const blockMap = new Map(level.blocks.map((block) => [block.pieceId, block]));
  const occupied = new Set<string>();
  for (const placement of placements) {
    const block = blockMap.get(placement.pieceId);
    if (!block) {
      continue;
    }

    const width = placement.rotation === 90 ? block.height : block.width;
    const height = placement.rotation === 90 ? block.width : block.height;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        occupied.add(`${placement.origin.x + x},${placement.origin.y + y}`);
      }
    }
  }
  return occupied;
}

/** Returns whether two preview states represent the same discrete drag result. */
function isSamePreview(left: PreviewPlacement | undefined, right: PreviewPlacement | undefined) {
  if (!left || !right) {
    return left === right;
  }

  return (
    left.valid === right.valid &&
    left.placement.blockId === right.placement.blockId &&
    left.placement.pieceId === right.placement.pieceId &&
    left.placement.rotation === right.placement.rotation &&
    left.placement.origin.x === right.placement.origin.x &&
    left.placement.origin.y === right.placement.origin.y
  );
}
