import { useState, useRef, useCallback } from "react";

interface AwardCardProps {
  label: string;
  imageSlug: string;
  index: number;
}

export default function AwardCard({ label, imageSlug, index }: AwardCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [cardY, setCardY] = useState(300);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = useCallback(() => {
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      setCardY(rect.top + rect.height / 2);
    }
    setIsHovered(true);
  }, []);

  return (
    <div
      ref={cardRef}
      className="card-outline p-4 flex items-center gap-3"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Medal icon */}
      <span className="flex-shrink-0" style={{ color: "var(--color-accent)" }}>
        <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-4.5A3.75 3.75 0 0012.75 10.5h-1.5A3.75 3.75 0 007.5 14.25v4.5m6-6V6.75a3.75 3.75 0 10-7.5 0v1.5" />
        </svg>
      </span>
      <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{label}</span>

      {/* Minimal debug preview — no portal, no canvas, no AnimatePresence */}
      {isHovered && (
        <div
          style={{
            position: "fixed",
            right: "2rem",
            top: `${Math.max(100, Math.min(cardY, window.innerHeight - 300))}px`,
            transform: "translateY(-50%)",
            width: "280px",
            height: "380px",
            borderRadius: "12px",
            overflow: "hidden",
            zIndex: 9999,
            pointerEvents: "none",
            border: "2px solid red",
            background: "#1a1a2e",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: "14px",
          }}
        >
          <img
            src={`/images/awards/${imageSlug}.jpg`}
            alt=""
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              userSelect: "none",
            }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
              (e.target as HTMLImageElement).parentElement!.textContent = `FAILED: /images/awards/${imageSlug}.jpg`;
            }}
          />
        </div>
      )}
    </div>
  );
}
