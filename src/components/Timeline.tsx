import { getActiveLevel, useGameStore } from "../game/state/gameStore";

/** Renders a standalone target timeline panel for debugging and tuning. */
export function Timeline() {
  const activeLevelId = useGameStore((state) => state.activeLevelId);
  const currentBeat = useGameStore((state) => state.currentBeat);
  const simulation = useGameStore((state) => state.simulation);
  const level = getActiveLevel({ activeLevelId });

  return (
    <section className="overlay-panel timeline-panel">
      <h2>Target Timeline</h2>
      <div className="timeline-track">
        {level.targetRhythm.map((note) => {
          const state = simulation.targetNotes.find((entry) => entry.id === note.id)?.state ?? "pending";
          return (
            <span
              key={note.id}
              className={`timeline-note ${state}`}
              style={{ left: `${(note.beat / level.loopBeats) * 100}%` }}
              title={`${note.timbre} @ ${note.beat}`}
            />
          );
        })}
        <span className="timeline-cursor" style={{ left: `${(currentBeat / level.loopBeats) * 100}%` }} />
      </div>
      <div className="timeline-legend">
        <span>Pending = muffled reference</span>
        <span>Matched = full signal</span>
        <span>Missed/Extra = filtered error</span>
      </div>
    </section>
  );
}
