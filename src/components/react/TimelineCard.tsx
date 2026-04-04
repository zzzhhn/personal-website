import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface TimelineCardProps {
  role: string;
  organization: string;
  location: string;
  startDate: string;
  endDate?: string;
  type: string;
  highlights: string[];
  techStack: string[];
  body?: string;
  index: number;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short" });
}

export default function TimelineCard({
  role,
  organization,
  location,
  startDate,
  endDate,
  type,
  highlights,
  techStack,
  index,
}: TimelineCardProps) {
  const [expanded, setExpanded] = useState(false);

  const dateRange = `${formatDate(startDate)} — ${endDate ? formatDate(endDate) : "Present"}`;

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
        style={{ backgroundColor: "var(--color-border-subtle)" }}
      />
      {/* Timeline dot */}
      <div
        className="absolute left-0 top-2 w-2 h-2 rounded-full -translate-x-[3.5px]"
        style={{ backgroundColor: "var(--color-accent)" }}
      />

      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full text-left glass glass-hover p-6 cursor-pointer"
        style={{ border: "1px solid var(--color-border-subtle)" }}
        aria-expanded={expanded}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3
              className="text-lg font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              {role}
            </h3>
            <p
              className="text-sm mt-1"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {organization} · {location}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className="text-xs font-medium px-2 py-1 rounded-full"
              style={{
                backgroundColor: "var(--color-surface-secondary)",
                color: "var(--color-accent)",
              }}
            >
              {type}
            </span>
            <span
              className="text-sm"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {dateRange}
            </span>
          </div>
        </div>

        {/* Highlights always visible */}
        <ul className="mt-4 space-y-1">
          {highlights.map((h, i) => (
            <li
              key={i}
              className="text-sm flex items-start gap-2"
              style={{ color: "var(--color-text-secondary)" }}
            >
              <span style={{ color: "var(--color-accent)" }}>·</span>
              {h}
            </li>
          ))}
        </ul>

        {/* Expandable tech stack */}
        <AnimatePresence>
          {expanded && techStack.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap gap-2 mt-4 pt-4" style={{ borderTop: "1px solid var(--color-border-subtle)" }}>
                {techStack.map((tech) => (
                  <span
                    key={tech}
                    className="text-xs px-2 py-1 rounded-md"
                    style={{
                      backgroundColor: "var(--color-surface-secondary)",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </button>
    </motion.div>
  );
}
