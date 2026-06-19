// Wire up controls + load frames.json + drive renderFrame().

const state = {
  frames: [],
  source: null,
  idx: 0,
};

const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const slider = document.getElementById("slider");
const lineLabel = document.getElementById("line-label");
const frameLabel = document.getElementById("frame-label");
const codeEl = document.getElementById("code");

const editBtn = document.getElementById("edit-btn");
const editDialog = document.getElementById("edit-dialog");
const codeInput = document.getElementById("code-input");
const funcSelect = document.getElementById("func-select");
const listRows = document.getElementById("list-rows");
const addRowBtn = document.getElementById("add-row");
const extrasInput = document.getElementById("extras-input");
const runBtn = document.getElementById("run-btn");
const cancelBtn = document.getElementById("cancel-btn");
const runError = document.getElementById("run-error");
const truncatedBanner = document.getElementById("truncated-banner");
const truncatedMessage = document.getElementById("truncated-message");
const truncatedDismiss = document.getElementById("truncated-dismiss");
truncatedDismiss.addEventListener("click", () => { truncatedBanner.hidden = true; });

const MAX_LISTS = 8;
const MAX_LIST_LEN = 200;
const MAX_EXTRAS = 8;

function showRunError(message) {
  runError.textContent = message;
  runError.hidden = false;
}

function renderSource(source) {
  const lines = source.code.split("\n");
  codeEl.innerHTML = lines
    .map((text, i) => {
      const lineNo = source.startLine + i;
      const safe = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;") || " ";
      return `<div class="code-line" data-line="${lineNo}"><span class="ln">${lineNo}</span><span class="src">${safe}</span></div>`;
    })
    .join("");
}

function highlightLine(line) {
  const prev = codeEl.querySelector(".code-line.active");
  if (prev) prev.classList.remove("active");
  const cur = codeEl.querySelector(`.code-line[data-line="${line}"]`);
  if (cur) {
    cur.classList.add("active");
    cur.scrollIntoView({ block: "nearest" });
  }
}

function go(i) {
  if (state.frames.length === 0) return;
  state.idx = Math.max(0, Math.min(i, state.frames.length - 1));
  const f = state.frames[state.idx];
  renderFrame(f);
  highlightLine(f.line);
  lineLabel.textContent = `line: ${f.line}`;
  frameLabel.textContent = `frame ${state.idx + 1} / ${state.frames.length}`;
  slider.value = String(state.idx);
  prevBtn.disabled = state.idx === 0;
  nextBtn.disabled = state.idx === state.frames.length - 1;
}

prevBtn.addEventListener("click", () => go(state.idx - 1));
nextBtn.addEventListener("click", () => go(state.idx + 1));
slider.addEventListener("input", (e) => go(parseInt(e.target.value, 10)));

document.addEventListener("keydown", (e) => {
  if (editDialog.open) return;
  if (e.key === "ArrowLeft") go(state.idx - 1);
  else if (e.key === "ArrowRight") go(state.idx + 1);
});

// ---- edit dialog ----

function refreshFuncSelect() {
  const code = codeInput.value;
  const names = [...code.matchAll(/^\s*def\s+(\w+)\s*\(/gm)].map((m) => m[1]);
  const prev = funcSelect.value;
  funcSelect.innerHTML = names.length
    ? names.map((n) => `<option value="${n}">${n}</option>`).join("")
    : `<option value="">(没找到 def …)</option>`;
  if (names.includes(prev)) funcSelect.value = prev;
  else if (names.length) funcSelect.value = names[names.length - 1];
}

function parseOptionalIndex(raw, label) {
  const value = raw.trim();
  if (value === "") return null;
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new Error(`${label} 必须是非负整数`);
  }
  return Number(value);
}

