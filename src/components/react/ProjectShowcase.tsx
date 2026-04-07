import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ProjectCard from "./ProjectCard";
import ProjectModalContent from "./ProjectModalContent";
import type { Project } from "./ProjectCard";

interface Props {
  projects: Project[];
}

const SPRING = { type: "spring" as const, stiffness: 260, damping: 28, mass: 0.8 };

function getModalInitial(rect: DOMRect | null) {
  if (!rect) return { opacity: 0, scale: 0.9, y: 40 };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardCenterX = rect.left + rect.width / 2;
  const cardCenterY = rect.top + rect.height / 2;
  const modalW = Math.min(640, vw - 32);
  return {
    opacity: 0,
    scale: rect.width / modalW,
    x: cardCenterX - vw / 2,
    y: cardCenterY - vh / 2,
  };
}

function usePrefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function ProjectShowcase({ projects }: Props) {
  const [selected, setSelected] = useState<Project | null>(null);
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  const openModal = useCallback((project: Project, rect: DOMRect, el: HTMLElement) => {
    triggerRef.current = el;
    setOriginRect(rect);
    setSelected(project);
  }, []);

  const closeModal = useCallback(() => {
    setSelected(null);
    setOriginRect(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const handleHover = useCallback((index: number | null) => {
    setHoveredIndex(index);
  }, []);

  // Scroll lock
  useEffect(() => {
    if (!selected) return;
    const scrollY = window.scrollY;
    const body = document.body;
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.overflow = "hidden";
    return () => {
      body.style.position = "";
      body.style.top = "";
      body.style.left = "";
      body.style.right = "";
      body.style.overflow = "";
      window.scrollTo(0, scrollY);
    };
  }, [selected]);

  // ESC to close
  useEffect(() => {
    if (!selected) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [selected, closeModal]);

  // Focus trap
  useEffect(() => {
    if (!selected || !modalRef.current) return;
    const modal = modalRef.current;
    const focusable = modal.querySelectorAll<HTMLElement>(
      'a[href], button, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    (first || modal).focus();

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    modal.addEventListener("keydown", handleTab);
    return () => modal.removeEventListener("keydown", handleTab);
  }, [selected]);

  const initial = reducedMotion ? { opacity: 0 } : getModalInitial(originRect);
  const animate = reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, x: 0, y: 0 };
  const exit = reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 30 };
  const transition = reducedMotion ? { duration: 0.15 } : SPRING;

  return (
    <div>
      {/* Horizontal deck — fanned cards with wave hover effect */}
      <div className="project-deck mx-auto" style={{ maxWidth: "56rem" }}>
        {projects.map((project, i) => (
          <ProjectCard
            key={project.slug}
            project={project}
            index={i}
            hoveredIndex={hoveredIndex}
            totalCards={projects.length}
            onClick={openModal}
            onHover={handleHover}
          />
        ))}
      </div>

      {/* Hint */}
      <p
        className="text-center mt-4"
        style={{
          fontSize: "0.75rem",
          color: "var(--color-text-tertiary)",
          fontStyle: "italic",
          opacity: 0.7,
        }}
      >
        Click a card to view details
      </p>

      {/* Modal — sibling to deck, NOT inside any card */}
      <AnimatePresence mode="wait">
        {selected && (
          <>
            <motion.div
              className="modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={closeModal}
              aria-hidden="true"
            />
            <div
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 101,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
              }}
            >
              <motion.div
                ref={modalRef}
                className="glass-elevated project-modal"
                style={{ pointerEvents: "auto" }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title"
                initial={initial}
                animate={animate}
                exit={exit}
                transition={transition}
              >
                <ProjectModalContent project={selected} onClose={closeModal} />
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
