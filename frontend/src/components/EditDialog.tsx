import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { RunResponse } from "../types";
import { BackendError, runUserCode } from "../api";
import {
  MAX_LISTS,
  emptyRow,
  extractFuncNames,
  parseExtras,
  parseInputs,
  type ListRow,
} from "../editForm";

interface Props {
  open: boolean;
  /** Code to prefill when the dialog opens (current traced source). */
  initialCode: string;
  onClose: () => void;
  onResult: (data: RunResponse) => void;
}

export default function EditDialog({ open, initialCode, onClose, onResult }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Uncontrolled textarea: we drive value imperatively so Tab/Backspace can use
  // execCommand and keep the browser's native undo stack intact.
  const codeRef = useRef<HTMLTextAreaElement>(null);

  const [rows, setRows] = useState<ListRow[]>([]);
  const [extras, setExtras] = useState("");
  const [funcNames, setFuncNames] = useState<string[]>([]);
  const [selectedFunc, setSelectedFunc] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  function refreshFuncs(code: string) {
    const names = extractFuncNames(code);
    setFuncNames(names);
    setSelectedFunc((prev) =>
      names.includes(prev) ? prev : names.length ? names[names.length - 1] : "",
    );
  }

  // Open/close the native <dialog> in step with the `open` prop.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      if (codeRef.current) codeRef.current.value = initialCode;
      refreshFuncs(initialCode);
      setError(null);
      setRows((prev) => (prev.length === 0 ? [emptyRow("[1,2,3,4,5]")] : prev));
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open, initialCode]);

  // Escape / native close keeps React state in sync.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    const handler = () => onClose();
    d.addEventListener("close", handler);
    return () => d.removeEventListener("close", handler);
  }, [onClose]);

  function updateRow(i: number, patch: Partial<ListRow>) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function addRow() {
    if (rows.length >= MAX_LISTS) {
      setError(`最多添加 ${MAX_LISTS} 条链`);
      return;
    }
    setError(null);
    setRows((prev) => [...prev, emptyRow()]);
  }

  function deleteRow(i: number) {
    setRows((prev) => prev.filter((_, j) => j !== i));
  }

  async function run() {
    setError(null);
    if (!selectedFunc) {
      setError("代码里没找到 def 函数,选一个吧");
      return;
    }

    let inputs;
    try {
      inputs = parseInputs(rows);
    } catch (e) {
      setError(`链表解析失败: ${(e as Error).message}`);
      return;
    }

    let extrasParsed;
    try {
      extrasParsed = parseExtras(extras);
    } catch (e) {
      setError(`额外参数解析失败: ${(e as Error).message}`);
      return;
    }

    setRunning(true);
    try {
      const data = await runUserCode({
        code: codeRef.current?.value ?? "",
        funcName: selectedFunc,
        inputs,
        extras: extrasParsed,
      });
      onResult(data);
      onClose();
    } catch (e) {
      if (e instanceof BackendError) {
        setError((e as Error).message);
      } else {
        setError(
          `请求失败: ${(e as Error).message}\n(确保你是用 server.py 起的服务,不是纯静态的 http.server)`,
        );
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <dialog id="edit-dialog" ref={dialogRef}>
      <h2>自定义算法</h2>
      <label>代码 (要包含一个函数,入参是链表头 head):</label>
      <textarea
        id="code-input"
        ref={codeRef}
        spellCheck={false}
        defaultValue={initialCode}
        onInput={(e) => refreshFuncs(e.currentTarget.value)}
        onKeyDown={onCodeKeyDown}
      />

      <div className="row">
        <label>
          函数:{" "}
          <select
            id="func-select"
            value={selectedFunc}
            onChange={(e) => setSelectedFunc(e.target.value)}
          >
            {funcNames.length ? (
              funcNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))
            ) : (
              <option value="">(没找到 def …)</option>
            )}
          </select>
        </label>
      </div>

      <label>链表 (每条独立一行):</label>
      <div id="list-rows">
        {rows.map((row, i) => (
          <div className="list-row" key={i}>
            <input
              className="vals"
              type="text"
              placeholder="[1,2,3,4,5]"
              value={row.vals}
              onChange={(e) => updateRow(i, { vals: e.target.value })}
            />
            <input
              className="cycle"
              type="number"
              placeholder="cycleAt"
              min={0}
              title="环点 index"
              value={row.cycle}
              onChange={(e) => updateRow(i, { cycle: e.target.value })}
            />
            <input
              className="ilist"
              type="number"
              placeholder="→链"
              min={0}
              title="intersect 目标链 index"
              value={row.ilist}
              onChange={(e) => updateRow(i, { ilist: e.target.value })}
            />
            <input
              className="iindex"
              type="number"
              placeholder="→节点"
              min={0}
              title="intersect 目标节点 index"
              value={row.iindex}
              onChange={(e) => updateRow(i, { iindex: e.target.value })}
            />
            <button
              type="button"
              className="del-row"
              title="删除这条链"
              disabled={rows.length === 1}
              onClick={() => deleteRow(i)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button type="button" id="add-row" onClick={addRow}>
        + 添加一条链
      </button>

      <label>
        额外参数 (JSON 数组,如 <code>[3]</code> 代表 x=3):
      </label>
      <input
        id="extras-input"
        type="text"
        placeholder="[]"
        value={extras}
        onChange={(e) => setExtras(e.target.value)}
      />

      {error !== null && <div id="run-error">{error}</div>}

      <div className="dialog-actions">
        <button id="cancel-btn" type="button" onClick={onClose}>
          取消
        </button>
        <button id="run-btn" type="button" onClick={run} disabled={running}>
          {running ? "运行中…" : "运行"}
        </button>
      </div>
    </dialog>
  );
}

// Tab indents / Shift+Tab dedents; Backspace at line-leading spaces dedents.
// Uses execCommand to preserve the textarea's native undo history.
function onCodeKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
  const ta = e.currentTarget;

  if (e.key === "Tab") {
    e.preventDefault();
    const indent = "    ";
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const value = ta.value;

    if (start === end && !e.shiftKey) {
      if (!document.execCommand("insertText", false, indent)) {
        ta.value = value.slice(0, start) + indent + value.slice(end);
        ta.selectionStart = ta.selectionEnd = start + indent.length;
      }
      return;
    }

    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const region = value.slice(lineStart, end);
    const newRegion = e.shiftKey
      ? region.replace(/^ {1,4}/gm, "")
      : region.replace(/^/gm, indent);
    ta.value = value.slice(0, lineStart) + newRegion + value.slice(end);
    ta.selectionStart = lineStart;
    ta.selectionEnd = lineStart + newRegion.length;
    return;
  }

  if (e.key === "Backspace") {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (start !== end) return;
    if (start === 0) return;

    const value = ta.value;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const before = value.slice(lineStart, start);
    if (before.length === 0 || !/^ +$/.test(before)) return;

    const dedent = before.length % 4 === 0 ? 4 : before.length % 4;

    e.preventDefault();
    ta.setSelectionRange(start - dedent, start);
    if (!document.execCommand("delete", false)) {
      ta.value = value.slice(0, start - dedent) + value.slice(start);
      ta.selectionStart = ta.selectionEnd = start - dedent;
    }
  }
}
