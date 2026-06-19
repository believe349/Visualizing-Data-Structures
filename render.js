// Render a single frame onto the Cytoscape canvas.
// A "frame" has the shape:
//   { line, nodes: [{id, val}], edges: [{from, to}], pointers: {name: id|null} }

let cy = null;

const positionCache = {};
function resetLayoutCache() {
  for (const k of Object.keys(positionCache)) delete positionCache[k];
}

function initCanvas(containerId) {
  const container = document.getElementById(containerId);
  if (typeof cytoscape === "undefined") {
    if (container) {
      container.innerHTML =
        `<p class="canvas-error">Cytoscape 加载失败，无法渲染链表图。请检查网络或改用本地依赖。</p>`;
    }
    return false;
  }

  cy = cytoscape({
    container,
    elements: [],
    style: [
      {
        selector: "node",
        style: {
          "background-color": "#74b9ff",
          "label": "data(label)",
          "color": "#2f3640",
          "text-valign": "center",
          "text-halign": "center",
          "font-size": 16,
          "font-weight": 600,
          "width": 50,
          "height": 50,
          "border-width": 2,
          "border-color": "#0984e3",
        },
      },
      {
        selector: "node.pointed",
        style: {
          "background-color": "#ffeaa7",
          "border-color": "#fdcb6e",
          "border-width": 3,
        },
      },
      {
        selector: "node.pointer-label",
        style: {
          "background-color": "#dfe6e9",
          "border-width": 1,
          "border-color": "#b2bec3",
          "shape": "round-rectangle",
          "width": "label",
          "height": 22,
          "padding": "6px",
          "font-size": 12,
          "font-weight": 700,
          "color": "#2d3436",
        },
      },
      {
        selector: "node.detached",
        style: {
          "background-color": "#dfe6e9",
          "border-color": "#b2bec3",
          "color": "#7f8c8d",
          "opacity": 0.55,
        },
      },
      {
        selector: "edge",
        style: {
          "width": 2,
          "line-color": "#636e72",
          "target-arrow-color": "#636e72",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
        },
      },
      {
        selector: "edge.detached-edge",
        style: {
          "line-color": "#b2bec3",
          "target-arrow-color": "#b2bec3",
          "opacity": 0.55,
        },
      },
      {
        selector: "edge.pointer-edge",
        style: {
          "line-color": "#fdcb6e",
          "target-arrow-color": "#fdcb6e",
          "line-style": "dashed",
          "width": 2,
        },
      },
      {
        selector: "edge.back-edge",
        style: {
          "curve-style": "unbundled-bezier",
          "control-point-distances": [70],
          "control-point-weights": [0.5],
        },
      },
    ],
    layout: { name: "preset" },
    userZoomingEnabled: true,
    userPanningEnabled: true,
  });
  return true;
}

function renderFrame(frame) {
  if (!cy) return;
  cy.elements().remove();

  const nodes = frame.nodes || [];
  const edges = frame.edges || [];
  const pointers = frame.pointers || {};

  // All nodes sit on one horizontal row.
  const X_GAP = 100;
  const X_START = 80;
  const Y = 200;
  const POINTER_OFFSET = 70;
  const POINTER_STACK = 28;

  const posById = {};
  const seen = new Set();

  const nodeList = nodes.map((n) => n.id);

  // Fill cached positions first — nodes keep their X across frames, Y forced to same row.
  for (const n of nodes) {
    if (positionCache[n.id]) {
      posById[n.id] = { x: positionCache[n.id].x, y: Y };
      seen.add(n.id);
    }
  }

  // Place any new nodes to the right of existing ones.
  const maxCachedX = seen.size > 0
    ? Math.max(...nodeList.filter((id) => seen.has(id)).map((id) => posById[id].x))
    : X_START - X_GAP;
  let col = 0;
  for (const id of nodeList) {
    if (seen.has(id)) continue;
    posById[id] = { x: maxCachedX + X_GAP + col * X_GAP, y: Y };
    positionCache[id] = { x: posById[id].x, y: Y };
    seen.add(id);
    col++;
  }

  const pointedIds = new Set(Object.values(pointers).filter(Boolean));
  const detachedIds = new Set(nodes.filter((n) => n.detached).map((n) => n.id));
  const dataNodes = nodes.map((n) => {
    const cls = [];
    if (pointedIds.has(n.id)) cls.push("pointed");
    if (n.detached) cls.push("detached");
    return {
      group: "nodes",
      data: { id: n.id, label: String(n.val) },
      position: posById[n.id],
      classes: cls.join(" "),
    };
  });

  // Count edges between each unordered pair so we only curve
  // back-edges when both directions exist between the same two nodes.
  const pairCount = new Map();
  for (const e of edges) {
    const key = [e.from, e.to].sort().join("|");
    pairCount.set(key, (pairCount.get(key) || 0) + 1);
  }

  const dataEdges = edges.map((e, i) => {
    const fp = posById[e.from];
    const tp = posById[e.to];
    const pairKey = [e.from, e.to].sort().join("|");
    const isBack = fp && tp && fp.y === tp.y && fp.x > tp.x && (pairCount.get(pairKey) || 0) > 1;
    const isDetachedEdge = detachedIds.has(e.from) && detachedIds.has(e.to);
    const cls = [];
    if (isBack) cls.push("back-edge");
    if (isDetachedEdge) cls.push("detached-edge");
    return {
      group: "edges",
      data: { id: `e_${i}`, source: e.from, target: e.to },
      classes: cls.join(" "),
    };
  });

  // Pointer labels stack just above their target node.
  const pointerByTarget = {};
  for (const [name, target] of Object.entries(pointers)) {
    if (!target) continue;
    if (!pointerByTarget[target]) pointerByTarget[target] = [];
    pointerByTarget[target].push(name);
  }

  const pointerNodes = [];
  const pointerEdges = [];
  for (const [target, names] of Object.entries(pointerByTarget)) {
    if (!posById[target]) continue;
    names.forEach((name, i) => {
      const pid = `ptr_${name}`;
      const x = posById[target].x;
      const y = posById[target].y - POINTER_OFFSET - i * POINTER_STACK;
      pointerNodes.push({
        group: "nodes",
        data: { id: pid, label: name },
        position: { x, y },
        classes: "pointer-label",
      });
      pointerEdges.push({
        group: "edges",
        data: { id: `pe_${name}`, source: pid, target: target },
        classes: "pointer-edge",
      });
    });
  }

  cy.add([...dataNodes, ...dataEdges, ...pointerNodes, ...pointerEdges]);
  if (cy.elements().length > 0) {
    cy.fit(cy.elements(), 40);
  }
}

window.resetLayoutCache = resetLayoutCache;
