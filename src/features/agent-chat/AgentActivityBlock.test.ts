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
});
