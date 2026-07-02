import { zodSchema } from "ai";
import { z } from "zod";

import type { LiveAgentToolContext } from "@/agent/agentSessionContext";
import { AGENT_TOOL_NAMES } from "@/agent/toolContract";
import { defineActuateTool } from "@/agent/tools/defineActuateTool";
import { shortenForTimeline } from "@/agent/tools/toolTimeline";

export function createClipboardReadTool(ctx: LiveAgentToolContext) {
  return defineActuateTool(ctx, {
    toolName: AGENT_TOOL_NAMES.CLIPBOARD_READ,
    description:
      "Read plain text from the system clipboard (desktop only). Use when the user refers to copied content or paste buffer text.",
    inputSchema: zodSchema(z.object({})),
    nativeGate: "clipboard",
    permission: () => ({
      summary: "Read system clipboard",
      rationale: "The model requested clipboard text.",
      details: "Reads UTF-8/plain text from the OS clipboard.",
    }),
    deniedError: "User denied clipboard read.",
    describe: () => "clipboard",
    execute: async (_input, _executeCtx, native) => {
      const result = await native.clipboardReadText();
      return {
        ok: true,
        value: { text: result.text, length: result.text.length },
        timelineSummary: shortenForTimeline(result.text),
      };
    },
  });
}

export function createClipboardWriteTool(ctx: LiveAgentToolContext) {
  return defineActuateTool(ctx, {
    toolName: AGENT_TOOL_NAMES.CLIPBOARD_WRITE,
    description:
      "Write plain text to the system clipboard without pasting. Pair with clipboard_paste to insert into the focused app, or use before manual user paste.",
    inputSchema: zodSchema(z.object({ text: z.string() })),
    nativeGate: "uiAutomation",
    permission: (input) => ({
      summary: `Write ${input.text.length} chars to clipboard`,
      rationale: "The model will place text on the system clipboard.",
      details: `bytes: ${input.text.length}`,
    }),
    deniedError: "Denied (permission or UI automation disabled).",
    describe: (input) => `${input.text.length} chars`,
    execute: async (input, _executeCtx, native) => {
      await native.clipboardWriteText(input.text);
      return {
        ok: true,
        value: { length: input.text.length },
        timelineSummary: `Wrote ${input.text.length} chars to clipboard`,
      };
    },
  });
}

export function createClipboardPasteTool(ctx: LiveAgentToolContext) {
  return defineActuateTool(ctx, {
    toolName: AGENT_TOOL_NAMES.CLIPBOARD_PASTE,
    description:
      "Paste the current clipboard into the focused application using the OS paste shortcut (Ctrl+V / Cmd+V). Use after clipboard_write or when the clipboard already has the desired text.",
    inputSchema: zodSchema(z.object({})),
    nativeGate: "uiAutomation",
    permission: () => ({
      summary: "Paste from clipboard",
      rationale: "The model will send the OS paste shortcut to the focused app.",
      details: "Ctrl+V on Windows/Linux; Cmd+V on macOS.",
    }),
    deniedError: "Denied (permission or UI automation disabled).",
    describe: () => "paste",
    execute: async (_input, _executeCtx, native) => {
      await native.clipboardPaste();
      return {
        ok: true,
        value: { pasted: true },
        timelineSummary: "Sent paste shortcut to focused app",
      };
    },
  });
}
