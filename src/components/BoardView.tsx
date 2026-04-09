import { useEffect, useMemo, useRef, useState } from "react";
import { AudioEngine } from "../game/audio/audioEngine";
import { Transport } from "../game/engine/transport";
import type { HitPulse, PreviewPlacement, StashPiece } from "../game/render/threeScene";
import { placementKey, RESERVE_MARGIN, ThreeScene } from "../game/render/threeScene";
import { getActiveLevel, useGameStore } from "../game/state/gameStore";
import { sampleAnimalPathVisits, validatePlacements } from "../game/simulation";
import type { Placement } from "../game/types";

const audioEngine = new AudioEngine();

type LoadingState = {
  active: boolean;
  progress: number;
  label: string;
};

type DragSession =
  | { source: "stash"; pieceId: string }
  | { source: "board"; originalPlacement: Placement };

type CameraSession = {
  mode: "pan" | "rotate";
};

type DragOccupancyState = {
  stashPieceId?: string;
  boardPlacement?: Placement;
};

/** Hosts the Three.js scene and coordinates runtime input, loading, and audio playback. */
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
  const previewRef = useRef<PreviewPlacement | undefined>(undefined);
  const lastBeatRef = useRef(0);
  const audioReadyRef = useRef(false);
  const audioTriggerRef = useRef(new Set<string>());
  const pulseMapRef = useRef(new Map<string, HitPulse>());
  const loadRequestRef = useRef(0);
  const pressedPlacementIdsRef = useRef(new Set<string>());
  const dragOccupancyRef = useRef<DragOccupancyState>({});
  const stashPiecesRef = useRef<StashPiece[]>([]);

  const [preview, setPreview] = useState<PreviewPlacement | undefined>(undefined);
  const [draggingStashPieceId, setDraggingStashPieceId] = useState<string | undefined>(undefined);
  const [draggingBoardBlockId, setDraggingBoardBlockId] = useState<string | undefined>(undefined);
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
  const placeBlock = useGameStore((state) => state.placeBlock);
  const removePlacementAt = useGameStore((state) => state.removePlacementAt);
  const startDrag = useGameStore((state) => state.startDrag);
  const updateDragPointer = useGameStore((state) => state.updateDragPointer);
  const rotateDrag = useGameStore((state) => state.rotateDrag);
  const endDrag = useGameStore((state) => state.endDrag);
  const level = getActiveLevel({ activeLevelId, levels });

  /** Mirrors drag occupancy into both refs and state so render paths and event handlers stay in sync. */
  const syncDragOccupancy = (next: DragOccupancyState) => {
    dragOccupancyRef.current = next;
    setDraggingStashPieceId(next.stashPieceId);
    setDraggingBoardBlockId(next.boardPlacement?.blockId);
  };

  /** Clears preview and drag-occupancy bookkeeping after level switches or drag completion. */
  const clearTransientInteractionState = () => {
    previewRef.current = undefined;
    setPreview(undefined);
    syncDragOccupancy({});
  };

  /** Rebuilds the visible reserve pieces from the latest level, placements, and drag occupancy. */
  const getVisibleStashPieces = (activeLevel: typeof level, nextPlacements: Placement[]) =>
    buildVisibleStashPieces(
      buildStashSlots(activeLevel),
      nextPlacements,
      dragOccupancyRef.current.stashPieceId,
      dragOccupancyRef.current.boardPlacement,
    );

  /** Pushes one complete render snapshot into the Three.js scene. */
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
      getVisibleStashPieces(activeLevel, nextPlacements),
      nextPressedPlacementIds,
      [...pulseMapRef.current.values()],
      nextPreview,
    );
  };

  // Trigger: whenever the active level object changes. Purpose: keep async callbacks reading the latest level via ref.
  useEffect(() => {
    levelRef.current = level;
  }, [level]);

  // Trigger: whenever HUD audio mix sliders/toggles change. Purpose: push the latest mix into the audio engine.
  useEffect(() => {
    audioEngine.setMix(audioMix);
  }, [audioMix]);

  const stashSlots = useMemo(() => buildStashSlots(level), [level]);
  const stashPieces = useMemo(
    () => buildVisibleStashPieces(stashSlots, placements, draggingStashPieceId, dragOccupancyRef.current.boardPlacement),
    [draggingBoardBlockId, draggingStashPieceId, placements, stashSlots],
  );
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

  // Trigger: whenever visible reserve pieces change. Purpose: keep imperative pointer handlers aligned with the latest fixed stash slots.
  useEffect(() => {
    stashPiecesRef.current = stashPieces;
  }, [stashPieces]);

  // Trigger: once on mount (plus stable callback identity changes). Purpose: create scene/transport and wire all input listeners.
  useEffect(() => {
    // Scene bootstrap: construct Three.js scene and mount renderer into the host container.
    const scene = new ThreeScene();
    sceneRef.current = scene;
    if (mountRef.current) {
      scene.mount(mountRef.current);
    }

    // Transport bootstrap: create beat clock and render on each transport tick.
    const transport = new Transport(level.bpm, level.loopBeats);
    transportRef.current = transport;
    const unsubscribe = transport.subscribe((beat) => {
      setCurrentBeat(beat);
      const activeLevel = levelRef.current;
      renderScene(activeLevel, beat, useGameStore.getState().placements, previewRef.current, pressedPlacementIdsRef.current);
    });

    const dom = scene.getDomElement();

    // Audio unlock gate: Web Audio starts after first user gesture.
    const unlockAudio = async () => {
      if (!audioReadyRef.current) {
        await audioEngine.start();
        audioReadyRef.current = true;
      }
    };

    // Pointer down routing: choose between camera gesture, stash drag, or board block drag.
    const handlePointerDown = async (event: PointerEvent) => {
      await unlockAudio();
      if (event.button !== 0 && event.button !== 2) {
        return;
      }

      const hit = scene.pickSceneObject(event.clientX, event.clientY);
      if (!hit) {
        const mode = event.button === 2 ? "rotate" : "pan";
        cameraSessionRef.current = { mode };
        scene.beginCameraDrag(mode, event.clientX, event.clientY);
        return;
      }

      if (event.button === 2) {
        const mode = "rotate";
        cameraSessionRef.current = { mode };
        scene.beginCameraDrag(mode, event.clientX, event.clientY);
        return;
      }

      if (hit.kind === "stash") {
        dragSessionRef.current = { source: "stash", pieceId: hit.pieceId };
        syncDragOccupancy({ stashPieceId: hit.pieceId });
        startDrag(hit.blockId, { x: event.clientX, y: event.clientY }, 0);
        return;
      }

      dragSessionRef.current = {
        source: "board",
        originalPlacement: hit.placement,
      };
      syncDragOccupancy({ boardPlacement: hit.placement });
      removePlacementAt(hit.placement.origin.x, hit.placement.origin.y);
      startDrag(hit.placement.blockId, { x: event.clientX, y: event.clientY }, hit.placement.rotation);
    };

    // Pointer move: either update camera drag or update placement preview while dragging a block.
    const handlePointerMove = (event: PointerEvent) => {
      const state = useGameStore.getState();
      if (!state.draggingBlockId) {
        if (cameraSessionRef.current) {
          scene.updateCameraDrag(event.clientX, event.clientY);
        }
        return;
      }

      updateDragPointer({ x: event.clientX, y: event.clientY });
      const activeLevel = levelRef.current;
      const cell = scene.getCellFromPointer(event.clientX, event.clientY, activeLevel, true);
      if (!cell) {
        if (!previewRef.current) {
          return;
        }
        setPreview(undefined);
        previewRef.current = undefined;
        return;
      }

      const nextPlacement: Placement = {
        blockId: state.draggingBlockId,
        pieceId: getDraggingPieceId(dragSessionRef.current),
        origin: cell,
        rotation: state.draggingRotation,
      };
      const nextPreview: PreviewPlacement = {
        placement: nextPlacement,
        valid: validatePlacements(activeLevel, [...useGameStore.getState().placements, nextPlacement]).valid,
      };
      if (isSamePreview(previewRef.current, nextPreview)) {
        return;
      }
      setPreview(nextPreview);
      previewRef.current = nextPreview;
      renderScene(activeLevel, useGameStore.getState().currentBeat, useGameStore.getState().placements, nextPreview, pressedPlacementIdsRef.current);
    };

    // Pointer up finalize: commit valid preview, or rollback to original block placement when needed.
    const handlePointerUp = () => {
      const state = useGameStore.getState();
      if (cameraSessionRef.current) {
        cameraSessionRef.current = null;
        scene.endCameraDrag();
      }

      if (!state.draggingBlockId) {
        return;
      }

      const activePreview = previewRef.current;
      if (activePreview?.valid) {
        placeBlock(activePreview.placement);
      } else if (dragSessionRef.current?.source === "board") {
        placeBlock(dragSessionRef.current.originalPlacement);
      }

      dragSessionRef.current = null;
      clearTransientInteractionState();
      endDrag();
    };

    // Context menu: right click removes a placed block on the board (unless currently rotating camera).
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      if (cameraSessionRef.current?.mode === "rotate") {
        return;
      }
      const activeLevel = levelRef.current;
      const cell = scene.getCellFromPointer(event.clientX, event.clientY, activeLevel);
      if (cell) {
        removePlacementAt(cell.x, cell.y);
      }
    };

    // Wheel zoom for camera orbit distance.
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      scene.zoomCamera(event.deltaY);
    };

    // Keyboard interaction: rotate active dragged block with R and refresh preview placement.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "r" || !useGameStore.getState().draggingBlockId) {
        return;
      }

      event.preventDefault();
      const state = useGameStore.getState();
      const rotation = state.draggingRotation === 0 ? 90 : 0;
      rotateDrag();

      const pointer = state.dragPointer;
      if (!pointer) {
        return;
      }

      const activeLevel = levelRef.current;
      const cell = scene.getCellFromPointer(pointer.x, pointer.y, activeLevel, true);
      if (!cell) {
        setPreview(undefined);
        previewRef.current = undefined;
        return;
      }

      const nextPlacement: Placement = {
        blockId: state.draggingBlockId!,
        pieceId: getDraggingPieceId(dragSessionRef.current),
        origin: cell,
        rotation,
      };
      const nextPreview: PreviewPlacement = {
        placement: nextPlacement,
        valid: validatePlacements(activeLevel, [...useGameStore.getState().placements, nextPlacement]).valid,
      };
      setPreview(nextPreview);
      previewRef.current = nextPreview;
    };

    // Window resize keeps renderer/camera in sync with viewport size.
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

    // Start transport after scene/input setup is complete.
    transport.start();

    // Cleanup: remove listeners and dispose scene/transport resources.
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
  }, [endDrag, placeBlock, removePlacementAt, rotateDrag, setCurrentBeat, startDrag, updateDragPointer]);

  // Trigger: whenever active level changes. Purpose: async-load level content, reset transport state, and clear transient caches.
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
    clearTransientInteractionState();
  }, [level]);

  // Trigger: whenever level list changes. Purpose: preload all referenced animal models for faster next level switch.
  useEffect(() => {
    const modelPaths = levels.flatMap((entry) =>
      entry.animals
        .map((animal) => entry.models[animal.animalType])
        .filter((path): path is string => Boolean(path)),
    );

    void ThreeScene.preloadModels(modelPaths);
  }, [levels]);

  // Trigger: on render-driving state updates (beat/placements/preview/path toggle). Purpose: draw the latest frame immediately.
  useEffect(() => {
    pressedPlacementIdsRef.current = pressedPlacementIds;
    renderScene(level, currentBeat, placements, preview, pressedPlacementIds);
  }, [currentBeat, level, placements, preview, pressedPlacementIds, showPaths, stashPieces]);

  // Trigger: on beat/simulation updates. Purpose: emit audio and refresh per-animal pulse states from trigger/visit events.
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

