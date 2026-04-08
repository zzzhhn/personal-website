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
  LabelList,
} from "recharts";

/* ──────────────────────────────────────────────────────────────────
   Static evaluation data produced by the EvalForge pipeline.

   Metric scores are raw VBench values (0–100 %).
   Dimension scores are EvalForge composite scores — weighted
   combinations of the underlying VBench metrics, where each metric
   is first normalised to its observed distribution across 50+
   publicly-benchmarked models (percentile-based 0–100 scale).
   Overall = quality 40% / semantic 40% / aesthetic 20% weighted avg.
   ────────────────────────────────────────────────────────────────── */

interface ModelResult {
  name: string;
  color: string;
  /** EvalForge composite dimensions (percentile-normalised, 0–100) */
  dimensions: Record<string, number>;
  /** Raw VBench per-metric scores */
  metrics: { name: string; dimension: string; score: number; grade: string }[];
  /** EvalForge weighted overall composite */
  overall: number;
}

const MODELS: ModelResult[] = [
  {
    name: "Kling 2.0",
    color: "#6366f1",
    overall: 75.6,
    dimensions: {
      "Temporal Consistency": 98.5,
      "Motion Quality":       71.1,
      "Visual Quality":       68.7,
      "Semantic Accuracy":    76.9,
      "Text Alignment":       66.8,
    },
    metrics: [
      { name: "Subject Consistency",    dimension: "Temporal Consistency", score: 98.5, grade: "Excellent" },
      { name: "Background Consistency", dimension: "Temporal Consistency", score: 97.8, grade: "Good"      },
      { name: "Temporal Flickering",    dimension: "Temporal Consistency", score: 99.1, grade: "Excellent" },
      { name: "Motion Smoothness",      dimension: "Motion Quality",       score: 99.4, grade: "Excellent" },
      { name: "Dynamic Degree",         dimension: "Motion Quality",       score: 52.3, grade: "Moderate"  },
      { name: "Aesthetic Quality",      dimension: "Visual Quality",       score: 63.1, grade: "Good"      },
      { name: "Imaging Quality",        dimension: "Visual Quality",       score: 72.4, grade: "Excellent" },
      { name: "Object Class",           dimension: "Semantic Accuracy",    score: 88.6, grade: "Excellent" },
      { name: "Multiple Objects",       dimension: "Semantic Accuracy",    score: 60.2, grade: "Good"      },
      { name: "Color",                  dimension: "Text Alignment",       score: 90.5, grade: "Excellent" },
      { name: "Spatial Relationship",   dimension: "Text Alignment",       score: 68.1, grade: "Good"      },
      { name: "Appearance Style",       dimension: "Visual Quality",       score: 26.4, grade: "Moderate"  },
    ],
  },
  {
    name: "Veo 2",
    color: "#10b981",
    overall: 73.4,
    dimensions: {
      "Temporal Consistency": 97.6,
      "Motion Quality":       68.7,
      "Visual Quality":       67.6,
      "Semantic Accuracy":    73.2,
      "Text Alignment":       63.4,
    },
    metrics: [
      { name: "Subject Consistency",    dimension: "Temporal Consistency", score: 97.2, grade: "Excellent" },
      { name: "Background Consistency", dimension: "Temporal Consistency", score: 96.9, grade: "Good"      },
      { name: "Temporal Flickering",    dimension: "Temporal Consistency", score: 98.7, grade: "Excellent" },
      { name: "Motion Smoothness",      dimension: "Motion Quality",       score: 99.6, grade: "Excellent" },
      { name: "Dynamic Degree",         dimension: "Motion Quality",       score: 48.1, grade: "Moderate"  },
      { name: "Aesthetic Quality",      dimension: "Visual Quality",       score: 61.8, grade: "Good"      },
      { name: "Imaging Quality",        dimension: "Visual Quality",       score: 71.5, grade: "Excellent" },
      { name: "Object Class",           dimension: "Semantic Accuracy",    score: 85.3, grade: "Good"      },
      { name: "Multiple Objects",       dimension: "Semantic Accuracy",    score: 55.8, grade: "Good"      },
      { name: "Color",                  dimension: "Text Alignment",       score: 87.4, grade: "Good"      },
      { name: "Spatial Relationship",   dimension: "Text Alignment",       score: 64.2, grade: "Good"      },
      { name: "Appearance Style",       dimension: "Visual Quality",       score: 24.1, grade: "Moderate"  },
    ],
  },
  {
    name: "Runway Gen-3α",
    color: "#f59e0b",
    overall: 71.2,
    dimensions: {
      "Temporal Consistency": 96.8,
      "Motion Quality":       66.4,
      "Visual Quality":       66.0,
      "Semantic Accuracy":    69.3,
      "Text Alignment":       59.9,
    },
    metrics: [
      { name: "Subject Consistency",    dimension: "Temporal Consistency", score: 96.4, grade: "Good"      },
      { name: "Background Consistency", dimension: "Temporal Consistency", score: 95.8, grade: "Moderate"  },
      { name: "Temporal Flickering",    dimension: "Temporal Consistency", score: 98.2, grade: "Excellent" },
      { name: "Motion Smoothness",      dimension: "Motion Quality",       score: 99.1, grade: "Excellent" },
      { name: "Dynamic Degree",         dimension: "Motion Quality",       score: 44.6, grade: "Moderate"  },
      { name: "Aesthetic Quality",      dimension: "Visual Quality",       score: 60.4, grade: "Good"      },
      { name: "Imaging Quality",        dimension: "Visual Quality",       score: 69.8, grade: "Good"      },
      { name: "Object Class",           dimension: "Semantic Accuracy",    score: 82.7, grade: "Good"      },
      { name: "Multiple Objects",       dimension: "Semantic Accuracy",    score: 51.3, grade: "Moderate"  },
      { name: "Color",                  dimension: "Text Alignment",       score: 84.9, grade: "Good"      },
      { name: "Spatial Relationship",   dimension: "Text Alignment",       score: 58.3, grade: "Good"      },
      { name: "Appearance Style",       dimension: "Visual Quality",       score: 22.7, grade: "Moderate"  },
    ],
  },
  {
    name: "Pika 2.0",
    color: "#ec4899",
    overall: 68.8,
    dimensions: {
      "Temporal Consistency": 95.6,
      "Motion Quality":       64.2,
      "Visual Quality":       63.9,
      "Semantic Accuracy":    65.3,
      "Text Alignment":       56.3,
    },
    metrics: [
      { name: "Subject Consistency",    dimension: "Temporal Consistency", score: 95.1, grade: "Moderate"  },
      { name: "Background Consistency", dimension: "Temporal Consistency", score: 94.3, grade: "Moderate"  },
      { name: "Temporal Flickering",    dimension: "Temporal Consistency", score: 97.5, grade: "Good"      },
      { name: "Motion Smoothness",      dimension: "Motion Quality",       score: 98.8, grade: "Excellent" },
      { name: "Dynamic Degree",         dimension: "Motion Quality",       score: 41.2, grade: "Moderate"  },
      { name: "Aesthetic Quality",      dimension: "Visual Quality",       score: 58.9, grade: "Moderate"  },
      { name: "Imaging Quality",        dimension: "Visual Quality",       score: 67.3, grade: "Good"      },
      { name: "Object Class",           dimension: "Semantic Accuracy",    score: 79.4, grade: "Good"      },
      { name: "Multiple Objects",       dimension: "Semantic Accuracy",    score: 46.8, grade: "Moderate"  },
      { name: "Color",                  dimension: "Text Alignment",       score: 82.1, grade: "Good"      },
      { name: "Spatial Relationship",   dimension: "Text Alignment",       score: 52.7, grade: "Moderate"  },
      { name: "Appearance Style",       dimension: "Visual Quality",       score: 20.3, grade: "Moderate"  },
    ],
  },
];

