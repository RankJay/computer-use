import { describe, expect, test } from "bun:test";

import {
  buildLiveCapabilitiesLine,
  buildLiveMessages,
  buildLivePromptBundle,
  buildLiveSystemPrompt,
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
    expect(system).toContain("do not rely on an earlier screenshot");
    expect(system).toContain("until the requested end state is reached");
    expect(system).toContain("do not narrate or explain the screenshot");
    expect(system).toContain("pixels from the top-left");
    expect(system).toContain("ui_focus_type");
    expect(system).toContain("Do not repeat the same ui_focus_type call");
    expect(system).toContain("Never use emojis");
  });

  test("prompt bundle wires capabilities into system and user messages", () => {
    const bundle = buildLivePromptBundle({
      nativeBridge: false,
      hostOs: "linux",
      uiAutomationEnabled: false,
      workspaceRoot: "/tmp/ws",
      conversationTimeline: [{ id: "u1", at: 1, kind: "user", text: "hello" }],
    });

    expect(bundle.system).toContain(bundle.capabilitiesLine);
    expect(bundle.messages).toHaveLength(1);
    expect(bundle.messages[0]).toMatchObject({ role: "user" });
    expect(bundle.messages[0]?.content).toContain(bundle.capabilitiesLine);
    expect(bundle.messages[0]?.content).toContain("/tmp/ws");
    expect(bundle.messages[0]?.content).toContain("hello");
    expect(bundle.capabilitiesLine).toContain("Web build");
  });

  test("live messages include the prior conversation and current runtime context", () => {
    const messages = buildLiveMessages("Runtime capabilities.", "D:\\Projects\\actuate", [
      { id: "u1", at: 1, kind: "user", text: "I want you to open chrome and search for" },
      {
        id: "a1",
        at: 2,
        kind: "assistant",
        status: "complete",
        text: "What would you like me to search for in Chrome?",
      },
      { id: "u2", at: 3, kind: "user", text: "economics" },
    ]);

    expect(messages).toEqual([
      { role: "user", content: "I want you to open chrome and search for" },
      {
        role: "assistant",
        content: "What would you like me to search for in Chrome?",
      },
      {
        role: "user",
        content:
          "Runtime capabilities.\n\nWorkspace root: D:\\Projects\\actuate\n\nUser task:\neconomics",
      },
    ]);
  });

  test("live messages preserve activity summaries as assistant context", () => {
    const messages = buildLiveMessages("caps", null, [
      { id: "u1", at: 1, kind: "user", text: "run tests" },
      {
        id: "act1",
        at: 2,
        kind: "activity",
        taskId: "task-1",
        status: "completed",
        rows: [{ id: "r1", title: "Terminal", detail: "exit 0", surface: "thought" }],
      },
      { id: "u2", at: 3, kind: "user", text: "continue" },
    ]);

    expect(messages[1]).toEqual({
      role: "assistant",
      content: "Agent activity (completed):\n- Terminal: exit 0",
    });
  });
});
