"use client";

import {
  useCallback,
  useEffect,
  useInsertionEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";

import { collectSkeletonRects, type SkeletonRect } from "@/components/ui/content-skeleton-trace";
import { cn } from "@/lib/utils";

const STYLE_ID = "content-skeleton-styles";

const DEFAULT_BASE = "#252525";
const DEFAULT_HIGHLIGHT = "#333333";

export type ContentSkeletonAnimation = "wave" | "pulse";

export type ContentSkeletonProps = {
  loading?: boolean;
  animation?: ContentSkeletonAnimation;
  baseColor?: string;
  highlightColor?: string;
  borderRadius?: string;
  speed?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
};

function ensureSkeletonStyles(): void {
  if (typeof document === "undefined") {
    return;
  }
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
@keyframes content-skeleton-wave {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
@keyframes content-skeleton-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}
[data-content-skeleton-loading] {
  pointer-events: none;
  user-select: none;
}
[data-content-skeleton-loading] :where(h1, h2, h3, h4, h5, h6, p, span, a, label, li, time, td, th) {
  color: transparent !important;
  -webkit-text-fill-color: transparent !important;
}
[data-content-skeleton-loading] :where(img, svg, video, canvas, iframe, input, textarea, select, button) {
  opacity: 0 !important;
}
`;
  document.head.appendChild(style);
}

function SkeletonBone({
  rect,
  animation,
  baseColor,
  highlightColor,
  containerWidth,
  speed,
}: {
  rect: SkeletonRect;
  animation: ContentSkeletonAnimation;
  baseColor: string;
  highlightColor: string;
  containerWidth: number;
  speed: number;
}): ReactElement {
  const isWave = animation === "wave";

  return (
    <div
      aria-hidden
      data-content-skeleton-bone=""
      style={{
        position: "absolute",
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        borderRadius: rect.borderRadius,
        backgroundColor: baseColor,
        overflow: "hidden",
        pointerEvents: "none",
        animation: isWave ? undefined : `content-skeleton-pulse ${speed}s ease-in-out infinite`,
      }}
    >
      {isWave ? (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: -rect.left,
            width: Math.max(containerWidth, 1),
            height: "100%",
            background: `linear-gradient(90deg, transparent 0%, ${highlightColor} 50%, transparent 100%)`,
            animation: `content-skeleton-wave ${speed}s linear infinite`,
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Renders children as the layout source of truth. While `loading`, hides text/media
 * paint and overlays shimmer bones measured from the live DOM — zero layout shift
 * when `loading` flips off on the same tree.
 */
export function ContentSkeleton({
  loading = false,
  animation = "wave",
  baseColor = DEFAULT_BASE,
  highlightColor = DEFAULT_HIGHLIGHT,
  borderRadius,
  speed = 1.4,
  className,
  style,
  children,
}: ContentSkeletonProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rects, setRects] = useState<SkeletonRect[]>([]);
  const [containerWidth, setContainerWidth] = useState(0);

  useInsertionEffect(() => {
    ensureSkeletonStyles();
  }, []);

  const remeasure = useCallback(() => {
    const root = containerRef.current;
    if (!root || !loading) {
      setRects([]);
      setContainerWidth(0);
      return;
    }
    setContainerWidth(root.getBoundingClientRect().width);
    setRects(collectSkeletonRects(root, borderRadius));
  }, [loading, borderRadius]);

  useLayoutEffect(() => {
    remeasure();
  }, [remeasure, children]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root || !loading) {
      return;
    }
    const observer = new ResizeObserver(() => {
      remeasure();
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [loading, remeasure]);

  return (
    <div
      ref={containerRef}
      className={cn("relative", className)}
      style={style}
      aria-busy={loading || undefined}
      data-content-skeleton-loading={loading ? "" : undefined}
    >
      {children}
      {loading && rects.length > 0 ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
          data-content-skeleton-overlay=""
        >
          {rects.map((rect) => (
            <SkeletonBone
              key={rect.key}
              rect={rect}
              animation={animation}
              baseColor={baseColor}
              highlightColor={highlightColor}
              containerWidth={containerWidth}
              speed={speed}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
