import { describe, expect, test } from "bun:test";

import { capabilityUsesImageModelOutput, imageToolToModelOutput } from "./image-model-output";

describe("imageToolToModelOutput", () => {
  test("empty clipboard stays text", () => {
    const output = imageToolToModelOutput({
      toolCallId: "t1",
      input: {},
      output: { width: 0, height: 0, mimeType: "image/png", base64: "", empty: true },
    });
    expect(output.type).toBe("text");
  });

  test("screenshot becomes multimodal content with geometry text", () => {
    const output = imageToolToModelOutput({
      toolCallId: "t1",
      input: { target: "display" },
      output: {
        width: 100,
        height: 50,
        mimeType: "image/png",
        base64: "aaaa",
        bounds: { x: 10, y: 20, width: 200, height: 100 },
        scale: 2,
      },
    });
    expect(output.type).toBe("content");
    if (output.type !== "content") return;
    expect(output.value).toHaveLength(2);
    expect(output.value[0]).toMatchObject({ type: "text" });
    expect(output.value[1]).toMatchObject({
      type: "file",
      mediaType: "image/png",
      data: { type: "data", data: "aaaa" },
    });
  });

  test("capabilityUsesImageModelOutput", () => {
    expect(capabilityUsesImageModelOutput("screenshot")).toBe(true);
    expect(capabilityUsesImageModelOutput("screenshot_region")).toBe(true);
    expect(capabilityUsesImageModelOutput("read_clipboard_image")).toBe(true);
    expect(capabilityUsesImageModelOutput("read_clipboard")).toBe(false);
  });
});
