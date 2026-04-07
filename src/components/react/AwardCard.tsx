import { useState, useEffect, useRef, useCallback } from "react";

interface AwardCardProps {
  label: string;
  imageSlug: string;
  index: number;
}

export default function AwardCard({ label, imageSlug, index }: AwardCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [imageExists, setImageExists] = useState(true);
  const [previewPos, setPreviewPos] = useState({ top: 300, left: 900 });
  const [visible, setVisible] = useState(false);
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

  const handleMouseEnter = useCallback(() => {
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      const cardCenterY = rect.top + rect.height / 2;
      setPreviewPos({
        top: Math.max(100, Math.min(cardCenterY, window.innerHeight - 320)),
        left: rect.right + 24,
      });
    }
    setIsHovered(true);
    // Delay visibility for CSS transition
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
  }, []);

  const handleMouseLeave = useCallback(() => {
    setVisible(false);
    // Wait for fade-out transition before unmounting
    setTimeout(() => setIsHovered(false), 200);
  }, []);

  const isMobile = typeof window !== "undefined" && window.innerWidth < 1100;

  return (
    <div
      ref={cardRef}
      className="card-outline p-4 flex items-center gap-3"
      style={{ position: "relative" }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Medal icon */}
      <span className="flex-shrink-0" style={{ color: "var(--color-accent)" }}>
        <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-4.5A3.75 3.75 0 0012.75 10.5h-1.5A3.75 3.75 0 007.5 14.25v4.5m6-6V6.75a3.75 3.75 0 10-7.5 0v1.5" />
        </svg>
      </span>
      <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{label}</span>

      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* Preview — no portal, no motion.div wrapper, plain fixed div */}
      {!isMobile && isHovered && imageExists && (
        <div
          onContextMenu={(e) => e.preventDefault()}
          style={{
            position: "fixed",
            left: `${previewPos.left}px`,
            top: `${previewPos.top}px`,
            transform: `translateY(-50%) scale(${visible ? 1 : 0.95})`,
            opacity: visible ? 1 : 0,
            width: "16rem",
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
            transition: "opacity 0.2s ease, transform 0.2s ease",
          }}
        >
          {!blobUrl && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              height: "100%", color: "var(--color-text-tertiary)", fontSize: "0.75rem",
            }}>
              Loading...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
