# 链表算法可视化 (Linked List Algorithm Visualizer)

把用户输入的链表算法（Python）逐步追踪、用 Cytoscape 图形化展示每一步的节点 / 指针变化。

- **前端**：React + Vite + TypeScript（`frontend/`），Cytoscape.js 渲染。
- **后端**：Python 标准库 HTTP 服务（`server.py`），在沙箱子进程里追踪用户代码，暴露 `POST /run`。
- **追踪**：`tracer.py`（`sys.settrace` 逐行快照）。

## 开发

需要两个终端：

```bash
# 终端 A —— 后端 API（:8000）
py server.py

# 终端 B —— 前端 dev server（:5173，带 HMR，/run 代理到 :8000）
cd frontend
npm install      # 首次
npm run dev
```

打开 http://localhost:5173 。

## 生产 / 演示

构建前端后由 `server.py` 直接托管：

```bash
cd frontend && npm run build      # 产物输出到 frontend/dist
cd ..
py server.py                      # 托管 frontend/dist + 提供 /run
```

打开 http://localhost:8000 。

## 其它脚本

```bash
cd frontend
npm run typecheck     # tsc --noEmit 类型检查
npm run preview       # 本地预览 dist 构建产物
```

后端回归（需 `py server.py` 在运行）：

```bash
node qa_http_check.js
node qa_worker_check.js
```

## 说明

- `frames.json` 是初始演示数据，放在 `frontend/public/`（构建时复制进 `dist/`）。它被 `.gitignore` 忽略，可用 `py tracer.py` 重新生成（直接写入 `frontend/public/frames.json`）。
- 开发期热重载由 Vite 负责；旧的 SSE `/__reload` 已移除。
