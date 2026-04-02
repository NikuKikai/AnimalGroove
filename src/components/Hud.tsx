import { getActiveLevel, useGameStore } from "../game/state/gameStore";

export function Hud() {
  const activeLevelId = useGameStore((state) => state.activeLevelId);
  const levels = useGameStore((state) => state.levels);
  const showPaths = useGameStore((state) => state.showPaths);
  const currentBeat = useGameStore((state) => state.currentBeat);
  const simulation = useGameStore((state) => state.simulation);
  const setActiveLevel = useGameStore((state) => state.setActiveLevel);
  const togglePaths = useGameStore((state) => state.togglePaths);
  const resetPlacements = useGameStore((state) => state.resetPlacements);

  const level = getActiveLevel({ activeLevelId });

  return (
    <header className="overlay-panel hud-panel">
      <div className="hud-row">
        <select value={activeLevelId} onChange={(event) => setActiveLevel(event.target.value)}>
          {levels.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
      </div>
      <div className="hud-row hud-controls">
        <button type="button" onClick={resetPlacements}>
          Reset
        </button>
        <button type="button" onClick={togglePaths}>
          Paths {showPaths ? "On" : "Off"}
        </button>
        <span
          className={`hud-pill ${simulation.solved ? "solved" : ""}`}
          title={`Matched ${simulation.targetNotes.filter((note) => note.state === "matched").length} of ${simulation.targetNotes.length}`}
        >
          {simulation.targetNotes.filter((note) => note.state === "matched").length}/{simulation.targetNotes.length}
        </span>
        <span className="hud-pill" title={`BPM ${level.bpm}, beat ${currentBeat.toFixed(2)} of ${level.loopBeats}`}>
          {currentBeat.toFixed(2)}
        </span>
        <div className="hud-timeline" title="Target rhythm timeline. Green is matched, orange is missed, pale is pending.">
          {level.targetRhythm.map((note) => {
            const state = simulation.targetNotes.find((entry) => entry.id === note.id)?.state ?? "pending";
            return (
              <span
                key={note.id}
                className={`timeline-note ${state}`}
                style={{ left: `${(note.beat / level.loopBeats) * 100}%` }}
                title={`${note.timbre} @ beat ${note.beat}`}
              />
            );
          })}
          <span className="timeline-cursor" style={{ left: `${(currentBeat / level.loopBeats) * 100}%` }} />
        </div>
      </div>
    </header>
  );
}
