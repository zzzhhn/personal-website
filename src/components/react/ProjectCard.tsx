import { memo, useRef, useCallback } from "react";
import { trackPortfolioEvent } from "../../lib/analytics";
import type { ProjectMaintenance, ProjectMaturity } from "../../lib/projectStatus";
import ProjectStatusBadges from "./ProjectStatusBadges";

export interface Project {
  title: string;
  titleZh: string;
  slug: string;
  tagline: string;
  taglineZh: string;
  description: string;
  descriptionZh: string;
  maturity: ProjectMaturity;
  maintenance: ProjectMaintenance;
  featured?: boolean;
  techStack: string[];
  highlights: string[];
  highlightsZh: string[];
  links: { live?: string; github?: string };
  thumbnail?: string;
  thumbnailLight?: string;
  thumbnailDark?: string;
}

interface ProjectCardProps {
  project: Project;
  index: number;
  onClick: (project: Project, rect: DOMRect, el: HTMLElement) => void;
}

const MAX_TAGS = 4;

function ProjectCard({ project, index, onClick }: ProjectCardProps) {
  const cardRef = useRef<HTMLElement>(null);

  const handleClick = useCallback(() => {
    if (cardRef.current) {
      trackPortfolioEvent("project_card_open", project.slug);
      onClick(project, cardRef.current.getBoundingClientRect(), cardRef.current);
    }
  }, [project, onClick]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick],
  );

  const visibleTags = project.techStack.slice(0, MAX_TAGS);
  const overflowCount = project.techStack.length - MAX_TAGS;
  const thumbnailDark = project.thumbnailDark ?? project.thumbnailLight ?? project.thumbnail;
  const thumbnailLight = project.thumbnailLight ?? project.thumbnailDark ?? project.thumbnail;
  const hasThemePair = Boolean(thumbnailDark && thumbnailLight && thumbnailDark !== thumbnailLight);

  return (
    <article
      ref={cardRef}
      className="project-card"
      data-maturity={project.maturity}
      data-maintenance={project.maintenance}
      style={{ animationDelay: `${index * 0.09}s` } as React.CSSProperties}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
    >
      {/* Content */}
      <div style={{ position: "relative", zIndex: 1 }}>
        {thumbnailDark && (
          <div className="project-thumb" style={{ position: "relative", marginBottom: "1rem" }}>
            <img
              className={hasThemePair ? "project-thumb-image project-thumb-image--dark" : "project-thumb-image"}
              src={thumbnailDark}
                alt={`${project.title} / ${project.titleZh} site snapshot`}
              width={640}
              height={400}
              loading="lazy"
              decoding="async"
            />
            {hasThemePair && (
              <img
                className="project-thumb-image project-thumb-image--light"
                src={thumbnailLight}
                alt=""
                width={640}
                height={400}
                loading="lazy"
                decoding="async"
                aria-hidden="true"
              />
            )}
            {project.links.live && (
              <span className="snapshot-badge" aria-label="Static snapshot of the live site">
                <span className="snapshot-mark" aria-hidden="true" />
                <span className="project-i18n-stable">
                  <span data-lang="en">Site snapshot</span>
                  <span data-lang="zh">站点快照</span>
                </span>
              </span>
            )}
          </div>
        )}
        <ProjectStatusBadges maturity={project.maturity} maintenance={project.maintenance} />

        <h3
          className="project-i18n-stable"
          style={{
            fontSize: "1.05rem",
            fontWeight: 600,
            color: "var(--color-text-primary)",
            marginBottom: "0.25rem",
            lineHeight: 1.3,
          }}
        >
          <span data-lang="en">{project.title}</span>
          <span data-lang="zh">{project.titleZh}</span>
        </h3>

        <p
          className="project-i18n-stable"
          style={{
            fontSize: "0.8rem",
            color: "var(--color-accent)",
            marginBottom: "1rem",
            lineHeight: 1.4,
          }}
        >
          <span data-lang="en">{project.tagline}</span>
          <span data-lang="zh">{project.taglineZh}</span>
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
          {visibleTags.map((tech) => (
            <span
              key={tech}
              className="glass-subtle"
              style={{
                fontSize: "0.65rem",
                padding: "0.15rem 0.5rem",
                color: "var(--color-text-secondary)",
              }}
            >
              {tech}
            </span>
          ))}
          {overflowCount > 0 && (
            <span
              style={{
                fontSize: "0.65rem",
                padding: "0.15rem 0.5rem",
                color: "var(--color-text-tertiary)",
              }}
            >
              +{overflowCount}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

export default memo(ProjectCard);
