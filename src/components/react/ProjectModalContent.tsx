import type { Project } from "./ProjectCard";

interface Props {
  project: Project;
  onClose: () => void;
}

export default function ProjectModalContent({ project, onClose }: Props) {
  const statusColor =
    project.status === "completed"
      ? "var(--color-accent-teal)"
      : "var(--color-accent-warm)";

  return (
    <>
      {/* Header row: close + status */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
        <button
          onClick={onClose}
          aria-label="Close project details"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--color-text-tertiary)",
            fontSize: "1.25rem",
            lineHeight: 1,
            padding: "0.25rem",
            transition: "color 0.15s ease",
          }}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.color = "var(--color-text-primary)"; }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.color = "var(--color-text-tertiary)"; }}
        >
          ✕
        </button>
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
          {project.status}
        </span>
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
        {project.title}
      </h2>

      {/* Tagline */}
      <p style={{ fontSize: "0.85rem", color: "var(--color-accent)", marginBottom: "1rem" }}>
        {project.tagline}
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
        {project.description}
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
            Highlights
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
                {h}
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
          Tech Stack
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
            style={{
              fontSize: "0.8rem",
              fontWeight: 500,
              color: "var(--color-accent)",
              textDecoration: "none",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            Live Demo →
          </a>
        )}
        {project.links.github && (
          <a
            href={project.links.github}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: "0.8rem",
              color: "var(--color-text-tertiary)",
              textDecoration: "none",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            GitHub
          </a>
        )}
        <a
          href={`/projects/${project.slug}`}
          style={{
            fontSize: "0.8rem",
            color: "var(--color-text-tertiary)",
            textDecoration: "none",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          Details →
        </a>
      </div>
    </>
  );
}
