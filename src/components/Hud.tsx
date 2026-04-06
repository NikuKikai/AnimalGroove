import { getActiveLevel, useGameStore } from "../game/state/gameStore";

/** Renders the top HUD with level controls, hints, and audio mix controls. */
export function Hud() {
  const activeLevelId = useGameStore((state) => state.activeLevelId);
  const levels = useGameStore((state) => state.levels);
  const showPaths = useGameStore((state) => state.showPaths);
  const currentBeat = useGameStore((state) => state.currentBeat);
  const audioMix = useGameStore((state) => state.audioMix);
  const simulation = useGameStore((state) => state.simulation);
  const setActiveLevel = useGameStore((state) => state.setActiveLevel);
  const togglePaths = useGameStore((state) => state.togglePaths);
  const resetPlacements = useGameStore((state) => state.resetPlacements);
  const setAudioVolume = useGameStore((state) => state.setAudioVolume);
  const toggleAudioMute = useGameStore((state) => state.toggleAudioMute);

  const level = getActiveLevel({ activeLevelId });

  return (
    <header className="overlay-panel hud-panel">
      <div className="hud-row hud-top-row">
        <div className="hud-group hud-level-group">
          <select value={activeLevelId} onChange={(event) => setActiveLevel(event.target.value)}>
            {levels.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </div>
        <div className="hud-group hud-button-group">
          <button type="button" onClick={resetPlacements}>
            Reset
          </button>
          <button type="button" className={`hint-button ${showPaths ? "is-active" : ""}`} onClick={togglePaths}>
            Path Hint
          </button>
        </div>
        <div className="hud-group hud-mix-group">
          <AudioControl
            label="Hit"
            value={audioMix.hit.volume}
            muted={audioMix.hit.muted}
            onChange={(value) => setAudioVolume("hit", value)}
            onToggleMute={() => toggleAudioMute("hit")}
          />
          <AudioControl
            label="Ref"
            value={audioMix.reference.volume}
            muted={audioMix.reference.muted}
            onChange={(value) => setAudioVolume("reference", value)}
            onToggleMute={() => toggleAudioMute("reference")}
          />
          <AudioControl
            label="Wrong"
            value={audioMix.wrong.volume}
            muted={audioMix.wrong.muted}
            onChange={(value) => setAudioVolume("wrong", value)}
            onToggleMute={() => toggleAudioMute("wrong")}
          />
        </div>
      </div>
      {showPaths ? (
        <div className="hud-row hud-timeline-row">
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
      ) : null}
    </header>
  );
}

type AudioControlProps = {
  label: string;
  value: number;
  muted: boolean;
  onChange: (value: number) => void;
  onToggleMute: () => void;
};

/** Renders one audio channel control row with a volume slider and mute toggle. */
function AudioControl({ label, value, muted, onChange, onToggleMute }: AudioControlProps) {
  return (
    <label className={`audio-control ${muted ? "is-muted" : ""}`} title={`${label} volume`}>
      <span className="audio-label">{label}</span>
      <input
        className="audio-slider"
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <button type="button" className={`audio-mute ${muted ? "is-active" : ""}`} onClick={onToggleMute} aria-pressed={muted}>
        Mute
      </button>
    </label>
  );
}
