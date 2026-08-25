import { useCallback, useEffect, useRef, useState } from "react";
import "./ScrollExpand.css";

interface ScrollExpandProps {
  imageSrc: string;
  imageAlt: string;
  labelEn: string;
  labelZh: string;
  hintEn: string;
  hintZh: string;
  tapLabelEn: string;
  tapLabelZh: string;
  replayLabelEn: string;
  replayLabelZh: string;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const segment = (value: number, start: number, end: number) =>
  clamp((value - start) / (end - start));

export default function ScrollExpand({
  imageSrc,
  imageAlt,
  labelEn,
  labelZh,
  hintEn,
  hintZh,
  tapLabelEn,
  tapLabelZh,
  replayLabelEn,
  replayLabelZh,
}: ScrollExpandProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>(0);
  const [progress, setProgress] = useState(0);
  const [mobile, setMobile] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [mobileRevealed, setMobileRevealed] = useState(false);

  const writeProgress = useCallback((value: number) => {
    const track = trackRef.current;
    if (!track) return;
    const expand = segment(value, 0, 0.52);
    const dissolve = segment(value, 0.5, 0.68);
    const copy = 1 - segment(value, 0.08, 0.36);
    const hint = 1 - segment(value, 0.18, 0.4);
    const editorial = segment(value, 0.48, 0.7);
    track.style.setProperty("--motion-x-inset", `${22 * (1 - expand)}%`);
    track.style.setProperty("--motion-y-inset", `${19 * (1 - expand)}%`);
    track.style.setProperty("--motion-radius", `${30 * (1 - expand) + 2}px`);
    track.style.setProperty("--motion-image-scale", `${1.12 - expand * 0.12}`);
    track.style.setProperty("--motion-media-opacity", `${1 - dissolve}`);
    track.style.setProperty("--motion-copy-opacity", `${copy}`);
    track.style.setProperty("--motion-copy-y", `${(1 - copy) * 16}px`);
    track.style.setProperty("--motion-hint-opacity", `${hint}`);
    const section = track.closest<HTMLElement>(".motion-section");
    section?.style.setProperty("--motion-editorial-opacity", `${editorial}`);
    section?.style.setProperty("--motion-editorial-y", `${(1 - editorial) * 28}px`);
  }, []);

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 768px), (pointer: coarse)");
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      setMobile(mobileQuery.matches);
      setReducedMotion(motionQuery.matches);
    };
    sync();
    mobileQuery.addEventListener("change", sync);
    motionQuery.addEventListener("change", sync);
    return () => {
      mobileQuery.removeEventListener("change", sync);
      motionQuery.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    if (mobile || reducedMotion) {
      if (reducedMotion) setProgress(0.48);
      return;
    }

    let queued = false;
    const update = () => {
      queued = false;
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const available = Math.max(1, rect.height - window.innerHeight + 64);
      writeProgress(clamp((64 - rect.top) / available));
    };
    const onScroll = () => {
      if (queued) return;
      queued = true;
      animationRef.current = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(animationRef.current);
    };
  }, [mobile, reducedMotion, writeProgress]);

  const animateMobile = useCallback(() => {
    if (reducedMotion) {
      setProgress(0.48);
      setMobileRevealed(true);
      return;
    }
    cancelAnimationFrame(animationRef.current);
    const startValue = mobileRevealed ? 0 : progress;
    const targetValue = 0.5;
    const startedAt = performance.now();
    const duration = 950;
    setProgress(startValue);
    setMobileRevealed(true);

    const tick = (now: number) => {
      const elapsed = clamp((now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - elapsed, 4);
      setProgress(startValue + (targetValue - startValue) * eased);
      if (elapsed < 1) animationRef.current = requestAnimationFrame(tick);
    };
    animationRef.current = requestAnimationFrame(tick);
  }, [mobileRevealed, progress, reducedMotion]);

  useEffect(() => () => cancelAnimationFrame(animationRef.current), []);

  const expandProgress = segment(progress, 0, 0.52);
  const dissolveProgress = segment(progress, 0.5, 0.68);
  const horizontalInset = 22 * (1 - expandProgress);
  const verticalInset = 19 * (1 - expandProgress);
  const radius = 30 * (1 - expandProgress) + 2;
  const imageScale = 1.12 - expandProgress * 0.12;
  const copyOpacity = 1 - segment(progress, 0.08, 0.36);
  const hintOpacity = 1 - segment(progress, 0.18, 0.4);

  return (
    <div
      ref={trackRef}
      className={`motion-expand-track${mobile ? " is-mobile" : ""}${reducedMotion ? " is-reduced" : ""}`}
      style={{
        "--motion-x-inset": `${horizontalInset}%`,
        "--motion-y-inset": `${verticalInset}%`,
        "--motion-radius": `${radius}px`,
        "--motion-image-scale": imageScale,
        "--motion-media-opacity": 1 - dissolveProgress,
        "--motion-copy-opacity": copyOpacity,
        "--motion-copy-y": `${(1 - copyOpacity) * 16}px`,
        "--motion-hint-opacity": hintOpacity,
      } as React.CSSProperties}
    >
      <div className="motion-expand-stage">
        <div className="motion-expand-media">
          <img src={imageSrc} alt={imageAlt} width="1672" height="941" loading="lazy" />
          <div className="motion-expand-shade" aria-hidden="true" />
        </div>

        <div className="motion-expand-copy" aria-hidden={copyOpacity < 0.1}>
          <span className="motion-expand-index">05 / MOTION</span>
          <p>
            <span data-lang="en">{labelEn}</span>
            <span data-lang="zh">{labelZh}</span>
          </p>
          <span className="motion-expand-line" aria-hidden="true" />
        </div>

        {!mobile && (
          <div className="motion-scroll-hint" aria-hidden={hintOpacity < 0.1}>
            <span data-lang="en">{hintEn}</span>
            <span data-lang="zh">{hintZh}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14m0 0 5-5m-5 5-5-5" />
            </svg>
          </div>
        )}

        {mobile && (
          <button type="button" className="motion-expand-button" onClick={animateMobile}>
            <span data-lang="en">{mobileRevealed ? replayLabelEn : tapLabelEn}</span>
            <span data-lang="zh">{mobileRevealed ? replayLabelZh : tapLabelZh}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14m0 0 5-5m-5 5-5-5" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
