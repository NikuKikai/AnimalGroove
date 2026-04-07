import { useMemo } from "react";
import { useGameStore } from "../game/state/gameStore";

/** Displays a compact debugging summary of the current simulation state. */
export function DebugPanel() {
  const simulation = useGameStore((state) => state.simulation);
  const placements = useGameStore((state) => state.placements);
  const applySolution = useGameStore((state) => state.applySolution);
  const summary = useMemo(
    () => ({
      matched: simulation.targetNotes.filter((note) => note.state === "matched").length,
      missed: simulation.targetNotes.filter((note) => note.state === "missed").length,
      extra: simulation.extraTriggers.length,
    }),
    [simulation],
  );

  return (
    <section className="overlay-panel debug-panel">
      <h2>Debug</h2>
      <p className="panel-copy">This mirrors the offline simulation and judge output.</p>
      <div className="debug-grid">
        <span>Placements</span>
        <span>{placements.length}</span>
        <span>Matched</span>
        <span>{summary.matched}</span>
        <span>Missed</span>
        <span>{summary.missed}</span>
        <span>Extra</span>
        <span>{summary.extra}</span>
      </div>
      <div className="debug-actions">
        <button type="button" onClick={applySolution}>
          Show Solution
        </button>
      </div>
    </section>
  );
}
