import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type TargetAndTransition,
  type Transition,
} from "framer-motion";
import "./RotatingText.css";

type StaggerFrom = "first" | "last" | "center" | "random" | number;
type SplitBy = "characters" | "words" | "lines" | string;

export interface RotatingTextHandle {
  next: () => void;
  previous: () => void;
  jumpTo: (index: number) => void;
  reset: () => void;
}

interface RotatingTextProps {
  texts: string[];
  rotationInterval?: number;
  initial?: TargetAndTransition;
  animate?: TargetAndTransition;
  exit?: TargetAndTransition;
  animatePresenceMode?: "sync" | "wait" | "popLayout";
  animatePresenceInitial?: boolean;
  staggerDuration?: number;
  staggerFrom?: StaggerFrom;
  transition?: Transition;
  loop?: boolean;
  auto?: boolean;
  splitBy?: SplitBy;
  onNext?: (index: number) => void;
  mainClassName?: string;
  splitLevelClassName?: string;
  elementLevelClassName?: string;
}

function splitCharacters(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(segmenter.segment(text), ({ segment }) => segment);
  }
  return Array.from(text);
}

const RotatingText = forwardRef<RotatingTextHandle, RotatingTextProps>(
  (
    {
      texts,
      transition = { type: "spring", damping: 25, stiffness: 300 },
      initial = { y: "100%", opacity: 0 },
      animate = { y: 0, opacity: 1 },
      exit = { y: "-120%", opacity: 0 },
      animatePresenceMode = "wait",
      animatePresenceInitial = false,
      rotationInterval = 2000,
      staggerDuration = 0,
      staggerFrom = "first",
      loop = true,
      auto = true,
      splitBy = "characters",
      onNext,
      mainClassName = "",
      splitLevelClassName = "",
      elementLevelClassName = "",
    },
    ref,
  ) => {
    const [index, setIndex] = useState(0);
    const reduceMotion = useReducedMotion();
    const safeTexts = texts.length ? texts : [""];

    const setSafeIndex = useCallback(
      (nextIndex: number) => {
        setIndex(nextIndex);
        onNext?.(nextIndex);
      },
      [onNext],
    );

    const next = useCallback(() => {
      const nextIndex = index === safeTexts.length - 1 ? (loop ? 0 : index) : index + 1;
      if (nextIndex !== index) setSafeIndex(nextIndex);
    }, [index, loop, safeTexts.length, setSafeIndex]);

    const previous = useCallback(() => {
      const previousIndex = index === 0 ? (loop ? safeTexts.length - 1 : 0) : index - 1;
      if (previousIndex !== index) setSafeIndex(previousIndex);
    }, [index, loop, safeTexts.length, setSafeIndex]);

    const jumpTo = useCallback(
      (nextIndex: number) => {
        const boundedIndex = Math.max(0, Math.min(nextIndex, safeTexts.length - 1));
        if (boundedIndex !== index) setSafeIndex(boundedIndex);
      },
      [index, safeTexts.length, setSafeIndex],
    );

    const reset = useCallback(() => jumpTo(0), [jumpTo]);
    useImperativeHandle(ref, () => ({ next, previous, jumpTo, reset }), [jumpTo, next, previous, reset]);

    useEffect(() => {
      if (!auto || reduceMotion || safeTexts.length < 2) return;
      const timer = window.setInterval(next, rotationInterval);
      return () => window.clearInterval(timer);
    }, [auto, next, reduceMotion, rotationInterval, safeTexts.length]);

    const groups = useMemo(() => {
      const text = safeTexts[index] ?? "";
      if (splitBy === "characters") {
        return text.split(" ").map((word, wordIndex, words) => ({
          elements: splitCharacters(word),
          needsSpace: wordIndex < words.length - 1,
        }));
      }
      if (splitBy === "words") {
        return text.split(" ").map((word, wordIndex, words) => ({
          elements: [word],
          needsSpace: wordIndex < words.length - 1,
        }));
      }
      if (splitBy === "lines") {
        return text.split("\n").map((line) => ({ elements: [line], needsSpace: false }));
      }
      return text.split(splitBy).map((part, partIndex, parts) => ({
        elements: [part],
        needsSpace: partIndex < parts.length - 1,
      }));
    }, [index, safeTexts, splitBy]);

    const totalElements = groups.reduce((total, group) => total + group.elements.length, 0);
    const staggerDelay = useCallback(
      (elementIndex: number) => {
        if (typeof staggerFrom === "number") return Math.abs(staggerFrom - elementIndex) * staggerDuration;
        if (staggerFrom === "last") return (totalElements - 1 - elementIndex) * staggerDuration;
        if (staggerFrom === "center") return Math.abs(Math.floor(totalElements / 2) - elementIndex) * staggerDuration;
        if (staggerFrom === "random") return Math.abs(Math.floor(Math.random() * totalElements) - elementIndex) * staggerDuration;
        return elementIndex * staggerDuration;
      },
      [staggerDuration, staggerFrom, totalElements],
    );

    let elementIndex = 0;
    return (
      <span
        className={`rotating-text ${mainClassName}`.trim()}
        aria-label={safeTexts.join(" / ")}
      >
        <span className="rotating-text-sizer" aria-hidden="true">
          {safeTexts.map((text, textIndex) => (
            <span key={`${text}-${textIndex}`}>
              {splitCharacters(text).map((character, characterIndex) => (
                <span key={`${character}-${characterIndex}`}>{character === " " ? "\u00a0" : character}</span>
              ))}
            </span>
          ))}
        </span>
        <AnimatePresence mode={animatePresenceMode} initial={animatePresenceInitial}>
          <motion.span key={index} className="rotating-text-current" aria-hidden="true">
            {groups.map((group, groupIndex) => (
              <span key={groupIndex} className={`rotating-text-group ${splitLevelClassName}`.trim()}>
                {group.elements.map((element, indexInGroup) => {
                  const currentIndex = elementIndex++;
                  return (
                    <motion.span
                      key={`${element}-${indexInGroup}`}
                      className={elementLevelClassName}
                      initial={reduceMotion ? false : initial}
                      animate={animate}
                      exit={reduceMotion ? undefined : exit}
                      transition={{ ...transition, delay: reduceMotion ? 0 : staggerDelay(currentIndex) }}
                    >
                      {element}
                    </motion.span>
                  );
                })}
                {group.needsSpace && <span>&nbsp;</span>}
              </span>
            ))}
          </motion.span>
        </AnimatePresence>
      </span>
    );
  },
);

RotatingText.displayName = "RotatingText";
export default RotatingText;
