import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import type { WorkflowData, WFNode, WFEdge } from "../../lib/i18n";

interface Props {
  workflow: WorkflowData;
  index: number;
}

interface EdgePath {
  d: string;
  edge: WFEdge;
  labelPos?: { x: number; y: number };
}

export default function WorkflowDiagram({ workflow, index }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [edgePaths, setEdgePaths] = useState<EdgePath[]>([]);
  const [svgH, setSvgH] = useState(0);
  const isHorizontal = workflow.direction === "horizontal";

  const nodeMap = useMemo(() => {
    const m = new Map<string, WFNode>();
    workflow.nodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [workflow]);

  const measureAndDraw = useCallback(() => {
    const container = containerRef.current;
    if (!container || nodeRefs.current.size < workflow.nodes.length) return;

    // offsetLeft/offsetTop are layout-based — unaffected by Framer Motion transforms
    const positions = new Map<
      string,
      { cx: number; cy: number; l: number; r: number; t: number; b: number }
    >();

    nodeRefs.current.forEach((el, id) => {
      const l = el.offsetLeft;
      const t = el.offsetTop;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      // clip-path diamond: visual tips sit at layout box midpoints (no offset needed)
      positions.set(id, {
        cx: l + w / 2,
        cy: t + h / 2,
        l,
        r: l + w,
        t,
        b: t + h,
      });
    });

    let maxRight = 0;
    let maxBottom = 0;
    positions.forEach((p) => {
      if (p.r > maxRight) maxRight = p.r;
      if (p.b > maxBottom) maxBottom = p.b;
    });

    const isHoriz = workflow.direction === "horizontal";
    const paths: EdgePath[] = [];

    for (const edge of workflow.edges) {
      const fp = positions.get(edge.from);
      const tp = positions.get(edge.to);
      if (!fp || !tp) continue;

      const fromNode = nodeMap.get(edge.from)!;
      const toNode = nodeMap.get(edge.to)!;

      let d: string;
      let labelPos: { x: number; y: number } | undefined;

      if (isHoriz) {
        // ── Horizontal layout ──
        // Feedback loop — route along the bottom
        if (edge.dashed && toNode.col < fromNode.col) {
          const loopY = maxBottom + 20;
          d = [
            `M ${fp.cx} ${fp.b}`,
            `L ${fp.cx} ${loopY}`,
            `L ${tp.cx} ${loopY}`,
            `L ${tp.cx} ${tp.b}`,
          ].join(" ");
          labelPos = { x: (fp.cx + tp.cx) / 2, y: loopY + 12 };
        }
        // Same row — straight horizontal (ensure left-to-right direction)
        else if (Math.abs(fp.cy - tp.cy) < 8) {
          const x1 = Math.min(fp.r, fp.cx + 4);
          const x2 = Math.max(tp.l, tp.cx - 4);
          // Guarantee arrow goes left→right even if nodes nearly touch
          const startX = fromNode.col < toNode.col ? fp.r : fp.l;
          const endX = fromNode.col < toNode.col ? tp.l : tp.r;
          d = `M ${startX} ${fp.cy} L ${endX} ${tp.cy}`;
          if (edge.label) {
            labelPos = { x: (startX + endX) / 2, y: fp.cy - 10 };
          }
        }
        // Different rows — step path (horizontal → vertical → horizontal)
        else {
          const midX = (fp.r + tp.l) / 2;
          d = [
            `M ${fp.r} ${fp.cy}`,
            `L ${midX} ${fp.cy}`,
            `L ${midX} ${tp.cy}`,
            `L ${tp.l} ${tp.cy}`,
          ].join(" ");
          if (edge.label) {
            labelPos = { x: midX, y: (fp.cy + tp.cy) / 2 - 8 };
          }
        }
      } else {
        // ── Vertical layout (default) ──
        // Feedback loop — route along the right side
        if (edge.dashed && toNode.row < fromNode.row) {
          const loopX = maxRight + 24;
          d = [
            `M ${fp.r} ${fp.cy}`,
            `L ${loopX} ${fp.cy}`,
            `L ${loopX} ${tp.cy}`,
            `L ${tp.r} ${tp.cy}`,
          ].join(" ");
          labelPos = { x: loopX + 5, y: (fp.cy + tp.cy) / 2 };
        }
        // Same column — straight vertical
        else if (Math.abs(fp.cx - tp.cx) < 8) {
          d = `M ${fp.cx} ${fp.b} L ${tp.cx} ${tp.t}`;
          if (edge.label) {
            labelPos = { x: fp.cx + 20, y: (fp.b + tp.t) / 2 };
          }
        }
        // Different columns — step path (vertical → horizontal → vertical)
        else {
          const midY = (fp.b + tp.t) / 2;
          d = [
            `M ${fp.cx} ${fp.b}`,
            `L ${fp.cx} ${midY}`,
            `L ${tp.cx} ${midY}`,
            `L ${tp.cx} ${tp.t}`,
          ].join(" ");
          if (edge.label) {
            labelPos = { x: (fp.cx + tp.cx) / 2, y: midY - 8 };
          }
        }
      }

      paths.push({ d, edge, labelPos });
    }

    setEdgePaths(paths);
    setSvgH(container.scrollHeight);
  }, [workflow, nodeMap]);

  // Measure after grid layout settles + on resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // rAF ensures grid layout is computed before measuring
    const raf = requestAnimationFrame(() => measureAndDraw());

    const ro = new ResizeObserver(() => measureAndDraw());
    ro.observe(container);

    // Re-measure when language or theme toggles (text width changes)
    const mo = new MutationObserver(() => {
      requestAnimationFrame(() => measureAndDraw());
    });
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-site-lang', 'data-theme'],
    });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
    };
  }, [measureAndDraw]);

  return (
    <motion.div
      ref={containerRef}
      className={`wf-container${isHorizontal ? " wf-container--horizontal" : ""}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* CSS Grid places nodes; SVG overlay draws edges */}
      <div
        className="wf-grid"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${workflow.cols}, 1fr)`,
          gridTemplateRows: `repeat(${workflow.rows}, auto)`,
          gap: isHorizontal
            ? `12px ${workflow.cols >= 7 ? 24 : 36}px`
            : "32px 14px",
          justifyItems: "center",
          alignItems: "center",
        }}
      >
        {workflow.nodes.map((node) => {
          const isDecision = node.type === "decision";
          const delay = isHorizontal
            ? node.col * 0.09 + node.row * 0.03
            : node.row * 0.09 + node.col * 0.03;

          return (
            <motion.div
              key={node.id}
              ref={(el: HTMLDivElement | null) => {
                if (el) nodeRefs.current.set(node.id, el);
              }}
              className={`wf-node${isDecision ? " wf-node--decision" : ""}`}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay, duration: 0.3, ease: "easeOut" }}
              style={{
                gridColumn: node.col + 1,
                gridRow: node.row + 1,
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
      </div>

      {/* SVG edge overlay */}
      {edgePaths.length > 0 && (
        <svg
          aria-hidden="true"
          className="wf-svg"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: svgH || "100%",
            pointerEvents: "none",
            overflow: "visible",
          }}
        >
          <defs>
            <marker
              id={`wf-a-${index}`}
              markerWidth="8"
              markerHeight="6"
              refX="8"
              refY="3"
              orient="auto"
            >
              <path d="M 0 0 L 8 3 L 0 6 Z" className="wf-arrow-fill" />
            </marker>
            <marker
              id={`wf-ad-${index}`}
              markerWidth="8"
              markerHeight="6"
              refX="8"
              refY="3"
              orient="auto"
            >
              <path d="M 0 0 L 8 3 L 0 6 Z" className="wf-arrow-fill wf-arrow-fill--dashed" />
            </marker>
          </defs>
          {edgePaths.map((ep) => {
            const toNode = nodeMap.get(ep.edge.to)!;
            const delay = toNode.row * 0.09 + toNode.col * 0.03;
            const mid = ep.edge.dashed ? `wf-ad-${index}` : `wf-a-${index}`;

            return (
              <g key={`${ep.edge.from}-${ep.edge.to}`}>
                <motion.path
                  d={ep.d}
                  fill="none"
                  className={ep.edge.dashed ? "wf-edge wf-edge--dashed" : "wf-edge"}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={ep.edge.dashed ? "5 3" : undefined}
                  markerEnd={`url(#${mid})`}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{
                    pathLength: { delay, duration: 0.45, ease: "easeInOut" },
                    opacity: { delay, duration: 0.15 },
                  }}
                />
                {ep.labelPos && ep.edge.label && (
                  <motion.text
                    x={ep.labelPos.x}
                    y={ep.labelPos.y}
                    className="wf-edge-label"
                    textAnchor={ep.edge.dashed ? "start" : "middle"}
                    dominantBaseline="middle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: delay + 0.2, duration: 0.2 }}
                  >
                    <tspan data-lang="en">{ep.edge.label.en}</tspan>
                    <tspan data-lang="zh">{ep.edge.label.zh}</tspan>
                  </motion.text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </motion.div>
  );
}
