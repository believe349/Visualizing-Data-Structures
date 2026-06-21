// Talks to the Python backend (server.py). In dev these go through Vite's proxy
// (/run -> :8000); in prod server.py serves the built app and the same routes.
import type { Frame, RunRequest, RunResponse } from "./types";

/** Thrown when the backend responds with a non-2xx status (validation/runtime/timeout). */
export class BackendError extends Error {}

/**
 * POST /run — trace user code and return frames.
 * Throws BackendError on a non-2xx response (message = backend's error),
 * or a plain Error if the request itself fails (network / not served by server.py).
 */
export async function runUserCode(req: RunRequest): Promise<RunResponse> {
  const res = await fetch("/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  const data = await res.json().catch(() => ({}) as { error?: string });
  if (!res.ok) {
    throw new BackendError((data as { error?: string }).error || `HTTP ${res.status}`);
  }
  return data as RunResponse;
}

/** Load the initial demo frames. Tolerates the legacy "bare array" frames.json. */
export async function loadFrames(): Promise<RunResponse> {
  const res = await fetch("frames.json");
  const data: unknown = await res.json();
  if (Array.isArray(data)) {
    return {
      source: { startLine: 1, code: "// (frames.json has no source; rerun tracer.py)" },
      frames: data as Frame[],
    };
  }
  return data as RunResponse;
}
