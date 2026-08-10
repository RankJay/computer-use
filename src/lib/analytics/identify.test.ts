import { afterEach, describe, expect, test } from "bun:test";

import { createRecordingMemoryAnalyticsPort } from "@/lib/analytics/adapters/recording-memory";
import { setAnalyticsPortForTests } from "@/lib/analytics/client";
import {
  beginIdentifyGeneration,
  identifyUser,
  resetAnalytics,
  resetIdentityGenerationForTests,
} from "@/lib/analytics/identify";

describe("identify generation gate", () => {
  const memory = createRecordingMemoryAnalyticsPort();

  afterEach(() => {
    memory.clear();
    setAnalyticsPortForTests(null);
    resetIdentityGenerationForTests();
  });

  test("identifyUser writes through the port", () => {
    setAnalyticsPortForTests(memory);
    identifyUser({ id: "u1", email: "a@b.c", name: "A" });
    expect(memory.entries).toEqual([
      {
        kind: "identify",
        distinctId: "u1",
        properties: { email: "a@b.c", name: "A" },
      },
    ]);
  });

  test("apply no-ops after resetAnalytics bumps generation", () => {
    setAnalyticsPortForTests(memory);
    const { apply } = beginIdentifyGeneration();
    resetAnalytics();
    apply({ id: "u1", email: "a@b.c", name: "A" });

    expect(memory.entries).toEqual([{ kind: "reset" }]);
  });

  test("apply succeeds when generation is still current", () => {
    setAnalyticsPortForTests(memory);
    const { apply } = beginIdentifyGeneration();
    apply({ id: "u2", email: "x@y.z", name: "X" });

    expect(memory.entries).toEqual([
      {
        kind: "identify",
        distinctId: "u2",
        properties: { email: "x@y.z", name: "X" },
      },
    ]);
  });
});
