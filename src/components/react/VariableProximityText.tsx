import { useRef, useEffect, useMemo, useCallback } from 'react';

interface VariableProximityTextProps {
  label: string;
  radius?: number;
  falloff?: 'linear' | 'exponential' | 'gaussian';
  className?: string;
  style?: React.CSSProperties;
}

function useAnimationFrame(callback: () => void) {
  useEffect(() => {
    let frameId: number;
    const loop = () => {
      callback();
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [callback]);
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
  const mouseRef = useRef({ x: 0, y: 0 });
  const lastPosRef = useRef({ x: -1, y: -1 });

  useEffect(() => {
    const updatePos = (x: number, y: number) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        mouseRef.current = { x: x - rect.left, y: y - rect.top };
      }
    };
    const onMouse = (e: MouseEvent) => updatePos(e.clientX, e.clientY);
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      updatePos(t.clientX, t.clientY);
    };
    window.addEventListener('mousemove', onMouse);
    window.addEventListener('touchmove', onTouch);
    return () => {
      window.removeEventListener('mousemove', onMouse);
      window.removeEventListener('touchmove', onTouch);
    };
  }, []);

  const calcFalloff = useCallback(
    (distance: number) => {
      const norm = Math.min(Math.max(1 - distance / radius, 0), 1);
      switch (falloff) {
        case 'exponential':
          return norm ** 2;
        case 'gaussian':
          return Math.exp(-((distance / (radius / 2)) ** 2) / 2);
        default:
          return norm;
      }
    },
    [radius, falloff]
  );

  useAnimationFrame(
    useCallback(() => {
      if (!containerRef.current) return;
      const { x, y } = mouseRef.current;
      if (lastPosRef.current.x === x && lastPosRef.current.y === y) return;
      lastPosRef.current = { x, y };

      const containerRect = containerRef.current.getBoundingClientRect();

      letterRefs.current.forEach((el) => {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2 - containerRect.left;
        const cy = rect.top + rect.height / 2 - containerRect.top;
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);

        if (dist >= radius) {
          el.style.fontWeight = '300';
          el.style.transform = 'scale(1)';
          return;
        }

        const f = calcFalloff(dist);
        // Weight: 300 → 900
        const weight = Math.round(300 + f * 600);
        // Scale: 1 → 1.15
        const scale = 1 + f * 0.15;
        el.style.fontWeight = String(weight);
        el.style.transform = `scale(${scale})`;
      });
    }, [calcFalloff, radius])
  );

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
                  transition: 'font-weight 0.1s, transform 0.15s',
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
