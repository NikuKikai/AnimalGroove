import { BoardView } from "../components/BoardView";
import { DebugPanel } from "../components/DebugPanel";
import { Hud } from "../components/Hud";

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
