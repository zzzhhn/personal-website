import { motion } from "framer-motion";

export interface Project {
  title: string;
  slug: string;
  tagline: string;
  description: string;
  status: string;
  techStack: string[];
  highlights: string[];
  links: { live?: string; github?: string };
}

interface DeckCardProps {
  project: Project;
  index: number;
  total: number;
  isDrawn: boolean;
  isHovered: boolean;
  onDraw: () => void;
  onReturn: () => void;
  onHover: (h: boolean) => void;
}

export default function DeckCard({
  project,
  index,
  total,
  isDrawn,
  isHovered,
  onDraw,
  onReturn,
  onHover,
}: DeckCardProps) {
  const isCompleted = project.status === "completed";

  // Fan layout: distribute cards horizontally with slight rotation
  const mid = (total - 1) / 2;
  const offset = index - mid;
  const fanRotate = offset * 4;           // ±4deg per card from center
  const fanX = offset * 180;              // horizontal spread
  const fanY = Math.abs(offset) * 12;     // slight arc (edges dip down)

  // Hover: card lifts slightly
  const hoverLift = isHovered && !isDrawn ? -12 : 0;

  // Drawn: card lifts above the fan
  const drawnY = -260;
  const drawnRotate = 0;

  const handleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a")) return;
    if (isDrawn) {
      onReturn();
    } else {
      onDraw();
    }
  };

  return (
    <motion.div
      animate={
        isDrawn
          ? { x: fanX, y: drawnY, rotate: drawnRotate, scale: 1.05, zIndex: 30 }
          : { x: fanX, y: fanY + hoverLift, rotate: fanRotate, scale: 1, zIndex: isHovered ? 20 : 10 - Math.abs(offset) }
      }
      transition={
        isDrawn
          ? { type: "spring", stiffness: 180, damping: 20, mass: 0.8 }
          : { type: "spring", stiffness: 280, damping: 26 }
      }
      onClick={handleClick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className="card-solid"
      style={{
        position: "absolute",
        width: "18rem",
        cursor: "pointer",
        userSelect: "none",
        padding: "1.25rem",
        transformOrigin: "center bottom",
      }}
    >
      {/* Status badge */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <span
          className="glass-subtle"
          style={{
            fontSize: "0.625rem",
            fontWeight: 500,
            padding: "0.15rem 0.5rem",
            color: isCompleted ? "var(--color-accent-teal)" : "var(--color-accent-warm)",
          }}
        >
          {isCompleted ? "Completed" : "In Progress"}
        </span>
      </div>

      {/* Title */}
      <h3
        style={{
          fontSize: "1rem",
          fontWeight: 600,
          color: "var(--color-text-primary)",
          marginBottom: "0.2rem",
          lineHeight: 1.3,
        }}
      >
        {project.title}
      </h3>

      {/* Tagline */}
      <p
        style={{
          fontSize: "0.75rem",
          fontWeight: 500,
          color: "var(--color-accent)",
          marginBottom: "0.6rem",
        }}
      >
        {project.tagline}
      </p>

      {/* Highlights */}
      {project.highlights.length > 0 && (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", marginBottom: "0.6rem" }}>
          {project.highlights.map((h, i) => (
            <li
              key={i}
              style={{
                fontSize: "0.75rem",
                color: "var(--color-text-secondary)",
                lineHeight: 1.45,
                display: "flex",
                alignItems: "flex-start",
                gap: "0.4rem",
                marginBottom: "0.25rem",
              }}
            >
              <span
                style={{
                  marginTop: "0.4rem",
                  width: "0.2rem",
                  height: "0.2rem",
                  borderRadius: "50%",
                  background: "var(--color-accent)",
                  flexShrink: 0,
                }}
              />
              {h}
            </li>
          ))}
        </ul>
      )}

      {/* Tech stack */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem", marginBottom: "0.6rem" }}>
        {project.techStack.map((t) => (
          <span
            key={t}
            className="glass-subtle"
            style={{ fontSize: "0.625rem", padding: "0.1rem 0.4rem", color: "var(--color-text-secondary)" }}
          >
            {t}
          </span>
        ))}
      </div>

      {/* Links */}
      <div
        style={{
          display: "flex",
          gap: "0.6rem",
          paddingTop: "0.4rem",
          borderTop: "1px solid var(--color-border-glass)",
          fontSize: "0.75rem",
        }}
      >
        <a
          href={`/projects/${project.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--color-accent)", textDecoration: "none", fontWeight: 500 }}
          onClick={(e) => e.stopPropagation()}
        >
          Details &rarr;
        </a>
        {project.links.github && (
          <a
            href={project.links.github}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--color-text-tertiary)", textDecoration: "none" }}
            onClick={(e) => e.stopPropagation()}
          >
            GitHub
          </a>
        )}
        {project.links.live && (
          <a
            href={project.links.live}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--color-text-tertiary)", textDecoration: "none" }}
            onClick={(e) => e.stopPropagation()}
          >
            Live
          </a>
        )}
      </div>
    </motion.div>
  );
}
