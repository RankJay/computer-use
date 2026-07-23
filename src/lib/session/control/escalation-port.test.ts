import { describe, expect, mock, test } from "bun:test";

import { createEscalationPort } from "./escalation-port";
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
});
