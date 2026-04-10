import type { AudioChannelKey, AudioMixState } from "../../game/state/gameStore";

type HudToplineProps = {
  isMenuOpen: boolean;
  isHintActive: boolean;
  matchPercent: number;
  audioMix: AudioMixState;
  onOpenLevels: () => void;
  onResetPlacements: () => void;
  onToggleHint: () => void;
  onToggleMenu: () => void;
  onSetAudioVolume: (channel: AudioChannelKey, value: number) => void;
  onApplySolution: () => void;
};

/** Renders the top floating controls, match gauge, and right menu. */
export function HudTopline({
  isMenuOpen,
  isHintActive,
  matchPercent,
  audioMix,
  onOpenLevels,
  onResetPlacements,
  onToggleHint,
  onToggleMenu,
  onSetAudioVolume,
  onApplySolution,
}: HudToplineProps) {
  return (
    <div className="hud-topline">
      <div className="hud-left-controls">
        <button type="button" className="hud-float-button" onClick={onOpenLevels}>
          Levels
        </button>
        <button type="button" className="hud-float-button" onClick={onResetPlacements}>
          Reset
        </button>
        <button type="button" className={`hud-float-button ${isHintActive ? "is-active" : ""}`} onClick={onToggleHint}>
          Hint
        </button>
      </div>

      <aside className="hud-match-gauge-inline" title="Curve match score">
        <div className="hud-match-value">{Math.round(matchPercent)}%</div>
        <div className="hud-match-track-inline">
          <div className="hud-match-fill-inline" style={{ width: `${Math.max(0, Math.min(100, matchPercent))}%` }} />
        </div>
      </aside>

      <div className="hud-right-controls">
        <button
          type="button"
          className={`hud-float-button ${isMenuOpen ? "is-active" : ""}`}
          onClick={onToggleMenu}
          aria-expanded={isMenuOpen}
        >
          Menu
        </button>
        {isMenuOpen ? (
          <section className="overlay-panel hud-menu-panel">
            <div className="hud-menu-title">Audio</div>
            <div className="hud-menu-audio">
              <AudioControl label="Hit" value={audioMix.hit.volume} onChange={(value) => onSetAudioVolume("hit", value)} />
              <AudioControl label="Ref" value={audioMix.reference.volume} onChange={(value) => onSetAudioVolume("reference", value)} />
              <AudioControl label="Wrong" value={audioMix.wrong.volume} onChange={(value) => onSetAudioVolume("wrong", value)} />
            </div>
            <button type="button" className="hint-button" onClick={onApplySolution}>
              Show Solution
            </button>
          </section>
        ) : null}
      </div>
    </div>
  );
}

type AudioControlProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
};

/** Renders one audio channel slider row. */
function AudioControl({ label, value, onChange }: AudioControlProps) {
  return (
    <label className="audio-control" title={`${label} volume`}>
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
    </label>
  );
}
