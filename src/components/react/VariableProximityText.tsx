import { useRef, useEffect, useCallback } from 'react';

interface VariableProximityTextProps {
  label: string;
  radius?: number;
  falloff?: 'linear' | 'exponential' | 'gaussian';
  className?: string;
  style?: React.CSSProperties;
}

export default function VariableProximityText({
  label,
  radius = 80,
  falloff = 'gaussian',
  className = '',
  style,
}: VariableProximityTextProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const letterRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const cachedPositions = useRef<{ cx: number; cy: number }[]>([]);
  const rafId = useRef(0);
  const needsUpdate = useRef(true);

  // Cache letter positions — recalc on resize, not every frame
  const cachePositions = useCallback(() => {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    cachedPositions.current = letterRefs.current.map((el) => {
      if (!el) return { cx: 0, cy: 0 };
      const rect = el.getBoundingClientRect();
      return {
        cx: rect.left + rect.width / 2 - containerRect.left,
        cy: rect.top + rect.height / 2 - containerRect.top,
      };
    });
  }, []);

  // Mouse tracking
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      needsUpdate.current = true;
    };
    const onTouch = (e: TouchEvent) => {
      if (!containerRef.current) return;
      const t = e.touches[0];
      const rect = containerRef.current.getBoundingClientRect();
      mouseRef.current = { x: t.clientX - rect.left, y: t.clientY - rect.top };
      needsUpdate.current = true;
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('touchmove', onTouch, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onTouch);
    };
  }, []);

  // Cache positions on mount, resize, and lang/theme toggle
  useEffect(() => {
    cachePositions();
    const onResize = () => {
      cachePositions();
      needsUpdate.current = true;
    };
    window.addEventListener('resize', onResize);

    // Re-cache when language or theme toggles (display:none → block changes layout)
    const observer = new MutationObserver(() => {
      // Defer to next frame so display:none has resolved
      requestAnimationFrame(() => {
        cachePositions();
        needsUpdate.current = true;
      });
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-site-lang', 'data-theme'],
    });

    return () => {
      window.removeEventListener('resize', onResize);
      observer.disconnect();
    };
  }, [cachePositions]);

  // Animation loop — only does work when mouse has moved
  useEffect(() => {
    const r2 = radius * radius;
    const halfR = radius / 2;

    const loop = () => {
      rafId.current = requestAnimationFrame(loop);
      if (!needsUpdate.current) return;
      needsUpdate.current = false;

      const { x, y } = mouseRef.current;
      const positions = cachedPositions.current;

      for (let i = 0; i < positions.length; i++) {
        const el = letterRefs.current[i];
        if (!el || !positions[i]) continue;

        const dx = x - positions[i].cx;
        const dy = y - positions[i].cy;
        const d2 = dx * dx + dy * dy;

        if (d2 >= r2) {
          el.style.fontWeight = '300';
          el.style.transform = 'scale(1)';
          continue;
        }

        const dist = Math.sqrt(d2);
        let f: number;
        if (falloff === 'exponential') {
          const norm = 1 - dist / radius;
          f = norm * norm;
        } else if (falloff === 'gaussian') {
          const ratio = dist / halfR;
          f = Math.exp(-(ratio * ratio) / 2);
        } else {
          f = 1 - dist / radius;
        }

        el.style.fontWeight = String(Math.round(300 + f * 600));
        el.style.transform = `scale(${1 + f * 0.15})`;
      }
    };

    rafId.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId.current);
  }, [radius, falloff]);

  const words = label.split(' ');
  let letterIndex = 0;

  return (
    <span
      ref={containerRef}
      className={className}
      style={{ display: 'inline', ...style }}
    >
      {words.map((word, wi) => (
        <span key={wi} style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
          {word.split('').map((ch) => {
            const idx = letterIndex++;
            return (
              <span
                key={idx}
                ref={(el) => { letterRefs.current[idx] = el; }}
                style={{
                  display: 'inline-block',
                  fontWeight: '300',
                  transition: 'font-weight 0.05s, transform 0.08s',
                  willChange: 'font-weight, transform',
                }}
              >
                {ch}
              </span>
            );
          })}
          {wi < words.length - 1 && <span style={{ display: 'inline-block' }}>&nbsp;</span>}
        </span>
      ))}
    </span>
  );
}
