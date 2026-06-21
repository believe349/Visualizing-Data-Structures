import { useEffect, useRef, useState } from "react";
import type { Core } from "cytoscape";
import type { Frame } from "../types";
import { createCy, renderFrame, type PositionCache } from "../cytoscape/renderFrame";

interface Props {
  frame: Frame | null;
  /** Bumped on every new run so we can reset cached node positions (cf. resetLayoutCache). */
  runId: number;
}

export default function GraphCanvas({ frame, runId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const posCacheRef = useRef<PositionCache>({});
  const lastRunIdRef = useRef<number>(runId);
  const [ready, setReady] = useState(false);

  // Create the Cytoscape instance once (re-created on StrictMode remount).
  useEffect(() => {
    if (!containerRef.current) return;
    cyRef.current = createCy(containerRef.current);
    setReady(true);
    return () => {
      cyRef.current?.destroy();
      cyRef.current = null;
      setReady(false);
    };
  }, []);

  // Draw the current frame whenever it (or the run) changes.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !frame) return;
    // A new run invalidates cached X positions — clear before laying out frame 0.
    if (runId !== lastRunIdRef.current) {
      posCacheRef.current = {};
      lastRunIdRef.current = runId;
    }
    renderFrame(cy, posCacheRef.current, frame);
  }, [ready, frame, runId]);

  return <div id="canvas" ref={containerRef} />;
}
