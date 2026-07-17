import type { ProduceRun } from "../control/run-controller";

/**
 * Select demo vs live producer from config.settings.agentMode.
 * Dynamic import keeps the AI SDK / demo fixtures off the cold-start graph.
 */
export function createProduceRun(): ProduceRun {
  return async (ctx) => {
    if (ctx.config.settings.agentMode === "demo") {
      const { createDemoReplayProducer } = await import("./demo-replay");
      await createDemoReplayProducer()(ctx);
      return;
    }

    const { createLiveRunProducer } = await import("./live-run");
    await createLiveRunProducer()(ctx);
  };
}
