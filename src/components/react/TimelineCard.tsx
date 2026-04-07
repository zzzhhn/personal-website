import { useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ExperienceEntry {
  role: string;
  organization: string;
  location: string;
  type: string;
  highlights: string[];
  techStack: string[];
}

interface TimelineCardProps {
  en: ExperienceEntry;
  zh: ExperienceEntry;
  startDate: string;
  endDate?: string;
  index: number;
  side: "left" | "right";
  expanded: boolean;
  onToggle: () => void;
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

function SkillBubbles({
  en,
  zh,
  index,
}: {
  en: ExperienceEntry;
  zh: ExperienceEntry;
  index: number;
}) {
  return (
    <motion.div
      className="tl-bubbles"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* EN bubbles */}
      <div data-lang="en" className="tl-bubble-group">
        {en.techStack.map((skill, i) => (
          <motion.span
            key={skill}
            data-skill={skill}
            data-exp-index={index}
            className="tl-bubble glass-subtle"
            initial={{ opacity: 0, scale: 0.5, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: 6 }}
            transition={{ delay: i * 0.08, duration: 0.28, ease: "easeOut" }}
          >
            {skill}
          </motion.span>
        ))}
      </div>
      {/* ZH bubbles — data-skill uses EN key for cross-experience matching */}
      <div data-lang="zh" className="tl-bubble-group">
        {zh.techStack.map((skill, i) => (
          <motion.span
            key={skill}
            data-skill={en.techStack[i]}
            data-exp-index={index}
            className="tl-bubble glass-subtle"
            initial={{ opacity: 0, scale: 0.5, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: 6 }}
            transition={{ delay: i * 0.08, duration: 0.28, ease: "easeOut" }}
          >
            {skill}
          </motion.span>
        ))}
      </div>
    </motion.div>
  );
}

export default function TimelineCard({
  en,
  zh,
  startDate,
  endDate,
  index,
  side,
  expanded,
  onToggle,
}: TimelineCardProps) {
  const dotColor = getDotColor(en.type);
  const dateStart = formatDateShort(startDate);
  const dateEnd = endDate ? formatDateShort(endDate) : "";
  const slideX = side === "left" ? -30 : 30;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onToggle();
      }
    },
    [onToggle],
  );

  return (
    <motion.div
      initial={{ opacity: 0, x: slideX }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay: index * 0.12, ease: "easeOut" }}
      className={`tl-row tl-row--${side}`}
    >
      {/* Date column + skill bubbles */}
      <div className="tl-date">
        <span className="tl-date-start">{dateStart}</span>
        {dateEnd && <span className="tl-date-end">{dateEnd}</span>}
        {!dateEnd && <span className="tl-date-end" data-lang="en">Present</span>}
        {!dateEnd && <span className="tl-date-end" data-lang="zh">至今</span>}

        <AnimatePresence>
          {expanded && (
            <SkillBubbles en={en} zh={zh} index={index} />
          )}
        </AnimatePresence>
      </div>

      {/* Dot column */}
      <div className="tl-track">
        <div
          className="tl-dot"
          style={{
            backgroundColor: dotColor.bg,
            boxShadow: `0 0 8px ${dotColor.glow}, 0 0 2px ${dotColor.bg}`,
          }}
        />
      </div>

      {/* Card column */}
      <button
        onClick={onToggle}
        onKeyDown={handleKeyDown}
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
      </button>
    </motion.div>
  );
}
