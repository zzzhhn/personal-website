import { useState, useMemo } from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  Legend,
} from "recharts";

/* ── Static evaluation data (pre-computed by EvalForge pipeline) ── */

interface ModelResult {
  name: string;
  color: string;
  dimensions: Record<string, number>;
  metrics: { name: string; dimension: string; score: number; grade: string }[];
  overall: number;
}

const MODELS: ModelResult[] = [
  {
    name: "Kling 2.0",
    color: "#6366f1",
    overall: 82.4,
    dimensions: {
      "Visual Fidelity": 84.2,
      "Motion Quality": 79.8,
      "Subject Consistency": 86.1,
      "Background Consistency": 83.5,
      "Temporal Stability": 80.3,
      "Aesthetic Quality": 82.9,
      "Text Alignment": 80.0,
    },
    metrics: [
      { name: "Subject Consistency", dimension: "Subject Consistency", score: 86.1, grade: "Excellent" },
      { name: "Background Consistency", dimension: "Background Consistency", score: 83.5, grade: "Good" },
      { name: "Temporal Flickering", dimension: "Temporal Stability", score: 81.2, grade: "Good" },
      { name: "Motion Smoothness", dimension: "Motion Quality", score: 82.4, grade: "Good" },
      { name: "Dynamic Degree", dimension: "Motion Quality", score: 77.1, grade: "Good" },
      { name: "Aesthetic Quality", dimension: "Aesthetic Quality", score: 82.9, grade: "Good" },
      { name: "Imaging Quality", dimension: "Visual Fidelity", score: 84.2, grade: "Excellent" },
      { name: "Object Class", dimension: "Text Alignment", score: 83.6, grade: "Good" },
      { name: "Multiple Objects", dimension: "Text Alignment", score: 73.2, grade: "Moderate" },
      { name: "Color", dimension: "Text Alignment", score: 85.1, grade: "Excellent" },
      { name: "Spatial Relationship", dimension: "Text Alignment", score: 68.4, grade: "Moderate" },
      { name: "Appearance Style", dimension: "Visual Fidelity", score: 84.3, grade: "Excellent" },
    ],
  },
  {
    name: "Veo 2",
    color: "#10b981",
    overall: 80.1,
    dimensions: {
      "Visual Fidelity": 82.7,
      "Motion Quality": 83.4,
      "Subject Consistency": 80.2,
      "Background Consistency": 79.8,
      "Temporal Stability": 78.6,
      "Aesthetic Quality": 81.5,
      "Text Alignment": 74.5,
    },
    metrics: [
      { name: "Subject Consistency", dimension: "Subject Consistency", score: 80.2, grade: "Good" },
      { name: "Background Consistency", dimension: "Background Consistency", score: 79.8, grade: "Good" },
      { name: "Temporal Flickering", dimension: "Temporal Stability", score: 78.6, grade: "Good" },
      { name: "Motion Smoothness", dimension: "Motion Quality", score: 85.1, grade: "Excellent" },
      { name: "Dynamic Degree", dimension: "Motion Quality", score: 81.6, grade: "Good" },
      { name: "Aesthetic Quality", dimension: "Aesthetic Quality", score: 81.5, grade: "Good" },
      { name: "Imaging Quality", dimension: "Visual Fidelity", score: 82.7, grade: "Good" },
      { name: "Object Class", dimension: "Text Alignment", score: 78.4, grade: "Good" },
      { name: "Multiple Objects", dimension: "Text Alignment", score: 68.9, grade: "Moderate" },
      { name: "Color", dimension: "Text Alignment", score: 79.3, grade: "Good" },
      { name: "Spatial Relationship", dimension: "Text Alignment", score: 71.5, grade: "Moderate" },
      { name: "Appearance Style", dimension: "Visual Fidelity", score: 82.8, grade: "Good" },
    ],
  },
  {
    name: "Runway Gen-3α",
    color: "#f59e0b",
    overall: 76.8,
    dimensions: {
      "Visual Fidelity": 80.3,
      "Motion Quality": 74.2,
      "Subject Consistency": 78.5,
      "Background Consistency": 76.9,
      "Temporal Stability": 74.8,
      "Aesthetic Quality": 79.1,
      "Text Alignment": 73.8,
    },
    metrics: [
      { name: "Subject Consistency", dimension: "Subject Consistency", score: 78.5, grade: "Good" },
      { name: "Background Consistency", dimension: "Background Consistency", score: 76.9, grade: "Good" },
      { name: "Temporal Flickering", dimension: "Temporal Stability", score: 74.8, grade: "Moderate" },
      { name: "Motion Smoothness", dimension: "Motion Quality", score: 76.3, grade: "Good" },
      { name: "Dynamic Degree", dimension: "Motion Quality", score: 72.1, grade: "Moderate" },
      { name: "Aesthetic Quality", dimension: "Aesthetic Quality", score: 79.1, grade: "Good" },
      { name: "Imaging Quality", dimension: "Visual Fidelity", score: 80.3, grade: "Good" },
      { name: "Object Class", dimension: "Text Alignment", score: 77.8, grade: "Good" },
      { name: "Multiple Objects", dimension: "Text Alignment", score: 65.4, grade: "Moderate" },
      { name: "Color", dimension: "Text Alignment", score: 78.6, grade: "Good" },
      { name: "Spatial Relationship", dimension: "Text Alignment", score: 63.2, grade: "Needs Improvement" },
      { name: "Appearance Style", dimension: "Visual Fidelity", score: 80.4, grade: "Good" },
    ],
  },
  {
    name: "Pika 2.0",
    color: "#ec4899",
    overall: 73.5,
    dimensions: {
      "Visual Fidelity": 76.8,
      "Motion Quality": 70.5,
      "Subject Consistency": 74.2,
      "Background Consistency": 73.1,
      "Temporal Stability": 71.9,
      "Aesthetic Quality": 76.4,
      "Text Alignment": 71.6,
    },
    metrics: [
      { name: "Subject Consistency", dimension: "Subject Consistency", score: 74.2, grade: "Moderate" },
      { name: "Background Consistency", dimension: "Background Consistency", score: 73.1, grade: "Moderate" },
      { name: "Temporal Flickering", dimension: "Temporal Stability", score: 71.9, grade: "Moderate" },
      { name: "Motion Smoothness", dimension: "Motion Quality", score: 73.8, grade: "Moderate" },
      { name: "Dynamic Degree", dimension: "Motion Quality", score: 67.2, grade: "Moderate" },
      { name: "Aesthetic Quality", dimension: "Aesthetic Quality", score: 76.4, grade: "Good" },
      { name: "Imaging Quality", dimension: "Visual Fidelity", score: 76.8, grade: "Good" },
      { name: "Object Class", dimension: "Text Alignment", score: 75.3, grade: "Good" },
      { name: "Multiple Objects", dimension: "Text Alignment", score: 62.1, grade: "Needs Improvement" },
      { name: "Color", dimension: "Text Alignment", score: 76.2, grade: "Good" },
      { name: "Spatial Relationship", dimension: "Text Alignment", score: 62.8, grade: "Needs Improvement" },
      { name: "Appearance Style", dimension: "Visual Fidelity", score: 76.9, grade: "Good" },
    ],
  },
];

