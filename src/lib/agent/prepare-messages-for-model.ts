import { getToolName, isDynamicToolUIPart, isToolUIPart, type UIMessage } from "ai";

import { PROVIDER_EXECUTED_TOOL_NAMES } from "@/lib/agent/provider-tools";

/**
 * Strip provider-executed server tools (e.g. Anthropic/OpenAI web_search) from
 * UI history before convertToModelMessages.
 *
 * Anthropic requires every `server_tool_use` (web_search) to be paired with a
 * `web_search_tool_result` that includes `encrypted_content`. Those fields do
 * not reliably survive UI persistence, and restoring `providerExecuted` alone
 * still leaves orphaned tool_use blocks (API 400). Keep assistant text; the
 * model can search again on later turns. UI still shows Sources from source-url.
 */
export function prepareMessagesForModel(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => {
    if (message.role !== "assistant") {
      return message;
    }

    let changed = false;
    const parts: UIMessage["parts"] = [];

    for (const part of message.parts) {
      if (!isToolUIPart(part) && !isDynamicToolUIPart(part)) {
        parts.push(part);
        continue;
      }

      const name = getToolName(part);
      if (part.providerExecuted === true || PROVIDER_EXECUTED_TOOL_NAMES.has(name)) {
        changed = true;
        continue;
      }

      parts.push(part);
    }

    return changed ? { ...message, parts } : message;
  });
}
