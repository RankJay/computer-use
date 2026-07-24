import type { StoredChat } from "@/lib/chats";

import type { AttemptRegistry } from "./control/attempt-registry";
import type { AttemptEngine } from "./engine";
import type { MandateProjection } from "./projection";
import { createEmptyMandateProjection } from "./projection";
import { isLiveRun } from "./run-status";

export type BindChatRouteInput = {
  chatId: string | undefined;
  loadChat: (id: string) => Promise<StoredChat | null>;
};

/** Linear bind phases — re-check live after every await (never reset over a live Attempt). */
export type BindPhase =
  | "check_live"
  | "flush"
  | "check_live_after_flush"
  | "reset"
  | "check_live_after_reset"
  | "clear_or_load"
  | "check_live_before_hydrate"
  | "hydrate"
  | "done";

export type RouteBinderDeps = {
  engine: AttemptEngine;
  registry: AttemptRegistry;
  flushLedger: () => Promise<void>;
  resetLedgerCursors: () => void;
  hydrateIdleChat: (chat: StoredChat) => Promise<void>;
  setLastStatus: (status: MandateProjection["status"]) => void;
  /** Replace host UI snapshot + notify subscribers. */
  publishProjection: (projection: MandateProjection) => void;
};

export type RouteBinder = {
  bindChatRoute: (input: BindChatRouteInput) => Promise<void>;
};

/**
 * Chat-route bind ladder as an explicit phase machine.
 * Never cancels a live Attempt on navigation.
 */
export function createRouteBinder(deps: RouteBinderDeps): RouteBinder {
  const { engine, registry } = deps;
  let bindChain: Promise<void> = Promise.resolve();
  let bindGeneration = 0;

  async function tryAttachLiveFocus(
    input: BindChatRouteInput,
    generation: number,
  ): Promise<boolean> {
    const status = engine.getProjection().status;
    const live = registry.getLive();
    if (!(isLiveRun(status) && live)) {
      return false;
    }
    const liveChatId = registry.getLiveChatId();
    if (input.chatId && input.chatId === liveChatId) {
      registry.setFocusedMandateId(live.mandateId);
      return true;
    }
    if (!input.chatId && liveChatId === null) {
      registry.setFocusedMandateId(live.mandateId);
      return true;
    }
    if (input.chatId) {
      const chat = await input.loadChat(input.chatId);
      if (generation !== bindGeneration) {
        return true;
      }
      if (chat) {
        registry.setFocusedMandateId(chat.mandateId);
      }
    }
    return true;
  }

  async function runBind(input: BindChatRouteInput, generation: number): Promise<void> {
    if (generation !== bindGeneration) {
      return;
    }
    if (await tryAttachLiveFocus(input, generation)) {
      return;
    }

    await deps.flushLedger();
    if (generation !== bindGeneration) {
      return;
    }
    if (await tryAttachLiveFocus(input, generation)) {
      return;
    }

    await engine.reset();
    if (generation !== bindGeneration) {
      return;
    }
    if (await tryAttachLiveFocus(input, generation)) {
      return;
    }

    registry.clearLive();
    deps.resetLedgerCursors();

    if (!input.chatId) {
      registry.setLiveChatId(null);
      registry.setFocusedMandateId(null);
      const empty = createEmptyMandateProjection();
      deps.setLastStatus(empty.status);
      deps.publishProjection(empty);
      return;
    }

    const chat = await input.loadChat(input.chatId);
    if (generation !== bindGeneration) {
      return;
    }
    if (!chat) {
      registry.setLiveChatId(null);
      registry.setFocusedMandateId(null);
      return;
    }

    if (await tryAttachLiveFocus(input, generation)) {
      return;
    }

    registry.setLiveChatId(chat.id);
    registry.setFocusedMandateId(chat.mandateId);
    await deps.hydrateIdleChat(chat);
    if (generation !== bindGeneration) {
      return;
    }

    const projection = engine.getProjection();
    deps.setLastStatus(projection.status);
    deps.publishProjection(projection);
  }

  return {
    async bindChatRoute(input) {
      const generation = ++bindGeneration;
      const run = async (): Promise<void> => {
        if (generation !== bindGeneration) {
          return;
        }
        await runBind(input, generation);
      };

      const queued = bindChain.then(run, run);
      bindChain = queued.then(
        () => undefined,
        () => undefined,
      );
      await queued;
    },
  };
}
