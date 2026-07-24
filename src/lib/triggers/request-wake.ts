import type { MandatesPersistence } from "@/lib/mandates";
import type { AttemptStartInput, AttemptStartResult } from "@/lib/session/control/attempt-control";
import type { LiveAttempt } from "@/lib/session/control/attempt-registry";
import type { ConcurrencyPolicy } from "@/lib/session/control/concurrency-policy";

import {
  evaluateTriggerWake,
  triggerSuppressedFact,
  type TriggerWakeDecision,
} from "./evaluate-wake";

export type RequestTriggerWakeInput = {
  mandates: MandatesPersistence;
  getLive: () => LiveAttempt | null;
  /** Sole start seam — Trigger Client must not call RunController. */
  start: (input: AttemptStartInput) => Promise<AttemptStartResult>;
  mandateId: string;
  prompt: string;
  triggerId?: string;
  concurrencyPolicy?: ConcurrencyPolicy;
};

export type RequestTriggerWakeResult =
  | { readonly ok: true; readonly started: AttemptStartResult }
  | {
      readonly ok: false;
      readonly suppressed: TriggerWakeDecision;
      readonly fact: ReturnType<typeof triggerSuppressedFact>;
    };

/**
 * Thin Trigger Client: evaluate wake → optionally AttemptControl.start.
 * Never drives Chat UI. Non-start decisions are suppressed (queue deferred).
 */
export async function requestTriggerWake(
  input: RequestTriggerWakeInput,
): Promise<RequestTriggerWakeResult> {
  const mandate = await input.mandates.get(input.mandateId);
  if (!mandate) {
    throw new Error(`Mandate not found: ${input.mandateId}`);
  }

  const decision = evaluateTriggerWake({
    mandate,
    live: input.getLive(),
    concurrencyPolicy: input.concurrencyPolicy,
  });

  if (decision.action !== "start") {
    return {
      ok: false,
      suppressed: decision,
      fact: triggerSuppressedFact({
        mandateId: mandate.id,
        reason: decision.reason,
        triggerId: input.triggerId,
      }),
    };
  }

  const started = await input.start({
    prompt: input.prompt,
    mandateId: mandate.id,
  });
  return { ok: true, started };
}
