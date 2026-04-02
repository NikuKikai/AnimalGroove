import { useEffect, useMemo, useRef, useState } from "react";
import { AudioEngine } from "../game/audio/audioEngine";
import { Transport } from "../game/engine/transport";
import type { PreviewPlacement, StashPiece } from "../game/render/threeScene";
import { ThreeScene } from "../game/render/threeScene";
import { getActiveLevel, useGameStore } from "../game/state/gameStore";
import { validatePlacements } from "../game/simulation";
import type { Placement } from "../game/types";

const audioEngine = new AudioEngine();

type DragSession =
  | { source: "stash" }
  | { source: "board"; originalPlacement: Placement };

export function BoardView() {
  const mountRef = useRef<HTMLDivElement>(null);
  const transportRef = useRef<Transport | null>(null);
  const sceneRef = useRef<ThreeScene | null>(null);
  const dragSessionRef = useRef<DragSession | null>(null);
  const previewRef = useRef<PreviewPlacement | undefined>(undefined);
  const lastBeatRef = useRef(0);
  const audioReadyRef = useRef(false);
  const audioTriggerRef = useRef(new Set<string>());

  const [preview, setPreview] = useState<PreviewPlacement | undefined>(undefined);

  const activeLevelId = useGameStore((state) => state.activeLevelId);
  const placements = useGameStore((state) => state.placements);
  const draggingBlockId = useGameStore((state) => state.draggingBlockId);
  const draggingRotation = useGameStore((state) => state.draggingRotation);
  const dragPointer = useGameStore((state) => state.dragPointer);
  const showPaths = useGameStore((state) => state.showPaths);
  const currentBeat = useGameStore((state) => state.currentBeat);
  const simulation = useGameStore((state) => state.simulation);
  const setCurrentBeat = useGameStore((state) => state.setCurrentBeat);
  const placeBlock = useGameStore((state) => state.placeBlock);
  const removePlacementAt = useGameStore((state) => state.removePlacementAt);
  const startDrag = useGameStore((state) => state.startDrag);
  const updateDragPointer = useGameStore((state) => state.updateDragPointer);
  const rotateDrag = useGameStore((state) => state.rotateDrag);
  const endDrag = useGameStore((state) => state.endDrag);
  const level = getActiveLevel({ activeLevelId });

  const stashPieces = useMemo(() => buildStashPieces(level, placements, draggingBlockId), [draggingBlockId, level, placements]);

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
      scene.update(
        level,
        beat,
        useGameStore.getState().placements,
        useGameStore.getState().showPaths,
        buildStashPieces(level, useGameStore.getState().placements, useGameStore.getState().draggingBlockId),
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
      const cell = scene.getCellFromPointer(event.clientX, event.clientY, level);
      if (!cell) {
        setPreview(undefined);
        previewRef.current = undefined;
        return;
      }

      const nextPreview: PreviewPlacement = {
        placement: {
          blockId: state.draggingBlockId,
          origin: cell,
          rotation: state.draggingRotation,
        },
        valid: validatePlacements(level, [...useGameStore.getState().placements, {
          blockId: state.draggingBlockId,
          origin: cell,
          rotation: state.draggingRotation,
        }]).valid,
      };
      setPreview(nextPreview);
      previewRef.current = nextPreview;
      scene.update(
        level,
        useGameStore.getState().currentBeat,
        useGameStore.getState().placements,
        useGameStore.getState().showPaths,
        buildStashPieces(level, useGameStore.getState().placements, useGameStore.getState().draggingBlockId),
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
      const cell = scene.getCellFromPointer(event.clientX, event.clientY, level);
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

      const cell = scene.getCellFromPointer(pointer.x, pointer.y, level);
      if (!cell) {
        setPreview(undefined);
        previewRef.current = undefined;
        return;
      }

      const rotation = useGameStore.getState().draggingRotation === 0 ? 90 : 0;
      const nextPreview: PreviewPlacement = {
        placement: {
          blockId: useGameStore.getState().draggingBlockId!,
          origin: cell,
          rotation,
        },
        valid: validatePlacements(level, [...useGameStore.getState().placements, {
          blockId: useGameStore.getState().draggingBlockId!,
          origin: cell,
          rotation,
        }]).valid,
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
  }, [endDrag, level, placeBlock, removePlacementAt, rotateDrag, setCurrentBeat, startDrag, updateDragPointer]);

  useEffect(() => {
    void sceneRef.current?.loadLevel(level);
    transportRef.current?.updateConfig(level.bpm, level.loopBeats);
    transportRef.current?.reset();
    lastBeatRef.current = 0;
    audioTriggerRef.current.clear();
    previewRef.current = undefined;
    setPreview(undefined);
  }, [level]);

  useEffect(() => {
    sceneRef.current?.update(level, currentBeat, placements, showPaths, stashPieces, preview);
  }, [currentBeat, level, placements, preview, showPaths, stashPieces]);

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
      <div className="scene-mount" ref={mountRef} />
    </section>
  );
}

function crossedBeat(previous: number, current: number, target: number) {
  if (current >= previous) {
    return target >= previous && target < current;
  }

  return target >= previous || target < current || Math.abs(target - current) < 0.0001;
}

function buildStashPieces(level: ReturnType<typeof getActiveLevel>, placements: Placement[], draggingBlockId?: string): StashPiece[] {
  const usage = new Map<string, number>();
  for (const placement of placements) {
    usage.set(placement.blockId, (usage.get(placement.blockId) ?? 0) + 1);
  }
  if (draggingBlockId) {
    usage.set(draggingBlockId, (usage.get(draggingBlockId) ?? 0) + 1);
  }

  const reserveCells = buildReserveCells(level.board.width, level.board.height);
  let reserveIndex = 0;
  return level.inventory.flatMap((block) => {
    const used = usage.get(block.id) ?? 0;
    const remaining = Math.max(0, block.quantity - used);
    return Array.from({ length: remaining }, (_, index) => {
      const cell = reserveCells[reserveIndex % reserveCells.length];
      reserveIndex += 1;
      return {
        pieceId: `${block.id}-${index}`,
        blockId: block.id,
        rotation: 0,
        worldX: cell.x + 0.5,
        worldZ: cell.y + 0.5,
      };
    });
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
  return cells;
}
