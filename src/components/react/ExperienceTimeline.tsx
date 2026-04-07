import { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import TimelineCard from "./TimelineCard";

interface ExperienceEntry {
  role: string;
  organization: string;
  location: string;
  type: string;
  highlights: string[];
  techStack: string[];
}

interface BilingualExperience {
  en: ExperienceEntry;
  zh: ExperienceEntry;
  startDate: string;
  endDate?: string;
}

interface Props {
  experiences: BilingualExperience[];
}

interface CurveLine {
  key: string;
  d: string;
}

export default function ExperienceTimeline({ experiences }: Props) {
  const [expandedSet, setExpandedSet] = useState<Set<number>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<CurveLine[]>([]);

  const toggleExpand = useCallback((index: number) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  // Calculate connecting lines between matching skill bubbles
  const calculateLines = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const centerX = container.offsetWidth / 2;
    const bubbleEls = container.querySelectorAll<HTMLElement>("[data-skill]");

    // Group visible bubbles by skill name
    const skillMap = new Map<string, { x: number; y: number; idx: string }[]>();

    bubbleEls.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0) return; // hidden (wrong language)
      const skill = el.getAttribute("data-skill") ?? "";
      const idx = el.getAttribute("data-exp-index") ?? "";
      const x = rect.left + rect.width / 2 - containerRect.left;
      const y = rect.top + rect.height / 2 - containerRect.top;
      if (!skillMap.has(skill)) skillMap.set(skill, []);
      skillMap.get(skill)!.push({ x, y, idx });
    });

    // Generate cubic Bézier curves between all pairs sharing a skill
    const newLines: CurveLine[] = [];
    skillMap.forEach((positions, skill) => {
      if (positions.length < 2) return;
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const a = positions[i];
          const b = positions[j];
          // S-curve through the timeline center axis
          const d = `M ${a.x} ${a.y} C ${centerX} ${a.y}, ${centerX} ${b.y}, ${b.x} ${b.y}`;
          newLines.push({
            key: `${skill}-${a.idx}-${b.idx}`,
            d,
          });
        }
      }
    });

    setLines(newLines);
  }, []);

  // Recalculate after bubbles animate in, or when expansion changes
  useEffect(() => {
    if (expandedSet.size === 0) {
      setLines([]);
      return;
    }
    const timer = setTimeout(calculateLines, 380);
    return () => clearTimeout(timer);
  }, [expandedSet, calculateLines]);

  // Also recalculate on resize
  useEffect(() => {
    if (expandedSet.size === 0) return;
    const onResize = () => calculateLines();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [expandedSet, calculateLines]);

  return (
    <div ref={containerRef} className="tl-center">
      {experiences.map((exp, i) => (
        <TimelineCard
          key={`${exp.en.organization}-${exp.en.role}`}
          en={exp.en}
          zh={exp.zh}
          startDate={exp.startDate}
          endDate={exp.endDate}
          index={i}
          side={i % 2 === 0 ? "left" : "right"}
          expanded={expandedSet.has(i)}
          onToggle={() => toggleExpand(i)}
        />
      ))}

      {/* SVG overlay for connecting curves */}
      <svg
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          overflow: "visible",
        }}
      >
        <AnimatePresence>
          {lines.map((line) => (
            <motion.path
              key={line.key}
              d={line.d}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="1.5"
              strokeOpacity="0.25"
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              exit={{ pathLength: 0, opacity: 0 }}
              transition={{ duration: 0.6, ease: "easeInOut" }}
            />
          ))}
        </AnimatePresence>
      </svg>
    </div>
  );
}
