import type { HTMLAttributes, ReactNode } from "react";
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
}

/**
 * Structural wrapper for a CSS-native card stack.
 *
 * Mobile pinning deliberately uses position: sticky instead of a smooth-scroll
 * runtime, so Safari can keep scrolling on its native compositor path.
 */
export default function ScrollStack({ children, className = "" }: ScrollStackProps) {
  return (
    <div className={`scroll-stack-scroller ${className}`.trim()}>
      <div className="scroll-stack-inner">
        {children}
        <div className="scroll-stack-end" aria-hidden="true" />
      </div>
    </div>
  );
}
