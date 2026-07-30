import ProjectShowcase from "./ProjectShowcase";
import type { Project } from "./ProjectCard";

interface Props {
  projects: Project[];
}

export default function ProjectGrid({ projects }: Props) {
  return <ProjectShowcase projects={projects} />;
}
