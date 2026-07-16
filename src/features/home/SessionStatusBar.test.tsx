import { describe, expect, test } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import type { PendingPermission, SessionFailure } from "@/lib/session";

import { SessionStatusBar } from "./SessionStatusBar";

const pending = (callId: string, capability: string): PendingPermission => ({
  callId,
  capability,
  input: {},
  risk: "high",
});

describe("SessionStatusBar", () => {
  test("hides when fewer than two pending permissions", () => {
    const html = renderToStaticMarkup(
      <SessionStatusBar
        pendingPermissions={[pending("c1", "write_file")]}
        canResolvePermission
        failure={null}
      />,
    );
    expect(html).toBe("");
  });

  test("shows banner when two or more pending", () => {
    const html = renderToStaticMarkup(
      <SessionStatusBar
        pendingPermissions={[pending("c1", "write_file"), pending("c2", "run_shell")]}
        canResolvePermission
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
      <SessionStatusBar
        pendingPermissions={[pending("c1", "mouse_move"), pending("c2", "accessibility_click")]}
        canResolvePermission
        failure={null}
      />,
    );
    expect(html).toContain("Surfing through your screen");
    expect(html).toContain("Touching an element");
    expect(html).not.toContain("mouse_move");
    expect(html).not.toContain("accessibility_click");
  });

  test("hides banner when canResolvePermission is false", () => {
    const html = renderToStaticMarkup(
      <SessionStatusBar
        pendingPermissions={[pending("c1", "write_file"), pending("c2", "run_shell")]}
        canResolvePermission={false}
        failure={null}
      />,
    );
    expect(html).toBe("");
  });

  test("shows failure line", () => {
    const failure: SessionFailure = {
      code: "auth",
      message: "missing API key",
      recoverable: true,
    };
    const html = renderToStaticMarkup(
      <SessionStatusBar pendingPermissions={[]} canResolvePermission={false} failure={failure} />,
    );
    expect(html).toContain('data-testid="session-failure-line"');
    expect(html).toContain("auth");
    expect(html).toContain("missing API key");
  });
});
