import { useMemo } from "react";
import { getActiveLevel, useGameStore } from "../game/state/gameStore";

/** Renders the legacy DOM backpack view for block inventory testing. */
export function Backpack() {
  const activeLevelId = useGameStore((state) => state.activeLevelId);
  const placements = useGameStore((state) => state.placements);
  const startDrag = useGameStore((state) => state.startDrag);
  const level = getActiveLevel({ activeLevelId });

  const loosePieces = useMemo(() => {
    const usage = new Map<string, number>();
    for (const placement of placements) {
      usage.set(placement.blockId, (usage.get(placement.blockId) ?? 0) + 1);
    }

    return level.inventory.flatMap((block) => {
      const used = usage.get(block.id) ?? 0;
      const remaining = Math.max(0, block.quantity - used);
      return Array.from({ length: remaining }, (_, index) => ({
        pieceId: `${block.id}-${index}`,
        block,
      }));
    });
  }, [level.inventory, placements]);

  return (
    <aside className="overlay-panel backpack-panel">
      <h2>Backpack</h2>
      <p className="panel-copy">Drag a physical block onto the ground. Press R while dragging to rotate.</p>
      <div className="piece-rack">
        {loosePieces.map(({ pieceId, block }) => (
          <button
            key={pieceId}
            type="button"
            className={`piece-token ${block.width > 1 || block.height > 1 ? "wide" : ""}`}
            style={{
              background: block.color,
              width: `${block.width * 42}px`,
              height: `${block.height * 42}px`,
            }}
            onPointerDown={(event) => {
              startDrag(block.id, { x: event.clientX, y: event.clientY });
            }}
            title={`${block.name} ${block.width}x${block.height}`}
          >
            <span>{block.timbre}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
