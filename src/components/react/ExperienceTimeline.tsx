import { useState, useCallback, useMemo } from "react";
import TimelineCard from "./TimelineCard";
import type { WorkflowData } from "../../lib/i18n";

/* Seeded pseudo-random for stable particle positions across renders */
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

const PARTICLE_COUNT = 22;

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
  workflows: WorkflowData[];
}

export default function ExperienceTimeline({ experiences, workflows }: Props) {
  const [expandedSet, setExpandedSet] = useState<Set<number>>(new Set());

  const toggleExpand = useCallback((index: number) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const particles = useMemo(() => {
    const rng = seededRandom(42);
    return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      id: i,
      top: `${3 + rng() * 92}%`,        // 3%–95% vertical spread
      offsetX: (rng() - 0.5) * 8,       // ±4px — narrower tube
      size: 1.5 + rng() * 2.5,          // 1.5–4px
      duration: 2.5 + rng() * 5,        // 2.5–7.5s — more varied
      delay: rng() * -8,                // wider stagger
      opacity: 0.2 + rng() * 0.35,      // 0.2–0.55
      driftX: (rng() - 0.5) * 6,        // horizontal wander ±3px
      driftY: -8 - rng() * 14,          // upward drift 8–22px
    }));
  }, []);

  return (
    <div className="tl-center">
      {/* Floating particles along the axis */}
      <div className="tl-particles" aria-hidden="true">
        {particles.map((p) => (
          <span
            key={p.id}
            className="tl-particle"
            style={{
              top: p.top,
              left: `calc(50% + ${p.offsetX}px)`,
              width: p.size,
              height: p.size,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
              "--p-dx": `${p.driftX}px`,
              "--p-dy": `${p.driftY}px`,
              "--p-op": p.opacity,
            } as React.CSSProperties}
          />
        ))}
      </div>
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
          workflow={workflows[i]}
        />
      ))}
    </div>
  );
}
