import { useEffect, useRef } from "react";
import type { Source } from "../types";

interface Props {
  source: Source | null;
  /** Line number currently executing (from the active frame), or null. */
  activeLine: number | null;
}

export default function CodePanel({ source, activeLine }: Props) {
  const preRef = useRef<HTMLPreElement>(null);
  const lines = source ? source.code.split("\n") : [];
  const startLine = source ? source.startLine : 1;

  // Keep the highlighted line in view (cf. original highlightLine -> scrollIntoView).
  useEffect(() => {
    const el = preRef.current?.querySelector(".code-line.active");
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [activeLine, source]);

  return (
    <aside id="code-panel">
      <pre id="code" ref={preRef}>
        {lines.map((text, i) => {
          const lineNo = startLine + i;
          return (
            <div
              key={lineNo}
              className={"code-line" + (lineNo === activeLine ? " active" : "")}
              data-line={lineNo}
            >
              <span className="ln">{lineNo}</span>
              <span className="src">{text === "" ? " " : text}</span>
            </div>
          );
        })}
      </pre>
    </aside>
  );
}
