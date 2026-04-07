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
      const previewW = 256; // 16rem
      const previewH = 341; // 16rem * 4/3
      // Place right of card; if no room, place left of card
      let left = rect.right + 16;
      if (left + previewW > window.innerWidth - 16) {
        left = rect.left - previewW - 16;
      }
      // Clamp vertically
      const top = Math.max(80, Math.min(cardCenterY, window.innerHeight - previewH / 2 - 16));
      setPreviewPos({ top, left: Math.max(16, left) });
    }
    setIsHovered(true);
  }, []);

  const isMobile = typeof window !== "undefined" && window.innerWidth < 900;

  return (
    <div
      ref={cardRef}
      className="card-outline p-4 flex items-center gap-3"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setIsHovered(false)}
    >
      <span className="flex-shrink-0" style={{ color: "var(--color-accent)" }}>
        <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-4.5A3.75 3.75 0 0012.75 10.5h-1.5A3.75 3.75 0 007.5 14.25v4.5m6-6V6.75a3.75 3.75 0 10-7.5 0v1.5" />
        </svg>
      </span>
      <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{label}</span>
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {!isMobile && isHovered && imageExists && (
        <div
          onContextMenu={(e) => e.preventDefault()}
          style={{
            position: "fixed",
            left: `${previewPos.left}px`,
            top: `${previewPos.top}px`,
            transform: "translateY(-50%)",
            width: "256px",
            height: "341px",
            borderRadius: "12px",
            overflow: "hidden",
            zIndex: 9999,
            pointerEvents: "none",
            border: "1px solid var(--color-border-subtle)",
            boxShadow: "0 12px 48px rgba(0,0,0,0.3)",
            userSelect: "none",
            WebkitUserSelect: "none",
            background: blobUrl
              ? `url(${blobUrl}) center / contain no-repeat var(--color-surface-secondary)`
              : "var(--color-surface-secondary)",
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
