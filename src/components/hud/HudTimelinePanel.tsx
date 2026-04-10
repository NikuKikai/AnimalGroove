import type { RhythmEvent, TriggerEvent } from "../../game/types";
import { buildPulseAreaPath, buildPulseLinePath, collectTimelineLanes } from "./rhythmMetrics";

type HudTimelinePanelProps = {
  currentBeat: number;
  loopBeats: number;
  targetRhythm: RhythmEvent[];
  producedTriggers: TriggerEvent[];
};

/** Renders the multi-lane rhythm timeline panel shown while hint mode is enabled. */
export function HudTimelinePanel({ currentBeat, loopBeats, targetRhythm, producedTriggers }: HudTimelinePanelProps) {
  const laneKeys = collectTimelineLanes(targetRhythm, producedTriggers);

  return (
    <section className="overlay-panel hud-timeline-panel">
      <div className="hud-timeline-multilane" title="Rows are timbres. Filled area is target groove. Line is produced groove. Height uses note velocity/animal weight.">
        {laneKeys.map((lane) => (
          <RhythmLane
            key={lane}
            lane={lane}
            loopBeats={loopBeats}
            currentBeat={currentBeat}
            target={targetRhythm.filter((note) => note.timbre === lane)}
            produced={producedTriggers.filter((trigger) => trigger.timbre === lane)}
          />
        ))}
      </div>
    </section>
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
  const referencePath = buildPulseAreaPath(target, loopBeats, viewWidth, viewHeight, maxReferenceVelocity);
  const producedPath = buildPulseLinePath(produced, loopBeats, viewWidth, viewHeight, maxProducedWeight);
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
