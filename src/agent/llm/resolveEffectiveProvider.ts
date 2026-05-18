import type { LlmApiProvider } from "@/agent/native/tauriIpc";

export function resolveEffectiveProvider(
  preferred: LlmApiProvider,
  hasAnthropicKey: boolean,
  hasOpenaiKey: boolean,
): LlmApiProvider | null {
  if (!hasAnthropicKey && !hasOpenaiKey) {
    return null;
  }
  if (hasAnthropicKey && !hasOpenaiKey) {
    return "anthropic";
  }
  if (!hasAnthropicKey && hasOpenaiKey) {
    return "openai";
  }
  if (preferred === "anthropic" && hasAnthropicKey) {
    return "anthropic";
  }
  if (preferred === "openai" && hasOpenaiKey) {
    return "openai";
  }
  return hasAnthropicKey ? "anthropic" : "openai";
}
