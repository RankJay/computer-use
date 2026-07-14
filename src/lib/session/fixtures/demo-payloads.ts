import type { ProduceRun } from "../control/run-controller";
import type { RuntimeEventPayload } from "../events";

/**
 * Demo assistant markdown — written as a design essay, not a feature checklist.
 * Still exercises GFM + plugins wired in MessageResponse: code, math, mermaid, cjk.
 * (Vega-Lite omitted — no custom renderer registered.)
 */
export const DEMO_MARKDOWN_SHOWCASE = `# The quiet craft of an answer

An agent response is a **composition**, not a dump. *Space, weight, and sequence* do the talking — so the reader never has to fight the page.

This demo is that composition: every typographic voice Actuate can sing, arranged the way a senior designer would arrange them — with intention, not inventory.[^streamdown]

[^streamdown]: Rendered by [Streamdown](https://github.com/vercel/streamdown) · https://streamdown.ai

![A wide field of soft light — the empty canvas before the first line](https://streamdown.ai/og.png)

---

## Begin with breath

Before hierarchy, before code, before diagrams — a single paragraph that earns the scroll. ***Bold italic*** for the one idea you want to land. \`inline code\` for the precise name of a thing. ~~Strike~~ what you outgrew, so the past stays visible but quiet.

> Good interfaces disappear the moment they work.
>
> > Great answers do the same — they leave only understanding.

### What we protect

- One idea per section
  - One visual beat per idea
    - Nothing that exists only to prove a feature
- Hierarchy that *means* something
- Silence between the loud parts

### How we build it

1. Establish the voice
2. Narrow the focus
   1. Cut until it hurts a little
   2. Put one detail back — the one that makes it human
3. Close with clarity, not applause

### Still on the desk

- [x] Lead that earns attention without shouting
- [X] Type ramp that feels like a single instrument
- [ ] Polish the last 10% — the part nobody names
  - [x] Nested checks for nested craft
  - [ ] Ship when the silence feels right

---

## The type ramp

Not labels. *Weights.* Read this column as a single scale — from display to whisper:

# Display
## Title
### Headline
#### Subhead
##### Label
###### Caption

Each step is smaller on purpose. If two levels feel interchangeable, one of them is lying.

#### A note on restraint

##### When everything is emphasized
###### Nothing is

---

## Decisions, in a glance

| Choice | Weight | Why it stays |
|:-------|:------:|-------------:|
| Lead paragraph | Heavy | Sets the emotional tempo |
| Lists | Medium | Structure without ceremony |
| Tables | Light | Compare, then move on |
| Code | Focal | Proof, not decoration |
| Math | Rare | Earns its quiet stage |
| Diagrams | Rare | Show the system breathing |

---

## Make the invisible visible

Rhythm in UI is often a function — literally. The easing you feel is $$f(t) = t^2(3 - 2t)$$; the sum of small spacings is $$\\sum_{i=1}^{n} s_i$$.

When the page needs a held breath — display math:

$$
\\int_{0}^{1} \\!\\!\\bigl(1 - (1 - t)^3\\bigr)\\, dt = \\tfrac{3}{4}
$$

A transform in two dimensions — how layout *and* type move together:

$$
\\begin{bmatrix}
s & 0 \\\\
0 & s
\\end{bmatrix}
\\begin{bmatrix}
x \\\\
y
\\end{bmatrix}
=
\\begin{bmatrix}
sx \\\\
sy
\\end{bmatrix}
$$

And when intent branches:

$$
\\textit{pace}(x) = \\begin{cases}
\\text{linger} & \\text{if } x \\text{ is rare} \\\\
\\text{vanish} & \\text{if } x \\text{ is habitual}
\\end{cases}
$$

---

## How an answer is composed

### The flow

\`\`\`mermaid
graph TD
  A[Prompt arrives] --> B{Is the idea clear?}
  B -->|No| C[Ask one sharper question]
  C --> B
  B -->|Yes| D[Shape the hierarchy]
  D --> E[Place proof — code, table, diagram]
  E --> F[Leave room to breathe]
  F --> G[Send]
\`\`\`

### The conversation underneath

\`\`\`mermaid
sequenceDiagram
  participant You
  participant Agent
  participant Craft

  You->>Agent: A messy intent
  Agent->>Craft: What deserves weight?
  Craft-->>Agent: Hierarchy, pause, proof
  Agent-->>You: Something that feels inevitable
\`\`\`

### The states of attention

\`\`\`mermaid
stateDiagram-v2
  [*] --> Reading
  Reading --> Pausing: a wide margin
  Pausing --> Reading: curiosity returns
  Reading --> Focusing: a code block lands
  Focusing --> Reading: understanding sticks
  Reading --> Done: nothing left to prove
  Done --> [*]
\`\`\`

---

## The same idea, in materials

A tiny contract for pacing — TypeScript as product language:

\`\`\`typescript
type Beat = "lead" | "proof" | "pause" | "close";

interface Answer {
  beats: Beat[];
  emphasis: "one idea" | "too many";
}

function compose(intent: string): Answer {
  const beats: Beat[] = ["lead", "proof", "pause", "close"];
  return {
    beats,
    emphasis: intent.trim().split(/\\s+/).length > 40 ? "too many" : "one idea",
  };
}
\`\`\`

Spacing as tokens — CSS you can feel:

\`\`\`css
:root {
  --rhythm: 1.25;
  --space-whisper: 0.5rem;
  --space-breath: calc(var(--space-whisper) * var(--rhythm));
  --space-hold: calc(var(--space-breath) * var(--rhythm));
}

.answer {
  display: flex;
  flex-direction: column;
  gap: var(--space-breath);
  max-width: 42rem;
}
\`\`\`

A soft calculator for the golden section — when you need numbers to justify taste:

\`\`\`python
def scale(base: float, steps: int = 6, ratio: float = 1.25) -> list[float]:
    """Type sizes from whisper to display."""
    return [round(base * (ratio**i), 2) for i in range(steps)]

print(scale(12))  # caption → display
\`\`\`

And the quiet install — tools behind the curtain:

\`\`\`bash
# The canvas, not the painting
bun add streamdown @streamdown/code @streamdown/math @streamdown/mermaid @streamdown/cjk
\`\`\`

---

## One world, many scripts

Typography is not Latin-only. The same breath must hold across scripts:

**Chinese** — **排版是呼吸。** 字距、行距、留白，同属一种安静。

**Japanese** — *余白はデザインです。* 詰めることより、置くことを信じる。

**Korean** — ~~장식~~ 대신 **여백**. 읽히는 속도가 곧 존중이다.

---

## Close

When the last line lands, stop. No encore. No feature roll call.

---

&copy; 2026 — Actuate · crafted to be read, not scanned
`;

