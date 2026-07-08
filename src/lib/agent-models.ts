/** USD per 1M tokens. Standard (short-context) API rates from provider docs. */
export type ModelPricing = {
  inputPerMillion: number;
  outputPerMillion: number;
  /** Cached-input rate when the provider publishes one. */
  cachedInputPerMillion?: number;
};

export type AgentModelOption = {
  id: string;
  name: string;
  provider: string;
  /** Maximum combined input + output tokens for one request. */
  contextWindowTokens: number;
  pricing: ModelPricing;
};

/**
 * Curated live-mode models — IDs must match @ai-sdk/openai and @ai-sdk/anthropic.
 * Context windows and pricing sourced from provider docs (July 2026):
 * - OpenAI: https://developers.openai.com/api/docs/models
 * - Anthropic: https://platform.claude.com/docs/en/about-claude/models/overview
 */
const DEFAULT_AGENT_MODELS: AgentModelOption[] = [
  {
    id: "openai/gpt-5.5",
    name: "GPT-5.5",
    provider: "OpenAI",
    contextWindowTokens: 1_000_000,
    pricing: { inputPerMillion: 5, outputPerMillion: 30, cachedInputPerMillion: 0.5 },
  },
  {
    id: "openai/gpt-5.4",
    name: "GPT-5.4",
    provider: "OpenAI",
    contextWindowTokens: 1_000_000,
    pricing: { inputPerMillion: 2.5, outputPerMillion: 15, cachedInputPerMillion: 0.25 },
  },
  {
    id: "openai/gpt-5.4-mini",
    name: "GPT-5.4 Mini",
    provider: "OpenAI",
    contextWindowTokens: 400_000,
    pricing: { inputPerMillion: 0.75, outputPerMillion: 4.5, cachedInputPerMillion: 0.075 },
  },
  {
    id: "anthropic/claude-opus-4-5",
    name: "Claude Opus 4.5",
    provider: "Anthropic",
    contextWindowTokens: 200_000,
    pricing: { inputPerMillion: 5, outputPerMillion: 25, cachedInputPerMillion: 0.5 },
  },
  {
    id: "anthropic/claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    provider: "Anthropic",
    contextWindowTokens: 200_000,
    pricing: { inputPerMillion: 3, outputPerMillion: 15, cachedInputPerMillion: 0.3 },
  },
  {
    id: "anthropic/claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    provider: "Anthropic",
    contextWindowTokens: 200_000,
    pricing: { inputPerMillion: 1, outputPerMillion: 5, cachedInputPerMillion: 0.1 },
  },
];

const DEFAULT_MODEL_ID = "anthropic/claude-haiku-4-5";

const MODEL_BY_ID = new Map(DEFAULT_AGENT_MODELS.map((model) => [model.id, model]));

export function getAvailableAgentModels(): AgentModelOption[] {
  return DEFAULT_AGENT_MODELS;
}

export function getAgentModel(modelId: string): AgentModelOption | undefined {
  return MODEL_BY_ID.get(modelId);
}

export function getDefaultAgentModelId(): string {
  return DEFAULT_MODEL_ID;
}

export function getDefaultAgentModel(): AgentModelOption {
  const model = MODEL_BY_ID.get(DEFAULT_MODEL_ID);
  if (!model) {
    throw new Error(`Default agent model "${DEFAULT_MODEL_ID}" is missing from catalog.`);
  }
  return model;
}

export function resolveAgentModelId(storedId: string | undefined): string {
  if (storedId && MODEL_BY_ID.has(storedId)) {
    return storedId;
  }
  return DEFAULT_MODEL_ID;
}

export function getModelContextWindow(modelId: string): number {
  return getAgentModel(modelId)?.contextWindowTokens ?? getDefaultAgentModel().contextWindowTokens;
}