function applyResult({ source, frames, truncated }) {
  state.source = source;
  state.frames = frames;
  renderSource(source);
  slider.max = String(Math.max(0, frames.length - 1));
  if (truncated) {
    truncatedMessage.textContent =
      `可能存在死循环；已显示前 ${frames.length} 步，可拖动滑块查看卡在哪里。(${truncated})`;
    truncatedBanner.style.display = "flex";
  } else {
    truncatedBanner.style.display = "none";
  }
  resetLayoutCache();
  go(0);
}

function addListRow(values = "", cycleAt = "", iList = "", iIndex = "") {
  const row = document.createElement("div");
  row.className = "list-row";
  row.innerHTML = `
    <input class="vals" type="text" placeholder='[1,2,3,4,5]' />
    <input class="cycle" type="number" placeholder="cycleAt" min="0" title="环点 index" />
    <input class="ilist" type="number" placeholder="→链" min="0" title="intersect 目标链 index" />
    <input class="iindex" type="number" placeholder="→节点" min="0" title="intersect 目标节点 index" />
    <button type="button" class="del-row" title="删除这条链">×</button>
  `;
  row.querySelector(".vals").value = values;
  row.querySelector(".cycle").value = cycleAt;
  row.querySelector(".ilist").value = iList;
  row.querySelector(".iindex").value = iIndex;
  listRows.appendChild(row);
  refreshDelButtons();
}

function refreshDelButtons() {
  const rows = listRows.querySelectorAll(".list-row");
  rows.forEach((r) => {
    const btn = r.querySelector(".del-row");
    btn.disabled = rows.length === 1;
  });
}

listRows.addEventListener("click", (e) => {
  if (!e.target.classList.contains("del-row")) return;
  e.target.closest(".list-row").remove();
  refreshDelButtons();
});
addRowBtn.addEventListener("click", () => {
  if (listRows.children.length >= MAX_LISTS) {
    showRunError(`最多添加 ${MAX_LISTS} 条链`);
    return;
  }
  runError.hidden = true;
  addListRow();
});

function openEditDialog() {
  if (state.source) codeInput.value = state.source.code;
  runError.hidden = true;
  runError.textContent = "";
  if (listRows.children.length === 0) {
    addListRow("[1,2,3,4,5]", "");
    extrasInput.value = "";
  }
  refreshFuncSelect();
  editDialog.showModal();
}

async function runUserCode() {
  runError.hidden = true;

  const funcName = funcSelect.value;
  if (!funcName) {
    runError.textContent = "代码里没找到 def 函数,选一个吧";
    runError.hidden = false;
    return;
  }

  let inputs;
  try {
    const rows = [...listRows.querySelectorAll(".list-row")];
    if (rows.length > MAX_LISTS) {
      throw new Error(`最多支持 ${MAX_LISTS} 条链`);
    }
    inputs = rows.map((row, i) => {
      const valsRaw = row.querySelector(".vals").value.trim();
      const values = JSON.parse(valsRaw || "[]");
      if (!Array.isArray(values)) {
        throw new Error(`链表 ${i + 1}: 必须是 JSON 数组`);
      }
      if (values.length > MAX_LIST_LEN) {
        throw new Error(`链表 ${i + 1}: 节点数量不能超过 ${MAX_LIST_LEN}`);
      }
      const cycleRaw = row.querySelector(".cycle").value.trim();
      const iListRaw = row.querySelector(".ilist").value.trim();
      const iIndexRaw = row.querySelector(".iindex").value.trim();
      const obj = {
        values,
        cycleAt: parseOptionalIndex(cycleRaw, `链表 ${i + 1}: cycleAt`),
      };
      if ((iListRaw === "") !== (iIndexRaw === "")) {
        throw new Error(`链表 ${i + 1}: intersectAt 需要同时填写目标链和目标节点`);
      }
      if (iListRaw !== "") {
        obj.intersectAt = {
          list: parseOptionalIndex(iListRaw, `链表 ${i + 1}: 目标链`),
          index: parseOptionalIndex(iIndexRaw, `链表 ${i + 1}: 目标节点`),
        };
      }
      return obj;
    });
  } catch (e) {
    runError.textContent = `链表解析失败: ${e.message}`;
    runError.hidden = false;
    return;
  }

  let extras;
  try {
    const extrasRaw = extrasInput.value.trim() || "[]";
    extras = JSON.parse(extrasRaw);
    if (!Array.isArray(extras)) {
      throw new Error("额外参数必须是 JSON 数组");
    }
    if (extras.length > MAX_EXTRAS) {
      throw new Error(`额外参数不能超过 ${MAX_EXTRAS} 个`);
    }
  } catch (e) {
    runError.textContent = `额外参数解析失败: ${e.message}`;
    runError.hidden = false;
    return;
  }

  runBtn.disabled = true;
  runBtn.textContent = "运行中…";
  try {
    const res = await fetch("/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: codeInput.value,
        funcName,
        inputs,
        extras,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      runError.textContent = data.error || `HTTP ${res.status}`;
      runError.hidden = false;
      return;
    }
    applyResult(data);
    editDialog.close();
  } catch (e) {
    runError.textContent = `请求失败: ${e.message}\n(确保你是用 server.py 起的服务,不是纯静态的 http.server)`;
    runError.hidden = false;
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = "运行";
  }
}

