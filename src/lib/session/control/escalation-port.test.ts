import { describe, expect, mock, test } from "bun:test";

import { createEscalationPort, resolveEscalationModeForWatch } from "./escalation-port";
import { createOsLease } from "./os-lease";

describe("EscalationPort", () => {
  test("interactive waits until resolve; does not release OS lease", async () => {
    const lease = createOsLease();
    lease.acquire("attempt-1", "desktop");
    const notify = mock((_n: { title: string; body: string }) => {});

    const port = createEscalationPort({
      mode: "interactive",
      osLease: lease,
      notifyIfUnfocused: notify,
    });

    const pending = port.escalate({
      callId: "c1",
      attemptId: "attempt-1",
      capability: "delete_path",
      input: { path: "x" },
      risk: "high",
    });

    await Promise.resolve();
    expect(notify).toHaveBeenCalled();
    expect(lease.holder()?.attemptId).toBe("attempt-1");

    port.resolve("c1", "allow");
    await expect(pending).resolves.toBe("allow");
  });

  test("park releases OS lease and times out to deny", async () => {
    const lease = createOsLease();
    lease.acquire("attempt-1", "desktop");

    const port = createEscalationPort({
      mode: "park",
      timeoutMs: 20,
      osLease: lease,
      notifyIfUnfocused: () => {},
    });

    const pending = port.escalate({
      callId: "c1",
      attemptId: "attempt-1",
      capability: "mouse_click",
      input: {},
      risk: "high",
    });

    await Promise.resolve();
    expect(lease.holder()).toBeNull();

    await expect(pending).resolves.toBe("deny");
  });

  test("park resolve before timeout returns allow", async () => {
    const lease = createOsLease();
    lease.acquire("attempt-1", "desktop");

    const port = createEscalationPort({
      mode: "park",
      timeoutMs: 5_000,
      osLease: lease,
      notifyIfUnfocused: () => {},
    });

    const pending = port.escalate({
      callId: "c1",
      attemptId: "attempt-1",
      capability: "delete_path",
      input: {},
      risk: "high",
    });

    port.resolve("c1", "allow");
    await expect(pending).resolves.toBe("allow");
    expect(lease.holder()).toBeNull();
  });

  test("denyAll settles pending as deny", async () => {
    const port = createEscalationPort({
      mode: "interactive",
      notifyIfUnfocused: () => {},
    });

    const pending = port.escalate({
      callId: "c1",
      attemptId: "a1",
      capability: "delete_path",
      input: {},
      risk: "high",
    });

    port.denyAll();
    await expect(pending).resolves.toBe("deny");
  });

  test("mode function parks when Mandate is not focused", async () => {
    const lease = createOsLease();
    lease.acquire("attempt-1", "desktop");

    const port = createEscalationPort({
      mode: (request) =>
        resolveEscalationModeForWatch({
          requestAttemptId: request.attemptId,
          live: { mandateId: "m1", attemptId: "attempt-1" },
          focusedMandateId: "other-mandate",
        }),
      timeoutMs: 20,
      osLease: lease,
      notifyIfUnfocused: () => {},
    });

    const pending = port.escalate({
      callId: "c1",
      attemptId: "attempt-1",
      capability: "delete_path",
      input: {},
      risk: "high",
    });

    await Promise.resolve();
    expect(lease.holder()).toBeNull();
    await expect(pending).resolves.toBe("deny");
  });

  test("mode function stays interactive when focused on live Mandate", async () => {
    const lease = createOsLease();
    lease.acquire("attempt-1", "desktop");

    const port = createEscalationPort({
      mode: (request) =>
        resolveEscalationModeForWatch({
          requestAttemptId: request.attemptId,
          live: { mandateId: "m1", attemptId: "attempt-1" },
          focusedMandateId: "m1",
        }),
      osLease: lease,
      notifyIfUnfocused: () => {},
    });

    const pending = port.escalate({
      callId: "c1",
      attemptId: "attempt-1",
      capability: "delete_path",
      input: {},
      risk: "high",
    });

    await Promise.resolve();
    expect(lease.holder()?.attemptId).toBe("attempt-1");
    port.resolve("c1", "allow");
    await expect(pending).resolves.toBe("allow");
  });
});

describe("resolveEscalationModeForWatch", () => {
  test("interactive only when live attempt matches focus", () => {
    expect(
      resolveEscalationModeForWatch({
        requestAttemptId: "a1",
        live: { mandateId: "m1", attemptId: "a1" },
        focusedMandateId: "m1",
      }),
    ).toBe("interactive");
    expect(
      resolveEscalationModeForWatch({
        requestAttemptId: "a1",
        live: { mandateId: "m1", attemptId: "a1" },
        focusedMandateId: "m2",
      }),
    ).toBe("park");
    expect(
      resolveEscalationModeForWatch({
        requestAttemptId: "a1",
        live: null,
        focusedMandateId: "m1",
      }),
    ).toBe("park");
  });
});
