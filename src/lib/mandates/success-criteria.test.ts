import { describe, expect, test } from "bun:test";

import {
  DEFAULT_SUCCESS_CRITERIA,
  nextMandateStatusAfterAttemptSettle,
  parseSuccessCriteria,
} from "./success-criteria";

describe("parseSuccessCriteria", () => {
  test("defaults invalid / missing to attempt_completed", () => {
    expect(parseSuccessCriteria(null)).toEqual(DEFAULT_SUCCESS_CRITERIA);
    expect(parseSuccessCriteria({})).toEqual(DEFAULT_SUCCESS_CRITERIA);
  });

  test("accepts manual", () => {
    expect(parseSuccessCriteria({ version: 1, kind: "manual" })).toEqual({
      version: 1,
      kind: "manual",
    });
  });
});

describe("nextMandateStatusAfterAttemptSettle", () => {
  test("attempt_completed → done on completed", () => {
    expect(
      nextMandateStatusAfterAttemptSettle({ version: 1, kind: "attempt_completed" }, "completed"),
    ).toBe("done");
  });

  test("manual → armed on completed (Mandate stays open)", () => {
    expect(nextMandateStatusAfterAttemptSettle({ version: 1, kind: "manual" }, "completed")).toBe(
      "armed",
    );
  });

  test("failed / cancelled", () => {
    expect(
      nextMandateStatusAfterAttemptSettle({ version: 1, kind: "attempt_completed" }, "failed"),
    ).toBe("failed");
    expect(nextMandateStatusAfterAttemptSettle({ version: 1, kind: "manual" }, "cancelled")).toBe(
      "armed",
    );
  });
});
