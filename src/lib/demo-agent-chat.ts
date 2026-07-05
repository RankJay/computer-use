import type { DynamicToolUIPart, LanguageModelUsage, UIMessage } from "ai";

import type { AgentTranscriptRow } from "@/features/ai-chat/types";

const deleteFileToolPending = {
  type: "dynamic-tool",
  toolName: "delete_file",
  toolCallId: "tool-delete-pending",
  state: "input-streaming",
  input: {},
} satisfies DynamicToolUIPart;

const deleteFileToolApproval = {
  type: "dynamic-tool",
  toolName: "delete_file",
  toolCallId: "tool-delete-approval",
  state: "approval-requested",
  input: { filePath: "/tmp/example.txt", confirm: false },
  approval: { id: "approval-1" },
} satisfies DynamicToolUIPart;

const searchFilesToolRunning = {
  type: "dynamic-tool",
  toolName: "search_files",
  toolCallId: "tool-search-running",
  state: "input-available",
  input: { query: "TaskPromptComposer.tsx", glob: "**/*.tsx" },
} satisfies DynamicToolUIPart;

const searchFilesToolCompleted = {
  type: "dynamic-tool",
  toolName: "search_files",
  toolCallId: "tool-search-done",
  state: "output-available",
  input: { query: "ControlCenter.tsx", glob: "**/*.tsx" },
  output: {
    matches: [
      "src/features/control-center/ControlCenter.tsx",
      "src/features/control-center/TaskPromptComposer.tsx",
    ],
  },
} satisfies DynamicToolUIPart;

const runTestsToolError = {
  type: "dynamic-tool",
  toolName: "run_tests",
  toolCallId: "tool-tests-error",
  state: "output-error",
  input: { suite: "agent-transcript" },
  errorText: "1 test failed: expected scroll anchor on user turn",
} satisfies DynamicToolUIPart;

const userPromptMessage = {
  id: "msg-user-1",
  role: "user",
  parts: [
    {
      type: "text",
      text: "Refactor the control center to show an agent activity timeline with every block type.",
    },
  ],
} satisfies UIMessage;

const assistantReasoningMessage = {
  id: "msg-assistant-1",
  role: "assistant",
  parts: [
    {
      type: "reasoning",
      text: "The user wants a demo transcript that exercises reasoning, tools, sources, and markdown output. I'll anchor each turn in MessageScroller and keep status rows as markers.",
      state: "done",
    },
    {
      type: "source-url",
      sourceId: "src-1",
      url: "https://ui.shadcn.com/docs/components/message-scroller",
      title: "Message Scroller",
    },
    {
      type: "source-url",
      sourceId: "src-2",
      url: "https://elements.ai-sdk.dev/components/tool",
      title: "AI Elements Tool",
    },
    {
      type: "text",
      text: `I'll use **shadcn MessageScroller** for scroll behavior and **AI Elements** for semantic blocks.

Here's the split:

- Transcript shell: \`MessageScroller\`
- User prompts: \`Message\` + \`Bubble\`
- Assistant markdown: \`MessageResponse\`
- Tools and approvals: \`Tool\` + \`Confirmation\``,
    },
  ],
} satisfies UIMessage;

const assistantToolsMessage = {
  id: "msg-assistant-2",
  role: "assistant",
  parts: [
    deleteFileToolPending,
    deleteFileToolApproval,
    searchFilesToolRunning,
    searchFilesToolCompleted,
    runTestsToolError,
    {
      type: "text",
      text: "Tool lifecycle blocks are wired. Approval, running, completed, and error states all render in the transcript.",
    },
  ],
} satisfies UIMessage;

const assistantFinalMessage = {
  id: "msg-assistant-3",
  role: "assistant",
  parts: [
    {
      type: "text",
      text: "Demo transcript is ready. Replace this fixture with `useChat()` when orchestration lands — the row renderer stays the same.",
    },
  ],
} satisfies UIMessage;

export const demoAgentTranscriptRows: AgentTranscriptRow[] = [
  {
    type: "marker",
    id: "marker-today",
    variant: "separator",
    text: "Today",
  },
  {
    type: "message",
    id: userPromptMessage.id,
    message: userPromptMessage,
    scrollAnchor: true,
  },
  {
    type: "marker",
    id: "marker-thinking",
    text: "Thinking…",
    live: true,
    status: true,
  },
  {
    type: "chain-of-thought",
    id: "cot-1",
    steps: [
      {
        label: "Searching project for control-center files",
        status: "complete",
        searchResults: ["ControlCenter.tsx", "TaskPromptComposer.tsx"],
      },
      {
        label: "Reading settings for model defaults",
        status: "complete",
        description: "Agent mode, max steps, and provider caps loaded from saved settings.",
      },
      {
        label: "Drafting transcript row mapping",
        status: "active",
        description: "Mapping AI SDK parts to shadcn shell + AI Elements blocks.",
      },
    ],
  },
  {
    type: "task",
    id: "task-1",
    title: "Found project files",
    items: [
      "Searching control-center and ai-chat directories",
      { text: "Read", file: { name: "ControlCenter.tsx" } },
      { text: "Read", file: { name: "TaskPromptComposer.tsx" } },
      "Scanning 12 candidate UI blocks",
    ],
  },
  {
    type: "message",
    id: assistantReasoningMessage.id,
    message: assistantReasoningMessage,
  },
  {
    type: "message",
    id: assistantToolsMessage.id,
    message: assistantToolsMessage,
  },
  {
    type: "marker",
    id: "marker-border",
    variant: "border",
    text: "Explored 4 files",
  },
  {
    type: "message",
    id: assistantFinalMessage.id,
    message: assistantFinalMessage,
  },
];

export const demoContextUsage = {
  usedTokens: 12_400,
  maxTokens: 128_000,
  modelId: "openai/gpt-4o",
  usage: {
    inputTokens: 8_200,
    outputTokens: 3_100,
    totalTokens: 11_300,
    inputTokenDetails: {
      noCacheTokens: 7_750,
      cacheReadTokens: 450,
      cacheWriteTokens: undefined,
    },
    outputTokenDetails: {
      textTokens: 2_000,
      reasoningTokens: 1_100,
    },
  } satisfies LanguageModelUsage,
};
