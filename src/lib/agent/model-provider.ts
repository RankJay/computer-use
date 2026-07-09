import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, LoadAPIKeyError, type LanguageModel } from "ai";

import { requireProviderFetch } from "@/lib/agent/tauri-fetch";
import type { AppSecrets } from "@/lib/settings/types";

export class ModelProviderError extends Error {
  readonly code: string;
  readonly recoverable: boolean;

  constructor(code: string, message: string, recoverable: boolean) {
    super(message);
    this.name = "ModelProviderError";
    this.code = code;
    this.recoverable = recoverable;
  }
}

function parseModelId(modelId: string): { provider: string; model: string } {
  const slashIndex = modelId.indexOf("/");
  if (slashIndex <= 0 || slashIndex === modelId.length - 1) {
    throw new ModelProviderError(
      "invalid_model",
      `Model id must be provider/model format. Got: ${modelId}`,
      false,
    );
  }

  return {
    provider: modelId.slice(0, slashIndex),
    model: modelId.slice(slashIndex + 1),
  };
}

export function resolveLanguageModel(modelId: string, secrets: AppSecrets): LanguageModel {
  const { provider, model } = parseModelId(modelId);

  switch (provider) {
    case "openai": {
      if (!secrets.openaiApiKey) {
        throw new ModelProviderError(
          "auth",
          "OpenAI API key is missing. Add it in Settings.",
          true,
        );
      }
      break;
    }
    case "anthropic": {
      if (!secrets.anthropicApiKey) {
        throw new ModelProviderError(
          "auth",
          "Anthropic API key is missing. Add it in Settings.",
          true,
        );
      }
      break;
    }
    default:
      throw new ModelProviderError(
        "unsupported_provider",
        `Provider "${provider}" is not supported in live mode yet.`,
        false,
      );
  }

  let fetch: typeof globalThis.fetch;
  try {
    fetch = requireProviderFetch();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Desktop runtime required for live mode.";
    throw new ModelProviderError("desktop_required", message, false);
  }

  if (provider === "openai") {
    return createOpenAI({ apiKey: secrets.openaiApiKey, fetch })(model);
  }

  return createAnthropic({
    apiKey: secrets.anthropicApiKey,
    fetch,
    headers: {
      "anthropic-dangerous-direct-browser-access": "true",
    },
  })(model);
}

export function mapAgentError(error: unknown): ModelProviderError {
  if (error instanceof ModelProviderError) {
    return error;
  }

  if (LoadAPIKeyError.isInstance(error)) {
    return new ModelProviderError("auth", error.message, true);
  }

  if (APICallError.isInstance(error)) {
    const status = error.statusCode ?? 0;
    if (status === 401 || status === 403) {
      return new ModelProviderError("auth", error.message, true);
    }
    if (status === 429) {
      return new ModelProviderError("rate_limit", error.message, true);
    }
    return new ModelProviderError("provider", error.message, true);
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return new ModelProviderError("aborted", error.message, false);
  }

  if (error instanceof Error && error.name === "AbortError") {
    return new ModelProviderError("aborted", error.message, false);
  }

  if (error instanceof Error) {
    if (error.message.includes("Failed to fetch") || error.message.includes("NetworkError")) {
      return new ModelProviderError(
        "network",
        "Provider request failed. Restart the desktop app if this persists.",
        true,
      );
    }
    return new ModelProviderError("internal", error.message, false);
  }

  return new ModelProviderError("internal", "Unknown agent failure", false);
}
