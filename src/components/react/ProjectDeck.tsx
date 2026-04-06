import { useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import DeckCard from "./DeckCard";
import type { Project } from "./DeckCard";

interface Props {
  projects: Project[];
}

function computeDrawnPositions(count: number): { x: number; y: number; rotate: number }[] {
  // Scatter drawn cards in a pleasing arc arrangement
  const positions: { x: number; y: number; rotate: number }[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    positions.push({
      x: col * 260 - 260,      // spread horizontally
      y: row * 380 + 340,      // below the deck
      rotate: (Math.random() - 0.5) * 4,
    });
  }
  return positions;
}

export default function ProjectDeck({ projects }: Props) {
  const [drawnIndices, setDrawnIndices] = useState<Set<number>>(new Set());
  const [deckHovered, setDeckHovered] = useState(false);

  const drawnPositions = useMemo(
    () => computeDrawnPositions(projects.length),
    [projects.length]
  );

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

  const handleDeckHover = useCallback((h: boolean) => {
    setDeckHovered(h);
  }, []);

  // Cards still in the deck (order: topmost first = lowest index)
  const inDeckIndices = projects
    .map((_, i) => i)
    .filter((i) => !drawnIndices.has(i));

  const allDrawn = drawnIndices.size === projects.length;

  return (
    <div style={{ position: "relative", width: "100%" }}>
      {/* Deck area */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "center",
          minHeight: "20rem",
        }}
      >
        {/* Phantom shadow cards for deck thickness illusion */}
        {!allDrawn && (
          <>
            <div
              className="card-solid"
              style={{
                position: "absolute",
                width: "100%",
                maxWidth: "22rem",
                height: "16rem",
                transform: "translateY(-12px) rotate(-2deg)",
                opacity: 0.3,
                pointerEvents: "none",
              }}
            />
            <div
              className="card-solid"
              style={{
                position: "absolute",
                width: "100%",
                maxWidth: "22rem",
                height: "16rem",
                transform: "translateY(-8px) rotate(1deg)",
                opacity: 0.5,
                pointerEvents: "none",
              }}
            />
          </>
        )}

        {/* Actual cards */}
        {projects.map((project, i) => {
          const isDrawn = drawnIndices.has(i);
          const deckIndex = isDrawn ? 0 : inDeckIndices.indexOf(i);
          const isTopCard = !isDrawn && deckIndex === 0;

          return (
            <DeckCard
              key={project.slug}
              project={project}
              index={i}
              deckIndex={deckIndex}
              isDrawn={isDrawn}
              isTopCard={isTopCard}
              deckHovered={deckHovered}
              drawnPos={drawnPositions[i]}
              onDraw={() => handleDraw(i)}
              onReturn={() => handleReturn(i)}
              onHoverDeck={handleDeckHover}
            />
          );
        })}
      </motion.div>

      {/* Hint text */}
      {!allDrawn && (
        <p
          style={{
            textAlign: "center",
            marginTop: "1.5rem",
            fontSize: "0.8125rem",
            color: "var(--color-text-tertiary)",
            fontStyle: "italic",
          }}
        >
          Click to draw a card
        </p>
      )}

      {/* Spacer for drawn cards below */}
      {drawnIndices.size > 0 && (
        <div style={{ height: `${Math.ceil(drawnIndices.size / 3) * 380 + 80}px` }} />
      )}
    </div>
  );
}
