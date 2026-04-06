import { BoardView } from "../components/BoardView";
import { DebugPanel } from "../components/DebugPanel";
import { Hud } from "../components/Hud";

/** Renders the main game shell and floating overlay UI. */
export function App() {
  return (
    <div className="app-shell">
      <BoardView />
      <div className="overlay-root">
        <Hud />
        <DebugPanel />
      </div>
    </div>
  );
}
