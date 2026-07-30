import type { ReactNode } from "react";
import { motion } from "framer-motion";
import type { WorkflowData } from "../../lib/i18n";

interface Props {
  workflow: WorkflowData;
}

type StoryVariant =
  | "evaluation-lab"
  | "evaluation-router"
  | "deal-room"
  | "underwriting-ledger";

function NodeLabel({ workflow, id }: Props & { id: string }) {
  const node = workflow.nodes.find((item) => item.id === id);
  if (!node) return null;
  return (
    <>
      <span data-lang="en">{node.label.en}</span>
      <span data-lang="zh">{node.label.zh}</span>
    </>
  );
}

function StoryHeader({ workflow, eyebrow }: Props & { eyebrow: string }) {
  return (
    <header className="wf-story-header">
      <span className="wf-story-eyebrow">{eyebrow}</span>
      <strong>
        <span data-lang="en">{workflow.center?.label.en}</span>
        <span data-lang="zh">{workflow.center?.label.zh}</span>
      </strong>
      <small>
        <span data-lang="en">{workflow.center?.meta.en}</span>
        <span data-lang="zh">{workflow.center?.meta.zh}</span>
      </small>
    </header>
  );
}

function StoryShell({ variant, label, children }: {
  variant: StoryVariant;
  label: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      className={`wf-container wf-container--story wf-container--${variant}`}
      role="group"
      aria-label={label}
      initial={{ opacity: 0, y: 8, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 5, scale: 0.99 }}
      transition={{ type: "spring", stiffness: 250, damping: 28, mass: 0.75 }}
    >
      {children}
    </motion.div>
  );
}

function EvaluationLab({ workflow }: Props) {
  return (
    <StoryShell variant="evaluation-lab" label="Video evaluation laboratory workflow / 视频评测实验室工作流">
      <div className="wf-story-stage evaluation-lab">
        <StoryHeader workflow={workflow} eyebrow="VIDEO REBIRTH · QA SYSTEM" />
        <div className="lab-control wf-story-panel">
          <span className="wf-story-index">01</span>
          <b><NodeLabel workflow={workflow} id="scope" /></b>
          <i aria-hidden="true" />
          <span className="wf-story-index">02</span>
          <b><NodeLabel workflow={workflow} id="framework" /></b>
        </div>
        <div className="lab-bench">
          <div className="lab-channel wf-story-panel">
            <span className="wf-story-index">03A · DATA</span>
            <b><NodeLabel workflow={workflow} id="data" /></b>
            <span className="lab-meter" aria-hidden="true" />
          </div>
          <div className="lab-chamber wf-story-panel">
            <span className="wf-story-index">04 · RUN</span>
            <b><NodeLabel workflow={workflow} id="run" /></b>
            <span className="lab-scan" aria-hidden="true" />
          </div>
          <div className="lab-channel wf-story-panel">
            <span className="wf-story-index">03B · METRIC</span>
            <b><NodeLabel workflow={workflow} id="metric" /></b>
            <span className="lab-meter lab-meter--metric" aria-hidden="true" />
          </div>
        </div>
        <div className="lab-output">
          <span className="wf-story-step"><NodeLabel workflow={workflow} id="analysis" /></span>
          <span className="wf-story-arrow" aria-hidden="true">→</span>
          <span className="wf-story-step"><NodeLabel workflow={workflow} id="report" /></span>
          <span className="lab-iterate">
            <span data-lang="en">↺ FEEDBACK TO FRAMEWORK</span>
            <span data-lang="zh">↺ 反馈至评测体系</span>
          </span>
        </div>
      </div>
    </StoryShell>
  );
}

function EvaluationRouter({ workflow }: Props) {
  return (
    <StoryShell variant="evaluation-router" label="AIME evaluation routing workflow / AIME 评测路由工作流">
      <div className="wf-story-stage evaluation-router">
        <StoryHeader workflow={workflow} eyebrow="BYTEDANCE · AIME CONSOLE" />
        <div className="router-intake">
          <span className="wf-story-step"><NodeLabel workflow={workflow} id="req" /></span>
          <span className="wf-story-arrow" aria-hidden="true">→</span>
          <span className="wf-story-step wf-story-step--active"><NodeLabel workflow={workflow} id="taxonomy" /></span>
        </div>
        <div className="router-lanes">
          <div className="router-lane wf-story-panel">
            <small>DATA / 01</small><b><NodeLabel workflow={workflow} id="datapipe" /></b>
          </div>
          <div className="router-lane wf-story-panel">
            <small>SPEC / 02</small><b><NodeLabel workflow={workflow} id="annospec" /></b>
          </div>
        </div>
        <div className="router-bus">
          <span className="router-packet" aria-hidden="true" />
          <span className="router-station"><small>AUTO</small><b><NodeLabel workflow={workflow} id="autolabel" /></b></span>
          <span className="router-station"><small>HUMAN</small><b><NodeLabel workflow={workflow} id="humanqa" /></b></span>
          <span className="router-station router-station--gate"><small>GATE</small><b><NodeLabel workflow={workflow} id="qcheck" /></b></span>
          <span className="router-station"><small>OUTPUT</small><b><NodeLabel workflow={workflow} id="report" /></b></span>
        </div>
        <div className="router-feedback">
          <span data-lang="en">FAIL · recalibrate labels</span>
          <span data-lang="zh">未达标 · 返回校准</span>
        </div>
      </div>
    </StoryShell>
  );
}

