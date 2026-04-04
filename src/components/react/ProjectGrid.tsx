import ProjectCard from "./ProjectCard";

interface Project {
  title: string;
  slug: string;
  tagline: string;
  description: string;
  status: string;
  techStack: string[];
  links: {
    live?: string;
    github?: string;
  };
}

interface Props {
  projects: Project[];
}

export default function ProjectGrid({ projects }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {projects.map((project, i) => (
        <ProjectCard key={project.slug} {...project} index={i} />
      ))}
    </div>
  );
}
