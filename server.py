"""
API + static server for the React/Vite frontend.

Serves the built frontend from frontend/dist and exposes POST /run, which traces
user-supplied code. During development run the Vite dev server (npm run dev) for
hot-reload; it proxies /run here.

Build the frontend first:  cd frontend && npm run build
Run:   py server.py
Open:  http://localhost:8000
"""

import functools
import json
import io
import os
import subprocess
import sys
import traceback
import webbrowser
from contextlib import redirect_stdout
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn

from tracer import trace, build_list, ListNode


class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

MAX_CODE_BYTES = 50_000
MAX_LISTS = 8
MAX_LIST_LEN = 200
MAX_EXTRAS = 8
RUN_TIMEOUT_SECONDS = 3

# Built frontend (vite build output) served as static files.
DIST_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend", "dist")


class UserCodeError(Exception):
    pass


SAFE_BUILTINS = {
    "abs": abs,
    "all": all,
    "any": any,
    "bool": bool,
    "dict": dict,
    "enumerate": enumerate,
    "float": float,
    "int": int,
    "len": len,
    "list": list,
    "max": max,
    "min": min,
    "print": print,
    "range": range,
    "reversed": reversed,
    "set": set,
    "str": str,
    "sum": sum,
    "tuple": tuple,
}


def _require_non_negative_int(value, label):
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise ValueError(f"{label} 必须是非负整数")
    return value


def _validate_inputs(inputs):
    if not isinstance(inputs, list):
        raise ValueError("inputs 必须是数组")
    if not inputs:
        raise ValueError("至少需要一条链表")
    if len(inputs) > MAX_LISTS:
        raise ValueError(f"链表数量不能超过 {MAX_LISTS}")

    clean = []
    for i, item in enumerate(inputs):
        if not isinstance(item, dict):
            raise ValueError(f"链表 {i}: 必须是对象")
        values = item.get("values")
        if not isinstance(values, list):
            raise ValueError(f"链表 {i}: values 必须是数组")
        if len(values) > MAX_LIST_LEN:
            raise ValueError(f"链表 {i}: 节点数量不能超过 {MAX_LIST_LEN}")

        cycle_at = item.get("cycleAt")
        if cycle_at is not None:
            cycle_at = _require_non_negative_int(cycle_at, f"链表 {i}: cycleAt")
            if cycle_at >= len(values):
                raise ValueError(f"链表 {i}: cycleAt 超出链表长度")

        obj = {"values": values, "cycleAt": cycle_at}
        ix = item.get("intersectAt")
        if ix is not None:
            if not isinstance(ix, dict):
                raise ValueError(f"链表 {i}: intersectAt 必须是对象")
            obj["intersectAt"] = {
                "list": _require_non_negative_int(ix.get("list"), f"链表 {i}: intersectAt.list"),
                "index": _require_non_negative_int(ix.get("index"), f"链表 {i}: intersectAt.index"),
            }
        clean.append(obj)

    return clean


def _validate_request(req):
    code = req["code"]
    func_name = req["funcName"]
    if not isinstance(code, str):
        raise ValueError("code 必须是字符串")
    if len(code.encode("utf-8")) > MAX_CODE_BYTES:
        raise ValueError(f"code 不能超过 {MAX_CODE_BYTES} bytes")
    if not isinstance(func_name, str) or not func_name.isidentifier():
        raise ValueError("funcName 必须是有效的 Python 函数名")

    if "inputs" in req:
        inputs = _validate_inputs(req["inputs"])
        extras = req.get("extras", [])
    else:
        inputs = _validate_inputs([{"values": req["input"], "cycleAt": None}])
        extras = []

    if not isinstance(extras, list):
        raise ValueError("extras 必须是数组")
    if len(extras) > MAX_EXTRAS:
        raise ValueError(f"额外参数不能超过 {MAX_EXTRAS} 个")

    return {
        "code": code,
        "funcName": func_name,
        "inputs": inputs,
        "extras": extras,
    }


def _run_trace_worker(req):
    proc = subprocess.run(
        [sys.executable, __file__, "--trace-worker"],
        input=json.dumps(req),
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        timeout=RUN_TIMEOUT_SECONDS,
        check=False,
    )
    if proc.returncode != 0:
        detail = proc.stderr.strip() or proc.stdout.strip() or f"worker exited {proc.returncode}"
        if proc.returncode == 2:
            raise ValueError(detail)
        raise UserCodeError(detail)
    return json.loads(proc.stdout)


