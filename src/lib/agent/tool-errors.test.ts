import { describe, expect, test } from "bun:test";

import { formatCapabilityError, formatToolStreamError } from "./tool-errors";

describe("formatCapabilityError", () => {
  test("joins code, message, details, and cause", () => {
    expect(
      formatCapabilityError({
        code: "permission_denied",
        message: "blocked",
        details: "path outside workspace",
        cause: "policy",
      }),
    ).toBe("[permission_denied] blocked\npath outside workspace\nCause: policy");
  });

  test("omits optional fields", () => {
    expect(formatCapabilityError({ code: "x", message: "y" })).toBe("[x] y");
  });
});

describe("formatToolStreamError", () => {
  test("formats structured capability-shaped objects", () => {
    const formatted = formatToolStreamError({
      code: "invalid_input",
      message: "bad args",
    });
    expect(formatted).toContain("[invalid_input]");
    expect(formatted).toContain("bad args");
  });

  test("parses JSON command errors from Error.message", () => {
    const formatted = formatToolStreamError(
      new Error(JSON.stringify({ code: "fs_error", message: "ENOENT", details: "missing" })),
    );
    expect(formatted).toContain("[fs_error]");
    expect(formatted).toContain("ENOENT");
    expect(formatted).toContain("missing");
  });

  test("returns plain Error.message when not JSON", () => {
    expect(formatToolStreamError(new Error("boom"))).toBe("boom");
  });

  test("parses JSON from string errors", () => {
    const formatted = formatToolStreamError(
      JSON.stringify({ code: "timeout", message: "took too long" }),
    );
    expect(formatted).toContain("[timeout]");
    expect(formatted).toContain("took too long");
  });

  test("returns plain string when not JSON", () => {
    expect(formatToolStreamError("raw failure")).toBe("raw failure");
  });

  test("falls back via mapInvokeError for unknown shapes", () => {
    const formatted = formatToolStreamError(42);
    expect(formatted.length).toBeGreaterThan(0);
  });
});
