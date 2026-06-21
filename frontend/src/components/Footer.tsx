import { useEffect, useState } from "react";

interface Props {
  idx: number;
  total: number;
  truncated: string | null;
  /** Changes per run; used to re-show a dismissed banner on a fresh run. */
  runId: number;
  onStep: (delta: number) => void;
  onGo: (i: number) => void;
}

export default function Footer({ idx, total, truncated, runId, onStep, onGo }: Props) {
  const [dismissed, setDismissed] = useState(false);

  // A new run resets the dismissed state so a fresh truncation warning shows.
  useEffect(() => {
    setDismissed(false);
  }, [runId]);

  const showBanner = !!truncated && !dismissed;

  return (
    <footer>
      {showBanner && (
        <div id="truncated-banner" style={{ display: "flex" }}>
          <span id="truncated-message">
            可能存在死循环；已显示前 {total} 步，可拖动滑块查看卡在哪里。({truncated})
          </span>
          <button
            type="button"
            id="truncated-dismiss"
            aria-label="关闭提示"
            onClick={() => setDismissed(true)}
          >
            ×
          </button>
        </div>
      )}
      <button id="prev-btn" onClick={() => onStep(-1)} disabled={idx === 0 || total === 0}>
        ← 上一步
      </button>
      <input
        id="slider"
        type="range"
        min={0}
        max={Math.max(0, total - 1)}
        value={idx}
        onChange={(e) => onGo(parseInt(e.target.value, 10))}
      />
      <button
        id="next-btn"
        onClick={() => onStep(1)}
        disabled={total === 0 || idx === total - 1}
      >
        下一步 →
      </button>
    </footer>
  );
}
