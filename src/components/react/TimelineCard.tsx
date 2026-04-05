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

function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getDotColor(type: string): { bg: string; glow: string } {
  const t = type.toLowerCase();
  if (t === "internship" || t === "part-time") {
    return { bg: "var(--color-accent-warm)", glow: "var(--color-accent-warm-glow)" };
  }
  if (t === "research") {
    return { bg: "var(--color-accent-teal)", glow: "var(--color-accent-teal-glow)" };
  }
  return { bg: "var(--color-accent)", glow: "var(--color-accent-glow)" };
}

export default function TimelineCard({
  en,
  zh,
  startDate,
  endDate,
  index,
}: TimelineCardProps) {
  const [expanded, setExpanded] = useState(false);
  const dotColor = getDotColor(en.type);

  const dateStart = formatDateShort(startDate);
  const dateEnd = endDate ? formatDateShort(endDate) : "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay: index * 0.12, ease: "easeOut" }}
      className="tl-row"
    >
      {/* Date column */}
      <div className="tl-date">
        <span className="tl-date-start">{dateStart}</span>
        {dateEnd && <span className="tl-date-end">{dateEnd}</span>}
        {!dateEnd && <span className="tl-date-end" data-lang="en">Present</span>}
        {!dateEnd && <span className="tl-date-end" data-lang="zh">至今</span>}
      </div>

      {/* Dot + line column */}
      <div className="tl-track">
        <div
          className="tl-dot"
          style={{
            backgroundColor: dotColor.bg,
            boxShadow: `0 0 8px ${dotColor.glow}, 0 0 2px ${dotColor.bg}`,
          }}
        />
        <div className="tl-line" />
      </div>

      {/* Card column */}
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="tl-card card-accent-border"
        aria-expanded={expanded}
      >
        {/* EN */}
        <div data-lang="en">
          <div className="tl-card-header">
            <div>
              <h3 className="tl-role">{en.role}</h3>
              <p className="tl-org">{en.organization} · {en.location}</p>
            </div>
            <span className="tl-type-badge" style={{ color: dotColor.bg }}>{en.type}</span>
          </div>
          <ul className="tl-highlights">
            {en.highlights.map((h, i) => (
              <li key={i}><span className="tl-bullet" style={{ background: dotColor.bg }} />{h}</li>
            ))}
          </ul>
        </div>

        {/* ZH */}
        <div data-lang="zh">
          <div className="tl-card-header">
            <div>
              <h3 className="tl-role">{zh.role}</h3>
              <p className="tl-org">{zh.organization} · {zh.location}</p>
            </div>
            <span className="tl-type-badge" style={{ color: dotColor.bg }}>{zh.type}</span>
          </div>
          <ul className="tl-highlights">
            {zh.highlights.map((h, i) => (
              <li key={i}><span className="tl-bullet" style={{ background: dotColor.bg }} />{h}</li>
            ))}
          </ul>
        </div>

        {expanded && (
          <div className="tl-tech-stack">
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
