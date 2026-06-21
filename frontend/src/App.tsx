import { useEffect, useState } from "react";
import Header from "./components/Header";
import CodePanel from "./components/CodePanel";
import GraphCanvas from "./components/GraphCanvas";
import Footer from "./components/Footer";
import EditDialog from "./components/EditDialog";
import { usePlayer } from "./hooks/usePlayer";
import { loadFrames } from "./api";

export default function App() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const player = usePlayer(dialogOpen);
  const { applyResult } = player;

  // Initial load of the demo frames.
  useEffect(() => {
    loadFrames()
      .then(applyResult)
      .catch((err: Error) => setLoadError(err.message));
  }, [applyResult]);

  return (
    <>
      <Header
        line={player.frame ? player.frame.line : null}
        idx={player.idx}
        total={player.frames.length}
        onEdit={() => setDialogOpen(true)}
      />

      <main>
        <CodePanel source={player.source} activeLine={player.frame ? player.frame.line : null} />
        {loadError ? (
          <div id="canvas">
            <p className="canvas-error">
              加载 frames.json 失败: {loadError}
              <br />用 <code>py server.py</code> 起服务,然后访问 http://localhost:8000
            </p>
          </div>
        ) : (
          <GraphCanvas frame={player.frame} runId={player.runId} />
        )}
      </main>

      <Footer
        idx={player.idx}
        total={player.frames.length}
        truncated={player.truncated}
        runId={player.runId}
        onStep={player.step}
        onGo={player.go}
      />

      <EditDialog
        open={dialogOpen}
        initialCode={player.source ? player.source.code : ""}
        onClose={() => setDialogOpen(false)}
        onResult={applyResult}
      />
    </>
  );
}