/** Builds the full fixed reserve-slot layout for a level. */
function buildStashSlots(level: ReturnType<typeof getActiveLevel>) {
  const layoutAxis = getReserveLayoutAxis();
  const sortedInventory = [...level.inventory].sort(compareInventoryBlocks);
  return layoutStashPieces(level.board.width, level.board.height, sortedInventory, layoutAxis);
}

/** Filters fixed reserve slots down to the pieces currently still available to the player. */
function buildVisibleStashPieces(
  slots: StashPiece[],
  placements: Placement[],
  draggingPieceId?: string,
  draggingBoardPlacement?: Placement,
) {
  const consumedPieceIds = buildConsumedPieceIds(slots, placements, draggingBoardPlacement);
  return slots.filter((piece) => !consumedPieceIds.has(piece.pieceId) && piece.pieceId !== draggingPieceId);
}

/** Picks whether reserve pieces should be distributed on top/bottom or left/right. */
function getReserveLayoutAxis(): "horizontal" | "vertical" {
  if (typeof window === "undefined") {
    return "horizontal";
  }
  return window.innerWidth >= window.innerHeight ? "horizontal" : "vertical";
}

/** Sorts reserve inventory for a more legible arrangement by timbre and footprint length. */
function compareInventoryBlocks(
  left: ReturnType<typeof getActiveLevel>["inventory"][number],
  right: ReturnType<typeof getActiveLevel>["inventory"][number],
) {
  const timbreOrder = left.timbre.localeCompare(right.timbre);
  if (timbreOrder !== 0) {
    return timbreOrder;
  }

  const lengthOrder = Math.max(right.width, right.height) - Math.max(left.width, left.height);
  if (lengthOrder !== 0) {
    return lengthOrder;
  }

  const areaOrder = right.width * right.height - left.width * left.height;
  if (areaOrder !== 0) {
    return areaOrder;
  }

  return left.id.localeCompare(right.id);
}

