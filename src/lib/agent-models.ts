export type AgentModelOption = {
  id: string;
  name: string;
  provider: string;
};

const DEFAULT_AGENT_MODELS: AgentModelOption[] = [
  { id: "openai/gpt-4o", name: "GPT-4o", provider: "OpenAI" },
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI" },
  { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4", provider: "Anthropic" },
  { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "Google" },
  { id: "deepseek/deepseek-r1", name: "DeepSeek R1", provider: "DeepSeek" },
];

const DEFAULT_MODEL_ID = DEFAULT_AGENT_MODELS[0].id;

export function getAvailableAgentModels(): AgentModelOption[] {
  return DEFAULT_AGENT_MODELS;
}

export function getDefaultAgentModelId(): string {
  return DEFAULT_MODEL_ID;
}
