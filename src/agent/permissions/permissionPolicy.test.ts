import { describe, expect, test } from "bun:test";
import { consequenceRequiresPrompt, toolRequiresPermissionPrompt } from "@/agent/permissions/permissionPolicy";
import { AGENT_TOOL_NAMES } from "@/agent/toolContract";

describe("permissionPolicy", () => {
  test("ask_risky skips prompt for observe tools", () => {
    expect(consequenceRequiresPrompt("ask_risky", "observe")).toBe(false);
    expect(toolRequiresPermissionPrompt("ask_risky", AGENT_TOOL_NAMES.DISPLAY_CAPTURE)).toBe(false);
  });

  test("ask_risky prompts for execution", () => {
    expect(consequenceRequiresPrompt("ask_risky", "execute_local")).toBe(true);
    expect(toolRequiresPermissionPrompt("ask_risky", AGENT_TOOL_NAMES.TERMINAL_RUN)).toBe(true);
  });

  test("session_low_risk skips prompts", () => {
    expect(toolRequiresPermissionPrompt("session_low_risk", AGENT_TOOL_NAMES.TERMINAL_RUN)).toBe(
      false,
    );
  });

  test("ask_all prompts for observe", () => {
    expect(toolRequiresPermissionPrompt("ask_all", AGENT_TOOL_NAMES.FILE_READ)).toBe(true);
  });
});
