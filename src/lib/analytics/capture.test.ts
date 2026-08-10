import { afterEach, describe, expect, test } from "bun:test";

import { createRecordingMemoryAnalyticsPort } from "@/lib/analytics/adapters/recording-memory";
import { captureProductEvent, captureSettingsUpdated } from "@/lib/analytics/capture";
import { setAnalyticsPortForTests } from "@/lib/analytics/client";

describe("captureProductEvent", () => {
  const memory = createRecordingMemoryAnalyticsPort();

  afterEach(() => {
    memory.clear();
    setAnalyticsPortForTests(null);
  });

  test("routes typed events through the port", () => {
    setAnalyticsPortForTests(memory);
    captureProductEvent("attempt_started", { attempt_id: "a1", model: "m1" });
    expect(memory.entries).toEqual([
      {
        kind: "capture",
        event: "attempt_started",
        properties: { attempt_id: "a1", model: "m1" },
      },
    ]);
  });

  test("settings_updated drops non-allowlisted keys and no-ops when empty", () => {
    setAnalyticsPortForTests(memory);
    captureSettingsUpdated({ keys: ["workspaceRoot", "approvals"] });
    expect(memory.entries).toEqual([]);

    captureSettingsUpdated({ keys: ["workspaceRoot", "agentMode"] });
    expect(memory.entries).toEqual([
      {
        kind: "capture",
        event: "settings_updated",
        properties: { keys: ["agentMode"] },
      },
    ]);
  });
});
