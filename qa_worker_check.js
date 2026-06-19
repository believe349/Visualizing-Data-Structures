const { spawnSync } = require("child_process");

const python = "C:/Users/李学亮/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe";

function runWorker(payload) {
  return spawnSync(python, ["server.py", "--trace-worker"], {
    input: JSON.stringify(payload),
    encoding: "utf8",
  });
}

const ok = runWorker({
  code: [
    "def reverseList(head):",
    "    print('debug')",
    "    prev = None",
    "    cur = head",
    "    while cur:",
    "        nxt = cur.next",
    "        cur.next = prev",
    "        prev = cur",
    "        cur = nxt",
    "    return prev",
  ].join("\n"),
  funcName: "reverseList",
  inputs: [{ values: [1, 2, 3], cycleAt: null }],
  extras: [],
});

console.log("ok status", ok.status);
console.log("ok stderr", ok.stderr.trim().slice(0, 300));
const data = JSON.parse(ok.stdout);
console.log("ok frames", data.frames.length);
console.log("ok first source line", data.source.code.split("\n")[0]);

const bad = runWorker({
  code: "def reverseList(head):\n    return head",
  funcName: "missing",
  inputs: [{ values: [1], cycleAt: null }],
  extras: [],
});

console.log("bad status", bad.status);
console.log("bad stderr has missing", bad.stderr.includes("missing"));
