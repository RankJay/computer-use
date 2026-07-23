import { describe, expect, test } from "bun:test";

import { createOsLease } from "./os-lease";

describe("OsLease", () => {
  test("grants desktop lease to first Attempt; re-entrant for same holder", () => {
    const lease = createOsLease();
    expect(lease.acquire("a1", "desktop")).toEqual({ outcome: "granted" });
    expect(lease.acquire("a1", "desktop")).toEqual({ outcome: "granted" });
    expect(lease.holder()?.attemptId).toBe("a1");
  });

  test("rejects second Attempt while first holds", () => {
    const lease = createOsLease();
    expect(lease.acquire("a1", "desktop").outcome).toBe("granted");
    expect(lease.acquire("a2", "desktop")).toEqual({
      outcome: "rejected",
      holderAttemptId: "a1",
    });
  });

  test("release frees lease for another Attempt", () => {
    const lease = createOsLease();
    lease.acquire("a1", "desktop");
    lease.release("a1");
    expect(lease.holder()).toBeNull();
    expect(lease.acquire("a2", "desktop")).toEqual({ outcome: "granted" });
  });

  test("release of non-holder is a no-op", () => {
    const lease = createOsLease();
    lease.acquire("a1", "desktop");
    lease.release("a2");
    expect(lease.holder()?.attemptId).toBe("a1");
  });

  test("clear drops any holder", () => {
    const lease = createOsLease();
    lease.acquire("a1", "desktop");
    lease.clear();
    expect(lease.holder()).toBeNull();
  });
});
