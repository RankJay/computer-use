import { describe, expect, test } from "bun:test";

import { resolveEffectiveProvider } from "@/agent/llm/resolveEffectiveProvider";
import type { LlmApiProvider } from "@/agent/native/tauriIpc";

type ProviderCase = {
  readonly preferred: LlmApiProvider;
  readonly hasAnthropicKey: boolean;
  readonly hasOpenaiKey: boolean;
  readonly expected: LlmApiProvider | null;
};

const cases: readonly ProviderCase[] = [
  {
    preferred: "anthropic",
    hasAnthropicKey: false,
    hasOpenaiKey: false,
    expected: null,
  },
  {
    preferred: "openai",
    hasAnthropicKey: false,
    hasOpenaiKey: false,
    expected: null,
  },
  {
    preferred: "anthropic",
    hasAnthropicKey: true,
    hasOpenaiKey: false,
    expected: "anthropic",
  },
  {
    preferred: "openai",
    hasAnthropicKey: true,
    hasOpenaiKey: false,
    expected: "anthropic",
  },
  {
    preferred: "anthropic",
    hasAnthropicKey: false,
    hasOpenaiKey: true,
    expected: "openai",
  },
  {
    preferred: "openai",
    hasAnthropicKey: false,
    hasOpenaiKey: true,
    expected: "openai",
  },
  {
    preferred: "anthropic",
    hasAnthropicKey: true,
    hasOpenaiKey: true,
    expected: "anthropic",
  },
  {
    preferred: "openai",
    hasAnthropicKey: true,
    hasOpenaiKey: true,
    expected: "openai",
  },
];

describe("resolveEffectiveProvider", () => {
  test.each(cases)(
    "$preferred with anthropic=$hasAnthropicKey openai=$hasOpenaiKey resolves $expected",
    ({ preferred, hasAnthropicKey, hasOpenaiKey, expected }) => {
      expect(resolveEffectiveProvider(preferred, hasAnthropicKey, hasOpenaiKey)).toBe(expected);
    },
  );
});
