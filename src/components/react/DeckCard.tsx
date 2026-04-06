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
  deckIndex: number;
  isDrawn: boolean;
  isTopCard: boolean;
  deckHovered: boolean;
  drawnPos: { x: number; y: number; rotate: number };
  onDraw: () => void;
  onReturn: () => void;
  onHoverDeck: (h: boolean) => void;
}

export default function DeckCard({
  project,
  index,
  deckIndex,
  isDrawn,
  isTopCard,
  deckHovered,
  drawnPos,
  onDraw,
  onReturn,
  onHoverDeck,
}: DeckCardProps) {
  const isCompleted = project.status === "completed";

  // In-deck position: stacked with slight offset
  const deckY = -deckIndex * 4;
  const deckRotate = (deckIndex - 1) * 1.2;
  const deckScale = 1 - deckIndex * 0.015;

  // Wavy hover offset for in-deck cards
  const wavyX = deckHovered && !isDrawn
    ? Math.sin(Date.now() / 600 + index * 1.2) * 3
    : 0;
  const liftY = deckHovered && isTopCard && !isDrawn ? -10 : 0;

  const handleClick = (e: React.MouseEvent) => {
    // Don't trigger draw/return if clicking a link
    if ((e.target as HTMLElement).closest("a")) return;
    if (isDrawn) {
      onReturn();
    } else {
      onDraw();
    }
  };

  return (
    <motion.div
      layout
      animate={
        isDrawn
          ? {
              x: drawnPos.x,
              y: drawnPos.y,
              rotate: drawnPos.rotate,
              scale: 1,
              zIndex: 20,
            }
          : {
              x: wavyX,
              y: deckY + liftY,
              rotate: deckRotate,
              scale: deckScale,
              zIndex: 10 - deckIndex,
            }
      }
      transition={
        isDrawn
          ? { type: "spring", stiffness: 200, damping: 22, mass: 0.8 }
          : { type: "spring", stiffness: 300, damping: 28 }
      }
      onClick={handleClick}
      onMouseEnter={() => !isDrawn && onHoverDeck(true)}
      onMouseLeave={() => !isDrawn && onHoverDeck(false)}
      className="card-solid"
      style={{
        position: isDrawn ? "absolute" : "absolute",
        width: "100%",
        maxWidth: "22rem",
        cursor: "pointer",
        perspective: "1000px",
        userSelect: "none",
        padding: "1.5rem",
      }}
    >
      {/* Status badge */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
        <span
          className="glass-subtle"
          style={{
            fontSize: "0.6875rem",
            fontWeight: 500,
            padding: "0.2rem 0.6rem",
            color: isCompleted ? "var(--color-accent-teal)" : "var(--color-accent-warm)",
          }}
        >
          {isCompleted ? "Completed" : "In Progress"}
        </span>
      </div>

      {/* Title */}
      <h3
        style={{
          fontSize: "1.125rem",
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
          fontSize: "0.8125rem",
          fontWeight: 500,
          color: "var(--color-accent)",
          marginBottom: "0.75rem",
        }}
      >
        {project.tagline}
      </p>

      {/* Highlights (bullet points) */}
      {project.highlights.length > 0 && (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", marginBottom: "0.75rem" }}>
          {project.highlights.map((h, i) => (
            <li
              key={i}
              style={{
                fontSize: "0.8125rem",
                color: "var(--color-text-secondary)",
                lineHeight: 1.5,
                display: "flex",
                alignItems: "flex-start",
                gap: "0.5rem",
                marginBottom: "0.35rem",
              }}
            >
              <span
                style={{
                  marginTop: "0.45rem",
                  width: "0.25rem",
                  height: "0.25rem",
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
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.75rem" }}>
        {project.techStack.map((t) => (
          <span
            key={t}
            className="glass-subtle"
            style={{ fontSize: "0.6875rem", padding: "0.15rem 0.5rem", color: "var(--color-text-secondary)" }}
          >
            {t}
          </span>
        ))}
      </div>

      {/* Links */}
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          paddingTop: "0.5rem",
          borderTop: "1px solid var(--color-border-glass)",
          fontSize: "0.8125rem",
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
            Live Demo
          </a>
        )}
      </div>
    </motion.div>
  );
}
