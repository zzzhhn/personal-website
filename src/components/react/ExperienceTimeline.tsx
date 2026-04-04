import TimelineCard from "./TimelineCard";

interface Experience {
  role: string;
  organization: string;
  location: string;
  startDate: string;
  endDate?: string;
  type: string;
  highlights: string[];
  techStack: string[];
}

interface Props {
  experiences: Experience[];
}

export default function ExperienceTimeline({ experiences }: Props) {
  return (
    <div className="relative">
      {experiences.map((exp, i) => (
        <TimelineCard
          key={`${exp.organization}-${exp.role}`}
          {...exp}
          index={i}
        />
      ))}
    </div>
  );
}
