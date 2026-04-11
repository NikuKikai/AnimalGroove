import { useEffect, useRef, useState } from "react";
import { loadCompletedLevelIds, markLevelCompleted } from "../game/persistence/levelProgress";
import { getActiveLevel, useGameStore } from "../game/state/gameStore";
import { HudLevelDrawer } from "./hud/HudLevelDrawer";
import { HudTimelinePanel } from "./hud/HudTimelinePanel";
import { HudTopline } from "./hud/HudTopline";
import { computeCurveMatchPercent } from "./hud/rhythmMetrics";

/** Renders the floating HUD controls and overlays. */
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
  const applySolution = useGameStore((state) => state.applySolution);
  const [isLevelDrawerOpen, setIsLevelDrawerOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [completedLevelIds, setCompletedLevelIds] = useState<Set<string>>(new Set());
  const [showClearDialog, setShowClearDialog] = useState(false);
  const previousSolvedRef = useRef(false);

  const level = getActiveLevel({ activeLevelId, levels });
  const matchPercent = computeCurveMatchPercent(level.targetRhythm, simulation.producedTriggers, level.loopBeats);
  const isSolvedNow = matchPercent >= 99.999;
  const isGeneratedLevel = activeLevelId.startsWith("generated-");

  useEffect(() => {
    let cancelled = false;
    loadCompletedLevelIds()
      .then((ids) => {
        if (!cancelled) {
          setCompletedLevelIds(ids);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isSolvedNow || previousSolvedRef.current) {
      previousSolvedRef.current = isSolvedNow;
      return;
    }

    setShowClearDialog(true);
    if (isGeneratedLevel) {
      setCompletedLevelIds((prev) => {
        const next = new Set(prev);
        next.add(activeLevelId);
        return next;
      });
    } else {
      markLevelCompleted(activeLevelId)
        .then((ids) => {
          setCompletedLevelIds(ids);
        })
        .catch(() => undefined);
    }

    previousSolvedRef.current = true;
  }, [activeLevelId, isGeneratedLevel, isSolvedNow]);

  useEffect(() => {
    previousSolvedRef.current = isSolvedNow;
  }, [activeLevelId, isSolvedNow]);

  return (
    <div className="hud-root">
      <HudTopline
        isMenuOpen={isMenuOpen}
        isHintActive={showPaths}
        matchPercent={matchPercent}
        audioMix={audioMix}
        onOpenLevels={() => setIsLevelDrawerOpen(true)}
        onResetPlacements={resetPlacements}
        onToggleHint={togglePaths}
        onToggleMenu={() => setIsMenuOpen((open) => !open)}
        onSetAudioVolume={setAudioVolume}
        onApplySolution={applySolution}
      />

      {showPaths ? (
        <HudTimelinePanel
          currentBeat={currentBeat}
          loopBeats={level.loopBeats}
          targetRhythm={level.targetRhythm}
          producedTriggers={simulation.producedTriggers}
        />
      ) : null}

      <HudLevelDrawer
        activeLevelId={activeLevelId}
        completedLevelIds={completedLevelIds}
        isOpen={isLevelDrawerOpen}
        levels={levels}
        onClose={() => setIsLevelDrawerOpen(false)}
        onCreateRandomLevel={createRandomLevel}
        onSelectLevel={setActiveLevel}
      />

      {showClearDialog ? (
        <div className="hud-clear-overlay" role="dialog" aria-modal="true" aria-label="Level completed">
          <div className="overlay-panel hud-clear-dialog">
            <div className="hud-clear-title">Level Complete</div>
            <div className="hud-clear-name">{level.name}</div>
            <div className="hud-clear-score">{Math.round(matchPercent)}%</div>
            <button type="button" className="hud-float-button" onClick={() => setShowClearDialog(false)}>
              Continue
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
