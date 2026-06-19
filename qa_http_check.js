const cases = [
  {
    name: "ok",
    payload: {
      code: [
        "def reverseList(head):",
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
    },
  },
  {
    name: "bad index",
    payload: {
      code: "def reverseList(head):\n    return head",
      funcName: "reverseList",
      inputs: [{ values: [1], cycleAt: -1 }],
      extras: [],
    },
  },
  {
    name: "timeout",
    payload: {
      code: "def reverseList(head):\n    while True:\n        pass",
      funcName: "reverseList",
      inputs: [{ values: [1], cycleAt: null }],
      extras: [],
    },
  },
];

(async () => {
  for (const item of cases) {
    const response = await fetch("http://127.0.0.1:8000/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item.payload),
    });
    const data = await response.json();
    console.log(item.name, response.status, data.frames ? data.frames.length : data.error.slice(0, 80));
  }
})();
