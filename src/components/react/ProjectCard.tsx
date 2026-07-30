import { useRef, useCallback } from "react";

export interface Project {
  title: string;
  titleZh: string;
  slug: string;
  tagline: string;
  taglineZh: string;
  description: string;
  descriptionZh: string;
  status: string;
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

export default function ProjectCard({ project, index, onClick }: ProjectCardProps) {
  const cardRef = useRef<HTMLElement>(null);

  const handleClick = useCallback(() => {
    if (cardRef.current) {
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

  const statusColor =
    project.status === "completed"
      ? "var(--color-accent-teal)"
      : "var(--color-accent-warm)";

  const visibleTags = project.techStack.slice(0, MAX_TAGS);
  const overflowCount = project.techStack.length - MAX_TAGS;
  const thumbnailDark = project.thumbnailDark ?? project.thumbnailLight ?? project.thumbnail;
  const thumbnailLight = project.thumbnailLight ?? project.thumbnailDark ?? project.thumbnail;
  const hasThemePair = Boolean(thumbnailDark && thumbnailLight && thumbnailDark !== thumbnailLight);

  return (
    <article
      ref={cardRef}
      className="project-card"
      data-status={project.status}
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
                alt={`${project.title} / ${project.titleZh} live screenshot`}
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
              <span className="live-badge" aria-label="Live site">
                <span className="live-dot" aria-hidden="true" />
                <span data-lang="en">Live</span>
                <span data-lang="zh">在线</span>
              </span>
            )}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <span
            className="glass-subtle"
            style={{
              fontSize: "0.625rem",
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              padding: "0.2rem 0.6rem",
              color: statusColor,
            }}
          >
            <span data-lang="en">{project.status === "completed" ? "Completed" : "In progress"}</span>
            <span data-lang="zh">{project.status === "completed" ? "已完成" : "持续迭代"}</span>
          </span>
        </div>

        <h3
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
