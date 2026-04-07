import { useState, useEffect, useRef, useCallback } from "react";
import AwardCard from "./AwardCard";

interface Award {
  label: string;
  image: string;
}

interface Props {
  awards: Award[];
}

interface HoverState {
  slug: string;
  cardRect: DOMRect;
}

export default function AwardsGrid({ awards }: Props) {
  const [hoverState, setHoverState] = useState<HoverState | null>(null);
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});
  const [animPhase, setAnimPhase] = useState<"idle" | "popping">("idle");
  const gridRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef(0);

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

  const handleCardHover = useCallback((slug: string | null, cardRect: DOMRect | null) => {
    if (slug && cardRect) {
      setHoverState({ slug, cardRect });
      // Trigger pop animation
      setAnimPhase("idle");
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = requestAnimationFrame(() => {
        setAnimPhase("popping");
      });
    } else {
      setAnimPhase("idle");
      // Small delay before removing to allow exit animation
      setTimeout(() => {
        setHoverState((prev) => {
          // Only clear if still in idle (no new hover happened)
          return prev;
        });
      }, 0);
      setHoverState(null);
    }
  }, []);

  useEffect(() => {
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  const isMobile = typeof window !== "undefined" && window.innerWidth < 1100;

  // Determine which column the hovered card is in and compute positions
  const computePreviewStyle = (): React.CSSProperties | null => {
    if (!hoverState || !gridRef.current || isMobile) return null;

    const { cardRect } = hoverState;
    const gridRect = gridRef.current.getBoundingClientRect();
    const gridCenterX = gridRect.left + gridRect.width / 2;

    // Left column: card center < grid center → preview goes LEFT
    // Right column: card center >= grid center → preview goes RIGHT
    const isLeftColumn = cardRect.left + cardRect.width / 2 < gridCenterX;

    const previewW = 220;
    const previewH = 293;
    const gap = 24;

    // Card center Y for vertical alignment
    const cardCenterY = cardRect.top + cardRect.height / 2;
    const top = Math.max(60, Math.min(cardCenterY - previewH / 2, window.innerHeight - previewH - 20));

    // Horizontal: pop out from card edge
    let finalLeft: number;
    let originX: string;

    if (isLeftColumn) {
      // Preview on left side of the grid
      finalLeft = gridRect.left - previewW - gap;
      // Ensure it doesn't go off-screen
      if (finalLeft < 10) finalLeft = 10;
      originX = "right center";
    } else {
      // Preview on right side of the grid
      finalLeft = gridRect.right + gap;
      // Ensure it doesn't go off-screen right
      if (finalLeft + previewW > window.innerWidth - 10) {
        finalLeft = window.innerWidth - previewW - 10;
      }
      originX = "left center";
    }

    // "Pop out from card" animation:
    // idle: scale(0.3) at card position, opacity 0
    // popping: scale(1) at final position, opacity 1
    const cardEdgeX = isLeftColumn ? cardRect.left : cardRect.right;
    const startLeft = cardEdgeX - (isLeftColumn ? previewW : 0);

    const isPopping = animPhase === "popping";

    return {
      position: "fixed" as const,
      left: isPopping ? `${finalLeft}px` : `${startLeft}px`,
      top: `${top}px`,
      width: `${previewW}px`,
      height: `${previewH}px`,
      borderRadius: "14px",
      overflow: "hidden",
      zIndex: 9999,
      pointerEvents: "none" as const,
      border: "1px solid var(--color-border-subtle)",
      boxShadow: "0 16px 56px rgba(0,0,0,0.35), 0 4px 16px rgba(0,0,0,0.15)",
      userSelect: "none" as const,
      WebkitUserSelect: "none" as const,
      transformOrigin: originX,
      transform: isPopping ? "scale(1) translateZ(0)" : "scale(0.35) translateZ(0)",
      opacity: isPopping ? 1 : 0,
      transition: isPopping
        ? "transform 0.38s cubic-bezier(0.34, 1.56, 0.64, 1), left 0.38s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease"
        : "transform 0.15s ease-in, opacity 0.12s ease-in",
    };
  };

  const previewStyle = computePreviewStyle();
  const previewUrl = hoverState ? blobUrls[hoverState.slug] : null;

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
          This avoids .card-outline:hover transform creating a containing block.
          Left-column cards → preview pops to left; Right-column → pops to right. */}
      {!isMobile && hoverState && previewStyle && (
        <div
          onContextMenu={(e) => e.preventDefault()}
          style={{
            ...previewStyle,
            background: previewUrl
              ? `url(${previewUrl}) center / contain no-repeat var(--color-surface-secondary)`
              : "var(--color-surface-secondary)",
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
