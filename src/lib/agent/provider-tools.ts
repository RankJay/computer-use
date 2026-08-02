import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import type { ToolSet } from "ai";

import { tryParseModelId } from "@/lib/agent/model-provider";

function openaiProviderTools(): ToolSet {
  return {
    web_search: openai.tools.webSearch({ searchContextSize: "low" }),
  };
}

function anthropicProviderTools(): ToolSet {
  // Basic search — curated models are Claude 4.5; dynamic-filter variants need 4.6+.
  return {
    web_search: anthropic.tools.webSearch_20250305({ maxUses: 3 }),
  };
}

const PROVIDER_TOOL_BUILDERS: Readonly<Record<string, () => ToolSet>> = {
  openai: openaiProviderTools,
  anthropic: anthropicProviderTools,
};

/** Derived from {@link PROVIDER_TOOL_BUILDERS} — adding a tool key updates this automatically. */
export const PROVIDER_EXECUTED_TOOL_NAMES: ReadonlySet<string> = new Set(
  Object.values(PROVIDER_TOOL_BUILDERS).flatMap((build) => Object.keys(build())),
);

/**
 * Provider-executed web search tools (OpenAI Responses / Anthropic Messages).
 * Server-side only — not part of the local capability runner.
 */
export function buildProviderWebSearchTools(modelId: string): ToolSet {
  const parsed = tryParseModelId(modelId);
  if (!parsed) {
    return {};
  }
  return PROVIDER_TOOL_BUILDERS[parsed.provider]?.() ?? {};
}
