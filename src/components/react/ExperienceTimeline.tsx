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

export default function ExperienceTimeline({ experiences }: Props) {
  return (
    <div className="relative">
      {experiences.map((exp, i) => (
        <TimelineCard
          key={`${exp.en.organization}-${exp.en.role}`}
          en={exp.en}
          zh={exp.zh}
          startDate={exp.startDate}
          endDate={exp.endDate}
          index={i}
        />
      ))}
    </div>
  );
}
