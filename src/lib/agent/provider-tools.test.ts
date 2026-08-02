import { describe, expect, test } from "bun:test";

import { buildProviderWebSearchTools, PROVIDER_EXECUTED_TOOL_NAMES } from "./provider-tools";

describe("buildProviderWebSearchTools", () => {
  test("returns OpenAI web_search for openai models", () => {
    const tools = buildProviderWebSearchTools("openai/gpt-5.5");
    expect(Object.keys(tools)).toEqual(["web_search"]);
    expect(tools.web_search).toBeDefined();
  });

  test("returns Anthropic web_search for anthropic models", () => {
    const tools = buildProviderWebSearchTools("anthropic/claude-haiku-4-5");
    expect(Object.keys(tools)).toEqual(["web_search"]);
    expect(tools.web_search).toBeDefined();
  });

  test("returns empty for unknown providers", () => {
    expect(buildProviderWebSearchTools("grok/fun")).toEqual({});
    expect(buildProviderWebSearchTools("gpt-5.5")).toEqual({});
  });

  test("PROVIDER_EXECUTED_TOOL_NAMES covers every registered provider tool key", () => {
    for (const modelId of ["openai/gpt-5.5", "anthropic/claude-haiku-4-5"]) {
      for (const name of Object.keys(buildProviderWebSearchTools(modelId))) {
        expect(PROVIDER_EXECUTED_TOOL_NAMES.has(name)).toBe(true);
      }
    }
    expect([...PROVIDER_EXECUTED_TOOL_NAMES].sort()).toEqual(["web_search"]);
  });
});
