import { useState } from "react";
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

  const level = getActiveLevel({ activeLevelId, levels });
  const matchPercent = computeCurveMatchPercent(level.targetRhythm, simulation.producedTriggers, level.loopBeats);

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
        isOpen={isLevelDrawerOpen}
        levels={levels}
        onClose={() => setIsLevelDrawerOpen(false)}
        onCreateRandomLevel={createRandomLevel}
        onSelectLevel={setActiveLevel}
      />
    </div>
  );
}
