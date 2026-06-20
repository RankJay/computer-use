import { generateObject, type LanguageModel, type ModelMessage } from "ai";
import { z } from "zod";

export const MAX_COMPLETION_CONTINUATIONS = 3;

const completionVerdictSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("complete"),
    reason: z.string(),
  }),
  z.object({
    status: z.literal("blocked"),
    reason: z.string(),
  }),
  z.object({
    status: z.literal("handoff"),
    reason: z.string(),
  }),
  z.object({
    status: z.literal("continue"),
    reason: z.string(),
    nextInstruction: z.string(),
  }),
]);

export type CompletionVerdict = z.infer<typeof completionVerdictSchema>;

export function buildCompletionVerifierPrompt(options: {
  readonly objective: string;
  readonly assistantText: string;
  readonly continuationCount: number;
}): string {
  return `Decide whether the agent has actually satisfied the user's objective.

Original objective:
${options.objective}

Latest assistant final text:
${options.assistantText}

Continuation attempts already used: ${options.continuationCount}

Return "complete" only when the requested end state is concretely achieved.
Return "blocked" when progress cannot continue without missing permission, login, user input, unavailable app state, or another hard blocker.
Return "handoff" when the objective explicitly asks the user to take over at this point.
Return "continue" when the assistant summarized, reasoned, described the screen, or stopped before achieving the requested end state.

For UI automation tasks, prefer "continue" unless there is concrete evidence that the UI is in the requested final state.
If tool activity shows ui_focus_type succeeded for the requested literal text, prefer "complete" unless the objective also requires submission and submit was not requested or evidence shows it failed.
When continuing a visible text-entry task, prefer ui_focus_type with corrected coordinates over repeating separate pointer and typing tools. Do not ask for another screenshot when the target is already identified unless pointer evidence shows a miss.`;
}

export function buildContinuationMessage(
  verdict: Extract<CompletionVerdict, { status: "continue" }>,
): ModelMessage {
  return {
    role: "user",
    content: `Continue the current task.

Verifier reason:
${verdict.reason}

Next instruction:
${verdict.nextInstruction}

Use tools now if the next instruction involves UI interaction. Do not summarize prior observations as a final answer unless the requested end state is now reached, blocked, or ready for user handoff. For text entry, call ui_focus_type instead of saying that you will click or type. Do not repeat ui_focus_type with the same coordinates and text if it already succeeded in this run.`,
  };
}

export async function verifyCompletion(options: {
  readonly model: LanguageModel;
  readonly messages: readonly ModelMessage[];
  readonly objective: string;
  readonly assistantText: string;
  readonly continuationCount: number;
  readonly abortSignal: AbortSignal;
}): Promise<CompletionVerdict> {
  const result = await generateObject({
    model: options.model,
    system:
      "You are a strict completion verifier for a local desktop agent. You cannot use tools. Judge only whether the latest assistant answer proves the user's requested end state has been achieved, is blocked, requires handoff, or must continue.",
    schema: completionVerdictSchema,
    messages: [
      ...options.messages,
      {
        role: "user",
        content: buildCompletionVerifierPrompt({
          objective: options.objective,
          assistantText: options.assistantText,
          continuationCount: options.continuationCount,
        }),
      },
    ],
    abortSignal: options.abortSignal,
  });

  return result.object;
}