function DealRoom({ workflow }: Props) {
  const dossiers = [
    { id: "bizdd", code: "BIZ", tone: "warm" },
    { id: "findd", code: "FIN", tone: "blue" },
    { id: "techdd", code: "TECH", tone: "teal" },
  ];

  return (
    <StoryShell variant="deal-room" label="Venture capital deal room workflow / 风险投资决策室工作流">
      <div className="wf-story-stage deal-room">
        <StoryHeader workflow={workflow} eyebrow="MOE CAPITAL · DEAL DESK" />
        <div className="deal-intake wf-story-panel">
          <span><small>01</small><b><NodeLabel workflow={workflow} id="scan" /></b></span>
          <span className="wf-story-arrow" aria-hidden="true">→</span>
          <span><small>02</small><b><NodeLabel workflow={workflow} id="screen" /></b></span>
        </div>
        <div className="deal-dossiers">
          {dossiers.map((dossier) => (
            <article key={dossier.id} className={`deal-dossier deal-dossier--${dossier.tone}`}>
              <span className="deal-tab">{dossier.code}</span>
              <b><NodeLabel workflow={workflow} id={dossier.id} /></b>
              <span className="deal-line" aria-hidden="true" />
              <span className="deal-line deal-line--short" aria-hidden="true" />
              <span className="deal-check" aria-hidden="true">✓</span>
            </article>
          ))}
          <span className="deal-scan" aria-hidden="true" />
        </div>
        <div className="deal-decision">
          <span className="wf-story-step"><NodeLabel workflow={workflow} id="comp" /></span>
          <span className="wf-story-arrow" aria-hidden="true">→</span>
          <span className="wf-story-step"><NodeLabel workflow={workflow} id="memo" /></span>
          <span className="wf-story-arrow" aria-hidden="true">→</span>
          <span className="deal-ic">
            <small>IC</small><b><NodeLabel workflow={workflow} id="ic" /></b>
          </span>
        </div>
      </div>
    </StoryShell>
  );
}

function UnderwritingLedger({ workflow }: Props) {
  const steps = [
    { id: "init", no: "01", kind: "single" },
    { id: "industry", no: "02A", kind: "split" },
    { id: "financial", no: "02B", kind: "split" },
    { id: "valuation", no: "03", kind: "single" },
    { id: "report", no: "04", kind: "single" },
    { id: "review", no: "05", kind: "review" },
  ];

  return (
    <StoryShell variant="underwriting-ledger" label="Equity underwriting review ledger / 股权承做审核台账">
      <div className="wf-story-stage underwriting-ledger">
        <div className="ledger-sheet">
          <StoryHeader workflow={workflow} eyebrow="SDIC SECURITIES · PROJECT FILE" />
          <div className="ledger-grid">
            {steps.map((step) => (
              <div key={step.id} className={`ledger-entry ledger-entry--${step.kind}`}>
                <span className="ledger-no">{step.no}</span>
                <b><NodeLabel workflow={workflow} id={step.id} /></b>
                <span className="ledger-state" aria-hidden="true">✓</span>
              </div>
            ))}
          </div>
          <span className="ledger-scan" aria-hidden="true" />
          <div className="ledger-seal">
            <span data-lang="en">INTERNAL<br />REVIEW</span>
            <span data-lang="zh">内核<br />审核</span>
          </div>
        </div>
      </div>
    </StoryShell>
  );
}

export default function NarrativeWorkflow({ workflow }: Props) {
  switch (workflow.variant) {
    case "evaluation-lab":
      return <EvaluationLab workflow={workflow} />;
    case "evaluation-router":
      return <EvaluationRouter workflow={workflow} />;
    case "deal-room":
      return <DealRoom workflow={workflow} />;
    case "underwriting-ledger":
      return <UnderwritingLedger workflow={workflow} />;
    default:
      return null;
  }
}
