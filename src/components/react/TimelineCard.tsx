import { useState } from "react";
import { motion } from "framer-motion";

interface TimelineCardProps {
  en: {
    role: string;
    organization: string;
    location: string;
    type: string;
    highlights: string[];
    techStack: string[];
  };
  zh: {
    role: string;
    organization: string;
    location: string;
    type: string;
    highlights: string[];
    techStack: string[];
  };
  startDate: string;
  endDate?: string;
  index: number;
}

function formatDate(dateStr: string, lang: string): string {
  const date = new Date(dateStr);
  if (lang === "zh") {
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}`;
  }
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short" });
}

export default function TimelineCard({
  en,
  zh,
  startDate,
  endDate,
  index,
}: TimelineCardProps) {
  const [expanded, setExpanded] = useState(false);

  const dateRangeEn = `${formatDate(startDate, "en")} — ${endDate ? formatDate(endDate, "en") : "Present"}`;
  const dateRangeZh = `${formatDate(startDate, "zh")} – ${endDate ? formatDate(endDate, "zh") : "至今"}`;

  return (
    <motion.div
      initial={{ opacity: 0, x: -24 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay: index * 0.15, ease: "easeOut" }}
      className="relative pl-8 pb-12 last:pb-0"
    >
      {/* Timeline line */}
      <div
        className="absolute left-0 top-2 bottom-0 w-px"
        style={{
          background: "linear-gradient(to bottom, var(--color-accent-glow), var(--color-border-subtle), transparent)",
        }}
      />
      {/* Timeline dot with glow */}
      <div
        className="absolute left-0 top-2 w-2.5 h-2.5 rounded-full -translate-x-[5px]"
        style={{
          backgroundColor: "var(--color-accent)",
          boxShadow: "0 0 8px var(--color-accent-glow), 0 0 2px var(--color-accent)",
        }}
      />

      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full text-left glass glass-hover p-6 cursor-pointer"
        aria-expanded={expanded}
      >
        {/* EN version */}
        <div data-lang="en">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>{en.role}</h3>
              <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>{en.organization} · {en.location}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="glass-subtle text-xs font-medium px-2.5 py-1" style={{ color: "var(--color-accent)" }}>{en.type}</span>
              <span className="text-sm" style={{ color: "var(--color-text-tertiary)" }}>{dateRangeEn}</span>
            </div>
          </div>
          <ul className="mt-4 space-y-2">
            {en.highlights.map((h, i) => (
              <li key={i} className="text-sm flex items-start gap-2.5" style={{ color: "var(--color-text-secondary)" }}>
                <span className="mt-1.5 w-1 h-1 rounded-full flex-shrink-0" style={{ background: "var(--color-accent)" }} />{h}
              </li>
            ))}
          </ul>
        </div>

        {/* ZH version */}
        <div data-lang="zh">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>{zh.role}</h3>
              <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>{zh.organization} · {zh.location}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="glass-subtle text-xs font-medium px-2.5 py-1" style={{ color: "var(--color-accent)" }}>{zh.type}</span>
              <span className="text-sm" style={{ color: "var(--color-text-tertiary)" }}>{dateRangeZh}</span>
            </div>
          </div>
          <ul className="mt-4 space-y-2">
            {zh.highlights.map((h, i) => (
              <li key={i} className="text-sm flex items-start gap-2.5" style={{ color: "var(--color-text-secondary)" }}>
                <span className="mt-1.5 w-1 h-1 rounded-full flex-shrink-0" style={{ background: "var(--color-accent)" }} />{h}
              </li>
            ))}
          </ul>
        </div>

        {expanded && (
          <div
            className="flex flex-wrap gap-2 mt-4 pt-4"
            style={{ borderTop: "1px solid var(--color-border-glass)" }}
          >
            <div data-lang="en" className="flex flex-wrap gap-2">
              {en.techStack.map((tech) => (
                <span key={tech} className="glass-subtle text-xs px-2.5 py-1" style={{ color: "var(--color-text-secondary)" }}>{tech}</span>
              ))}
            </div>
            <div data-lang="zh" className="flex flex-wrap gap-2">
              {zh.techStack.map((tech) => (
                <span key={tech} className="glass-subtle text-xs px-2.5 py-1" style={{ color: "var(--color-text-secondary)" }}>{tech}</span>
              ))}
            </div>
          </div>
        )}
      </button>
    </motion.div>
  );
}
