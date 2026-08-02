import { describe, expect, test } from "bun:test";

import type { SourceUrlUIPart, TextUIPart } from "ai";

import {
  appendInlineCiteMarker,
  buildCitedMarkdown,
  buildProseCitationRun,
} from "./prose-citation-run";

function text(value: string): TextUIPart {
  return { type: "text", text: value };
}

function source(id: string, url: string, title?: string): SourceUrlUIPart {
  return { type: "source-url", sourceId: id, url, title };
}

describe("buildProseCitationRun", () => {
  test("leading sources become summary; trailing sources attach to text segments", () => {
    const run = buildProseCitationRun([
      source("a", "https://a.example/"),
      source("b", "https://b.example/"),
      text("Intro.\n\n"),
      text("- 24k: ₹1\n"),
      source("c", "https://c.example/"),
      text("- 22k: ₹2\n"),
      source("d", "https://d.example/"),
      source("e", "https://e.example/"),
    ]);

    expect(run.summarySources.map((s) => s.sourceId)).toEqual(["a", "b"]);
    expect(run.segments).toHaveLength(3);
    expect(run.segments[1]?.citations.map((s) => s.sourceId)).toEqual(["c"]);
    expect(run.segments[2]?.citations.map((s) => s.sourceId)).toEqual(["d", "e"]);
  });

  test("dedupes summary sources by url", () => {
    const run = buildProseCitationRun([
      source("a1", "https://a.example/"),
      source("a2", "https://a.example/"),
      text("Hi"),
    ]);
    expect(run.summarySources).toHaveLength(1);
  });
});

describe("appendInlineCiteMarker", () => {
  test("places cite before trailing newline so list items stay intact", () => {
    expect(appendInlineCiteMarker("- 24k: ₹1\n", 0)).toBe(
      '- 24k: ₹1 <actuate-cite group="0"></actuate-cite>\n',
    );
  });

  test("skips extra space when text already ends with whitespace", () => {
    expect(appendInlineCiteMarker("done ", 1)).toBe('done <actuate-cite group="1"></actuate-cite>');
  });
});

describe("buildCitedMarkdown", () => {
  test("joins segments with per-chunk cite groups", () => {
    const { markdown, groups } = buildCitedMarkdown([
      { text: "Hello.\n\n", citations: [] },
      {
        text: "- A\n",
        citations: [source("1", "https://one.example/")],
      },
      {
        text: "- B\n",
        citations: [source("2", "https://two.example/"), source("3", "https://three.example/")],
      },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveLength(1);
    expect(groups[1]).toHaveLength(2);
    expect(markdown).toContain('<actuate-cite group="0"></actuate-cite>');
    expect(markdown).toContain('<actuate-cite group="1"></actuate-cite>');
    expect(markdown.startsWith("Hello.")).toBe(true);
  });
});
