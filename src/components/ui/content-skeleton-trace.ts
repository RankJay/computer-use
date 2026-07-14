export type SkeletonRect = {
  key: string;
  left: number;
  top: number;
  width: number;
  height: number;
  borderRadius: string;
};

const TRACE_LEAF_TAGS = new Set([
  "IMG",
  "VIDEO",
  "CANVAS",
  "IFRAME",
  "INPUT",
  "TEXTAREA",
  "SELECT",
  "BUTTON",
  "SVG",
]);

export function isTraceLeafTag(tagName: string): boolean {
  return TRACE_LEAF_TAGS.has(tagName.toUpperCase());
}

const TEXT_NODE = 3;

export function hasDirectTextChild(node: {
  childNodes: ArrayLike<{ nodeType: number; textContent: string | null }>;
}): boolean {
  const { childNodes } = node;
  for (let i = 0; i < childNodes.length; i++) {
    const child = childNodes[i];
    if (
      child !== undefined &&
      child.nodeType === TEXT_NODE &&
      (child.textContent?.trim().length ?? 0) > 0
    ) {
      return true;
    }
  }
  return false;
}

export function toRelativeRect(
  containerRect: Pick<DOMRect, "left" | "top">,
  elementRect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  borderRadius: string,
  key: string,
): SkeletonRect {
  return {
    key,
    left: elementRect.left - containerRect.left,
    top: elementRect.top - containerRect.top,
    width: elementRect.width,
    height: elementRect.height,
    borderRadius,
  };
}

function isVisibleEnough(el: Element): boolean {
  if (!(el instanceof HTMLElement) && !(el instanceof SVGElement)) {
    return false;
  }
  const style = getComputedStyle(el);
  if (style.visibility === "hidden" || style.display === "none") {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function readBorderRadius(el: Element, fallback: string | undefined): string {
  if (fallback !== undefined) {
    return fallback;
  }
  if (!(el instanceof HTMLElement) && !(el instanceof SVGElement)) {
    return "4px";
  }
  const radius = getComputedStyle(el).borderRadius;
  return radius && radius !== "0px" ? radius : "4px";
}

/**
 * Walk `root`'s descendants and collect leaf content boxes for skeleton bones.
 * Skips `data-skeleton-ignore` subtrees. Force-includes `data-skeleton` nodes.
 */
export function collectSkeletonRects(
  root: HTMLElement,
  borderRadiusOverride?: string,
): SkeletonRect[] {
  const containerRect = root.getBoundingClientRect();
  const rects: SkeletonRect[] = [];
  let index = 0;

  function push(el: Element): void {
    if (!isVisibleEnough(el)) {
      return;
    }
    const rect = el.getBoundingClientRect();
    rects.push(
      toRelativeRect(
        containerRect,
        rect,
        readBorderRadius(el, borderRadiusOverride),
        `bone-${index++}`,
      ),
    );
  }

  function walk(el: Element): void {
    if (el !== root && el.hasAttribute("data-skeleton-ignore")) {
      return;
    }

    if (el !== root && el.hasAttribute("data-skeleton")) {
      push(el);
      return;
    }

    if (el !== root && isTraceLeafTag(el.tagName)) {
      push(el);
      return;
    }

    if (el !== root && hasDirectTextChild(el) && el.children.length === 0) {
      push(el);
      return;
    }

    for (const child of el.children) {
      walk(child);
    }
  }

  walk(root);
  return rects;
}
