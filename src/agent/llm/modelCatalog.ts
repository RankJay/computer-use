/** Curated API model ids aligned with @ai-sdk/openai and Anthropic docs (snapshot ids). */

export const ANTHROPIC_MODEL_OPTIONS = [
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "claude-opus-4-7", label: "Claude Opus 4.7" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
] as const;

export const OPENAI_MODEL_OPTIONS = [
  { id: "gpt-5.2", label: "GPT-5.2" },
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "gpt-4o-mini", label: "GPT-4o mini" },
] as const;

export type AnthropicModelId = (typeof ANTHROPIC_MODEL_OPTIONS)[number]["id"];
export type OpenAIModelId = (typeof OPENAI_MODEL_OPTIONS)[number]["id"];

export const DEFAULT_ANTHROPIC_MODEL_ID: AnthropicModelId = "claude-sonnet-4-6";
export const DEFAULT_OPENAI_MODEL_ID: OpenAIModelId = "gpt-5.2";

export function isAnthropicModelId(value: string): value is AnthropicModelId {
  return ANTHROPIC_MODEL_OPTIONS.some((o) => o.id === value);
}

export function isOpenAIModelId(value: string): value is OpenAIModelId {
  return OPENAI_MODEL_OPTIONS.some((o) => o.id === value);
}
