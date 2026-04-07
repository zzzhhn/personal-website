import { useRef, useCallback } from "react";
import { motion } from "framer-motion";

interface AwardCardProps {
  label: string;
  imageSlug: string;
  index: number;
  onHover: (slug: string | null, cardCenterY: number) => void;
}

export default function AwardCard({ label, imageSlug, index, onHover }: AwardCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = useCallback(() => {
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      onHover(imageSlug, rect.top + rect.height / 2);
    }
  }, [imageSlug, onHover]);

  const handleMouseLeave = useCallback(() => {
    onHover(null, 0);
  }, [onHover]);

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.4, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
      className="card-outline p-4 flex items-center gap-3"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span className="flex-shrink-0" style={{ color: "var(--color-accent)" }}>
        <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-4.5A3.75 3.75 0 0012.75 10.5h-1.5A3.75 3.75 0 007.5 14.25v4.5m6-6V6.75a3.75 3.75 0 10-7.5 0v1.5" />
        </svg>
      </span>
      <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{label}</span>
    </motion.div>
  );
}
