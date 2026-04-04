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
  return (
    <motion.article
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay: index * 0.12, ease: "easeOut" }}
      className="glass glass-hover p-8 flex flex-col h-full"
      style={{ border: "1px solid var(--color-border-subtle)" }}
    >
      {/* Status badge */}
      <div className="flex items-center justify-between mb-4">
        <span
          className="text-xs font-medium px-2 py-1 rounded-full"
          style={{
            backgroundColor:
              status === "completed"
                ? "oklch(0.45 0.15 145 / 0.2)"
                : "oklch(0.55 0.15 60 / 0.2)",
            color:
              status === "completed"
                ? "oklch(0.7 0.15 145)"
                : "oklch(0.75 0.15 60)",
          }}
        >
          {status === "completed" ? "Completed" : "In Progress"}
        </span>
      </div>

      {/* Title & tagline */}
      <h3
        className="text-xl font-semibold mb-2"
        style={{ color: "var(--color-text-primary)" }}
      >
        <a
          href={`/projects/${slug}`}
          className="hover:underline"
          style={{ color: "inherit", textDecoration: "none" }}
        >
          {title}
        </a>
      </h3>
      <p
        className="text-sm mb-3"
        style={{ color: "var(--color-accent)" }}
      >
        {tagline}
      </p>
      <p
        className="text-sm mb-6 flex-1"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {description}
      </p>

      {/* Tech stack tags */}
      <div className="flex flex-wrap gap-2 mb-6">
        {techStack.map((tech) => (
          <span
            key={tech}
            className="text-xs px-2 py-1 rounded-md"
            style={{
              backgroundColor: "var(--color-surface-secondary)",
              color: "var(--color-text-secondary)",
            }}
          >
            {tech}
          </span>
        ))}
      </div>

      {/* Links */}
      <div className="flex items-center gap-4 mt-auto">
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
            style={{ color: "var(--color-text-secondary)", textDecoration: "none" }}
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
            style={{ color: "var(--color-text-secondary)", textDecoration: "none" }}
          >
            Live Demo
          </a>
        )}
      </div>
    </motion.article>
  );
}
