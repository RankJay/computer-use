import { afterEach, describe, expect, test } from "bun:test";

import { createRecordingMemoryAnalyticsPort } from "@/lib/analytics/adapters/recording-memory";
import {
  beginAnalyticsBufferingForTests,
  getAnalyticsPort,
  initAnalytics,
  setAnalyticsPortForTests,
} from "@/lib/analytics/client";

describe("analytics client", () => {
  afterEach(() => {
    setAnalyticsPortForTests(null);
  });

  test("disabled env resolves to noop (no buffered captures retained)", async () => {
    // Tests run without VITE_POSTHOG_ENABLED — getAnalyticsPort is noop.
    const port = getAnalyticsPort();
    port.capture("sign_out");
    await initAnalytics();
    // Still noop; nothing throws.
    getAnalyticsPort().capture("sign_in_clicked");
  });

  test("setAnalyticsPortForTests replaces the transport", () => {
    const memory = createRecordingMemoryAnalyticsPort();
    setAnalyticsPortForTests(memory);
    getAnalyticsPort().capture("sign_out");
    expect(memory.entries).toEqual([{ kind: "capture", event: "sign_out", properties: {} }]);
  });

  test("pre-resolve ops buffer then flush onto the test port", () => {
    beginAnalyticsBufferingForTests();
    const port = getAnalyticsPort();
    port.capture("sign_in_clicked");
    port.identify("u1", { email: "a@b.c", name: "A" });
    port.flush();

    const memory = createRecordingMemoryAnalyticsPort();
    setAnalyticsPortForTests(memory);

    expect(memory.entries).toEqual([
      { kind: "capture", event: "sign_in_clicked", properties: {} },
      {
        kind: "identify",
        distinctId: "u1",
        properties: { email: "a@b.c", name: "A" },
      },
      { kind: "flush" },
    ]);
  });

  test("buffered reset then identify keeps order when flushed", () => {
    beginAnalyticsBufferingForTests();
    const port = getAnalyticsPort();
    port.identify("stale", { email: "old@x.y", name: "Old" });
    port.reset();
    port.identify("fresh", { email: "new@x.y", name: "New" });

    const memory = createRecordingMemoryAnalyticsPort();
    setAnalyticsPortForTests(memory);

    expect(memory.entries).toEqual([
      {
        kind: "identify",
        distinctId: "stale",
        properties: { email: "old@x.y", name: "Old" },
      },
      { kind: "reset" },
      {
        kind: "identify",
        distinctId: "fresh",
        properties: { email: "new@x.y", name: "New" },
      },
    ]);
  });

  test("setAnalyticsPortForTests(null) drops the pending buffer", () => {
    beginAnalyticsBufferingForTests();
    getAnalyticsPort().capture("sign_out");
    setAnalyticsPortForTests(null);

    const memory = createRecordingMemoryAnalyticsPort();
    setAnalyticsPortForTests(memory);
    expect(memory.entries).toEqual([]);
  });
});