/** Payload-only demo fixture for session-engine tests (no envelopes). */
export function createDemoPayloads(prompt: string): RuntimeEventPayload[] {
  return [
    {
      type: "activity.marker",
      markerId: "marker-today",
      variant: "separator",
      text: "Today",
    },
    {
      type: "task.started",
      prompt,
      modelId: "openai/gpt-5.4",
      agentMode: "demo",
      userMessageId: "msg-user-1",
    },
    {
      type: "activity.marker",
      markerId: "marker-thinking",
      text: "Thinking…",
      live: true,
      status: true,
    },
    {
      type: "task.status_changed",
      status: "streaming",
    },
    {
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
    },
    {
      type: "activity.task_updated",
      activityTaskId: "task-1",
      title: "Found project files",
      items: [
        "Searching control-center and ai-chat directories",
        { text: "Read", file: { name: "ControlCenter.tsx" } },
        { text: "Read", file: { name: "TaskPromptComposer.tsx" } },
        "Scanning 12 candidate UI blocks",
      ],
    },
    {
      type: "assistant.message_started",
      messageId: "msg-assistant-1",
      role: "assistant",
    },
    {
      type: "assistant.part_updated",
      messageId: "msg-assistant-1",
      partIndex: 0,
      part: {
        type: "text",
        text: DEMO_MARKDOWN_SHOWCASE,
      },
    },
    {
      type: "assistant.message_finished",
      messageId: "msg-assistant-1",
    },
    {
      type: "usage.updated",
      modelId: "openai/gpt-5.4",
      usedTokens: 12_400,
      maxTokens: 128_000,
    },
    {
      type: "task.completed",
      finishReason: "stop",
    },
  ];
}

/**
 * Test producer: appends payloads in order. Yields between events so cancel can abort.
 * Rewrites task.started prompt/model from config; supports omitUserMessage for retry.
 */
export function createTestDemoProducer(
  payloads: RuntimeEventPayload[] = createDemoPayloads("demo"),
): ProduceRun {
  return async ({ config, taskId, signal, append }) => {
    for (const payload of payloads) {
      if (signal.aborted) break;
      await Promise.resolve();
      if (signal.aborted) break;

      if (payload.type === "task.started") {
        append({
          ...payload,
          prompt: config.prompt,
          modelId: config.modelId,
          agentMode: "demo",
          userMessageId: config.isRetry ? undefined : `user-${taskId}`,
          omitUserMessage: config.isRetry === true,
        });
        continue;
      }

      if (payload.type === "usage.updated") {
        append({ ...payload, modelId: config.modelId });
        continue;
      }

      append(payload);
    }
  };
}
