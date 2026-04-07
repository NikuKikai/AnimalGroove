import { getActiveLevel, useGameStore } from "../game/state/gameStore";
import type { RhythmEvent, TriggerEvent } from "../game/types";

/** Renders the top HUD with level controls, hints, and audio mix controls. */
export function Hud() {
  const activeLevelId = useGameStore((state) => state.activeLevelId);
  const levels = useGameStore((state) => state.levels);
  const showPaths = useGameStore((state) => state.showPaths);
  const currentBeat = useGameStore((state) => state.currentBeat);
  const audioMix = useGameStore((state) => state.audioMix);
  const simulation = useGameStore((state) => state.simulation);
  const setActiveLevel = useGameStore((state) => state.setActiveLevel);
  const createRandomLevel = useGameStore((state) => state.createRandomLevel);
  const togglePaths = useGameStore((state) => state.togglePaths);
  const resetPlacements = useGameStore((state) => state.resetPlacements);
  const setAudioVolume = useGameStore((state) => state.setAudioVolume);
  const toggleAudioMute = useGameStore((state) => state.toggleAudioMute);

  const level = getActiveLevel({ activeLevelId, levels });
  const laneKeys = collectTimelineLanes(level.targetRhythm, simulation.producedTriggers);
  const matchPercent = computeCurveMatchPercent(level.targetRhythm, simulation.producedTriggers, level.loopBeats);

  return (
    <div className="hud-cluster">
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
            <button type="button" onClick={createRandomLevel} title="Generate a random test level">
              Random
            </button>
          </div>
          <div className="hud-group hud-button-group">
            <button type="button" onClick={resetPlacements}>
              Reset
            </button>
            <button type="button" className={`hint-button ${showPaths ? "is-active" : ""}`} onClick={togglePaths}>
              Hint
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
            <div className="hud-timeline-multilane" title="Rows are timbres. Filled area is target groove. Line is produced groove. Height uses note velocity/animal weight.">
              {laneKeys.map((lane) => (
                <RhythmLane
                  key={lane}
                  lane={lane}
                  loopBeats={level.loopBeats}
                  currentBeat={currentBeat}
                  target={level.targetRhythm.filter((note) => note.timbre === lane)}
                  produced={simulation.producedTriggers.filter((trigger) => trigger.timbre === lane)}
                />
              ))}
            </div>
          </div>
        ) : null}
      </header>
      <div className="hud-gauge-row">
        <aside className="hud-match-gauge" title="Curve match score">
          <div className="hud-match-value">{Math.round(matchPercent)}%</div>
          <div className="hud-match-track">
            <div className="hud-match-fill" style={{ height: `${Math.max(0, Math.min(100, matchPercent))}%` }} />
          </div>
        </aside>
      </div>
    </div>
  );
}

type RhythmLaneProps = {
  lane: string;
  loopBeats: number;
  currentBeat: number;
  target: RhythmEvent[];
  produced: TriggerEvent[];
};

