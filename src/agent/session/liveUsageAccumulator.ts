import type { LlmApiProvider } from "@/agent/native/tauriIpc";
import { estimateCostUsd } from "@/agent/session/liveModelPricing";
import {
  addUsageSnapshots,
  createEmptyUsageSnapshot,
  hasUsageDelta,
  mergeUsageSnapshot,
  type StreamUsageSnapshot,
  usageSnapshotDelta,
} from "@/agent/session/liveStreamMapping";
import type { AgentUsageDelta, TokenUsage } from "@/agent/types";

export type UsageDeltaForEmit = AgentUsageDelta;

export type LiveUsageAccumulator = {
  readonly ingest: (snapshot: StreamUsageSnapshot) => UsageDeltaForEmit | null;
  readonly commitStep: () => void;
  readonly total: () => TokenUsage;
};

export function createLiveUsageAccumulator(options: {
  readonly provider: LlmApiProvider;
  readonly modelId: string;
}): LiveUsageAccumulator {
  let committedUsage = createEmptyUsageSnapshot();
  let currentStepUsage = createEmptyUsageSnapshot();
  let emittedUsage = createEmptyUsageSnapshot();

  return {
    ingest: (snapshot) => {
      const nextUsage =
        snapshot.scope === "run"
          ? mergeUsageSnapshot(emittedUsage, snapshot.usage)
          : addUsageSnapshots(committedUsage, mergeUsageSnapshot(currentStepUsage, snapshot.usage));
      const usageDelta = usageSnapshotDelta(nextUsage, emittedUsage);

      if (snapshot.scope === "step") {
        currentStepUsage = mergeUsageSnapshot(currentStepUsage, snapshot.usage);
      }

      if (!hasUsageDelta(usageDelta)) {
        return null;
      }

      emittedUsage = addUsageSnapshots(emittedUsage, usageDelta);
      return {
        ...usageDelta,
        costUsd: estimateCostUsd(usageDelta, options.provider, options.modelId),
      };
    },
    commitStep: () => {
      committedUsage = addUsageSnapshots(committedUsage, currentStepUsage);
      currentStepUsage = createEmptyUsageSnapshot();
    },
    total: () => emittedUsage,
  };
}