/** Lays out reserve pieces by timbre group, keeping them close to the board edges. */
function layoutStashPieces(
  boardWidth: number,
  boardHeight: number,
  inventory: ReturnType<typeof getActiveLevel>["inventory"],
  layoutAxis: "horizontal" | "vertical",
) {
  const inventoryById = new Map(inventory.map((block) => [block.id, block]));
  const groups = groupInventoryByTimbre(inventory);
  const pieces: StashPiece[] = [];

  if (layoutAxis === "horizontal") {
    const leftGroups = groups.filter((_, index) => index % 2 === 0);
    const rightGroups = groups.filter((_, index) => index % 2 === 1);
    pieces.push(...layoutVerticalEdgeGroups(leftGroups, "left", boardWidth, boardHeight, inventoryById));
    pieces.push(...layoutVerticalEdgeGroups(rightGroups, "right", boardWidth, boardHeight, inventoryById));
    return pieces;
  }

  const topGroups = groups.filter((_, index) => index % 2 === 0);
  const bottomGroups = groups.filter((_, index) => index % 2 === 1);
  pieces.push(...layoutHorizontalEdgeGroups(topGroups, "top", boardWidth, boardHeight, inventoryById));
  pieces.push(...layoutHorizontalEdgeGroups(bottomGroups, "bottom", boardWidth, boardHeight, inventoryById));
  return pieces;
}

