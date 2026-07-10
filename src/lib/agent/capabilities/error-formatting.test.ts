import { describe, expect, test } from "bun:test";

import { formatCapabilityError, formatToolStreamError } from "../tool-errors";
import { mapInvokeError } from "./tauri-invoke";

describe("capability error formatting", () => {
  test("mapInvokeError reads structured command errors", () => {
    expect(
      mapInvokeError({
        code: "find_element_timeout",
        message: "Finding accessibility element timed out",
        details: "hwnd=1640006",
      }),
    ).toEqual({
      code: "find_element_timeout",
      message: "Finding accessibility element timed out",
      details: "hwnd=1640006",
    });
  });

  test("mapInvokeError parses JSON command errors in Error.message", () => {
    expect(
      mapInvokeError(
        new Error(
          JSON.stringify({
            code: "worker_panic",
            message: "index out of bounds",
          }),
        ),
      ),
    ).toEqual({
      code: "worker_panic",
      message: "index out of bounds",
    });
  });

  test("formatToolStreamError surfaces Error.message instead of generic text", () => {
    expect(formatToolStreamError(new Error("[find_failed] UIA search failed"))).toBe(
      "[find_failed] UIA search failed",
    );
  });

  test("formatCapabilityError includes code, message, and details", () => {
    expect(
      formatCapabilityError({
        code: "a11y_busy",
        message: "Another accessibility operation is already in progress",
        details: "retry after snapshot completes",
      }),
    ).toBe(
      "[a11y_busy] Another accessibility operation is already in progress\nretry after snapshot completes",
    );
  });
});
