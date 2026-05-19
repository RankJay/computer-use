import { describe, expect, test } from "bun:test";

import { joinStreamingText } from "./streamingTextJoin";

describe("joinStreamingText", () => {
  test("inserts a space after punctuation when the next chunk starts a word", () => {
    expect(joinStreamingText("guide:", "Since")).toBe("guide: Since");
  });

  test("preserves explicit whitespace between chunks", () => {
    expect(joinStreamingText("using the ", "terminal.")).toBe("using the terminal.");
  });

  test("does not alter mid-word chunk boundaries", () => {
    expect(joinStreamingText("hel", "lo")).toBe("hello");
  });
});
