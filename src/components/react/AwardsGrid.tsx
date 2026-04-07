import { useState, useEffect, useRef, useCallback } from "react";
import AwardCard from "./AwardCard";

interface Award {
  label: string;
  image: string;
}

interface Props {
  awards: Award[];
}

export default function AwardsGrid({ awards }: Props) {
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);
  const [previewTop, setPreviewTop] = useState(300);
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});
  const gridRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Preload all images into blob URLs on mount
  useEffect(() => {
    const urls: Record<string, string> = {};
    let mounted = true;

    awards.forEach((award) => {
      const img = new Image();
      img.src = `/images/awards/${award.image}.jpg`;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        try {
          canvas.toBlob((blob) => {
            if (blob && mounted) {
              urls[award.image] = URL.createObjectURL(blob);
              setBlobUrls((prev) => ({ ...prev, [award.image]: urls[award.image] }));
            }
          }, "image/jpeg", 0.92);
        } catch {
          if (mounted) {
            urls[award.image] = `/images/awards/${award.image}.jpg`;
            setBlobUrls((prev) => ({ ...prev, [award.image]: urls[award.image] }));
          }
        }
      };
    });

    return () => {
      mounted = false;
      Object.values(urls).forEach((u) => {
        if (u.startsWith("blob:")) URL.revokeObjectURL(u);
      });
    };
  }, [awards]);

  const handleCardHover = useCallback((slug: string | null, cardCenterY: number) => {
    setHoveredSlug(slug);
    if (slug !== null) {
      setPreviewTop(Math.max(100, Math.min(cardCenterY, window.innerHeight - 200)));
    }
  }, []);

  const isMobile = typeof window !== "undefined" && window.innerWidth < 1100;
  const previewUrl = hoveredSlug ? blobUrls[hoveredSlug] : null;

  // Calculate preview position: right side of the grid
  const gridRight = gridRef.current?.getBoundingClientRect().right ?? 0;
  const previewLeft = gridRight + 20;

  return (
    <div style={{ position: "relative" }}>
      <div
        ref={gridRef}
        className="grid grid-cols-1 md:grid-cols-2 gap-3 mx-auto"
        style={{ maxWidth: "48rem" }}
      >
        {awards.map((award, i) => (
          <AwardCard
            key={award.image + i}
            label={award.label}
            imageSlug={award.image}
            index={i}
            onHover={handleCardHover}
          />
        ))}
      </div>

      {/* Preview — rendered as sibling to the grid, NOT inside any card.
          This avoids .card-outline:hover transform creating a containing block. */}
      {!isMobile && hoveredSlug && (
        <div
          onContextMenu={(e) => e.preventDefault()}
          style={{
            position: "fixed",
            left: `${previewLeft}px`,
            top: `${previewTop}px`,
            transform: "translateY(-50%)",
            width: "240px",
            height: "320px",
            borderRadius: "12px",
            overflow: "hidden",
            zIndex: 9999,
            pointerEvents: "none",
            border: "1px solid var(--color-border-subtle)",
            boxShadow: "0 12px 48px rgba(0,0,0,0.3)",
            userSelect: "none",
            WebkitUserSelect: "none",
            background: previewUrl
              ? `url(${previewUrl}) center / contain no-repeat var(--color-surface-secondary)`
              : "var(--color-surface-secondary)",
            transition: "top 0.2s ease, opacity 0.15s ease",
            opacity: previewUrl ? 1 : 0.6,
          }}
        >
          {!previewUrl && (
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
