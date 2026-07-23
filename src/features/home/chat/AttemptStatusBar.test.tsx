import { describe, expect, test } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import type { AttemptFailure, PendingInteraction } from "@/lib/session";

import { AttemptStatusBar } from "./AttemptStatusBar";

const pending = (callId: string, capability: string): PendingInteraction => ({
  callId,
  kind: "permission",
  permission: {
    capability,
    input: {},
    risk: "high",
  },
});

describe("AttemptStatusBar", () => {
  test("hides when fewer than two pending permissions", () => {
    const html = renderToStaticMarkup(
      <AttemptStatusBar
        pendingInteractions={[pending("c1", "write_file")]}
        canResolve
        failure={null}
      />,
    );
    expect(html).toBe("");
  });

  test("shows banner when two or more pending", () => {
    const html = renderToStaticMarkup(
      <AttemptStatusBar
        pendingInteractions={[pending("c1", "write_file"), pending("c2", "run_shell")]}
        canResolve
        failure={null}
      />,
    );
    expect(html).toContain('data-testid="multi-pending-banner"');
    expect(html).toContain("2 tools waiting for approval");
    expect(html).toContain("Writing a file");
    expect(html).toContain("Running a command");
  });

  test("shows friendly labels for mouse and accessibility tools", () => {
    const html = renderToStaticMarkup(
      <AttemptStatusBar
        pendingInteractions={[pending("c1", "mouse_move"), pending("c2", "accessibility_click")]}
        canResolve
        failure={null}
      />,
    );
    expect(html).toContain("Surfing through your screen");
    expect(html).toContain("Touching an element");
    expect(html).not.toContain("mouse_move");
    expect(html).not.toContain("accessibility_click");
  });

  test("hides banner when canResolve is false", () => {
    const html = renderToStaticMarkup(
      <AttemptStatusBar
        pendingInteractions={[pending("c1", "write_file"), pending("c2", "run_shell")]}
        canResolve={false}
        failure={null}
      />,
    );
    expect(html).toBe("");
  });

  test("shows failure line", () => {
    const failure: AttemptFailure = {
      code: "auth",
      message: "missing API key",
      recoverable: true,
    };
    const html = renderToStaticMarkup(
      <AttemptStatusBar pendingInteractions={[]} canResolve={false} failure={failure} />,
    );
    expect(html).toContain('data-testid="attempt-failure-line"');
    expect(html).toContain("auth");
    expect(html).toContain("missing API key");
  });
});