/** Renders one timbre lane as filled target pulses and a produced pulse curve. */
function RhythmLane({ lane, loopBeats, currentBeat, target, produced }: RhythmLaneProps) {
  const viewWidth = 1000;
  const viewHeight = 44;
  const maxReferenceVelocity = Math.max(1, ...target.map((note) => note.velocity ?? 1));
  const maxProducedWeight = Math.max(1, ...produced.map((trigger) => trigger.weight));
  const referencePath = buildPulseAreaPath(target, loopBeats, viewWidth, viewHeight, maxReferenceVelocity, "velocity");
  const producedPath = buildPulseLinePath(produced, loopBeats, viewWidth, viewHeight, maxProducedWeight, "weight");
  const cursorX = (currentBeat / loopBeats) * viewWidth;

  return (
    <div className="hud-lane">
      <span className="hud-lane-label">{lane.slice(0, 1).toUpperCase()}</span>
      <svg className="hud-lane-plot" viewBox={`0 0 ${viewWidth} ${viewHeight}`} preserveAspectRatio="none">
        <line className="hud-lane-baseline" x1="0" y1={viewHeight - 1} x2={viewWidth} y2={viewHeight - 1} />
        <path className="hud-lane-produced" d={producedPath} />
        <path className="hud-lane-reference" d={referencePath} />
        <line className="hud-lane-cursor" x1={cursorX} y1="0" x2={cursorX} y2={viewHeight} />
      </svg>
    </div>
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

/** Collects deterministic lane order for timeline rows. */
function collectTimelineLanes(targetRhythm: RhythmEvent[], producedTriggers: TriggerEvent[]) {
  const preferred = ["kick", "snare", "hat"];
  const seen = new Set<string>();
  const lanes: string[] = [];

  for (const lane of preferred) {
    if (targetRhythm.some((entry) => entry.timbre === lane) || producedTriggers.some((entry) => entry.timbre === lane)) {
      seen.add(lane);
      lanes.push(lane);
    }
  }

  for (const lane of targetRhythm.map((entry) => entry.timbre).concat(producedTriggers.map((entry) => entry.timbre))) {
    if (!seen.has(lane)) {
      seen.add(lane);
      lanes.push(lane);
    }
  }

  return lanes;
}

/** Builds a closed area path for target pulses using event velocity as height. */
function buildPulseAreaPath<T extends RhythmEvent | TriggerEvent>(
  events: T[],
  loopBeats: number,
  viewWidth: number,
  viewHeight: number,
  normalizer: number,
  valueKey: "velocity" | "weight",
) {
  const baseline = viewHeight - 1;
  const pulseBeatWidth = Math.max(0.08, loopBeats * 0.018);
  const segments: Array<{ leftBeat: number; rightBeat: number; amplitude: number }> = [];
  for (const event of events) {
    const amplitudeRaw = valueKey === "velocity" ? (event as RhythmEvent).velocity ?? 1 : (event as TriggerEvent).weight;
    const amplitude = Math.max(0.15, Math.min(1, amplitudeRaw / normalizer));
    const wrapped = buildWrappedPulseSegments(event.beat, pulseBeatWidth * 0.5, loopBeats);
    for (const segment of wrapped) {
      segments.push({
        leftBeat: segment.leftBeat,
        rightBeat: segment.rightBeat,
        amplitude,
      });
    }
  }
  const sorted = segments.sort((left, right) => left.leftBeat - right.leftBeat);
  let path = `M 0 ${baseline}`;

  for (const segment of sorted) {
    const amplitude = segment.amplitude;
    const topY = baseline - amplitude * (viewHeight - 7);
    const leftBeat = segment.leftBeat;
    const rightBeat = segment.rightBeat;
    const leftX = (leftBeat / loopBeats) * viewWidth;
    const rightX = (rightBeat / loopBeats) * viewWidth;
    path += ` L ${leftX.toFixed(2)} ${baseline} L ${leftX.toFixed(2)} ${topY.toFixed(2)} L ${rightX.toFixed(2)} ${topY.toFixed(2)} L ${rightX.toFixed(2)} ${baseline}`;
  }

  path += ` L ${viewWidth} ${baseline} Z`;
  return path;
}

/** Builds a stroke-only pulse path for produced notes using animal weight as height. */
function buildPulseLinePath<T extends RhythmEvent | TriggerEvent>(
  events: T[],
  loopBeats: number,
  viewWidth: number,
  viewHeight: number,
  normalizer: number,
  valueKey: "velocity" | "weight",
) {
  const baseline = viewHeight - 1;
  const pulseBeatWidth = Math.max(0.08, loopBeats * 0.018);
  const segments: Array<{ leftBeat: number; rightBeat: number; amplitude: number }> = [];
  for (const event of events) {
    const amplitudeRaw = valueKey === "velocity" ? (event as RhythmEvent).velocity ?? 1 : (event as TriggerEvent).weight;
    const amplitude = Math.max(0.15, Math.min(1, amplitudeRaw / normalizer));
    const wrapped = buildWrappedPulseSegments(event.beat, pulseBeatWidth * 0.5, loopBeats);
    for (const segment of wrapped) {
      segments.push({
        leftBeat: segment.leftBeat,
        rightBeat: segment.rightBeat,
        amplitude,
      });
    }
  }
  const sorted = segments.sort((left, right) => left.leftBeat - right.leftBeat);
  let path = `M 0 ${baseline}`;

  for (const segment of sorted) {
    const amplitude = segment.amplitude;
    const topY = baseline - amplitude * (viewHeight - 7);
    const leftBeat = segment.leftBeat;
    const rightBeat = segment.rightBeat;
    const leftX = (leftBeat / loopBeats) * viewWidth;
    const rightX = (rightBeat / loopBeats) * viewWidth;
    path += ` L ${leftX.toFixed(2)} ${baseline} L ${leftX.toFixed(2)} ${topY.toFixed(2)} L ${rightX.toFixed(2)} ${topY.toFixed(2)} L ${rightX.toFixed(2)} ${baseline}`;
  }

  path += ` L ${viewWidth} ${baseline}`;
  return path;
}

/** Computes a weighted rhythm match score from timing precision and amplitude similarity. */
function computeCurveMatchPercent(target: RhythmEvent[], produced: TriggerEvent[], loopBeats: number) {
  if (target.length === 0 && produced.length === 0) {
    return 100;
  }

  const tolerance = Math.max(0.08, loopBeats * 0.02);
  const usedProduced = new Set<string>();
  let matched = 0;
  let amplitudeScore = 0;

  for (const note of target) {
    let best: TriggerEvent | undefined;
    let bestDistance = Infinity;

    for (const trigger of produced) {
      if (usedProduced.has(trigger.id) || trigger.timbre !== note.timbre) {
        continue;
      }

      const distance = wrappedBeatDistance(note.beat, trigger.beat, loopBeats);
      if (distance < bestDistance && distance <= tolerance) {
        best = trigger;
        bestDistance = distance;
      }
    }

    if (!best) {
      continue;
    }

    usedProduced.add(best.id);
    matched += 1;
    const targetAmp = Math.max(0.01, note.velocity ?? 1);
    const producedAmp = Math.max(0.01, best.weight);
    const ampDiff = Math.abs(targetAmp - producedAmp) / Math.max(targetAmp, producedAmp);
    amplitudeScore += 1 - Math.max(0, Math.min(1, ampDiff));
  }

  const misses = Math.max(0, target.length - matched);
  const extras = Math.max(0, produced.length - matched);
  const precision = matched / Math.max(1, matched + extras);
  const recall = matched / Math.max(1, matched + misses);
  const amplitude = matched > 0 ? amplitudeScore / matched : 0;
  const score = precision * 0.4 + recall * 0.45 + amplitude * 0.15;
  return Math.max(0, Math.min(100, score * 100));
}

/** Returns circular beat distance inside a looping timeline. */
function wrappedBeatDistance(left: number, right: number, loopBeats: number) {
  const raw = Math.abs(left - right) % loopBeats;
  return Math.min(raw, loopBeats - raw);
}

/** Splits one centered pulse into one or two in-range segments for looping timelines. */
function buildWrappedPulseSegments(centerBeat: number, halfWidth: number, loopBeats: number) {
  const left = centerBeat - halfWidth;
  const right = centerBeat + halfWidth;
  if (left >= 0 && right <= loopBeats) {
    return [{ leftBeat: left, rightBeat: right }];
  }

  if (left < 0) {
    return [
      { leftBeat: 0, rightBeat: right },
      { leftBeat: loopBeats + left, rightBeat: loopBeats },
    ];
  }

  if (right > loopBeats) {
    return [
      { leftBeat: left, rightBeat: loopBeats },
      { leftBeat: 0, rightBeat: right - loopBeats },
    ];
  }

  return [{ leftBeat: 0, rightBeat: 0 }];
}
