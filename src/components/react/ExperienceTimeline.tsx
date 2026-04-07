import { useState, useCallback } from "react";
import TimelineCard from "./TimelineCard";
import type { WorkflowData } from "../../lib/i18n";

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

  return (
    <div className="tl-center">
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
