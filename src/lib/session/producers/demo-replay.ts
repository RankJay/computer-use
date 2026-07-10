import type { ProduceRun } from "../control/run-controller";
import { createDemoPayloads } from "../fixtures/demo-payloads";

const EVENT_DELAY_MS = 30;

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Paced demo producer for UI — emits fixture payloads through append. */
export function createDemoReplayProducer(): ProduceRun {
  return async ({ config, taskId, signal, append }) => {
    const payloads = createDemoPayloads(config.prompt);

    for (const payload of payloads) {
      if (signal.aborted) break;

      try {
        await delay(EVENT_DELAY_MS, signal);
      } catch {
        break;
      }

      if (signal.aborted) break;

      if (payload.type === "task.started") {
        append({
          ...payload,
          prompt: config.prompt,
          modelId: config.modelId,
          agentMode: "demo",
          userMessageId: config.isRetry ? undefined : `user-${taskId}`,
          omitUserMessage: config.isRetry === true,
        });
        continue;
      }

      if (payload.type === "usage.updated") {
        append({ ...payload, modelId: config.modelId });
        continue;
      }

      append(payload);
    }
  };
}
