import { describe, expect, test } from "bun:test";

import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";

import { needsPermission } from "./permission";

describe("needsPermission", () => {
  test("low-risk capabilities never prompt", () => {
    expect(
      needsPermission(
        { name: "read_file", risk: "low" },
        {
          ...DEFAULT_SETTINGS,
          permissionMode: "every-meaningful",
        },
      ),
    ).toBe(false);
  });

  test("high-risk prompts in risky mode", () => {
    expect(
      needsPermission(
        { name: "delete_path", risk: "high", destructive: true },
        {
          ...DEFAULT_SETTINGS,
          permissionMode: "risky",
        },
      ),
    ).toBe(true);
  });

  test("medium-risk skips prompt in risky mode", () => {
    expect(
      needsPermission(
        { name: "read_clipboard", risk: "medium" },
        {
          ...DEFAULT_SETTINGS,
          permissionMode: "risky",
        },
      ),
    ).toBe(false);
  });

  test("every-meaningful prompts for medium and high risk", () => {
    expect(
      needsPermission(
        { name: "read_clipboard", risk: "medium" },
        {
          ...DEFAULT_SETTINGS,
          permissionMode: "every-meaningful",
        },
      ),
    ).toBe(true);
  });

  test("run_shell prompts in risky mode", () => {
    expect(
      needsPermission(
        { name: "run_shell", risk: "high", destructive: true },
        {
          ...DEFAULT_SETTINGS,
          permissionMode: "risky",
        },
      ),
    ).toBe(true);
  });

  test("destructive-only prompts for destructive high-risk tools", () => {
    expect(
      needsPermission(
        { name: "delete_path", risk: "high", destructive: true },
        {
          ...DEFAULT_SETTINGS,
          permissionMode: "destructive-only",
        },
      ),
    ).toBe(true);
  });

  test("destructive-only skips non-destructive high-risk tools", () => {
    expect(
      needsPermission(
        { name: "mouse_click", risk: "high" },
        {
          ...DEFAULT_SETTINGS,
          permissionMode: "destructive-only",
        },
      ),
    ).toBe(false);
  });

  test("destructive-only skips medium-risk tools", () => {
    expect(
      needsPermission(
        { name: "read_clipboard", risk: "medium" },
        {
          ...DEFAULT_SETTINGS,
          permissionMode: "destructive-only",
        },
      ),
    ).toBe(false);
  });

  test("persisted approvals bypass prompts", () => {
    expect(
      needsPermission(
        { name: "delete_path", risk: "high", destructive: true },
        {
          ...DEFAULT_SETTINGS,
          permissionMode: "every-meaningful",
          persistedApprovals: ["delete_path"],
        },
      ),
    ).toBe(false);
  });
});
