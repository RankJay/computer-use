import { describe, expect, test } from "bun:test";

import { applyFilePatches } from "@/agent/tools/filePatchLogic";

describe("applyFilePatches", () => {
  test("replaces first occurrence by default", () => {
    const result = applyFilePatches("hello world hello", [{ search: "hello", replace: "hi" }]);
    expect(result.content).toBe("hi world hello");
    expect(result.applied).toBe(1);
  });

  test("replaceAll replaces every match", () => {
    const result = applyFilePatches("aa-bb-aa", [{ search: "aa", replace: "x", replaceAll: true }]);
    expect(result.content).toBe("x-bb-x");
    expect(result.applied).toBe(2);
  });

  test("throws when search is missing", () => {
    expect(() => applyFilePatches("content", [{ search: "missing", replace: "x" }])).toThrow(
      /not found/,
    );
  });
});