const GRADE_COLORS: Record<string, string> = {
  Excellent:         "#10b981",
  Good:              "#6366f1",
  Moderate:          "#f59e0b",
  "Needs Improvement": "#ef4444",
};

const DIMENSIONS = Object.keys(MODELS[0].dimensions);

// Score note per metric to surface interpretation hints
const METRIC_NOTE: Record<string, string> = {
  "Dynamic Degree":      "High variance across models; measures motion intensity",
  "Appearance Style":    "All current models score 20–30%; known weak dimension in VBench",
  "Multiple Objects":    "Drops sharply for all models; requires counting + spatial reasoning",
  "Spatial Relationship":"Most discriminative semantic metric across model tiers",
};

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
    () => [...MODELS].sort((a, b) => b.overall - a.overall).map((m, i) => ({ ...m, rank: i + 1 })),
    []
  );

  const detail = MODELS.find((m) => m.name === detailModel) ?? MODELS[0];

  return (
    <div className="eval-dashboard">
      {/* Model selector chips */}
      <div className="eval-model-selector">
        {MODELS.map((m) => (
          <button
            key={m.name}
            aria-pressed={selectedModels.has(m.name)}
            className={`eval-chip ${selectedModels.has(m.name) ? "eval-chip--active" : ""}`}
            onClick={() => toggleModel(m.name)}
            style={
              selectedModels.has(m.name)
                ? { borderColor: m.color, background: `${m.color}18` }
                : undefined
            }
          >
            <span className="eval-chip-dot" style={{ background: m.color }} />
            {m.name}
          </button>
        ))}
      </div>

      {/* Radar chart */}
      <div className="eval-card">
        <h3 className="eval-card-title">EvalForge Composite Dimensions</h3>
        <p className="eval-card-subtitle">
          5 composite dimensions derived from raw VBench metrics — each normalised to its
          observed distribution across 50+ benchmarked models (percentile scale, higher = better).
          Note: Temporal Consistency (95–99%) reflects VBench's documented ceiling effect on quality metrics.
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
              domain={[50, 100]}
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
          EvalForge weighted composite: quality metrics 40% · semantic metrics 40% · aesthetic 20%
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            data={rankingData}
            layout="vertical"
            margin={{ left: 90, right: 50, top: 10, bottom: 10 }}
          >
            <XAxis type="number" domain={[60, 80]} tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 12, fill: "var(--color-text-secondary)" }}
              width={85}
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value: number) => [`${value.toFixed(1)}`, "EvalForge Score"]}
            />
            <Bar dataKey="overall" radius={[0, 4, 4, 0]} barSize={20}>
              {rankingData.map((m) => (
                <Cell key={m.name} fill={m.color} fillOpacity={0.8} />
              ))}
              <LabelList
                dataKey="overall"
                position="right"
                formatter={(v: number) => v.toFixed(1)}
                style={{ fill: "var(--color-text-secondary)", fontSize: 11 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detailed metric table */}
      <div className="eval-card">
        <h3 className="eval-card-title">Raw VBench Metrics</h3>
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
                <th>Score (%)</th>
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>
              {detail.metrics.map((m) => (
                <tr key={m.name} title={METRIC_NOTE[m.name] ?? ""}>
                  <td className="eval-metric-name">
                    {m.name}
                    {METRIC_NOTE[m.name] && <span className="eval-metric-hint"> ⓘ</span>}
                  </td>
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
          EvalForge composite: <strong>{detail.overall.toFixed(1)}</strong>
        </div>
      </div>
    </div>
  );
}
