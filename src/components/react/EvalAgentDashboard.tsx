import { useState, useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";

/* ── Static agent evaluation data ── */

interface IntentData {
  name: string;
  count: number;
  color: string;
  quality: { coverage: number; relevance: number; executability: number; practicality: number };
}

const INTENTS: IntentData[] = [
  { name: "Information Query", count: 142, color: "#6366f1", quality: { coverage: 88.2, relevance: 91.3, executability: 72.1, practicality: 85.6 } },
  { name: "Task Execution", count: 98, color: "#10b981", quality: { coverage: 82.4, relevance: 86.7, executability: 90.2, practicality: 88.1 } },
  { name: "Creative Writing", count: 67, color: "#f59e0b", quality: { coverage: 79.8, relevance: 84.5, executability: 68.3, practicality: 71.2 } },
  { name: "Code Generation", count: 83, color: "#ec4899", quality: { coverage: 85.6, relevance: 88.9, executability: 91.5, practicality: 86.3 } },
  { name: "Analysis", count: 54, color: "#8b5cf6", quality: { coverage: 90.1, relevance: 87.2, executability: 74.8, practicality: 82.4 } },
  { name: "Conversation", count: 38, color: "#06b6d4", quality: { coverage: 75.3, relevance: 92.1, executability: 65.4, practicality: 78.9 } },
  { name: "Translation", count: 18, color: "#84cc16", quality: { coverage: 86.7, relevance: 93.5, executability: 88.2, practicality: 90.1 } },
];

const QUALITY_DIMS = ["coverage", "relevance", "executability", "practicality"] as const;

const DIM_LABELS: Record<string, string> = {
  coverage: "Coverage",
  relevance: "Relevance",
  executability: "Executability",
  practicality: "Practicality",
};

interface ConversationSample {
  id: string;
  intent: string;
  turns: { role: "user" | "agent"; text: string }[];
  scores: { coverage: number; relevance: number; executability: number; practicality: number };
  overallGrade: string;
}

const SAMPLES: ConversationSample[] = [
  {
    id: "conv-0247",
    intent: "Code Generation",
    turns: [
      { role: "user", text: "Write a Python async function that retries an HTTP request up to 3 times with exponential backoff." },
      { role: "agent", text: "Here's an implementation using aiohttp with configurable retry logic:\n\nasync def fetch_with_retry(url, max_retries=3, base_delay=1.0):\n    for attempt in range(max_retries):\n        try:\n            async with aiohttp.ClientSession() as session:\n                async with session.get(url) as resp:\n                    resp.raise_for_status()\n                    return await resp.json()\n        except (aiohttp.ClientError, asyncio.TimeoutError) as e:\n            if attempt == max_retries - 1:\n                raise\n            delay = base_delay * (2 ** attempt)\n            await asyncio.sleep(delay)" },
    ],
    scores: { coverage: 92, relevance: 95, executability: 94, practicality: 88 },
    overallGrade: "Excellent",
  },
  {
    id: "conv-0183",
    intent: "Analysis",
    turns: [
      { role: "user", text: "Compare the trade-offs between microservices and monolithic architecture for a startup with 5 engineers." },
      { role: "agent", text: "For a 5-person startup, a monolith is almost certainly the right starting point. Here's the breakdown:\n\nMonolith advantages: simpler deployment, easier debugging, lower operational overhead, faster feature iteration. Your team can focus on product, not infrastructure.\n\nMicroservices drawbacks at this scale: distributed system complexity, need for service mesh/API gateway, higher DevOps burden, network latency between services.\n\nRecommendation: Start monolithic with clean module boundaries. Extract services only when you hit concrete scaling bottlenecks — not prematurely." },
    ],
    scores: { coverage: 88, relevance: 91, executability: 72, practicality: 90 },
    overallGrade: "Good",
  },
];

const GRADE_COLORS: Record<string, string> = {
  Excellent: "#10b981",
  Good: "#6366f1",
  Moderate: "#f59e0b",
};

const total = INTENTS.reduce((s, i) => s + i.count, 0);

export default function EvalAgentDashboard() {
  const [selectedIntent, setSelectedIntent] = useState<string | null>(null);
  const [sampleIdx, setSampleIdx] = useState(0);

  const globalQuality = useMemo(() => {
    return QUALITY_DIMS.map((dim) => {
      const weighted =
        INTENTS.reduce((s, i) => s + i.quality[dim] * i.count, 0) / total;
      return { dimension: DIM_LABELS[dim], score: Math.round(weighted * 10) / 10 };
    });
  }, []);

  const intentQualityRadar = useMemo(() => {
    if (!selectedIntent) return null;
    const intent = INTENTS.find((i) => i.name === selectedIntent);
    if (!intent) return null;
    return QUALITY_DIMS.map((dim) => ({
      dimension: DIM_LABELS[dim],
      [intent.name]: intent.quality[dim],
      Global: globalQuality.find((g) => g.dimension === DIM_LABELS[dim])!.score,
    }));
  }, [selectedIntent, globalQuality]);

  const sample = SAMPLES[sampleIdx];

  return (
    <div className="eval-dashboard">
      {/* Intent distribution + quality overview row */}
      <div className="eval-row">
        <div className="eval-card eval-card--half">
          <h3 className="eval-card-title">Intent Distribution</h3>
          <p className="eval-card-subtitle">{total} conversations classified into 7 categories</p>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={INTENTS}
                dataKey="count"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={95}
                paddingAngle={2}
                stroke="none"
                onClick={(_, idx) => setSelectedIntent(INTENTS[idx].name)}
                style={{ cursor: "pointer" }}
              >
                {INTENTS.map((i) => (
                  <Cell
                    key={i.name}
                    fill={i.color}
                    fillOpacity={selectedIntent && selectedIntent !== i.name ? 0.3 : 0.85}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface-elevated)",
                  border: "1px solid var(--color-border-subtle)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value: number, name: string) => [
                  `${value} (${((value / total) * 100).toFixed(1)}%)`,
                  name,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div className="eval-pie-legend">
            {INTENTS.map((i) => (
              <button
                key={i.name}
                className={`eval-legend-item ${selectedIntent === i.name ? "eval-legend-item--active" : ""}`}
                onClick={() =>
                  setSelectedIntent((p) => (p === i.name ? null : i.name))
                }
              >
                <span className="eval-legend-dot" style={{ background: i.color }} />
                <span className="eval-legend-label">{i.name}</span>
                <span className="eval-legend-count">{i.count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="eval-card eval-card--half">
          <h3 className="eval-card-title">
            {selectedIntent
              ? `Quality: ${selectedIntent}`
              : "Global Quality Scores"}
          </h3>
          <p className="eval-card-subtitle">
            4-dimension assessment via LLM judge with chain-of-thought
          </p>
          {selectedIntent && intentQualityRadar ? (
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={intentQualityRadar} cx="50%" cy="50%" outerRadius="68%">
                <PolarGrid stroke="var(--color-border-subtle)" />
                <PolarAngleAxis
                  dataKey="dimension"
                  tick={{ fill: "var(--color-text-secondary)", fontSize: 11 }}
                />
                <PolarRadiusAxis domain={[50, 100]} tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }} />
                <Radar
                  name={selectedIntent}
                  dataKey={selectedIntent}
                  stroke={INTENTS.find((i) => i.name === selectedIntent)?.color}
                  fill={INTENTS.find((i) => i.name === selectedIntent)?.color}
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
                <Radar
                  name="Global Avg"
                  dataKey="Global"
                  stroke="var(--color-text-tertiary)"
                  fill="none"
                  strokeDasharray="4 3"
                  strokeWidth={1.5}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={globalQuality}
                margin={{ left: 10, right: 20, top: 20, bottom: 10 }}
              >
                <XAxis
                  dataKey="dimension"
                  tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
                />
                <YAxis
                  domain={[60, 100]}
                  tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-surface-elevated)",
                    border: "1px solid var(--color-border-subtle)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [`${v.toFixed(1)}`, "Score"]}
                />
                <Bar dataKey="score" radius={[4, 4, 0, 0]} barSize={36}>
                  {globalQuality.map((_, i) => (
                    <Cell key={i} fill={["#6366f1", "#10b981", "#f59e0b", "#ec4899"][i]} fillOpacity={0.75} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Sample conversation evaluation */}
      <div className="eval-card">
        <div className="eval-sample-header">
          <h3 className="eval-card-title">Sample Evaluation</h3>
          <div className="eval-sample-nav">
            {SAMPLES.map((s, i) => (
              <button
                key={s.id}
                className={`eval-tab ${sampleIdx === i ? "eval-tab--active" : ""}`}
                onClick={() => setSampleIdx(i)}
              >
                {s.id}
              </button>
            ))}
          </div>
        </div>

        <div className="eval-sample-meta">
          <span className="eval-intent-tag" style={{ background: `${INTENTS.find((i) => i.name === sample.intent)?.color || "#6366f1"}20`, color: INTENTS.find((i) => i.name === sample.intent)?.color }}>
            {sample.intent}
          </span>
          <span
            className="eval-grade eval-grade--lg"
            style={{ color: GRADE_COLORS[sample.overallGrade], background: `${GRADE_COLORS[sample.overallGrade]}18` }}
          >
            {sample.overallGrade}
          </span>
        </div>

        <div className="eval-conversation">
          {sample.turns.map((t, i) => (
            <div key={i} className={`eval-turn eval-turn--${t.role}`}>
              <div className="eval-turn-role">{t.role === "user" ? "User" : "Agent"}</div>
              <div className="eval-turn-text">
                {t.text.split("\n").map((line, j) => (
                  <span key={j}>
                    {line}
                    {j < t.text.split("\n").length - 1 && <br />}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="eval-score-grid">
          {QUALITY_DIMS.map((dim) => (
            <div key={dim} className="eval-score-item">
              <div className="eval-score-label">{DIM_LABELS[dim]}</div>
              <div className="eval-score-bar-track">
                <div
                  className="eval-score-bar-fill"
                  style={{ width: `${sample.scores[dim]}%` }}
                />
              </div>
              <div className="eval-score-value">{sample.scores[dim]}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
