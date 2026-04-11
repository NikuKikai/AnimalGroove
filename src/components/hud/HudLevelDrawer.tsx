import type { LevelDefinition } from "../../game/types";

type HudLevelDrawerProps = {
  activeLevelId: string;
  completedLevelIds: Set<string>;
  isOpen: boolean;
  levels: LevelDefinition[];
  onClose: () => void;
  onCreateRandomLevel: () => void;
  onSelectLevel: (levelId: string) => void;
};

/** Renders the left-side level drawer and dimmed outside area. */
export function HudLevelDrawer({
  activeLevelId,
  completedLevelIds,
  isOpen,
  levels,
  onClose,
  onCreateRandomLevel,
  onSelectLevel,
}: HudLevelDrawerProps) {
  return (
    <div className={`hud-level-overlay ${isOpen ? "is-open" : ""}`} aria-hidden={!isOpen}>
      <button type="button" className="hud-level-scrim" aria-label="Close level list" onClick={onClose} tabIndex={isOpen ? 0 : -1} />
      <aside className="overlay-panel hud-level-drawer">
        <div className="hud-level-drawer-head">
          <h2>Levels</h2>
          <button type="button" className="hud-float-button" onClick={onCreateRandomLevel} title="Generate a random test level">
            Random
          </button>
        </div>
        <div className="hud-level-card-list">
          {levels.map((entry, index) => (
            <button
              key={entry.id}
              type="button"
              className={`hud-level-card ${entry.id === activeLevelId ? "is-active" : ""}`}
              onClick={() => onSelectLevel(entry.id)}
            >
              <span className="hud-level-card-index">{String(index + 1).padStart(2, "0")}</span>
              <span className="hud-level-card-name">{entry.name}</span>
              <span className={`hud-level-card-copy ${completedLevelIds.has(entry.id) ? "is-completed" : ""}`}>
                {completedLevelIds.has(entry.id) ? "Completed" : "Tap to load"}
              </span>
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}