/** Groups currently available reserve pieces by timbre while preserving per-group sort order. */
function groupInventoryByTimbre(
  inventory: ReturnType<typeof getActiveLevel>["inventory"],
) {
  const groups = new Map<string, StashPiece[]>();
  for (const block of inventory) {
    const currentGroup = groups.get(block.timbre) ?? [];
    for (let index = 0; index < block.quantity; index += 1) {
      currentGroup.push({
        pieceId: `${block.id}-${index}`,
        blockId: block.id,
        rotation: 0,
        worldX: 0,
        worldZ: 0,
      });
    }
    groups.set(block.timbre, currentGroup);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, pieces]) => pieces);
}

/** Lays out timbre groups from top to bottom on either the left or right side of the board. */
function layoutVerticalEdgeGroups(
  groups: StashPiece[][],
  side: "left" | "right",
  boardWidth: number,
  boardHeight: number,
  inventoryById: Map<string, ReturnType<typeof getActiveLevel>["inventory"][number]>,
) {
  const placements: StashPiece[] = [];
  let cursorY = -2;

  for (const group of groups) {
    for (const piece of group) {
      const block = inventoryById.get(piece.blockId);
      if (!block) {
        continue;
      }

      const rotation = getPreferredReserveRotation(block.width, block.height, "vertical");
      const width = rotation === 90 ? block.height : block.width;
      const height = rotation === 90 ? block.width : block.height;
      const worldX = side === "left" ? -width - 1 : boardWidth + 1;
      placements.push({
        ...piece,
        rotation,
        worldX,
        worldZ: cursorY,
      });
      cursorY += height + 1;
    }
    cursorY += 1;
  }

  return placements.filter((piece) => piece.worldZ <= boardHeight + RESERVE_MARGIN);
}

