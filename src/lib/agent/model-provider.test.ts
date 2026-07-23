import { describe, expect, test } from "bun:test";

import { APICallError, LoadAPIKeyError } from "ai";

import { DEFAULT_SECRETS } from "@/lib/settings/defaults";

import { mapAgentError, ModelProviderError, resolveLanguageModel } from "./model-provider";

describe("mapAgentError", () => {
  test("passes through ModelProviderError", () => {
    const original = new ModelProviderError("auth", "missing", true);
    expect(mapAgentError(original)).toBe(original);
  });

  test("maps LoadAPIKeyError to recoverable auth", () => {
    const mapped = mapAgentError(new LoadAPIKeyError({ message: "no key" }));
    expect(mapped.code).toBe("auth");
    expect(mapped.recoverable).toBe(true);
  });

  test("maps APICallError status codes", () => {
    const auth = mapAgentError(
      new APICallError({
        message: "unauthorized",
        url: "https://api.openai.com",
        requestBodyValues: {},
        statusCode: 401,
        responseHeaders: {},
        responseBody: "",
        isRetryable: false,
      }),
    );
    expect(auth.code).toBe("auth");
    expect(auth.recoverable).toBe(true);

    const rate = mapAgentError(
      new APICallError({
        message: "slow down",
        url: "https://api.openai.com",
        requestBodyValues: {},
        statusCode: 429,
        responseHeaders: {},
        responseBody: "",
        isRetryable: true,
      }),
    );
    expect(rate.code).toBe("rate_limit");
    expect(rate.recoverable).toBe(true);

    const other = mapAgentError(
      new APICallError({
        message: "server",
        url: "https://api.openai.com",
        requestBodyValues: {},
        statusCode: 500,
        responseHeaders: {},
        responseBody: "",
        isRetryable: true,
      }),
    );
    expect(other.code).toBe("provider");
    expect(other.recoverable).toBe(true);
  });

  test("maps AbortError variants", () => {
    const dom = mapAgentError(new DOMException("aborted", "AbortError"));
    expect(dom.code).toBe("aborted");
    expect(dom.recoverable).toBe(false);

    const named = new Error("cancelled");
    named.name = "AbortError";
    expect(mapAgentError(named).code).toBe("aborted");
  });

  test("maps network-looking errors as recoverable network", () => {
    const mapped = mapAgentError(new Error("Failed to fetch provider"));
    expect(mapped.code).toBe("network");
    expect(mapped.recoverable).toBe(true);
  });

  test("maps unknown Error as non-recoverable internal", () => {
    const mapped = mapAgentError(new Error("weird"));
    expect(mapped.code).toBe("internal");
    expect(mapped.recoverable).toBe(false);
  });

  test("maps non-Error as internal unknown", () => {
    const mapped = mapAgentError(null);
    expect(mapped.code).toBe("internal");
    expect(mapped.message).toBe("Unknown agent failure");
  });
});

describe("resolveLanguageModel", () => {
  test("rejects invalid model id format", () => {
    expect(() => resolveLanguageModel("gpt-4o", DEFAULT_SECRETS)).toThrow(ModelProviderError);
    try {
      resolveLanguageModel("gpt-4o", DEFAULT_SECRETS);
    } catch (error) {
      expect(error).toBeInstanceOf(ModelProviderError);
      if (error instanceof ModelProviderError) {
        expect(error.code).toBe("invalid_model");
        expect(error.recoverable).toBe(false);
      }
    }
  });

  test("rejects missing openai key", () => {
    try {
      resolveLanguageModel("openai/gpt-4o", { ...DEFAULT_SECRETS, openaiApiKey: "" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ModelProviderError);
      if (error instanceof ModelProviderError) {
        expect(error.code).toBe("auth");
        expect(error.recoverable).toBe(true);
      }
    }
  });

  test("rejects unsupported provider", () => {
    try {
      resolveLanguageModel("grok/fun", DEFAULT_SECRETS);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ModelProviderError);
      if (error instanceof ModelProviderError) {
        expect(error.code).toBe("unsupported_provider");
      }
    }
  });

  test("rejects anthropic key without sk-ant- prefix", () => {
    try {
      resolveLanguageModel("anthropic/claude-sonnet-4", {
        ...DEFAULT_SECRETS,
        anthropicApiKey: "not-a-real-key",
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ModelProviderError);
      if (error instanceof ModelProviderError) {
        expect(error.code).toBe("auth");
        expect(error.message).toContain("sk-ant-");
      }
    }
  });

  test("requires desktop fetch even with valid openai key", () => {
    try {
      resolveLanguageModel("openai/gpt-4o", {
        ...DEFAULT_SECRETS,
        openaiApiKey: "sk-test-key",
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ModelProviderError);
      if (error instanceof ModelProviderError) {
        expect(error.code).toBe("desktop_required");
        expect(error.recoverable).toBe(false);
      }
    }
  });
});