def _trace_payload(req):
    ns = {
        "__builtins__": SAFE_BUILTINS,
        "__name__": "__user__",
        "ListNode": ListNode,
        "build_list": build_list,
    }
    exec(compile(req["code"], "<user>", "exec"), ns)
    func_name = req["funcName"]
    if func_name not in ns or not callable(ns[func_name]):
        raise ValueError(f"function '{func_name}' not defined in code")
    heads = _prepare_inputs(req["inputs"])
    _, frames, source, truncated = trace(ns[func_name], *heads, *req["extras"])
    if source is None:
        source = {"startLine": 1, "code": req["code"].rstrip("\n")}
    return {"source": source, "frames": frames, "truncated": truncated}


def _worker_main():
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    try:
        req = _validate_request(json.loads(sys.stdin.read()))
        with redirect_stdout(io.StringIO()):
            payload = _trace_payload(req)
        print(json.dumps(payload, ensure_ascii=False))
    except ValueError as e:
        print(str(e), file=sys.stderr)
        raise SystemExit(2)
    except Exception as e:
        # User code blew up: keep it short — exception type + message + last frame.
        tb = traceback.extract_tb(e.__traceback__)
        user_frames = [f for f in tb if f.filename == "<user>"]
        location = f" (line {user_frames[-1].lineno})" if user_frames else ""
        print(f"{type(e).__name__}: {e}{location}", file=sys.stderr)
        raise SystemExit(1)


def _build_with_cycle(values, cycle_at):
    head = build_list(values)
    if cycle_at is None or head is None:
        return head
    target = head
    for _ in range(cycle_at):
        if target is None:
            raise ValueError(f"cycleAt={cycle_at} 超出链表长度")
        target = target.next
    if target is None:
        raise ValueError(f"cycleAt={cycle_at} 超出链表长度")
    tail = head
    while tail.next:
        tail = tail.next
    tail.next = target
    return head


def _walk_n(head, n, list_idx):
    cur = head
    for _ in range(n):
        if cur is None:
            raise ValueError(f"链表 {list_idx}: intersectAt.index={n} 超出目标链长度")
        cur = cur.next
    if cur is None:
        raise ValueError(f"链表 {list_idx}: intersectAt.index={n} 超出目标链长度")
    return cur


def _prepare_inputs(inputs):
    heads = [_build_with_cycle(i["values"], i.get("cycleAt")) for i in inputs]
    for i, inp in enumerate(inputs):
        ix = inp.get("intersectAt")
        if ix is None:
            continue
        if inp.get("cycleAt") is not None:
            raise ValueError(f"链表 {i}: cycleAt 和 intersectAt 不能同时设置")
        target_list = ix["list"]
        if target_list == i:
            raise ValueError(f"链表 {i}: intersectAt 不能指向自己")
        if not 0 <= target_list < len(heads):
            raise ValueError(f"链表 {i}: intersectAt.list={target_list} 越界")
        target = _walk_n(heads[target_list], ix["index"], i)
        tail = heads[i]
        if tail is None:
            raise ValueError(f"链表 {i}: 空链表无法设置 intersectAt")
        while tail.next is not None:
            tail = tail.next
        tail.next = target
    return heads


class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/run":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length).decode("utf-8")
        try:
            req = json.loads(body)
            req = _validate_request(req)
        except (ValueError, KeyError) as e:
            self._json(400, {"error": f"bad request: {e}"})
            return

        try:
            self._json(200, _run_trace_worker(req))
        except subprocess.TimeoutExpired:
            self._json(408, {"error": f"运行超时 ({RUN_TIMEOUT_SECONDS}s)，可能存在死循环或计算量过大"})
        except ValueError as e:
            self._json(400, {"error": str(e)})
        except UserCodeError as e:
            self._json(500, {"error": str(e)})
        except Exception:
            self._json(500, {"error": traceback.format_exc()})

    def _json(self, status, payload):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--trace-worker":
        _worker_main()
        raise SystemExit(0)

    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    addr = ("127.0.0.1", port)
    if not os.path.isdir(DIST_DIR):
        print(f"warning: {DIST_DIR} not found — run 'cd frontend && npm run build' first.")
        print("         /run still works; for dev use 'npm run dev' (proxies /run here).")
    handler = functools.partial(Handler, directory=DIST_DIR)
    print(f"serving http://{addr[0]}:{addr[1]}  (Ctrl+C to stop)")
    webbrowser.open(f"http://{addr[0]}:{addr[1]}")
    ThreadingHTTPServer(addr, handler).serve_forever()
