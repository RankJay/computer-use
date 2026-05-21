import { describe, expect, test } from "bun:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { AgentActivitySurface } from "@/agent/types";
import { AgentActivityBlock } from "@/features/agent-chat/AgentActivityBlock";

describe("AgentActivityBlock", () => {
  test("routes each activity surface to its matching component", () => {
    const surfaces: readonly AgentActivitySurface[] = ["reasoning", "task", "thought"];

    for (const surface of surfaces) {
      const html = renderToStaticMarkup(
        createElement(AgentActivityBlock, {
          rows: [{ id: surface, title: `${surface} row`, surface }],
          status: "completed",
          collapse: true,
        }),
      );

      expect(html).toContain(`data-activity-surface="${surface}"`);
    }
  });

  test("renders timeout detail from raw tool error payload", () => {
    const html = renderToStaticMarkup(
      createElement(AgentActivityBlock, {
        rows: [
          {
            id: "timeout",
            title: "Timed out terminal.run",
            surface: "thought",
            tone: "timeout",
            toolError: { kind: "timeout", timeoutMs: 2_000, elapsedMs: 2_004 },
          },
        ],
        status: "active",
      }),
    );

    expect(html).toContain("Stopped after 2s.");
  });

  test("renders screenshot image URL from raw base64 payload", () => {
    const html = renderToStaticMarkup(
      createElement(AgentActivityBlock, {
        rows: [
          {
            id: "screenshot",
            title: "Captured screenshot",
            detail: "primary",
            surface: "thought",
            screenshotImageBase64: "AAA",
          },
        ],
        status: "active",
      }),
    );

    expect(html).toContain('src="data:image/png;base64,AAA"');
  });

  test("renders mixed activity surfaces under one status header", () => {
    const html = renderToStaticMarkup(
      createElement(AgentActivityBlock, {
        rows: [
          { id: "thought", title: "Planned 3 steps", surface: "thought" },
          { id: "reasoning", title: "Reasoned about workspace", surface: "reasoning" },
          { id: "task", title: "Running terminal.run", surface: "task" },
        ],
        status: "cancelled",
        collapse: true,
      }),
    );

    expect(html.match(/Stopped/g)?.length).toBe(1);
    expect(html.match(/data-activity-surface=/g)?.length).toBe(1);
  });
});
