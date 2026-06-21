import { useCallback, useEffect, useState } from "react";
import type { Frame, RunResponse, Source } from "../types";

export interface Player {
  frames: Frame[];
  source: Source | null;
  idx: number;
  frame: Frame | null;
  truncated: string | null;
  /** Bumped on each applyResult so GraphCanvas can reset its layout cache. */
  runId: number;
  /** Jump to an absolute frame index (clamped). */
  go: (i: number) => void;
  /** Move relative to the current frame (clamped). */
  step: (delta: number) => void;
  /** Load a new run's result and reset to frame 0. */
  applyResult: (data: RunResponse) => void;
}

/**
 * Drives frame playback: state, navigation, and ←/→ keyboard stepping.
 * Pass keyboardDisabled=true (e.g. while the edit dialog is open) to suspend keys.
 */
export function usePlayer(keyboardDisabled: boolean): Player {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [source, setSource] = useState<Source | null>(null);
  const [idx, setIdx] = useState(0);
  const [truncated, setTruncated] = useState<string | null>(null);
  const [runId, setRunId] = useState(0);

  const clamp = useCallback(
    (i: number) => Math.max(0, Math.min(i, frames.length - 1)),
    [frames.length],
  );

  const go = useCallback(
    (i: number) => {
      if (frames.length === 0) return;
      setIdx(clamp(i));
    },
    [frames.length, clamp],
  );

  const step = useCallback(
    (delta: number) => {
      setIdx((prev) => {
        if (frames.length === 0) return prev;
        return Math.max(0, Math.min(prev + delta, frames.length - 1));
      });
    },
    [frames.length],
  );

  const applyResult = useCallback((data: RunResponse) => {
    setSource(data.source);
    setFrames(data.frames);
    setTruncated(data.truncated ?? null);
    setIdx(0);
    setRunId((n) => n + 1);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (keyboardDisabled) return;
      if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [keyboardDisabled, step]);

  const frame = frames.length > 0 ? frames[idx] : null;

  return { frames, source, idx, frame, truncated, runId, go, step, applyResult };
}
