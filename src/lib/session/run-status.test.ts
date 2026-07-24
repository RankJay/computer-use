import { describe, expect, test } from "bun:test";

import {
  isAgentProgressStatus,
  isLiveRun,
  shouldCheckpointChat,
  shouldSettleLedger,
} from "./run-status";

describe("run-status", () => {
  test("isLiveRun covers in-flight only", () => {
    expect(isLiveRun("running")).toBe(true);
    expect(isLiveRun("streaming")).toBe(true);
    expect(isLiveRun("waiting_interaction")).toBe(true);
    expect(isLiveRun("idle")).toBe(false);
    expect(isLiveRun("completed")).toBe(false);
    expect(isLiveRun("failed")).toBe(false);
    expect(isLiveRun("cancelled")).toBe(false);
  });

  test("isAgentProgressStatus excludes waiting_interaction", () => {
    expect(isAgentProgressStatus("running")).toBe(true);
    expect(isAgentProgressStatus("streaming")).toBe(true);
    expect(isAgentProgressStatus("waiting_interaction")).toBe(false);
    expect(isAgentProgressStatus("idle")).toBe(false);
  });

  test("shouldSettleLedger includes cancelled", () => {
    expect(shouldSettleLedger("completed")).toBe(true);
    expect(shouldSettleLedger("failed")).toBe(true);
    expect(shouldSettleLedger("cancelled")).toBe(true);
    expect(shouldSettleLedger("streaming")).toBe(false);
  });

  test("shouldCheckpointChat excludes cancelled", () => {
    expect(shouldCheckpointChat("completed")).toBe(true);
    expect(shouldCheckpointChat("failed")).toBe(true);
    expect(shouldCheckpointChat("cancelled")).toBe(false);
    expect(shouldCheckpointChat("idle")).toBe(false);
    expect(shouldCheckpointChat("running")).toBe(false);
    expect(shouldCheckpointChat("streaming")).toBe(false);
    expect(shouldCheckpointChat("waiting_interaction")).toBe(false);
  });
});
