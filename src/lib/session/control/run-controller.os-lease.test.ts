import { describe, expect, test } from "bun:test";

import { DEFAULT_SECRETS, DEFAULT_SETTINGS } from "@/lib/settings/defaults";

import { createEmptyMandateProjection } from "../projection";
import { createOsLease } from "./os-lease";
import { createRunController, type ProduceRun } from "./run-controller";

describe("RunController OS lease release", () => {
  test("releases lease on cancel and on settle", async () => {
    const lease = createOsLease();
    let resolveHold: (() => void) | undefined;
    const hold = new Promise<void>((resolve) => {
      resolveHold = resolve;
    });

    const producer: ProduceRun = async ({ attemptId, osLease, signal }) => {
      expect(osLease?.acquire(attemptId, "desktop").outcome).toBe("granted");
      await new Promise<void>((resolve) => {
        if (signal.aborted) {
          resolve();
          return;
        }
        signal.addEventListener("abort", () => resolve(), { once: true });
        void hold.then(() => resolve());
      });
    };

    const controller = createRunController({
      append: () => {},
      beginAttempt: () => {},
      clearAttempt: () => {},
      getProjection: () => createEmptyMandateProjection(),
      produceRun: producer,
      osLease: lease,
    });

    const started = controller.start({
      prompt: "hi",
      modelId: "openai/gpt-5.4",
      settings: DEFAULT_SETTINGS,
      secrets: DEFAULT_SECRETS,
    });

    await Promise.resolve();
    expect(lease.holder()).not.toBeNull();

    await controller.cancel();
    await started;

    expect(lease.holder()).toBeNull();
    resolveHold?.();
  });

  test("settle path releases lease in finally", async () => {
    const lease = createOsLease();

    const producer: ProduceRun = async ({ attemptId, osLease }) => {
      osLease?.acquire(attemptId, "desktop");
    };

    const controller = createRunController({
      append: () => {},
      beginAttempt: () => {},
      clearAttempt: () => {},
      getProjection: () => createEmptyMandateProjection(),
      produceRun: producer,
      osLease: lease,
    });

    await controller.start({
      prompt: "hi",
      modelId: "openai/gpt-5.4",
      settings: DEFAULT_SETTINGS,
      secrets: DEFAULT_SECRETS,
    });

    expect(lease.holder()).toBeNull();
  });
});
