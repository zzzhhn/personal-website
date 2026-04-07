import { useRef, useCallback } from "react";
import { motion } from "framer-motion";

export interface Project {
  title: string;
  slug: string;
  tagline: string;
  description: string;
  status: string;
  featured?: boolean;
  techStack: string[];
  highlights: string[];
  links: { live?: string; github?: string };
}

interface ProjectCardProps {
  project: Project;
  index: number;
  onClick: (project: Project, rect: DOMRect, el: HTMLElement) => void;
}

const MAX_TAGS = 4;

export default function ProjectCard({ project, index, onClick }: ProjectCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

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

  return (
    <motion.article
      ref={cardRef}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay: index * 0.12, ease: [0.22, 1, 0.36, 1] }}
      className="glass glass-hover"
      style={{ padding: "1.5rem", cursor: "pointer", borderRadius: "var(--radius-lg)" }}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
    >
      {/* Status + featured badges */}
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
          {project.status}
        </span>
        {project.featured && (
          <span
            style={{
              fontSize: "0.6rem",
              fontWeight: 500,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--color-accent)",
              opacity: 0.7,
            }}
          >
            Featured
          </span>
        )}
      </div>

      {/* Title */}
      <h3
        style={{
          fontSize: "1.05rem",
          fontWeight: 600,
          color: "var(--color-text-primary)",
          marginBottom: "0.25rem",
          lineHeight: 1.3,
        }}
      >
        {project.title}
      </h3>

      {/* Tagline */}
      <p
        style={{
          fontSize: "0.8rem",
          color: "var(--color-accent)",
          marginBottom: "1rem",
          lineHeight: 1.4,
        }}
      >
        {project.tagline}
      </p>

      {/* Tech tags */}
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
    </motion.article>
  );
}
