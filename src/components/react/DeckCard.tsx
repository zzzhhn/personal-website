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
  mode: "deck" | "drawn";
  deckSlot: number;
  peekGap: number;
  peekHeight: number;
  isHovered: boolean;
  scatterPos: { x: number; y: number; rotate: number };
  drawOrder: number;
  onDraw: () => void;
  onReturn: () => void;
  onHover: (h: boolean) => void;
}

export default function DeckCard({
  project,
  mode,
  deckSlot,
  peekGap,
  peekHeight,
  isHovered,
  scatterPos,
  onDraw,
  onReturn,
  onHover,
}: DeckCardProps) {
  const isCompleted = project.status === "completed";

  const handleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a")) return;
    if (mode === "drawn") {
      onReturn();
    } else {
      onDraw();
    }
  };

  // ── Deck mode: peek strip ──
  if (mode === "deck") {
    const top = deckSlot * peekGap;
    const hoverLift = isHovered ? -16 : 0;

    return (
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{
          opacity: 1,
          y: hoverLift,
          scale: isHovered ? 1.02 : 1,
        }}
        exit={{ opacity: 0, y: -60, transition: { duration: 0.35 } }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        onClick={handleClick}
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
        className="card-solid"
        style={{
          position: "absolute",
          top,
          left: 0,
          right: 0,
          height: peekHeight,
          overflow: "hidden",
          cursor: "pointer",
          userSelect: "none",
          padding: "0.75rem 1.25rem",
          zIndex: isHovered ? 10 : deckSlot,
          boxShadow: isHovered
            ? "0 8px 24px rgba(0,0,0,0.18)"
            : "0 2px 8px rgba(0,0,0,0.08)",
        }}
      >
        {/* Peek content: title + status badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
          }}
        >
          <h3
            style={{
              fontSize: "0.95rem",
              fontWeight: 600,
              color: "var(--color-text-primary)",
              margin: 0,
              lineHeight: 1.3,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {project.title}
          </h3>

          <span
            className="glass-subtle"
            style={{
              fontSize: "0.6rem",
              fontWeight: 500,
              padding: "0.1rem 0.45rem",
              flexShrink: 0,
              color: isCompleted
                ? "var(--color-accent-teal)"
                : "var(--color-accent-warm)",
            }}
          >
            {isCompleted ? "Completed" : "In Progress"}
          </span>
        </div>

        {/* Tagline peek */}
        <p
          style={{
            fontSize: "0.72rem",
            color: "var(--color-text-tertiary)",
            margin: "0.25rem 0 0",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {project.tagline}
        </p>

        {/* Bottom gradient mask — envelope edge illusion */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "1.2rem",
            background:
              "linear-gradient(to bottom, transparent, var(--color-surface-secondary))",
            pointerEvents: "none",
          }}
        />
      </motion.div>
    );
  }

  // ── Drawn mode: full card, scattered on desktop ──
  return (
    <motion.div
      initial={{ opacity: 0, y: -40, scale: 0.92 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
        rotate: scatterPos.rotate,
      }}
      exit={{ opacity: 0, y: -30, scale: 0.9, transition: { duration: 0.3 } }}
      transition={{ type: "spring", stiffness: 180, damping: 20, mass: 0.8 }}
      onClick={handleClick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className="card-solid"
      style={{
        position: "relative",
        width: "100%",
        maxWidth: "38rem",
        cursor: "pointer",
        userSelect: "none",
        padding: "1.25rem",
        boxShadow: isHovered
          ? "0 12px 32px rgba(0,0,0,0.22)"
          : "0 4px 16px rgba(0,0,0,0.10)",
        transition: "box-shadow 0.25s ease",
      }}
    >
      {/* Status badge */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.5rem",
        }}
      >
        <span
          className="glass-subtle"
          style={{
            fontSize: "0.625rem",
            fontWeight: 500,
            padding: "0.15rem 0.5rem",
            color: isCompleted
              ? "var(--color-accent-teal)"
              : "var(--color-accent-warm)",
          }}
        >
          {isCompleted ? "Completed" : "In Progress"}
        </span>

        {/* Return hint */}
        <span
          style={{
            fontSize: "0.6rem",
            color: "var(--color-text-tertiary)",
            opacity: isHovered ? 0.8 : 0,
            transition: "opacity 0.2s ease",
          }}
        >
          Click to return
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
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            marginBottom: "0.6rem",
          }}
        >
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
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.25rem",
          marginBottom: "0.6rem",
        }}
      >
        {project.techStack.map((t) => (
          <span
            key={t}
            className="glass-subtle"
            style={{
              fontSize: "0.625rem",
              padding: "0.1rem 0.4rem",
              color: "var(--color-text-secondary)",
            }}
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
          href={project.links.live || `/projects/${project.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: "var(--color-accent)",
            textDecoration: "none",
            fontWeight: 500,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          Details &rarr;
        </a>
        {project.links.github && (
          <a
            href={project.links.github}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "var(--color-text-tertiary)",
              textDecoration: "none",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            GitHub
          </a>
        )}
      </div>
    </motion.div>
  );
}
