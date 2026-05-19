import type { LlmApiProvider } from "@/agent/native/tauriIpc";

const UNIFIED_MODEL_KEY_SEP = ":";

export function unifiedModelOptionValue(provider: LlmApiProvider, modelId: string): string {
  return `${provider}${UNIFIED_MODEL_KEY_SEP}${modelId}`;
}

export function parseUnifiedModelOptionValue(
  value: string,
): { provider: LlmApiProvider; modelId: string } | null {
  const i = value.indexOf(UNIFIED_MODEL_KEY_SEP);
  if (i <= 0 || i === value.length - 1) return null;
  const providerRaw = value.slice(0, i);
  const modelId = value.slice(i + UNIFIED_MODEL_KEY_SEP.length);
  const provider: LlmApiProvider = providerRaw === "openai" ? "openai" : "anthropic";
  return { provider, modelId };
}
