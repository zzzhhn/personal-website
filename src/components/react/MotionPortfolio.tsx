import { useEffect, useRef, useState } from "react";
import "./MotionPortfolio.css";

interface BilingualText {
  en: string;
  zh: string;
}

export interface MotionWork {
  id: string;
  title: BilingualText;
  kind: BilingualText;
  role: BilingualText;
  description: BilingualText;
  duration: string;
  poster: string;
  source: string;
}

interface MotionLabels {
  play: BilingualText;
  close: BilingualText;
  loading: BilingualText;
  error: BilingualText;
  retry: BilingualText;
}

interface MotionPortfolioProps {
  works: readonly MotionWork[];
  labels: MotionLabels;
}

type LoadState = "idle" | "loading" | "ready" | "error";

export default function MotionPortfolio({ works, labels }: MotionPortfolioProps) {
  const abortRef = useRef<AbortController | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  const releaseMedia = (syncState = true) => {
    requestIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    blobUrlRef.current = null;
    if (syncState) setBlobUrl(null);
  };

  useEffect(() => () => releaseMedia(false), []);

  const loadWork = async (work: MotionWork) => {
    releaseMedia();
    const requestId = requestIdRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setActiveId(work.id);
    setState("loading");
    setProgress(0);

    try {
      const response = await fetch(work.source, { signal: controller.signal });
      if (!response.ok) throw new Error(`Media request failed with ${response.status}`);
      const total = Number(response.headers.get("content-length")) || 0;
      let mediaBlob: Blob;

      if (response.body) {
        const reader = response.body.getReader();
        const chunks: ArrayBuffer[] = [];
        let received = 0;
        let reportedProgress = -2;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value.slice().buffer as ArrayBuffer);
          received += value.byteLength;
          if (total) {
            const nextProgress = Math.round((received / total) * 100);
            if (nextProgress >= reportedProgress + 2 || nextProgress === 100) {
              reportedProgress = nextProgress;
              setProgress(nextProgress);
            }
          } else {
            setProgress(null);
          }
        }
        mediaBlob = new Blob(chunks, {
          type: response.headers.get("content-type") || "video/mp4",
        });
      } else {
        mediaBlob = await response.blob();
      }

      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      const url = URL.createObjectURL(mediaBlob);
      blobUrlRef.current = url;
      setBlobUrl(url);
      setProgress(100);
      setState("ready");
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("Unable to prepare motion work", error);
      setProgress(null);
      setState("error");
    }
  };

  const closePlayer = () => {
    releaseMedia();
    setActiveId(null);
    setState("idle");
    setProgress(null);
  };

  return (
    <div className="motion-works">
      {works.map((work, index) => {
        const active = activeId === work.id;
        return (
          <article className={`motion-work${index % 2 ? " is-reversed" : ""}`} key={work.id}>
            <div className={`motion-work-visual${active ? " is-active" : ""}`}>
              <div className="motion-work-media">
                {active && state === "ready" && blobUrl ? (
                  <video
                    src={blobUrl}
                    poster={work.poster}
                    controls
                    playsInline
                    preload="metadata"
                    controlsList="nodownload noremoteplayback"
                    aria-label={`${work.title.en} / ${work.title.zh}`}
                  />
                ) : (
                  <img src={work.poster} alt="" width="1280" height="720" loading="lazy" />
                )}

                {!active && (
                  <button
                    type="button"
                    className="motion-play"
                    onClick={() => void loadWork(work)}
                    data-analytics-event="motion_video_load"
                    data-analytics-target={work.id}
                  >
                    <span className="motion-play-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24"><path d="m9 7 8 5-8 5Z" /></svg>
                    </span>
                    <span>
                      <span data-lang="en">{labels.play.en}</span>
                      <span data-lang="zh">{labels.play.zh}</span>
                    </span>
                  </button>
                )}

                {active && state === "loading" && (
                  <div className="motion-player-state" role="status" aria-live="polite">
                    <span className="motion-loading-ring" aria-hidden="true" />
                    <strong>
                      <span data-lang="en">{labels.loading.en}</span>
                      <span data-lang="zh">{labels.loading.zh}</span>
                    </strong>
                    <span>{progress === null ? "…" : `${progress}%`}</span>
                    <div className="motion-loading-track" aria-hidden="true">
                      <span style={{ width: `${progress ?? 18}%` }} />
                    </div>
                  </div>
                )}

                {active && state === "error" && (
                  <div className="motion-player-state is-error" role="alert">
                    <p>
                      <span data-lang="en">{labels.error.en}</span>
                      <span data-lang="zh">{labels.error.zh}</span>
                    </p>
                    <button type="button" onClick={() => void loadWork(work)}>
                      <span data-lang="en">{labels.retry.en}</span>
                      <span data-lang="zh">{labels.retry.zh}</span>
                    </button>
                  </div>
                )}
              </div>

              {active && (
                <button type="button" className="motion-close" onClick={closePlayer}>
                  <span data-lang="en">{labels.close.en}</span>
                  <span data-lang="zh">{labels.close.zh}</span>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>
                </button>
              )}
            </div>

            <div className="motion-work-copy">
              <div className="motion-work-kicker">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <span data-lang="en">{work.kind.en}</span>
                <span data-lang="zh">{work.kind.zh}</span>
              </div>
              <h3>
                <span data-lang="en">{work.title.en}</span>
                <span data-lang="zh">{work.title.zh}</span>
              </h3>
              <p className="motion-work-role">
                <span data-lang="en">{work.role.en}</span>
                <span data-lang="zh">{work.role.zh}</span>
              </p>
              <p className="motion-work-description">
                <span data-lang="en">{work.description.en}</span>
                <span data-lang="zh">{work.description.zh}</span>
              </p>
              <div className="motion-work-duration">
                <span>FILM</span>
                <time>{work.duration}</time>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
