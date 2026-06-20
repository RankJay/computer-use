import { describe, expect, test } from "bun:test";

import {
  buildCompletionVerifierPrompt,
  buildContinuationMessage,
} from "@/agent/session/liveCompletionVerifier";

describe("liveCompletionVerifier", () => {
  test("verifier prompt asks for outcome judgment instead of text matching", () => {
    const prompt = buildCompletionVerifierPrompt({
      objective: "Open Gmail and draft an email",
      assistantText: "I captured the screen and saw VS Code.",
      continuationCount: 1,
    });

    expect(prompt).toContain("Original objective:\nOpen Gmail and draft an email");
    expect(prompt).toContain("Latest assistant final text:\nI captured the screen");
    expect(prompt).toContain('Return "continue"');
    expect(prompt).toContain("concrete evidence");
    expect(prompt).toContain("ui_focus_type succeeded");
  });

  test("continuation message carries verifier reason and next instruction", () => {
    const message = buildContinuationMessage({
      status: "continue",
      reason: "Gmail is not open yet.",
      nextInstruction: "Open Chrome and navigate to Gmail.",
    });

    expect(message).toEqual({
      role: "user",
      content:
        "Continue the current task.\n\nVerifier reason:\nGmail is not open yet.\n\nNext instruction:\nOpen Chrome and navigate to Gmail.\n\nUse tools now if the next instruction involves UI interaction. Do not summarize prior observations as a final answer unless the requested end state is now reached, blocked, or ready for user handoff. For text entry, call ui_focus_type instead of saying that you will click or type. Do not repeat ui_focus_type with the same coordinates and text if it already succeeded in this run.",
    });
  });
});
