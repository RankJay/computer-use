import { describe, expect, test } from "bun:test";

import {
  AGENT_TOOL_NAMES,
  MODEL_TOOL_KEYS,
  MODEL_TOOL_TO_AGENT_TOOL,
  TOOL_CONTRACT,
  agentToolNameForModelToolKey,
  isPointerAutomationToolName,
  isUiAutomationToolName,
  normalizePersistedApprovals,
} from "@/agent/toolContract";

describe("toolContract", () => {
  test("every model key maps to a TOOL_CONTRACT entry", () => {
    for (const modelKey of Object.values(MODEL_TOOL_KEYS)) {
      const agentTool = agentToolNameForModelToolKey(modelKey);
      expect(TOOL_CONTRACT[agentTool]).toBeDefined();
      expect(MODEL_TOOL_TO_AGENT_TOOL[modelKey]).toBe(agentTool);
    }
  });

  test("every mapped agent tool exists in TOOL_CONTRACT", () => {
    for (const agentTool of Object.values(MODEL_TOOL_TO_AGENT_TOOL)) {
      expect(TOOL_CONTRACT[agentTool].name).toBe(agentTool);
    }
  });

  test("normalizePersistedApprovals keeps dotted contract ids", () => {
    expect(normalizePersistedApprovals(["terminal.run", "file.read"])).toEqual([
      AGENT_TOOL_NAMES.TERMINAL_RUN,
      AGENT_TOOL_NAMES.FILE_READ,
    ]);
  });

  test("normalizePersistedApprovals migrates legacy snake_case keys", () => {
    expect(normalizePersistedApprovals(["terminal_run", "read_file"])).toEqual([
      AGENT_TOOL_NAMES.TERMINAL_RUN,
      AGENT_TOOL_NAMES.FILE_READ,
    ]);
  });

  test("normalizePersistedApprovals drops unknown values and dedupes", () => {
    expect(
      normalizePersistedApprovals(["terminal.run", "terminal_run", "not_a_tool", "terminal.run"]),
    ).toEqual([AGENT_TOOL_NAMES.TERMINAL_RUN]);
  });

  test("ui automation membership follows TOOL_CONTRACT risk class", () => {
    expect(isUiAutomationToolName(AGENT_TOOL_NAMES.POINTER_CLICK)).toBe(true);
    expect(isUiAutomationToolName(AGENT_TOOL_NAMES.TYPE_TEXT)).toBe(true);
    expect(isUiAutomationToolName(AGENT_TOOL_NAMES.TERMINAL_RUN)).toBe(false);
    expect(isPointerAutomationToolName(AGENT_TOOL_NAMES.POINTER_MOVE)).toBe(true);
    expect(isPointerAutomationToolName(AGENT_TOOL_NAMES.TYPE_TEXT)).toBe(false);
  });
});
