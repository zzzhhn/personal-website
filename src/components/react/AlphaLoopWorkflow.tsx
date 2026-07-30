import type { CSSProperties } from "react";
import { motion } from "framer-motion";
import type { WorkflowData } from "../../lib/i18n";

interface Props {
  workflow: WorkflowData;
}

const ORBIT_POSITIONS = [
  { x: "13%", y: "19%" },
  { x: "50%", y: "9%" },
  { x: "87%", y: "19%" },
  { x: "87%", y: "70%" },
  { x: "50%", y: "82%" },
  { x: "13%", y: "70%" },
] as const;

export default function AlphaLoopWorkflow({ workflow }: Props) {
  return (
    <motion.div
      className="wf-container wf-container--alpha-loop"
      role="group"
      aria-label="Closed-loop automated factor discovery workflow / 自动挖因子闭环"
      initial={{ opacity: 0, y: 8, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 5, scale: 0.99 }}
      transition={{ type: "spring", stiffness: 250, damping: 28, mass: 0.75 }}
    >
      <div className="alpha-loop-stage">
        <svg
          className="alpha-loop-orbit"
          viewBox="0 0 500 250"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            className="alpha-loop-track alpha-loop-track--halo"
            d="M65 50 C170 5 330 5 435 50 C490 90 490 160 435 200 C330 245 170 245 65 200 C10 160 10 90 65 50 Z"
          />
          <path
            className="alpha-loop-track alpha-loop-track--rail"
            d="M65 50 C170 5 330 5 435 50 C490 90 490 160 435 200 C330 245 170 245 65 200 C10 160 10 90 65 50 Z"
          />
          <circle className="alpha-loop-signal" r="4">
            <animateMotion
              dur="7s"
              repeatCount="indefinite"
              path="M65 50 C170 5 330 5 435 50 C490 90 490 160 435 200 C330 245 170 245 65 200 C10 160 10 90 65 50 Z"
            />
          </circle>
        </svg>

        <div className="alpha-loop-core">
          <span className="alpha-loop-kicker">WORLDQUANT × ALPHA AGENT</span>
          <strong>
            <span data-lang="en">{workflow.center?.label.en}</span>
            <span data-lang="zh">{workflow.center?.label.zh}</span>
          </strong>
          <small>
            <span data-lang="en">{workflow.center?.meta.en}</span>
            <span data-lang="zh">{workflow.center?.meta.zh}</span>
          </small>
          <div className="alpha-loop-outcomes" aria-label="Candidate outcomes">
            {workflow.outcomes?.map((outcome) => (
              <span key={outcome.tone} className={`alpha-loop-outcome alpha-loop-outcome--${outcome.tone}`}>
                <span data-lang="en">{outcome.label.en}</span>
                <span data-lang="zh">{outcome.label.zh}</span>
              </span>
            ))}
          </div>
        </div>

        {workflow.nodes.map((node, i) => {
          const position = ORBIT_POSITIONS[i] ?? ORBIT_POSITIONS[0];
          return (
            <motion.div
              key={node.id}
              className={`alpha-loop-node${node.type === "decision" ? " alpha-loop-node--gate" : ""}`}
              style={{ "--alpha-x": position.x, "--alpha-y": position.y } as CSSProperties}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.08 + i * 0.07, duration: 0.28, ease: "easeOut" }}
            >
              <span className="alpha-loop-node-index">{String(i + 1).padStart(2, "0")}</span>
              <span data-lang="en">{node.label.en}</span>
              <span data-lang="zh">{node.label.zh}</span>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
