import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

interface AwardCardProps {
  label: string;
  imageSlug: string;
  index: number;
}

export default function AwardCard({ label, imageSlug, index }: AwardCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [imageExists, setImageExists] = useState(true);
  const [cardCenterY, setCardCenterY] = useState(300);
  const cardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blobUrlRef = useRef<string | null>(null);

  // Load image into canvas → blob URL (prevents right-click save)
  useEffect(() => {
    const img = new Image();
    img.src = `/images/awards/${imageSlug}.jpg`;

    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      try {
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            blobUrlRef.current = url;
            setBlobUrl(url);
          }
        }, "image/jpeg", 0.92);
      } catch {
        // Canvas tainted by CORS — fall back to direct img src
        setBlobUrl(`/images/awards/${imageSlug}.jpg`);
      }
    };

    img.onerror = () => setImageExists(false);

    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [imageSlug]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // Compute card position synchronously BEFORE setting hover state
  // so React batches both updates into one render with correct coords
  const handleMouseEnter = useCallback(() => {
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      setCardCenterY(rect.top + rect.height / 2);
    }
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  const preview = !isMobile && (
    <AnimatePresence>
      {isHovered && imageExists && (
        <motion.div
          key={`award-preview-${imageSlug}`}
          initial={{ opacity: 0, x: 20, scale: 0.92 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 20, scale: 0.92 }}
          transition={{ duration: 0.3, ease: [0.175, 0.885, 0.32, 1.275] }}
          onContextMenu={handleContextMenu}
          style={{
            position: "fixed",
            right: "2rem",
            top: `clamp(6rem, ${cardCenterY}px, calc(100vh - 20rem))`,
            transform: "translateY(-50%)",
            width: "18rem",
            aspectRatio: "3 / 4",
            borderRadius: "0.75rem",
            overflow: "hidden",
            zIndex: 9999,
            pointerEvents: "none",
            background: blobUrl
              ? `url(${blobUrl}) center / contain no-repeat var(--color-surface-secondary)`
              : "var(--color-surface-secondary)",
            border: "1px solid var(--color-border-subtle)",
            boxShadow: "0 12px 48px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.05)",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
        >
          {!blobUrl && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                gap: "0.5rem",
                color: "var(--color-text-tertiary)",
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <span style={{ fontSize: "0.6875rem" }}>Loading...</span>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );

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
      <canvas ref={canvasRef} style={{ display: "none" }} />
      {typeof document !== "undefined" && createPortal(preview, document.body)}
    </motion.div>
  );
}
