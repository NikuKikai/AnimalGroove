import { useEffect, useMemo, useRef, useState } from "react";
import { AudioEngine } from "../game/audio/audioEngine";
import { Transport } from "../game/engine/transport";
import type { PreviewPlacement, StashPiece } from "../game/render/threeScene";
import { placementKey, ThreeScene } from "../game/render/threeScene";
import { getActiveLevel, useGameStore } from "../game/state/gameStore";
import { validatePlacements } from "../game/simulation";
import type { Placement } from "../game/types";

const audioEngine = new AudioEngine();

type LoadingState = {
  active: boolean;
  progress: number;
  label: string;
};

type DragSession =
  | { source: "stash" }
  | { source: "board"; originalPlacement: Placement };

export function BoardView() {
  const mountRef = useRef<HTMLDivElement>(null);
  const transportRef = useRef<Transport | null>(null);
  const sceneRef = useRef<ThreeScene | null>(null);
  const levelRef = useRef(getActiveLevel({ activeLevelId: useGameStore.getState().activeLevelId }));
  const dragSessionRef = useRef<DragSession | null>(null);
  const previewRef = useRef<PreviewPlacement | undefined>(undefined);
  const lastBeatRef = useRef(0);
  const audioReadyRef = useRef(false);
  const audioTriggerRef = useRef(new Set<string>());
  const loadRequestRef = useRef(0);

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
  const placeBlock = useGameStore((state) => state.placeBlock);
  const removePlacementAt = useGameStore((state) => state.removePlacementAt);
  const startDrag = useGameStore((state) => state.startDrag);
  const updateDragPointer = useGameStore((state) => state.updateDragPointer);
  const rotateDrag = useGameStore((state) => state.rotateDrag);
  const endDrag = useGameStore((state) => state.endDrag);
  const level = getActiveLevel({ activeLevelId });

  useEffect(() => {
    levelRef.current = level;
  }, [level]);

  useEffect(() => {
    audioEngine.setMix(audioMix);
  }, [audioMix]);

  const stashPieces = useMemo(() => buildStashPieces(level, placements, draggingBlockId), [draggingBlockId, level, placements]);
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

  useEffect(() => {
    const scene = new ThreeScene();
    sceneRef.current = scene;
    if (mountRef.current) {
      scene.mount(mountRef.current);
    }

    const transport = new Transport(level.bpm, level.loopBeats);
    transportRef.current = transport;
    const unsubscribe = transport.subscribe((beat) => {
      setCurrentBeat(beat);
      const activeLevel = levelRef.current;
      scene.update(
        activeLevel,
        beat,
        useGameStore.getState().placements,
        useGameStore.getState().showPaths,
        buildStashPieces(activeLevel, useGameStore.getState().placements, useGameStore.getState().draggingBlockId),
        pressedPlacementIdsRef.current,
        previewRef.current,
      );
    });

    const dom = scene.getDomElement();

    const unlockAudio = async () => {
      if (!audioReadyRef.current) {
        await audioEngine.start();
        audioReadyRef.current = true;
      }
    };

    const handlePointerDown = async (event: PointerEvent) => {
      await unlockAudio();
      const hit = scene.pickSceneObject(event.clientX, event.clientY);
      if (!hit) {
        return;
      }

      if (hit.kind === "stash") {
        dragSessionRef.current = { source: "stash" };
        startDrag(hit.blockId, { x: event.clientX, y: event.clientY }, 0);
        return;
      }

      dragSessionRef.current = {
        source: "board",
        originalPlacement: hit.placement,
      };
      removePlacementAt(hit.placement.origin.x, hit.placement.origin.y);
      startDrag(hit.placement.blockId, { x: event.clientX, y: event.clientY }, hit.placement.rotation);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const state = useGameStore.getState();
      if (!state.draggingBlockId) {
        return;
      }

      updateDragPointer({ x: event.clientX, y: event.clientY });
      const activeLevel = levelRef.current;
      const cell = scene.getCellFromPointer(event.clientX, event.clientY, activeLevel, true);
      if (!cell) {
        setPreview(undefined);
        previewRef.current = undefined;
        return;
      }

      const nextPlacement: Placement = {
        blockId: state.draggingBlockId,
        origin: cell,
        rotation: state.draggingRotation,
      };
      const nextPreview: PreviewPlacement = {
        placement: nextPlacement,
        valid: validatePlacements(activeLevel, [...useGameStore.getState().placements, nextPlacement]).valid,
      };
      setPreview(nextPreview);
      previewRef.current = nextPreview;
      scene.update(
        activeLevel,
        useGameStore.getState().currentBeat,
        useGameStore.getState().placements,
        useGameStore.getState().showPaths,
        buildStashPieces(activeLevel, useGameStore.getState().placements, useGameStore.getState().draggingBlockId),
        pressedPlacementIdsRef.current,
        nextPreview,
      );
    };

    const handlePointerUp = () => {
      const state = useGameStore.getState();
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
      previewRef.current = undefined;
      setPreview(undefined);
      endDrag();
    };

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      const activeLevel = levelRef.current;
      const cell = scene.getCellFromPointer(event.clientX, event.clientY, activeLevel);
      if (cell) {
        removePlacementAt(cell.x, cell.y);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "r" || !useGameStore.getState().draggingBlockId) {
        return;
      }

      event.preventDefault();
      rotateDrag();

      const pointer = useGameStore.getState().dragPointer;
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

      const rotation = useGameStore.getState().draggingRotation === 0 ? 90 : 0;
      const nextPlacement: Placement = {
        blockId: useGameStore.getState().draggingBlockId!,
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

    const handleResize = () => scene.resize();

    window.addEventListener("pointerdown", unlockAudio);
    dom.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    dom.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);

    transport.start();

    return () => {
      unsubscribe();
      window.removeEventListener("pointerdown", unlockAudio);
      dom.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      dom.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
      transport.dispose();
      scene.dispose();
    };
  }, [endDrag, placeBlock, removePlacementAt, rotateDrag, setCurrentBeat, startDrag, updateDragPointer]);

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
    previewRef.current = undefined;
    setPreview(undefined);
  }, [level]);

  useEffect(() => {
    const modelPaths = levels.flatMap((entry) =>
      entry.animals
        .map((animal) => entry.models[animal.animalType])
        .filter((path): path is string => Boolean(path)),
    );

    void ThreeScene.preloadModels(modelPaths);
  }, [levels]);

  useEffect(() => {
    pressedPlacementIdsRef.current = pressedPlacementIds;
    sceneRef.current?.update(level, currentBeat, placements, showPaths, stashPieces, pressedPlacementIds, preview);
  }, [currentBeat, level, placements, preview, pressedPlacementIds, showPaths, stashPieces]);

  useEffect(() => {
    if (currentBeat < lastBeatRef.current) {
      audioTriggerRef.current.clear();
    }

    if (!audioReadyRef.current) {
      lastBeatRef.current = currentBeat;
      return;
    }

    for (const note of simulation.targetNotes) {
      if (crossedBeat(lastBeatRef.current, currentBeat, note.beat)) {
        audioEngine.playReference(note, note.state);
      }
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
      audioEngine.playTrigger(trigger, matched);
    }
    lastBeatRef.current = currentBeat;
  }, [currentBeat, simulation]);

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

