// Shared data shapes for the linked-list visualizer.
// These mirror what server.py / tracer.py emit and what render.js consumed.

/** A single linked-list node in a frame snapshot. */
export interface FrameNode {
  id: string;
  val: number | string;
  /** True once the node is no longer reachable from any live pointer. */
  detached?: boolean;
}

/** A directed edge (node.next) between two node ids. */
export interface FrameEdge {
  from: string;
  to: string;
}

/** Named pointer -> node id it currently references (null = points at nothing). */
export type Pointers = Record<string, string | null>;

/** One execution step: the line being run plus the graph state at that point. */
export interface Frame {
  line: number;
  nodes: FrameNode[];
  edges: FrameEdge[];
  pointers: Pointers;
}

/** The traced function's source, with the absolute line number it starts at. */
export interface Source {
  startLine: number;
  code: string;
}

/** intersectAt target: a node (index) in another input list (list). */
export interface IntersectAt {
  list: number;
  index: number;
}

/** One input linked list described in the edit dialog. */
export interface ListInput {
  values: unknown[];
  cycleAt: number | null;
  intersectAt?: IntersectAt;
}

/** POST /run request body. */
export interface RunRequest {
  code: string;
  funcName: string;
  inputs: ListInput[];
  extras: unknown[];
}

/** POST /run (and frames.json) response body. */
export interface RunResponse {
  source: Source;
  frames: Frame[];
  /** Set when tracing was cut short (e.g. suspected infinite loop). */
  truncated?: string | null;
}
