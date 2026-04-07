import { useRef, useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import type { WorkflowData, WFNode, WFEdge } from "../../lib/i18n";

interface Props {
  workflow: WorkflowData;
  index: number;
}

const NODE_H = 32;
const DECISION_SIZE = 48;
const ROW_GAP = 20;
const ROW_HEIGHT = NODE_H + ROW_GAP;
const DECISION_ROW_HEIGHT = DECISION_SIZE + ROW_GAP;

function getRowY(row: number, nodes: WFNode[]): number {
  let y = 0;
  for (let r = 0; r < row; r++) {
    const hasDecision = nodes.some((n) => n.row === r && n.type === "decision");
    y += hasDecision ? DECISION_ROW_HEIGHT : ROW_HEIGHT;
  }
  return y;
}

function getTotalHeight(rows: number, nodes: WFNode[]): number {
  let h = 0;
  for (let r = 0; r < rows; r++) {
    const hasDecision = nodes.some((n) => n.row === r && n.type === "decision");
    h += hasDecision ? DECISION_ROW_HEIGHT : ROW_HEIGHT;
  }
  return h - ROW_GAP + (nodes.some((n) => n.row === rows - 1 && n.type === "decision") ? DECISION_SIZE : NODE_H);
}

function nodeCenter(
  node: WFNode,
  cellW: number,
  nodes: WFNode[],
): { x: number; y: number } {
  const x = node.col * cellW + cellW / 2;
  const rowY = getRowY(node.row, nodes);
  const h = node.type === "decision" ? DECISION_SIZE : NODE_H;
  const y = rowY + h / 2;
  return { x, y };
}

function buildEdgePath(
  edge: WFEdge,
  nodeMap: Map<string, WFNode>,
  cellW: number,
  totalW: number,
  allNodes: WFNode[],
): string {
  const fromNode = nodeMap.get(edge.from)!;
  const toNode = nodeMap.get(edge.to)!;
  const from = nodeCenter(fromNode, cellW, allNodes);
  const to = nodeCenter(toNode, cellW, allNodes);
  const fromH = fromNode.type === "decision" ? DECISION_SIZE / 2 : NODE_H / 2;
  const toH = toNode.type === "decision" ? DECISION_SIZE / 2 : NODE_H / 2;

  // Feedback loop (going upward) — route along the right side
  if (edge.dashed && toNode.row < fromNode.row) {
    const offsetX = totalW + 12;
    const startY = from.y;
    const endY = to.y;
    return `M ${from.x + 50} ${startY} L ${offsetX} ${startY} L ${offsetX} ${endY} L ${to.x + 50} ${endY}`;
  }

  // Same column — straight vertical line
  if (fromNode.col === toNode.col) {
    return `M ${from.x} ${from.y + fromH} L ${to.x} ${to.y - toH}`;
  }

  // Different columns — L-shaped step path
  const midY = from.y + fromH + ROW_GAP / 2;
  return `M ${from.x} ${from.y + fromH} L ${from.x} ${midY} L ${to.x} ${midY} L ${to.x} ${to.y - toH}`;
}

function edgeLabelPos(
  edge: WFEdge,
  nodeMap: Map<string, WFNode>,
  cellW: number,
  totalW: number,
  allNodes: WFNode[],
): { x: number; y: number } {
  const fromNode = nodeMap.get(edge.from)!;
  const toNode = nodeMap.get(edge.to)!;
  const from = nodeCenter(fromNode, cellW, allNodes);
  const to = nodeCenter(toNode, cellW, allNodes);

  if (edge.dashed && toNode.row < fromNode.row) {
    const offsetX = totalW + 12;
    return { x: offsetX + 4, y: (from.y + to.y) / 2 };
  }
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
}

export default function WorkflowDiagram({ workflow, index }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setContainerW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const nodeMap = useMemo(() => {
    const m = new Map<string, WFNode>();
    workflow.nodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [workflow]);

  const cellW = containerW / workflow.cols;
  const totalH = getTotalHeight(workflow.rows, workflow.nodes);
  // Extra width for feedback loop paths routed along the right side
  const svgW = containerW + 40;

  return (
    <motion.div
      ref={containerRef}
      className="wf-container"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{ position: "relative", minHeight: totalH }}
    >
      {/* Nodes */}
      {containerW > 0 &&
        workflow.nodes.map((node) => {
          const cx = node.col * cellW + cellW / 2;
          const ry = getRowY(node.row, workflow.nodes);
          const isDecision = node.type === "decision";
          const w = isDecision ? DECISION_SIZE : undefined;
          const h = isDecision ? DECISION_SIZE : NODE_H;
          const delay = node.row * 0.12 + node.col * 0.04;

          return (
            <motion.div
              key={node.id}
              className={`wf-node ${isDecision ? "wf-node--decision" : ""}`}
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay, duration: 0.3, ease: "easeOut" }}
              style={{
                position: "absolute",
                left: isDecision ? cx - DECISION_SIZE / 2 : undefined,
                top: ry,
                width: w,
                height: h,
                // For process nodes: center horizontally in cell, auto width
                ...(!isDecision && {
                  left: cx,
                  transform: "translateX(-50%)",
                }),
              }}
            >
              <span data-lang="en" className="wf-node-label">
                {node.label.en}
              </span>
              <span data-lang="zh" className="wf-node-label">
                {node.label.zh}
              </span>
            </motion.div>
          );
        })}

      {/* SVG edges */}
      {containerW > 0 && (
        <svg
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: svgW,
            height: totalH,
            pointerEvents: "none",
            overflow: "visible",
          }}
        >
          <defs>
            <marker
              id={`wf-arrow-${index}`}
              markerWidth="6"
              markerHeight="4"
              refX="5"
              refY="2"
              orient="auto"
            >
              <path
                d="M 0 0 L 6 2 L 0 4 Z"
                fill="var(--color-accent)"
                opacity="0.5"
              />
            </marker>
            <marker
              id={`wf-arrow-dashed-${index}`}
              markerWidth="6"
              markerHeight="4"
              refX="5"
              refY="2"
              orient="auto"
            >
              <path
                d="M 0 0 L 6 2 L 0 4 Z"
                fill="var(--color-accent)"
                opacity="0.3"
              />
            </marker>
          </defs>
          {workflow.edges.map((edge) => {
            const toNode = nodeMap.get(edge.to)!;
            const delay = toNode.row * 0.12 + toNode.col * 0.04;
            const d = buildEdgePath(
              edge,
              nodeMap,
              cellW,
              containerW,
              workflow.nodes,
            );
            const markerId = edge.dashed
              ? `wf-arrow-dashed-${index}`
              : `wf-arrow-${index}`;

            return (
              <g key={`${edge.from}-${edge.to}`}>
                <motion.path
                  d={d}
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth="1.5"
                  strokeOpacity={edge.dashed ? 0.25 : 0.35}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={edge.dashed ? "4 3" : undefined}
                  markerEnd={`url(#${markerId})`}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{
                    pathLength: { delay, duration: 0.4, ease: "easeInOut" },
                    opacity: { delay, duration: 0.15 },
                  }}
                />
                {edge.label && (() => {
                  const pos = edgeLabelPos(
                    edge,
                    nodeMap,
                    cellW,
                    containerW,
                    workflow.nodes,
                  );
                  return (
                    <motion.text
                      x={pos.x}
                      y={pos.y}
                      className="wf-edge-label"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: delay + 0.2, duration: 0.2 }}
                    >
                      <tspan data-lang="en">{edge.label.en}</tspan>
                      <tspan data-lang="zh">{edge.label.zh}</tspan>
                    </motion.text>
                  );
                })()}
              </g>
            );
          })}
        </svg>
      )}
    </motion.div>
  );
}
