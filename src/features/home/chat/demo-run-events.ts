import type { DemoRuntimeEvent } from "./types";

export const DEMO_TASK_ID = "task-demo-1";

let demoEventSeq = 0;

type DemoEventPayload = {
  [Type in DemoRuntimeEvent["type"]]: Omit<Extract<DemoRuntimeEvent, { type: Type }>, "eventId">;
}[DemoRuntimeEvent["type"]];

export function demoEvent(event: DemoEventPayload): DemoRuntimeEvent {
  demoEventSeq += 1;
  return {
    ...event,
    eventId: `demo-evt-${demoEventSeq}`,
  } as DemoRuntimeEvent;
}

/** Ordered demo events for mock stream replay. */
export const demoRunEvents: DemoRuntimeEvent[] = [
  demoEvent({
    type: "activity.marker",
    markerId: "marker-today",
    variant: "separator",
    text: "Today",
  }),
  demoEvent({
    type: "task.started",
    prompt: "Refactor the control center to show an agent activity timeline with every block type.",
    modelId: "openai/gpt-5.4",
    userMessageId: "msg-user-1",
  }),
  demoEvent({
    type: "activity.marker",
    markerId: "marker-thinking",
    text: "Thinking…",
    live: true,
    status: true,
  }),
  demoEvent({
    type: "task.status_changed",
    status: "streaming",
  }),
  demoEvent({
    type: "activity.chain_updated",
    chainId: "cot-1",
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
  }),
  demoEvent({
    type: "activity.task_updated",
    activityTaskId: "task-1",
    title: "Found project files",
    items: [
      "Searching control-center and ai-chat directories",
      { text: "Read", file: { name: "ControlCenter.tsx" } },
      { text: "Read", file: { name: "TaskPromptComposer.tsx" } },
      "Scanning 12 candidate UI blocks",
    ],
  }),
  demoEvent({
    type: "assistant.message_started",
    messageId: "msg-assistant-1",
    role: "assistant",
  }),
  demoEvent({
    type: "assistant.part_updated",
    messageId: "msg-assistant-1",
    partIndex: 0,
    part: {
      type: "reasoning",
      text: "The user wants a demo transcript that exercises reasoning, tools, sources, and markdown output. I'll anchor each turn in MessageScroller and keep status rows as markers.",
      state: "done",
    },
  }),
  demoEvent({
    type: "assistant.part_updated",
    messageId: "msg-assistant-1",
    partIndex: 1,
    part: {
      type: "source-url",
      sourceId: "src-1",
      url: "https://ui.shadcn.com/docs/components/message-scroller",
      title: "Message Scroller",
    },
  }),
  demoEvent({
    type: "assistant.part_updated",
    messageId: "msg-assistant-1",
    partIndex: 2,
    part: {
      type: "source-url",
      sourceId: "src-2",
      url: "https://elements.ai-sdk.dev/components/tool",
      title: "AI Elements Tool",
    },
  }),
  demoEvent({
    type: "assistant.part_updated",
    messageId: "msg-assistant-1",
    partIndex: 3,
    part: {
      type: "text",
      text: `I'll use **shadcn MessageScroller** for scroll behavior and **AI Elements** for semantic blocks.

Here's the split:

- Transcript shell: \`MessageScroller\`
- User prompts: \`Message\` + \`Bubble\`
- Assistant markdown: \`MessageResponse\`
- Tools and approvals: \`Tool\` + \`Confirmation\``,
    },
  }),
  demoEvent({
    type: "assistant.message_finished",
    messageId: "msg-assistant-1",
  }),
  demoEvent({
    type: "assistant.message_started",
    messageId: "msg-assistant-2",
    role: "assistant",
  }),
  demoEvent({
    type: "assistant.part_updated",
    messageId: "msg-assistant-2",
    partIndex: 0,
    part: {
      type: "dynamic-tool",
      toolName: "delete_path",
      toolCallId: "tool-delete-pending",
      state: "input-streaming",
      input: {},
    },
  }),
  demoEvent({
    type: "assistant.part_updated",
    messageId: "msg-assistant-2",
    partIndex: 1,
    part: {
      type: "dynamic-tool",
      toolName: "delete_path",
      toolCallId: "tool-delete-approval",
      state: "approval-requested",
      input: { filePath: "/tmp/example.txt", confirm: false },
      approval: { id: "approval-1" },
    },
  }),
  demoEvent({
    type: "assistant.part_updated",
    messageId: "msg-assistant-2",
    partIndex: 2,
    part: {
      type: "dynamic-tool",
      toolName: "search_files",
      toolCallId: "tool-search-running",
      state: "input-available",
      input: { query: "TaskPromptComposer.tsx", glob: "**/*.tsx" },
    },
  }),
  demoEvent({
    type: "assistant.part_updated",
    messageId: "msg-assistant-2",
    partIndex: 3,
    part: {
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
    },
  }),
  demoEvent({
    type: "assistant.part_updated",
    messageId: "msg-assistant-2",
    partIndex: 4,
    part: {
      type: "dynamic-tool",
      toolName: "run_shell",
      toolCallId: "tool-shell-error",
      state: "output-error",
      input: { program: "bun", args: ["test", "agent-transcript"] },
      errorText: "Command exited with code 1: expected scroll anchor on user turn",
    },
  }),
  demoEvent({
    type: "assistant.part_updated",
    messageId: "msg-assistant-2",
    partIndex: 5,
    part: {
      type: "text",
      text: "Tool lifecycle blocks are wired. Approval, running, completed, and error states all render in the transcript.",
    },
  }),
  demoEvent({
    type: "assistant.message_finished",
    messageId: "msg-assistant-2",
  }),
  demoEvent({
    type: "activity.marker",
    markerId: "marker-border",
    variant: "border",
    text: "Explored 4 files",
  }),
  demoEvent({
    type: "assistant.message_started",
    messageId: "msg-assistant-3",
    role: "assistant",
  }),
  demoEvent({
    type: "assistant.part_updated",
    messageId: "msg-assistant-3",
    partIndex: 0,
    part: {
      type: "text",
      text: "Demo transcript is ready. Replace this fixture with a live stream when orchestration lands — the row renderer stays the same.",
    },
  }),
  demoEvent({
    type: "assistant.message_finished",
    messageId: "msg-assistant-3",
  }),
  demoEvent({
    type: "usage.updated",
    modelId: "openai/gpt-5.4",
    usedTokens: 12_400,
    maxTokens: 128_000,
  }),
  demoEvent({
    type: "task.completed",
    finishReason: "stop",
  }),
];

/** Clone fixture events with the submitted prompt on `task.started`. */
export function createDemoRunEvents(prompt: string): DemoRuntimeEvent[] {
  return demoRunEvents.map((event) => {
    if (event.type !== "task.started") return event;
    return Object.assign({}, event, { prompt });
  });
}
