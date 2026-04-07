import { useRef, useCallback, useState } from "react";
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

/** Compute wave offset: cards near the hovered card lift/tilt proportionally */
function getWaveStyle(index: number, hoveredIndex: number | null, total: number) {
  if (hoveredIndex === null) {
    // Default fanned layout — slight rotation based on position
    const center = (total - 1) / 2;
    const offset = index - center;
    return {
      rotate: offset * 2.5,
      y: Math.abs(offset) * 6,
      scale: 1,
      zIndex: total - Math.abs(offset),
    };
  }

  const dist = Math.abs(index - hoveredIndex);

  if (dist === 0) {
    // Hovered card: lift up, no rotation, scale up
    return { rotate: 0, y: -16, scale: 1.04, zIndex: 20 };
  }

  // Adjacent cards: wave ripple — slight lift and tilt away
  const direction = index < hoveredIndex ? -1 : 1;
  const falloff = Math.max(0, 1 - dist * 0.5); // decays with distance
  return {
    rotate: direction * 3 * falloff,
    y: -6 * falloff + Math.abs(index - (total - 1) / 2) * 3,
    scale: 1 - dist * 0.015,
    zIndex: 10 - dist,
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
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });

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

  // Mouse-tracking specular highlight
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setMousePos({
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    });
  }, []);

  const handleMouseEnter = useCallback(() => {
    onHover(index);
  }, [index, onHover]);

  const handleMouseLeave = useCallback(() => {
    onHover(null);
    setMousePos({ x: 0.5, y: 0.5 });
  }, [onHover]);

  const statusColor =
    project.status === "completed"
      ? "var(--color-accent-teal)"
      : "var(--color-accent-warm)";

  const visibleTags = project.techStack.slice(0, MAX_TAGS);
  const overflowCount = project.techStack.length - MAX_TAGS;

  const wave = getWaveStyle(index, hoveredIndex, totalCards);
  const isHovered = hoveredIndex === index;

  // Dynamic specular: radial gradient that follows cursor
  const sheenGradient = isHovered
    ? `radial-gradient(circle 180px at ${mousePos.x * 100}% ${mousePos.y * 100}%, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 40%, transparent 70%)`
    : "none";

  return (
    <motion.article
      ref={cardRef}
      initial={{ opacity: 0, y: 40, rotate: 0 }}
      whileInView={{ opacity: 1, y: wave.y, rotate: wave.rotate }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{
        opacity: { duration: 0.5, delay: index * 0.12 },
        y: { type: "spring", stiffness: 200, damping: 22 },
        rotate: { type: "spring", stiffness: 200, damping: 22 },
        scale: { type: "spring", stiffness: 260, damping: 24 },
      }}
      animate={{
        y: wave.y,
        rotate: wave.rotate,
        scale: wave.scale,
      }}
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
      {/* Dynamic specular sheen overlay */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "inherit",
          background: sheenGradient,
          pointerEvents: "none",
          transition: "background 0.15s ease",
          zIndex: 0,
        }}
      />

      {/* Content — above sheen */}
      <div style={{ position: "relative", zIndex: 1 }}>
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
      </div>
    </motion.article>
  );
}
