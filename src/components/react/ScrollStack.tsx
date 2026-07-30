import { useCallback, useLayoutEffect, useRef } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import Lenis from "lenis";
import "./ScrollStack.css";

interface ScrollStackItemProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  itemClassName?: string;
}

export function ScrollStackItem({
  children,
  itemClassName = "",
  ...props
}: ScrollStackItemProps) {
  return (
    <div
      {...props}
      className={`scroll-stack-card ${itemClassName} ${props.className ?? ""}`.trim()}
    >
      {children}
    </div>
  );
}

interface ScrollStackProps {
  children: ReactNode;
  className?: string;
  itemDistance?: number;
  itemScale?: number;
  itemStackDistance?: number;
  stackPosition?: string;
  scaleEndPosition?: string;
  baseScale?: number;
  rotationAmount?: number;
  blurAmount?: number;
  onStackComplete?: () => void;
}

interface CardTransform {
  translateY: number;
  scale: number;
  rotation: number;
  blur: number;
}

const MOBILE_QUERY = "(max-width: 768px)";

export default function ScrollStack({
  children,
  className = "",
  itemDistance = 76,
  itemScale = 0.022,
  itemStackDistance = 18,
  stackPosition = "15%",
  scaleEndPosition = "7%",
  baseScale = 0.88,
  rotationAmount = 0.35,
  blurAmount = 0,
  onStackComplete,
}: ScrollStackProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLElement[]>([]);
  const cardOffsetsRef = useRef<number[]>([]);
  const lastTransformsRef = useRef(new Map<number, CardTransform>());
  const stackCompletedRef = useRef(false);
  const updatingRef = useRef(false);

  const parsePosition = useCallback((value: string, height: number) => {
    return value.includes("%") ? (Number.parseFloat(value) / 100) * height : Number.parseFloat(value);
  }, []);

  const progress = useCallback((current: number, start: number, end: number) => {
    if (current <= start) return 0;
    if (current >= end) return 1;
    return (current - start) / Math.max(1, end - start);
  }, []);

  const clearTransforms = useCallback(() => {
    cardsRef.current.forEach((card) => {
      card.style.removeProperty("transform");
      card.style.removeProperty("filter");
      card.style.removeProperty("margin-bottom");
      card.style.removeProperty("will-change");
      card.style.removeProperty("transform-origin");
    });
    lastTransformsRef.current.clear();
  }, []);

  const updateCardTransforms = useCallback(() => {
    if (updatingRef.current || !cardsRef.current.length || !scrollerRef.current) return;
    updatingRef.current = true;

    const scrollTop = window.scrollY;
    const viewportHeight = window.innerHeight;
    const stackPositionPx = parsePosition(stackPosition, viewportHeight);
    const scaleEndPositionPx = parsePosition(scaleEndPosition, viewportHeight);
    const endElement = scrollerRef.current.querySelector<HTMLElement>(".scroll-stack-end");
    const endTop = endElement ? endElement.getBoundingClientRect().top + scrollTop : scrollTop;
    let topCardIndex = 0;

    cardsRef.current.forEach((_, i) => {
      const cardTop = cardOffsetsRef.current[i];
      const triggerStart = cardTop - stackPositionPx - itemStackDistance * i;
      if (scrollTop >= triggerStart) topCardIndex = i;
    });

    cardsRef.current.forEach((card, i) => {
      const cardTop = cardOffsetsRef.current[i];
      const triggerStart = cardTop - stackPositionPx - itemStackDistance * i;
      const triggerEnd = cardTop - scaleEndPositionPx;
      const pinEnd = endTop - viewportHeight * 0.58;
      const scaleProgress = progress(scrollTop, triggerStart, triggerEnd);
      const targetScale = baseScale + i * itemScale;
      const scale = 1 - scaleProgress * (1 - targetScale);
      const rotation = i * rotationAmount * scaleProgress;
      const blur = i < topCardIndex ? (topCardIndex - i) * blurAmount : 0;
      let translateY = 0;

      if (scrollTop >= triggerStart && scrollTop <= pinEnd) {
        translateY = scrollTop - cardTop + stackPositionPx + itemStackDistance * i;
      } else if (scrollTop > pinEnd) {
        translateY = pinEnd - cardTop + stackPositionPx + itemStackDistance * i;
      }

      const next = {
        translateY: Math.round(translateY * 100) / 100,
        scale: Math.round(scale * 1000) / 1000,
        rotation: Math.round(rotation * 100) / 100,
        blur: Math.round(blur * 100) / 100,
      };
      const previous = lastTransformsRef.current.get(i);
      const changed = !previous || Object.keys(next).some((key) => {
        const field = key as keyof CardTransform;
        return Math.abs(previous[field] - next[field]) > (field === "scale" ? 0.001 : 0.1);
      });

      if (changed) {
        card.style.transform = `translate3d(0, ${next.translateY}px, 0) scale(${next.scale}) rotate(${next.rotation}deg)`;
        card.style.filter = next.blur > 0 ? `blur(${next.blur}px)` : "";
        lastTransformsRef.current.set(i, next);
      }

      if (i === cardsRef.current.length - 1) {
        const complete = scrollTop >= triggerStart && scrollTop <= pinEnd;
        if (complete !== stackCompletedRef.current) {
          stackCompletedRef.current = complete;
          if (complete) onStackComplete?.();
        }
      }
    });

    updatingRef.current = false;
  }, [baseScale, blurAmount, itemScale, itemStackDistance, onStackComplete, parsePosition, progress, rotationAmount, scaleEndPosition, stackPosition]);

  useLayoutEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const mobile = window.matchMedia(MOBILE_QUERY);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let lenis: Lenis | null = null;
    const refreshLayout = () => {
      const rootTop = root.getBoundingClientRect().top + window.scrollY;
      cardOffsetsRef.current = cardsRef.current.map((card) => rootTop + card.offsetTop);
      updateCardTransforms();
    };

    const teardown = () => {
      window.removeEventListener("scroll", updateCardTransforms);
      window.removeEventListener("resize", refreshLayout);
      lenis?.destroy();
      lenis = null;
      clearTransforms();
    };

    const setup = () => {
      teardown();
      cardsRef.current = Array.from(root.querySelectorAll<HTMLElement>(".scroll-stack-card"));
      if (!mobile.matches || reducedMotion.matches) return;
      cardsRef.current.forEach((card, i) => {
        if (i < cardsRef.current.length - 1) card.style.marginBottom = `${itemDistance}px`;
        card.style.willChange = "transform, filter";
        card.style.transformOrigin = "top center";
      });
      const rootTop = root.getBoundingClientRect().top + window.scrollY;
      cardOffsetsRef.current = cardsRef.current.map((card) => rootTop + card.offsetTop);
      lenis = new Lenis({
        autoRaf: true,
        duration: 1.05,
        smoothWheel: true,
        touchMultiplier: 1.25,
        syncTouch: false,
        lerp: 0.12,
      });
      lenis.on("scroll", updateCardTransforms);
      window.addEventListener("scroll", updateCardTransforms, { passive: true });
      window.addEventListener("resize", refreshLayout);
      updateCardTransforms();
    };

    setup();
    mobile.addEventListener("change", setup);
    reducedMotion.addEventListener("change", setup);
    return () => {
      mobile.removeEventListener("change", setup);
      reducedMotion.removeEventListener("change", setup);
      teardown();
      cardsRef.current = [];
      cardOffsetsRef.current = [];
    };
  }, [clearTransforms, itemDistance, updateCardTransforms]);

  return (
    <div ref={scrollerRef} className={`scroll-stack-scroller ${className}`.trim()}>
      <div className="scroll-stack-inner">
        {children}
        <div className="scroll-stack-end" aria-hidden="true" />
      </div>
    </div>
  );
}
