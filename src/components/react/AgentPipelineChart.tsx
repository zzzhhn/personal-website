import MermaidDiagram from "./MermaidDiagram";

const CHART = [
  "flowchart LR",
  "    input([Conversations\\n500 sessions · JSONL]):::io --> s1",
  "    s1[\"Stage 1: Classify Intent\\n7 categories\\nhybrid rules + LLM\"] --> s3",
  "    s3[\"Stage 3: LLM Judge\\n5 dimensions\\n5-shot calibration\"] --> s4",
  "    s4[\"Stage 4: Aggregate\\nturn → session\\n→ intent category\"] --> s5",
  "    s5[\"Stage 5: Report\\nheatmaps · radar · JSON\"]:::out --> output([Intent + Quality Profiles]):::io",
  "    llm([LLM Backend\\nGemma 4 local or\\nOpenAI-compat API]):::ext --> s1",
  "    llm --> s3",
  "    classDef io fill:#6366f11a,stroke:#6366f1,color:#a5b4fc",
  "    classDef ext fill:#10b9811a,stroke:#10b981,color:#6ee7b7",
  "    classDef out fill:#f59e0b1a,stroke:#f59e0b,color:#fcd34d",
].join("\n");

export default function AgentPipelineChart() {
  return (
    <MermaidDiagram
      chart={CHART}
      caption="EvalForge Agent track — Stage 2 (Generation) is skipped when conversations are pre-collected"
    />
  );
}
