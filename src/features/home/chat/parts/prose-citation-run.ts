import type { SourceUrlUIPart, TextUIPart, UIMessage } from "ai";
import { isTextUIPart } from "ai";

export type CitedTextSegment = {
  readonly text: string;
  /** Sources that followed this text chunk in the stream. */
  readonly citations: readonly SourceUrlUIPart[];
};

export type ProseCitationRun = {
  /** Source dump with no adjacent claim — render as Sources summary. */
  readonly summarySources: readonly SourceUrlUIPart[];
  /** Text chunks; trailing citations become inline pills at chunk end. */
  readonly segments: readonly CitedTextSegment[];
};

const CITE_TAG = "actuate-cite";

export function isProseRunPart(
  part: UIMessage["parts"][number] | undefined,
): part is TextUIPart | SourceUrlUIPart {
  return part !== undefined && (isTextUIPart(part) || part.type === "source-url");
}

export function uniqueSources(parts: readonly SourceUrlUIPart[]): SourceUrlUIPart[] {
  const seen = new Set<string>();
  const unique: SourceUrlUIPart[] = [];
  for (const part of parts) {
    const url = part.url?.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    unique.push(part);
  }
  return unique;
}

/**
 * Collapse a contiguous text/source-url run into summary sources + cited segments.
 * Leading (or orphan) source clusters → summarySources; sources after text → segment.citations.
 */
export function buildProseCitationRun(
  parts: readonly UIMessage["parts"][number][],
): ProseCitationRun {
  const summarySources: SourceUrlUIPart[] = [];
  const segments: CitedTextSegment[] = [];
  let index = 0;

  const takeSources = (): SourceUrlUIPart[] => {
    const sources: SourceUrlUIPart[] = [];
    while (index < parts.length) {
      const part = parts[index];
      if (!part || part.type !== "source-url") break;
      sources.push(part);
      index += 1;
    }
    return sources;
  };

  // Leading source dump (typical post-search “Used N sources”).
  const leading = takeSources();
  if (leading.length > 0) {
    summarySources.push(...leading);
  }

  while (index < parts.length) {
    const part = parts[index];
    if (!part) {
      index += 1;
      continue;
    }

    if (isTextUIPart(part)) {
      index += 1;
      if (part.text.length === 0) {
        continue;
      }
      const citations = takeSources();
      segments.push({ text: part.text, citations });
      continue;
    }

    if (part.type === "source-url") {
      // Orphan mid-run sources (no preceding text in this phase) → summary.
      summarySources.push(...takeSources());
      continue;
    }

    break;
  }

  return {
    summarySources: uniqueSources(summarySources),
    segments,
  };
}

/** Collect a contiguous prose run starting at `startIndex`; returns end index exclusive. */
export function collectProseRunParts(
  parts: UIMessage["parts"],
  startIndex: number,
): { readonly runParts: UIMessage["parts"][number][]; readonly endIndex: number } {
  const runParts: UIMessage["parts"][number][] = [];
  let index = startIndex;
  while (isProseRunPart(parts[index])) {
    const part = parts[index];
    if (!part) break;
    runParts.push(part);
    index += 1;
  }
  return { runParts, endIndex: index };
}

/**
 * Insert cite tag before trailing newlines so list items stay one markdown item.
 */
export function appendInlineCiteMarker(text: string, group: number): string {
  const cite = `<${CITE_TAG} group="${group}"></${CITE_TAG}>`;
  const match = /(\r?\n)*$/.exec(text);
  const trailing = match?.[0] ?? "";
  const body = text.slice(0, text.length - trailing.length);
  const needsSpace = body.length > 0 && !/\s$/u.test(body);
  return `${body}${needsSpace ? " " : ""}${cite}${trailing}`;
}

export function buildCitedMarkdown(segments: readonly CitedTextSegment[]): {
  markdown: string;
  groups: SourceUrlUIPart[][];
} {
  const groups: SourceUrlUIPart[][] = [];
  let markdown = "";

  for (const segment of segments) {
    const citations = uniqueSources(segment.citations);
    if (citations.length === 0) {
      markdown += segment.text;
      continue;
    }
    const group = groups.length;
    groups.push(citations);
    markdown += appendInlineCiteMarker(segment.text, group);
  }

  return { markdown, groups };
}

export const PROSE_CITE_TAG = CITE_TAG;
