import { getAnalyticsPort } from "@/lib/analytics/client";

/** Minimal person shape for identify — avoids coupling analytics to auth types. */
export type AnalyticsPerson = {
  id: string;
  email: string;
  name: string;
};

let generation = 0;

/** Identify signed-in user (sync). */
export function identifyUser(user: AnalyticsPerson): void {
  getAnalyticsPort().identify(user.id, { email: user.email, name: user.name });
}

/**
 * Capture generation for async identify (boot hydrate).
 * Completer no-ops if `resetAnalytics` ran since.
 */
export function beginIdentifyGeneration(): {
  generation: number;
  apply: (user: AnalyticsPerson) => void;
} {
  const gen = generation;
  return {
    generation: gen,
    apply(user) {
      if (gen !== generation) {
        return;
      }
      getAnalyticsPort().identify(user.id, { email: user.email, name: user.name });
    },
  };
}

export function resetAnalytics(): void {
  generation += 1;
  getAnalyticsPort().reset();
}

/** Test helper */
export function getIdentityGenerationForTests(): number {
  return generation;
}

/** Test helper — reset generation counter between cases. */
export function resetIdentityGenerationForTests(): void {
  generation = 0;
}
