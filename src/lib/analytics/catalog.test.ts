import { describe, expect, test } from "bun:test";

import { filterSettingsUpdatedKeys, sanitizeEventProperties } from "@/lib/analytics/catalog";

describe("sanitizeEventProperties", () => {
  test("strict keeps allowlisted keys and drops undefined", () => {
    const out = sanitizeEventProperties(
      "attempt_started",
      { attempt_id: "a1", model: "m1", ghost: undefined },
      "strict",
    );
    expect(out).toEqual({ attempt_id: "a1", model: "m1" });
  });

  test("strict throws on unknown event", () => {
    expect(() => sanitizeEventProperties("not_an_event", { a: 1 }, "strict")).toThrow(
      /unknown event/,
    );
  });

  test("strict throws on forbidden property", () => {
    expect(() =>
      sanitizeEventProperties("attempt_started", { attempt_id: "a1", extra: "nope" }, "strict"),
    ).toThrow(/forbids property/);
  });

  test("strip drops unknown event and forbidden keys", () => {
    expect(sanitizeEventProperties("not_an_event", { a: 1 }, "strip")).toEqual({});
    expect(
      sanitizeEventProperties(
        "attempt_blocked",
        { reason: "concurrency_reject", meter: "steps", capability: "run" },
        "strip",
      ),
    ).toEqual({ reason: "concurrency_reject", capability: "run" });
  });
});

describe("filterSettingsUpdatedKeys", () => {
  test("keeps allowlisted keys only", () => {
    expect(
      filterSettingsUpdatedKeys(["agentMode", "workspaceRoot", "approvals", "selectedModelId"]),
    ).toEqual(["agentMode", "selectedModelId"]);
  });
});
