import MermaidDiagram from "./MermaidDiagram";

const CHART = [
  "flowchart LR",
  "    input([Prompt Dataset]):::io --> s1",
  "    s1[\"Stage 1: Classify\\nLLM taxonomy · hash cache\\n7 prompt categories\"] --> s2",
  "    s2[\"Stage 2: Generate\\nasync · per-provider semaphore\\nN-run retry · checkpoint\"] --> s3",
  "    s3[\"Stage 3: Evaluate\\nVBench 1.0 · 16 metrics\\n+ VBench++ I2V dims\"] --> s4",
  "    s4[\"Stage 4: Analyze\\npercentile normalise\\ncross-model ranking\"] --> s5",
  "    s5[\"Stage 5: Report\\nJSON · DOCX · HTML\"]:::out --> output([Interactive Dashboard]):::io",
  "    providers([Model Providers\\nKling · Veo · Runway · Pika]):::ext --> s2",
  "    vbench([VBench Evaluator\\noptional GPU server]):::ext --> s3",
  "    classDef io fill:#6366f11a,stroke:#6366f1,color:#a5b4fc",
  "    classDef ext fill:#10b9811a,stroke:#10b981,color:#6ee7b7",
  "    classDef out fill:#f59e0b1a,stroke:#f59e0b,color:#fcd34d",
].join("\n");

export default function T2VPipelineChart() {
  return (
    <MermaidDiagram
      chart={CHART}
      caption="EvalForge T2V track — text-to-video evaluation pipeline"
    />
  );
}