editBtn.addEventListener("click", openEditDialog);
cancelBtn.addEventListener("click", () => editDialog.close());
runBtn.addEventListener("click", runUserCode);
codeInput.addEventListener("input", refreshFuncSelect);

codeInput.addEventListener("keydown", (e) => {
  if (e.key !== "Tab") return;
  e.preventDefault();
  const indent = "    ";
  const start = codeInput.selectionStart;
  const end = codeInput.selectionEnd;
  const value = codeInput.value;

  if (start === end && !e.shiftKey) {
    if (!document.execCommand("insertText", false, indent)) {
      codeInput.value = value.slice(0, start) + indent + value.slice(end);
      codeInput.selectionStart = codeInput.selectionEnd = start + indent.length;
    }
    return;
  }

  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const region = value.slice(lineStart, end);
  const newRegion = e.shiftKey
    ? region.replace(/^ {1,4}/gm, "")
    : region.replace(/^/gm, indent);
  codeInput.value = value.slice(0, lineStart) + newRegion + value.slice(end);
  codeInput.selectionStart = lineStart;
  codeInput.selectionEnd = lineStart + newRegion.length;
});

codeInput.addEventListener("keydown", (e) => {
  if (e.key !== "Backspace") return;
  if (e.ctrlKey || e.altKey || e.metaKey) return;

  const start = codeInput.selectionStart;
  const end = codeInput.selectionEnd;
  if (start !== end) return;
  if (start === 0) return;

  const value = codeInput.value;
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const before = value.slice(lineStart, start);
  if (before.length === 0 || !/^ +$/.test(before)) return;

  const dedent = before.length % 4 === 0 ? 4 : before.length % 4;

  e.preventDefault();
  codeInput.setSelectionRange(start - dedent, start);
  if (!document.execCommand("delete", false)) {
    codeInput.value = value.slice(0, start - dedent) + value.slice(start);
    codeInput.selectionStart = codeInput.selectionEnd = start - dedent;
  }
});

// ---- initial load ----

async function loadFrames() {
  const res = await fetch("frames.json");
  const data = await res.json();
  if (Array.isArray(data)) {
    applyResult({
      source: { startLine: 1, code: "// (frames.json has no source; rerun tracer.py)" },
      frames: data,
    });
  } else {
    applyResult(data);
  }
}

if (initCanvas("canvas")) {
  loadFrames().catch((err) => {
    document.getElementById("canvas").innerHTML =
      `<p class="canvas-error">加载 frames.json 失败: ${err.message}<br>用 <code>py server.py</code> 起服务,然后访问 http://localhost:8000</p>`;
  });
}
