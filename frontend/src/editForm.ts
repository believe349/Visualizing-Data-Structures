// Pure helpers for the edit dialog: limits, function-name extraction, and
// parsing the linked-list / extras inputs into a RunRequest payload.
// Ported from the original app.js form logic.
import type { ListInput } from "./types";

export const MAX_LISTS = 8;
export const MAX_LIST_LEN = 200;
export const MAX_EXTRAS = 8;

/** One editable linked-list row in the dialog (raw string fields). */
export interface ListRow {
  vals: string;
  cycle: string;
  ilist: string;
  iindex: string;
}

export function emptyRow(vals = "", cycle = "", ilist = "", iindex = ""): ListRow {
  return { vals, cycle, ilist, iindex };
}

/** Function names defined via `def name(...)` in the code, in source order. */
export function extractFuncNames(code: string): string[] {
  return [...code.matchAll(/^\s*def\s+(\w+)\s*\(/gm)].map((m) => m[1]);
}

function parseOptionalIndex(raw: string, label: string): number | null {
  const value = raw.trim();
  if (value === "") return null;
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new Error(`${label} 必须是非负整数`);
  }
  return Number(value);
}

/** Parse the list rows into RunRequest.inputs. Throws Error(message) on bad input. */
export function parseInputs(rows: ListRow[]): ListInput[] {
  if (rows.length > MAX_LISTS) {
    throw new Error(`最多支持 ${MAX_LISTS} 条链`);
  }
  return rows.map((row, i) => {
    const valsRaw = row.vals.trim();
    const values = JSON.parse(valsRaw || "[]");
    if (!Array.isArray(values)) {
      throw new Error(`链表 ${i + 1}: 必须是 JSON 数组`);
    }
    if (values.length > MAX_LIST_LEN) {
      throw new Error(`链表 ${i + 1}: 节点数量不能超过 ${MAX_LIST_LEN}`);
    }
    const obj: ListInput = {
      values,
      cycleAt: parseOptionalIndex(row.cycle, `链表 ${i + 1}: cycleAt`),
    };
    const iListRaw = row.ilist.trim();
    const iIndexRaw = row.iindex.trim();
    if ((iListRaw === "") !== (iIndexRaw === "")) {
      throw new Error(`链表 ${i + 1}: intersectAt 需要同时填写目标链和目标节点`);
    }
    if (iListRaw !== "") {
      obj.intersectAt = {
        list: parseOptionalIndex(iListRaw, `链表 ${i + 1}: 目标链`)!,
        index: parseOptionalIndex(iIndexRaw, `链表 ${i + 1}: 目标节点`)!,
      };
    }
    return obj;
  });
}

/** Parse the extras JSON array. Throws Error(message) on bad input. */
export function parseExtras(raw: string): unknown[] {
  const extras = JSON.parse(raw.trim() || "[]");
  if (!Array.isArray(extras)) {
    throw new Error("额外参数必须是 JSON 数组");
  }
  if (extras.length > MAX_EXTRAS) {
    throw new Error(`额外参数不能超过 ${MAX_EXTRAS} 个`);
  }
  return extras;
}
