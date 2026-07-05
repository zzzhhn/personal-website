import { useRef, useCallback } from "react";

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
  thumbnail?: string;
}

interface ProjectCardProps {
  project: Project;
  index: number;
  onClick: (project: Project, rect: DOMRect, el: HTMLElement) => void;
}

const MAX_TAGS = 4;

export default function ProjectCard({ project, index, onClick }: ProjectCardProps) {
  const cardRef = useRef<HTMLElement>(null);
  const sheenRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const posRef = useRef({ x: 50, y: 50 });

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

  // Sheen follows the cursor via direct DOM writes — no React re-render.
  // Paint is rAF-throttled so bursts of mousemove events coalesce into at most
  // one gradient repaint per frame (the raw event rate can far exceed 60/s and
  // each repaint covers the whole card — expensive on retina).
  const paintSheen = useCallback(() => {
    rafRef.current = 0;
    const sheen = sheenRef.current;
    if (!sheen) return;
    const { x, y } = posRef.current;
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    if (isLight) {
      const angle = Math.round((x + y) * 1.2) % 360;
      sheen.style.background =
        `radial-gradient(circle 200px at ${x}% ${y}%, oklch(0.75 0.08 ${angle} / 0.18) 0%, oklch(0.80 0.05 ${angle + 60} / 0.08) 40%, transparent 70%)`;
    } else {
      sheen.style.background =
        `radial-gradient(circle 200px at ${x}% ${y}%, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.04) 40%, transparent 70%)`;
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    posRef.current = {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    };
    if (!rafRef.current) rafRef.current = requestAnimationFrame(paintSheen);
  }, [paintSheen]);

  const handleMouseEnter = useCallback(() => {
    if (sheenRef.current) sheenRef.current.style.opacity = "1";
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (sheenRef.current) {
      sheenRef.current.style.opacity = "0";
      sheenRef.current.style.background = "none";
    }
  }, []);

  const statusColor =
    project.status === "completed"
      ? "var(--color-accent-teal)"
      : "var(--color-accent-warm)";

  const visibleTags = project.techStack.slice(0, MAX_TAGS);
  const overflowCount = project.techStack.length - MAX_TAGS;

  return (
    <article
      ref={cardRef}
      className="glass project-card"
      style={{ animationDelay: `${index * 0.09}s` } as React.CSSProperties}
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
      <div ref={sheenRef} aria-hidden="true" className="project-card-sheen" />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 1 }}>
        {project.thumbnail && (
          <div className="project-thumb" style={{ position: "relative", marginBottom: "1rem" }}>
            <img
              src={project.thumbnail}
              alt={`${project.title} — live screenshot`}
              width={640}
              height={400}
              loading="lazy"
              decoding="async"
            />
            {project.links.live && (
              <span className="live-badge" aria-label="Live site">
                <span className="live-dot" aria-hidden="true" />
                Live
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
    </article>
  );
}
