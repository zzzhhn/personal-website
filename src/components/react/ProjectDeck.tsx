import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import DeckCard from "./DeckCard";
import type { Project } from "./DeckCard";

interface Props {
  projects: Project[];
}

export default function ProjectDeck({ projects }: Props) {
  const [drawnIndices, setDrawnIndices] = useState<Set<number>>(new Set());
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const handleDraw = useCallback((index: number) => {
    setDrawnIndices((prev) => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  }, []);

  const handleReturn = useCallback((index: number) => {
    setDrawnIndices((prev) => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  }, []);

  const handleHover = useCallback((index: number, h: boolean) => {
    setHoveredIndex(h ? index : null);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      style={{
        position: "relative",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "32rem",
        perspective: "1200px",
      }}
    >
      {projects.map((project, i) => (
        <DeckCard
          key={project.slug}
          project={project}
          index={i}
          total={projects.length}
          isDrawn={drawnIndices.has(i)}
          isHovered={hoveredIndex === i}
          onDraw={() => handleDraw(i)}
          onReturn={() => handleReturn(i)}
          onHover={(h) => handleHover(i, h)}
        />
      ))}

      {/* Hint */}
      <p
        style={{
          position: "absolute",
          bottom: 0,
          textAlign: "center",
          fontSize: "0.8125rem",
          color: "var(--color-text-tertiary)",
          fontStyle: "italic",
        }}
      >
        Click a card to draw it out
      </p>
    </motion.div>
  );
}
