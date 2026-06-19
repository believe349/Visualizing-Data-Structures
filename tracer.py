"""
Tracer for linked-list algorithms.

Hooks every line of a target function, walks all reachable ListNode-like
objects from the function's locals, and emits a JSON snapshot per line.

Output schema (frames.json):
[
  {
    "line": 12,
    "nodes": [{"id": "140...", "val": 1}, ...],
    "edges": [{"from": "140...", "to": "140..."}, ...],
    "pointers": {"prev": "140...", "cur": "140...", "nxt": null}
  },
  ...
]
"""

import sys
import json
import inspect


class TraceLimitError(RuntimeError):
    pass


class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next


def is_list_node(obj):
    return obj is not None and hasattr(obj, "val") and hasattr(obj, "next")


_frames = []
_target_name = None
_known_nodes = {}  # id(node) -> ListNode (strong ref keeps detached nodes alive across snapshots)
_MAX_FRAMES = 100
_MAX_NODES_PER_FRAME = 1000


def _snapshot(frame):
    nodes = {}
    edges = []
    pointers = {}

    def walk(obj, detached=False):
        cur = obj
        while is_list_node(cur):
            nid = id(cur)
            if nid in nodes:
                return
            if len(nodes) >= _MAX_NODES_PER_FRAME:
                raise TraceLimitError(
                    f"snapshot exceeded {_MAX_NODES_PER_FRAME} nodes"
                )
            node_data = {"id": str(nid), "val": cur.val}
            if detached:
                node_data["detached"] = True
            nodes[nid] = node_data
            _known_nodes[nid] = cur
            nxt = cur.next
            if not is_list_node(nxt):
                return
            edges.append({"from": str(nid), "to": str(id(nxt))})
            cur = nxt

    for name, val in frame.f_locals.items():
        if is_list_node(val):
            pointers[name] = str(id(val))
            walk(val, detached=False)
        elif val is None:
            pointers[name] = None

    for nid, obj in list(_known_nodes.items()):
        if nid not in nodes:
            walk(obj, detached=True)

    return {
        "line": frame.f_lineno,
        "nodes": list(nodes.values()),
        "edges": edges,
        "pointers": pointers,
    }


def _tracer(frame, event, arg):
    if event == "call":
        if frame.f_code.co_name == _target_name:
            return _tracer
        return None
    if event == "line":
        _frames.append(_snapshot(frame))
        if len(_frames) > _MAX_FRAMES:
            raise TraceLimitError(
                f"trace exceeded {_MAX_FRAMES} frames (infinite loop?)"
            )
    return _tracer


def trace(func, *args, **kwargs):
    """Run func(*args, **kwargs) under the tracer; return (result, frames, source, truncated).

    `truncated` is None on a clean run, or a reason string when the tracer hit
    `_MAX_FRAMES` / `_MAX_NODES_PER_FRAME` mid-execution — partial frames are
    still returned so the caller can show progress up to the stuck point.
    """
    global _target_name
    _target_name = func.__name__
    _frames.clear()
    _known_nodes.clear()
    truncated = None
    result = None
    sys.settrace(_tracer)
    try:
        result = func(*args, **kwargs)
    except TraceLimitError as e:
        truncated = str(e)
    finally:
        sys.settrace(None)
    try:
        lines, start = inspect.getsourcelines(func)
        source = {"startLine": start, "code": "".join(lines).rstrip("\n")}
    except (OSError, TypeError):
        source = None
    return result, list(_frames), source, truncated


def build_list(arr):
    dummy = ListNode()
    cur = dummy
    for v in arr:
        cur.next = ListNode(v)
        cur = cur.next
    return dummy.next


# --- demo: reverse a linked list ---
def reverseList(head):
    prev = None
    cur = head
    while cur:
        nxt = cur.next
        cur.next = prev
        prev = cur
        cur = nxt
    return prev


if __name__ == "__main__":
    head = build_list([1, 2, 3, 4, 5])
    _, frames, source, truncated = trace(reverseList, head)
    payload = {"source": source, "frames": frames, "truncated": truncated}
    with open("frames.json", "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    print(f"wrote {len(frames)} frames to frames.json")
