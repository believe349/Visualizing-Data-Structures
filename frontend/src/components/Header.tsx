interface Props {
  line: number | null;
  idx: number;
  total: number;
  onEdit: () => void;
}

export default function Header({ line, idx, total, onEdit }: Props) {
  return (
    <header>
      <h1>链表算法可视化 (MVP)</h1>
      <div className="status">
        <span id="line-label">line: {line ?? "—"}</span>
        <span id="frame-label">
          frame {total === 0 ? 0 : idx + 1} / {total}
        </span>
        <button id="edit-btn" onClick={onEdit}>
          ✎ 编辑代码
        </button>
      </div>
    </header>
  );
}