const pressedPlacementIdsRef: { current: Set<string> } = { current: new Set<string>() };

function crossedBeat(previous: number, current: number, target: number) {
  if (current >= previous) {
    return target >= previous && target < current;
  }

  return target >= previous || target < current || Math.abs(target - current) < 0.0001;
}

function normalizedBeatDelta(currentBeat: number, targetBeat: number, loopBeats: number) {
  const raw = currentBeat - targetBeat;
  return raw >= 0 ? raw : raw + loopBeats;
}

function buildStashPieces(level: ReturnType<typeof getActiveLevel>, placements: Placement[], draggingBlockId?: string): StashPiece[] {
  const usage = new Map<string, number>();
  for (const placement of placements) {
    usage.set(placement.blockId, (usage.get(placement.blockId) ?? 0) + 1);
  }
  if (draggingBlockId) {
    usage.set(draggingBlockId, (usage.get(draggingBlockId) ?? 0) + 1);
  }

  const occupied = new Set<string>();
  const candidates = buildReserveCells(level.board.width, level.board.height);
  return level.inventory.flatMap((block) => {
    const used = usage.get(block.id) ?? 0;
    const slots = Array.from({ length: block.quantity }, (_, index) => {
      const cell = findReserveOrigin(candidates, occupied, block.width, block.height);
      const stashPiece: StashPiece = {
        pieceId: `${block.id}-${index}`,
        blockId: block.id,
        rotation: 0,
        worldX: cell.x,
        worldZ: cell.y,
      };
      return stashPiece;
    });
    return slots.slice(Math.min(used, slots.length));
  });
}

function buildReserveCells(width: number, height: number) {
  const cells: { x: number; y: number }[] = [];
  for (let x = -2; x < width + 2; x += 1) {
    cells.push({ x, y: -2 }, { x, y: height + 1 });
  }
  for (let y = -1; y <= height; y += 1) {
    cells.push({ x: -2, y }, { x: width + 1, y });
  }
  const unique = new Map<string, { x: number; y: number }>();
  for (const cell of cells) {
    unique.set(`${cell.x},${cell.y}`, cell);
  }
  return [...unique.values()];
}

function findReserveOrigin(
  candidates: { x: number; y: number }[],
  occupied: Set<string>,
  width: number,
  height: number,
) {
  for (const candidate of candidates) {
    let canPlace = true;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (occupied.has(`${candidate.x + x},${candidate.y + y}`)) {
          canPlace = false;
        }
      }
    }
    if (!canPlace) {
      continue;
    }

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        occupied.add(`${candidate.x + x},${candidate.y + y}`);
      }
    }
    return candidate;
  }

  return candidates[0] ?? { x: -2, y: -2 };
}
