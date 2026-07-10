import type { ProduceRun } from "../control/run-controller";
import { createDemoReplayProducer } from "./demo-replay";
import { createLiveRunProducer } from "./live-run";

/** Select demo vs live producer from config.settings.agentMode — not inside RunController. */
export function createProduceRun(): ProduceRun {
  const demo = createDemoReplayProducer();
  const live = createLiveRunProducer();

  return async (ctx) => {
    if (ctx.config.settings.agentMode === "demo") {
      await demo(ctx);
      return;
    }
    await live(ctx);
  };
}