/** Lays out timbre groups from left to right on either the top or bottom side of the board. */
function layoutHorizontalEdgeGroups(
  groups: StashPiece[][],
  side: "top" | "bottom",
  boardWidth: number,
  boardHeight: number,
  inventoryById: Map<string, ReturnType<typeof getActiveLevel>["inventory"][number]>,
) {
  const placements: StashPiece[] = [];
  let cursorX = -2;

  for (const group of groups) {
    for (const piece of group) {
      const block = inventoryById.get(piece.blockId);
      if (!block) {
        continue;
      }

      const rotation = getPreferredReserveRotation(block.width, block.height, "horizontal");
      const width = rotation === 90 ? block.height : block.width;
      const height = rotation === 90 ? block.width : block.height;
      const worldZ = side === "top" ? -height - 1 : boardHeight + 1;
      placements.push({
        ...piece,
        rotation,
        worldX: cursorX,
        worldZ,
      });
      cursorX += width + 1;
    }
    cursorX += 1;
  }

  return placements.filter((piece) => piece.worldX <= boardWidth + RESERVE_MARGIN);
}

/** Resolves which fixed reserve slots are currently consumed by placed blocks. */
function buildConsumedPieceIds(slots: StashPiece[], placements: Placement[], draggingBoardPlacement?: Placement) {
  const usedCounts = new Map<string, number>();
  for (const placement of placements) {
    if (!placement.pieceId) {
      usedCounts.set(placement.blockId, (usedCounts.get(placement.blockId) ?? 0) + 1);
    }
  }

  const consumed = new Set<string>();
  const perBlockSlots = new Map<string, StashPiece[]>();
  for (const slot of slots) {
    const currentSlots = perBlockSlots.get(slot.blockId) ?? [];
    currentSlots.push(slot);
    perBlockSlots.set(slot.blockId, currentSlots);
  }

  for (const placement of placements) {
    if (placement.pieceId) {
      consumed.add(placement.pieceId);
    }
  }
  if (draggingBoardPlacement?.pieceId) {
    consumed.add(draggingBoardPlacement.pieceId);
  } else if (draggingBoardPlacement) {
    usedCounts.set(draggingBoardPlacement.blockId, (usedCounts.get(draggingBoardPlacement.blockId) ?? 0) + 1);
  }

  for (const [blockId, count] of usedCounts) {
    const blockSlots = perBlockSlots.get(blockId) ?? [];
    let consumedForBlock = 0;
    for (const slot of blockSlots) {
      if (consumedForBlock >= count) {
        break;
      }
      if (consumed.has(slot.pieceId)) {
        continue;
      }
      consumed.add(slot.pieceId);
      consumedForBlock += 1;
    }
  }

  return consumed;
}

/** Chooses a default reserve-slot rotation so long bars face across the packing direction. */
function getPreferredReserveRotation(width: number, height: number, flow: "horizontal" | "vertical"): 0 | 90 {
  if (flow === "vertical") {
    return width >= height ? 0 : 90;
  }
  return width >= height ? 90 : 0;
}


/** Builds a cell-key set for all currently occupied board cells by placed blocks. */
function buildOccupiedCellSet(level: ReturnType<typeof getActiveLevel>, placements: Placement[]) {
  const inventoryById = new Map(level.inventory.map((block) => [block.id, block]));
  const occupied = new Set<string>();
  for (const placement of placements) {
    const block = inventoryById.get(placement.blockId);
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
    left.placement.rotation === right.placement.rotation &&
    left.placement.origin.x === right.placement.origin.x &&
    left.placement.origin.y === right.placement.origin.y
  );
}

/** Resolves the stash-piece identity currently being dragged so it can persist after placement. */
function getDraggingPieceId(session: DragSession | null) {
  if (!session) {
    return undefined;
  }

  if (session.source === "stash") {
    return session.pieceId;
  }

  return session.originalPlacement.pieceId;
}
