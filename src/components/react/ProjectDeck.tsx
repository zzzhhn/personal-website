import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import DeckCard from "./DeckCard";
import type { Project } from "./DeckCard";

interface Props {
  projects: Project[];
}

// Pre-compute natural "scattered on desk" positions
const SCATTER = [
  { x: -80, y: 20, rotate: -3.5 },
  { x: 90, y: 40, rotate: 2.8 },
  { x: -10, y: 10, rotate: -1.2 },
  { x: 60, y: 55, rotate: 3.5 },
  { x: -50, y: 50, rotate: -2 },
];

function getScatterPos(i: number) {
  const base = SCATTER[i % SCATTER.length];
  // Add slight jitter for uniqueness
  const jx = (Math.sin(i * 7.3) * 15) | 0;
  const jy = (Math.cos(i * 5.1) * 10) | 0;
  return { x: base.x + jx, y: base.y + jy, rotate: base.rotate };
}

const PEEK_HEIGHT = 72; // px visible per card in deck
const PEEK_GAP = 54;    // px offset between cards in deck

export default function ProjectDeck({ projects }: Props) {
  const [drawnSet, setDrawnSet] = useState<Set<number>>(new Set());
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const drawOrderRef = useRef<number[]>([]);

  const handleDraw = useCallback((index: number) => {
    setDrawnSet((prev) => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });
    drawOrderRef.current = [...drawOrderRef.current, index];
  }, []);

  const handleReturn = useCallback((index: number) => {
    setDrawnSet((prev) => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
    drawOrderRef.current = drawOrderRef.current.filter((i) => i !== index);
  }, []);

  // Deck height = peek of all undrawn cards
  const undrawCount = projects.length - drawnSet.size;
  const deckHeight = undrawCount > 0
    ? PEEK_HEIGHT + (undrawCount - 1) * PEEK_GAP
    : 0;

  // Compute deck-slot index for each undrawn card
  let deckSlot = 0;
  const deckSlots: Record<number, number> = {};
  for (let i = 0; i < projects.length; i++) {
    if (!drawnSet.has(i)) {
      deckSlots[i] = deckSlot++;
    }
  }

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: "42rem", margin: "0 auto" }}>
      {/* ── Deck envelope ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        style={{
          position: "relative",
          height: deckHeight > 0 ? deckHeight : undefined,
          minHeight: deckHeight > 0 ? deckHeight : 0,
          transition: "min-height 0.4s ease",
        }}
      >
        {projects.map((project, i) => {
          if (drawnSet.has(i)) return null;
          const slot = deckSlots[i] ?? 0;
          return (
            <DeckCard
              key={project.slug}
              project={project}
              index={i}
              mode="deck"
              deckSlot={slot}
              peekGap={PEEK_GAP}
              peekHeight={PEEK_HEIGHT}
              isHovered={hoveredIndex === i}
              scatterPos={getScatterPos(i)}
              drawOrder={0}
              onDraw={() => handleDraw(i)}
              onReturn={() => handleReturn(i)}
              onHover={(h) => setHoveredIndex(h ? i : null)}
            />
          );
        })}
      </motion.div>

      {/* Hint */}
      {undrawCount > 0 && (
        <p
          style={{
            textAlign: "center",
            marginTop: "1rem",
            fontSize: "0.8125rem",
            color: "var(--color-text-tertiary)",
            fontStyle: "italic",
            opacity: 0.7,
          }}
        >
          Click a card to draw it
        </p>
      )}

      {/* ── Scatter desktop area ── */}
      {drawnSet.size > 0 && (
        <div
          style={{
            position: "relative",
            marginTop: "2rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "1.5rem",
          }}
        >
          {drawOrderRef.current
            .filter((i) => drawnSet.has(i))
            .map((i, drawIdx) => (
              <DeckCard
                key={projects[i].slug}
                project={projects[i]}
                index={i}
                mode="drawn"
                deckSlot={0}
                peekGap={PEEK_GAP}
                peekHeight={PEEK_HEIGHT}
                isHovered={hoveredIndex === i}
                scatterPos={getScatterPos(i)}
                drawOrder={drawIdx}
                onDraw={() => handleDraw(i)}
                onReturn={() => handleReturn(i)}
                onHover={(h) => setHoveredIndex(h ? i : null)}
              />
            ))}
        </div>
      )}
    </div>
  );
}
