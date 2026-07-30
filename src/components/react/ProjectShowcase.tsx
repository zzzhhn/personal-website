import { useState, useEffect, useRef, useCallback } from "react";
import type { CSSProperties } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ProjectCard from "./ProjectCard";
import ProjectModalContent from "./ProjectModalContent";
import ScrollStack, { ScrollStackItem } from "./ScrollStack";
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
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
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
      <ScrollStack className="project-deck mx-auto">
        {projects.map((project, i) => {
          const centerOffset = i - (projects.length - 1) / 2;
          const distance = activeIndex === null ? 0 : i - activeIndex;
          const ripple = distance === 0
            ? 0
            : Math.sign(distance) * Math.max(0, 12 - Math.abs(distance) * 3);
          const lift = activeIndex === i ? -28 : activeIndex !== null && Math.abs(distance) === 1 ? -4 : 0;
          const fanRotation = activeIndex === i ? 0 : centerOffset * 3.2;
          const fanY = Math.pow(Math.abs(centerOffset), 1.7) * 5;
          const zIndex = activeIndex === i ? 50 : i + 1;

          return (
            <ScrollStackItem
              key={project.slug}
              itemClassName="project-card-slot"
              data-active={activeIndex === i ? "true" : "false"}
              onPointerEnter={() => setActiveIndex(i)}
              onPointerLeave={() => setActiveIndex(null)}
              onFocusCapture={() => setActiveIndex(i)}
              onBlurCapture={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setActiveIndex(null);
                }
              }}
              style={{
                "--deck-ripple-x": `${ripple}px`,
                "--deck-lift": `${lift}px`,
                "--deck-fan-rotate": `${fanRotation}deg`,
                "--deck-fan-y": `${fanY}px`,
                "--deck-scale": activeIndex === i ? 1.035 : 1,
                "--deck-z": zIndex,
                "--stack-top": `${72 + i * 13}px`,
                "--stack-scale": 0.91 + i * 0.018,
                "--stack-rotate": `${i === projects.length - 1 ? 0 : i % 2 === 0 ? -0.6 : 0.6}deg`,
              } as CSSProperties}
            >
              <ProjectCard
                project={project}
                index={i}
                onClick={openModal}
              />
            </ScrollStackItem>
          );
        })}
      </ScrollStack>

      <p className="project-deck-hint">
        <span className="project-deck-hint-chip">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m9 9 5 12 1.8-5.2L21 14Z" />
            <path d="M7.2 2.2 8 5.1" />
            <path d="m5.1 8-2.9-.8" />
            <path d="M14 4.1 12 6" />
            <path d="m6 12-1.9 2" />
          </svg>
          <span className="project-i18n-stable project-deck-hint-copy">
            <span data-lang="en">Select a card to explore the project</span>
            <span data-lang="zh">点击任意卡片，查看项目详情</span>
          </span>
        </span>
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
