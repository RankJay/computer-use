import type { LiveAgentToolContext } from "@/agent/agentSessionContext";
import type { AgentToolName } from "@/agent/toolContract";
import { createEventId } from "@/agent/types";

export function shortenForTimeline(text: string, max = 400): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export async function emitToolStarted(
  ctx: LiveAgentToolContext,
  toolName: AgentToolName,
  inputSummary: string,
): Promise<void> {
  const ev = {
    id: createEventId(),
    at: Date.now(),
    taskId: ctx.taskId,
    type: "tool.started" as const,
    toolName,
    inputSummary,
  };
  ctx.emit(ev);
  await ctx.appendStructuredLog(ev);
}

export async function emitToolCompleted(
  ctx: LiveAgentToolContext,
  toolName: AgentToolName,
  outputSummary: string,
): Promise<void> {
  const ev = {
    id: createEventId(),
    at: Date.now(),
    taskId: ctx.taskId,
    type: "tool.completed" as const,
    toolName,
    outputSummary,
  };
  ctx.emit(ev);
  await ctx.appendStructuredLog(ev);
}
