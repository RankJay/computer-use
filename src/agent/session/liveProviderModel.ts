import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { fetch as tauriHttpFetch } from "@tauri-apps/plugin-http";
import type { LanguageModel } from "ai";

import type { LlmApiProvider } from "@/agent/native/tauriIpc";

export type LiveProviderModelOptions = {
  readonly apiKey: string;
  readonly llmProvider: LlmApiProvider;
  readonly liveModelId: string;
  readonly useTauriHttp: boolean;
};

export function createLiveLanguageModel(options: LiveProviderModelOptions): LanguageModel {
  const { apiKey, llmProvider, liveModelId, useTauriHttp } = options;
  const tauriFetch = useTauriHttp ? { fetch: tauriHttpFetch } : {};

  if (llmProvider === "anthropic") {
    return createAnthropic({
      apiKey,
      headers: {
        "anthropic-dangerous-direct-browser-access": "true",
      },
      ...tauriFetch,
    })(liveModelId);
  }

  return createOpenAI({
    apiKey,
    ...tauriFetch,
  }).chat(liveModelId);
}
