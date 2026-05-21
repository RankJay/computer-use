import { describe, expect, test } from "bun:test";

import {
  buildLiveCapabilitiesLine,
  buildLivePromptBundle,
  buildLiveSystemPrompt,
  buildLiveUserMessage,
} from "@/agent/session/liveSystemPrompt";

describe("liveSystemPrompt", () => {
  test("system prompt includes runtime capabilities and UI automation guidance", () => {
    const capabilitiesLine = buildLiveCapabilitiesLine({
      nativeBridge: true,
      hostOs: "windows",
      uiAutomationEnabled: true,
    });
    const system = buildLiveSystemPrompt(capabilitiesLine);

    expect(system).toContain(capabilitiesLine);
    expect(system).toContain("Actuate");
    expect(system).toContain("display_capture");
    expect(system).toContain("pointer_move");
    expect(system).toContain("copy_file");
    expect(system).toContain("Never use emojis");
  });

  test("user message includes workspace root and task", () => {
    const capabilitiesLine = "Runtime capabilities.";
    const userMessage = buildLiveUserMessage(
      capabilitiesLine,
      "D:\\Projects\\actuate",
      "List files",
    );

    expect(userMessage).toContain(capabilitiesLine);
    expect(userMessage).toContain("D:\\Projects\\actuate");
    expect(userMessage).toContain("List files");
  });

  test("unset workspace root shows settings hint", () => {
    const userMessage = buildLiveUserMessage("caps", null, "task");
    expect(userMessage).toContain("(workspace not set");
  });

  test("prompt bundle wires capabilities into system and user messages", () => {
    const bundle = buildLivePromptBundle({
      nativeBridge: false,
      hostOs: "linux",
      uiAutomationEnabled: false,
      workspaceRoot: "/tmp/ws",
      prompt: "hello",
    });

    expect(bundle.system).toContain(bundle.capabilitiesLine);
    expect(bundle.userMessage).toContain(bundle.capabilitiesLine);
    expect(bundle.userMessage).toContain("/tmp/ws");
    expect(bundle.userMessage).toContain("hello");
    expect(bundle.capabilitiesLine).toContain("Web build");
  });
});
