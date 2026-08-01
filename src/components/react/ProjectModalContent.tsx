import type { Project } from "./ProjectCard";
import ProjectStatusBadges from "./ProjectStatusBadges";

interface Props {
  project: Project;
  onClose: () => void;
}

export default function ProjectModalContent({ project, onClose }: Props) {
  return (
    <>
      {/* Header row: close + status */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
        <button
          onClick={onClose}
          aria-label="Close project details / 关闭项目详情"
          className="project-icon-button"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
        <ProjectStatusBadges maturity={project.maturity} maintenance={project.maintenance} />
      </div>

      {/* Title */}
      <h2
        id="modal-title"
        style={{
          fontSize: "1.35rem",
          fontWeight: 600,
          color: "var(--color-text-primary)",
          marginBottom: "0.25rem",
          lineHeight: 1.25,
        }}
      >
        <span data-lang="en">{project.title}</span>
        <span data-lang="zh">{project.titleZh}</span>
      </h2>

      {/* Tagline */}
      <p style={{ fontSize: "0.85rem", color: "var(--color-accent)", marginBottom: "1rem" }}>
        <span data-lang="en">{project.tagline}</span>
        <span data-lang="zh">{project.taglineZh}</span>
      </p>

      {/* Description */}
      <p
        style={{
          fontSize: "0.875rem",
          color: "var(--color-text-secondary)",
          lineHeight: 1.65,
          marginBottom: "1.5rem",
        }}
      >
        <span data-lang="en">{project.description}</span>
        <span data-lang="zh">{project.descriptionZh}</span>
      </p>

      {/* Highlights */}
      {project.highlights.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <h3
            style={{
              fontSize: "0.65rem",
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--color-text-tertiary)",
              marginBottom: "0.75rem",
            }}
          >
            <span data-lang="en">Highlights</span>
            <span data-lang="zh">项目亮点</span>
          </h3>
          <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {project.highlights.map((h, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.5rem",
                  fontSize: "0.8rem",
                  color: "var(--color-text-secondary)",
                  lineHeight: 1.5,
                }}
              >
                <span
                  style={{
                    marginTop: "0.45rem",
                    width: "4px",
                    height: "4px",
                    borderRadius: "50%",
                    background: "var(--color-accent)",
                    flexShrink: 0,
                  }}
                />
                <span data-lang="en">{h}</span>
                <span data-lang="zh">{project.highlightsZh[i] ?? h}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tech stack */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h3
          style={{
            fontSize: "0.65rem",
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--color-text-tertiary)",
            marginBottom: "0.75rem",
          }}
        >
          <span data-lang="en">Tech Stack</span>
          <span data-lang="zh">技术栈</span>
        </h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
          {project.techStack.map((tech) => (
            <span
              key={tech}
              className="glass-subtle"
              style={{
                fontSize: "0.7rem",
                padding: "0.2rem 0.6rem",
                color: "var(--color-text-secondary)",
              }}
            >
              {tech}
            </span>
          ))}
        </div>
      </div>

      {/* Links */}
      <div
        style={{
          borderTop: "1px solid var(--color-border-subtle)",
          paddingTop: "1rem",
          display: "flex",
          flexWrap: "wrap",
          gap: "1rem",
          alignItems: "center",
        }}
      >
        {project.links.live && (
          <a
            href={project.links.live}
            target="_blank"
            rel="noopener noreferrer"
            className="project-action-link project-action-link--primary"
            data-analytics-event="project_live_click"
            data-analytics-target={project.slug}
          >
            <span data-lang="en">Live Demo →</span>
            <span data-lang="zh">在线体验 →</span>
          </a>
        )}
        {project.links.github && (
          <a
            href={project.links.github}
            target="_blank"
            rel="noopener noreferrer"
            className="project-action-link"
          >
            GitHub
          </a>
        )}
        <a
          href={`/projects/${project.slug}`}
          className="project-action-link"
          data-analytics-event="project_details_click"
          data-analytics-target={project.slug}
        >
          <span data-lang="en">Details →</span>
          <span data-lang="zh">完整详情 →</span>
        </a>
      </div>
    </>
  );
}
