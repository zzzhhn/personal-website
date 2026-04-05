import { motion } from "framer-motion";

interface ProjectCardProps {
  title: string;
  slug: string;
  tagline: string;
  description: string;
  status: string;
  techStack: string[];
  links: {
    live?: string;
    github?: string;
  };
  index: number;
}

export default function ProjectCard({
  title,
  slug,
  tagline,
  description,
  status,
  techStack,
  links,
  index,
}: ProjectCardProps) {
  const isCompleted = status === "completed";

  return (
    <motion.article
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay: index * 0.12, ease: [0.22, 1, 0.36, 1] }}
      className="card-solid p-8 flex flex-col h-full"
    >
      {/* Status badge */}
      <div className="flex items-center justify-between mb-5">
        <span
          className="glass-subtle text-xs font-medium px-2.5 py-1"
          style={{
            color: isCompleted
              ? "var(--color-accent-teal)"
              : "var(--color-accent-warm)",
          }}
        >
          {isCompleted ? "Completed" : "In Progress"}
        </span>
      </div>

      {/* Title & tagline */}
      <h3
        className="text-xl font-semibold mb-2"
        style={{ color: "var(--color-text-primary)" }}
      >
        <a
          href={`/projects/${slug}`}
          style={{ color: "inherit", textDecoration: "none" }}
        >
          {title}
        </a>
      </h3>
      <p
        className="text-sm mb-3 font-medium"
        style={{ color: "var(--color-accent)" }}
      >
        {tagline}
      </p>
      <p
        className="text-sm mb-6 flex-1 leading-relaxed"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {description}
      </p>

      {/* Tech stack tags */}
      <div className="flex flex-wrap gap-2 mb-6">
        {techStack.map((tech) => (
          <span
            key={tech}
            className="glass-subtle text-xs px-2.5 py-1"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {tech}
          </span>
        ))}
      </div>

      {/* Links */}
      <div className="flex items-center gap-4 mt-auto pt-4" style={{ borderTop: "1px solid var(--color-border-glass)" }}>
        <a
          href={`/projects/${slug}`}
          className="text-sm font-medium transition-colors"
          style={{ color: "var(--color-accent)", textDecoration: "none" }}
        >
          Read more &rarr;
        </a>
        {links.github && (
          <a
            href={links.github}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm transition-colors"
            style={{ color: "var(--color-text-tertiary)", textDecoration: "none" }}
          >
            GitHub
          </a>
        )}
        {links.live && (
          <a
            href={links.live}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm transition-colors"
            style={{ color: "var(--color-text-tertiary)", textDecoration: "none" }}
          >
            Live Demo
          </a>
        )}
      </div>
    </motion.article>
  );
}
