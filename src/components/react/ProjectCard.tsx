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
  hoveredIndex: number | null;
  totalCards: number;
  onClick: (project: Project, rect: DOMRect, el: HTMLElement) => void;
  onHover: (index: number | null) => void;
}

const MAX_TAGS = 4;

/** Wave: hovered card lifts, neighbors shift proportionally. No rotation — flat parallel layout. */
function getWaveStyle(index: number, hoveredIndex: number | null, total: number) {
  if (hoveredIndex === null) {
    return { y: 0, scale: 1, zIndex: 1 };
  }
  const dist = Math.abs(index - hoveredIndex);
  if (dist === 0) {
    return { y: -14, scale: 1.03, zIndex: 10 };
  }
  const falloff = Math.max(0, 1 - dist * 0.45);
  return {
    y: -6 * falloff,
    scale: 1 - dist * 0.01,
    zIndex: 5 - dist,
  };
}

export default function ProjectCard({
  project,
  index,
  hoveredIndex,
  totalCards,
  onClick,
  onHover,
}: ProjectCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const sheenRef = useRef<HTMLDivElement>(null);

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

  // Sheen via direct DOM — zero React re-renders
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const card = cardRef.current;
    const sheen = sheenRef.current;
    if (!card || !sheen) return;
    const rect = card.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    sheen.style.background =
      `radial-gradient(circle 200px at ${x}% ${y}%, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.04) 40%, transparent 70%)`;
  }, []);

  const handleMouseEnter = useCallback(() => {
    onHover(index);
    if (sheenRef.current) {
      sheenRef.current.style.opacity = "1";
    }
  }, [index, onHover]);

  const handleMouseLeave = useCallback(() => {
    onHover(null);
    if (sheenRef.current) {
      sheenRef.current.style.opacity = "0";
      sheenRef.current.style.background = "none";
    }
  }, [onHover]);

  const statusColor =
    project.status === "completed"
      ? "var(--color-accent-teal)"
      : "var(--color-accent-warm)";

  const visibleTags = project.techStack.slice(0, MAX_TAGS);
  const overflowCount = project.techStack.length - MAX_TAGS;
  const wave = getWaveStyle(index, hoveredIndex, totalCards);

  return (
    <motion.article
      ref={cardRef}
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{
        opacity: { duration: 0.5, delay: index * 0.12 },
        y: { type: "spring", stiffness: 220, damping: 24 },
        scale: { type: "spring", stiffness: 260, damping: 24 },
      }}
      animate={{ y: wave.y, scale: wave.scale }}
      className="glass"
      style={{
        padding: "1.5rem",
        cursor: "pointer",
        borderRadius: "var(--radius-lg)",
        position: "relative",
        zIndex: wave.zIndex,
        overflow: "hidden",
        willChange: "transform",
      }}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
    >
      {/* Specular sheen — updated via DOM ref, not React state */}
      <div
        ref={sheenRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "inherit",
          pointerEvents: "none",
          opacity: 0,
          transition: "opacity 0.25s ease",
          zIndex: 0,
        }}
      />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 1 }}>
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
    </motion.article>
  );
}