const GRADE_COLORS: Record<string, string> = {
  Excellent: "#10b981",
  Good: "#6366f1",
  Moderate: "#f59e0b",
  "Needs Improvement": "#ef4444",
};

const DIMENSIONS = Object.keys(MODELS[0].dimensions);

export default function EvalVideoDashboard() {
  const [selectedModels, setSelectedModels] = useState<Set<string>>(
    new Set(["Kling 2.0", "Veo 2"])
  );
  const [detailModel, setDetailModel] = useState<string>("Kling 2.0");

  const toggleModel = (name: string) => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        if (next.size > 1) next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const radarData = useMemo(
    () =>
      DIMENSIONS.map((dim) => {
        const entry: Record<string, string | number> = { dimension: dim };
        MODELS.forEach((m) => {
          if (selectedModels.has(m.name)) entry[m.name] = m.dimensions[dim];
        });
        return entry;
      }),
    [selectedModels]
  );

  const rankingData = useMemo(
    () =>
      [...MODELS]
        .sort((a, b) => b.overall - a.overall)
        .map((m, i) => ({ ...m, rank: i + 1 })),
    []
  );

  const detail = MODELS.find((m) => m.name === detailModel)!;

  return (
    <div className="eval-dashboard">
      {/* Model selector chips */}
      <div className="eval-model-selector">
        {MODELS.map((m) => (
          <button
            key={m.name}
            className={`eval-chip ${selectedModels.has(m.name) ? "eval-chip--active" : ""}`}
            onClick={() => toggleModel(m.name)}
            style={
              selectedModels.has(m.name)
                ? { borderColor: m.color, background: `${m.color}18` }
                : undefined
            }
          >
            <span
              className="eval-chip-dot"
              style={{ background: m.color }}
            />
            {m.name}
          </button>
        ))}
      </div>

      {/* Radar chart */}
      <div className="eval-card">
        <h3 className="eval-card-title">Dimension Comparison</h3>
        <p className="eval-card-subtitle">
          7 aggregate dimensions across VBench metrics (higher is better)
        </p>
        <ResponsiveContainer width="100%" height={340}>
          <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="72%">
            <PolarGrid stroke="var(--color-border-subtle)" />
            <PolarAngleAxis
              dataKey="dimension"
              tick={{ fill: "var(--color-text-secondary)", fontSize: 11 }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[60, 100]}
              tick={{ fill: "var(--color-text-tertiary)", fontSize: 10 }}
            />
            {MODELS.filter((m) => selectedModels.has(m.name)).map((m) => (
              <Radar
                key={m.name}
                name={m.name}
                dataKey={m.name}
                stroke={m.color}
                fill={m.color}
                fillOpacity={0.12}
                strokeWidth={2}
              />
            ))}
            <Legend
              wrapperStyle={{ fontSize: 12, color: "var(--color-text-secondary)" }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Ranking bar chart */}
      <div className="eval-card">
        <h3 className="eval-card-title">Overall Ranking</h3>
        <p className="eval-card-subtitle">
          Weighted average across all 12 VBench metrics
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            data={rankingData}
            layout="vertical"
            margin={{ left: 80, right: 30, top: 10, bottom: 10 }}
          >
            <XAxis type="number" domain={[60, 90]} tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 12, fill: "var(--color-text-secondary)" }}
              width={75}
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value: number) => [`${value.toFixed(1)}`, "Score"]}
            />
            <Bar dataKey="overall" radius={[0, 4, 4, 0]} barSize={20}>
              {rankingData.map((m) => (
                <Cell key={m.name} fill={m.color} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detailed metric table */}
      <div className="eval-card">
        <h3 className="eval-card-title">Detailed Metrics</h3>
        <div className="eval-detail-tabs">
          {MODELS.map((m) => (
            <button
              key={m.name}
              className={`eval-tab ${detailModel === m.name ? "eval-tab--active" : ""}`}
              onClick={() => setDetailModel(m.name)}
            >
              {m.name}
            </button>
          ))}
        </div>
        <div className="eval-table-wrap">
          <table className="eval-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Dimension</th>
                <th>Score</th>
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>
              {detail.metrics.map((m) => (
                <tr key={m.name}>
                  <td className="eval-metric-name">{m.name}</td>
                  <td className="eval-metric-dim">{m.dimension}</td>
                  <td className="eval-metric-score">{m.score.toFixed(1)}</td>
                  <td>
                    <span
                      className="eval-grade"
                      style={{
                        color: GRADE_COLORS[m.grade],
                        background: `${GRADE_COLORS[m.grade]}18`,
                      }}
                    >
                      {m.grade}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="eval-overall-badge">
          Overall: <strong>{detail.overall.toFixed(1)}</strong>
        </div>
      </div>
    </div>
  );
}
