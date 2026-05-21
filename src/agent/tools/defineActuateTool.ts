import { tool, type FlexibleSchema } from "ai";

import type { LiveAgentToolContext } from "@/agent/agentSessionContext";
import { gateNativeTool, type NativeToolKind } from "@/agent/host/nativeToolGate";
import type { AgentNativeBridge } from "@/agent/native/nativeBridge";
import {
  requestToolPermission,
  type PermissionRequestCopy,
} from "@/agent/permissions/permissionOrchestrator";
import type { AgentToolName } from "@/agent/toolContract";
import {
  abortable,
  isCancellationError,
  TOOL_CANCELLED_REASON,
  toolTimeoutFromNativeError,
  throwIfAborted,
  withToolTimeout,
} from "@/agent/tools/toolCancellation";
import {
  emitToolCancelled,
  emitToolCompleted,
  emitToolError,
  emitToolStarted,
} from "@/agent/tools/toolTimeline";

type ToolPreflightResult = { readonly ok: true } | { readonly ok: false; readonly error: string };

type ToolExecuteSuccess<TValue extends object> = {
  readonly ok: true;
  readonly value: TValue;
  readonly timelineSummary: string;
};

type ToolExecuteContext = LiveAgentToolContext & {
  readonly setNativeCancel: (cancel: () => Promise<void>) => void;
};

type ActuateToolDescriptorBase<TInput> = {
  readonly toolName: AgentToolName;
  readonly description: string;
  readonly inputSchema: FlexibleSchema<TInput>;
  readonly permission: (input: TInput, ctx: LiveAgentToolContext) => PermissionRequestCopy;
  readonly deniedError: string;
  readonly describe: (input: TInput) => string;
  readonly preflight?: (input: TInput, ctx: LiveAgentToolContext) => ToolPreflightResult;
  readonly formatThrownErrorSummary?: (message: string) => string;
};

type ActuateNonNativeToolDescriptor<
  TInput,
  TValue extends object,
> = ActuateToolDescriptorBase<TInput> & {
  readonly nativeGate: "none";
  readonly execute: (input: TInput, ctx: ToolExecuteContext) => Promise<ToolExecuteSuccess<TValue>>;
};

type ActuateNativeToolDescriptor<
  TInput,
  TValue extends object,
> = ActuateToolDescriptorBase<TInput> & {
  readonly nativeGate: NativeToolKind;
  readonly execute: (
    input: TInput,
    ctx: ToolExecuteContext,
    native: AgentNativeBridge,
  ) => Promise<ToolExecuteSuccess<TValue>>;
};

export type ActuateToolDescriptor<TInput, TValue extends object> =
  | ActuateNonNativeToolDescriptor<TInput, TValue>
  | ActuateNativeToolDescriptor<TInput, TValue>;

export function defineActuateTool<TInput, TValue extends object>(
  ctx: LiveAgentToolContext,
  descriptor: ActuateToolDescriptor<TInput, TValue>,
) {
  return tool<TInput, unknown>({
    description: descriptor.description,
    inputSchema: descriptor.inputSchema,
    execute: async (input) => {
      const preflight = descriptor.preflight?.(input, ctx);
      if (preflight?.ok === false) {
        return { ok: false as const, error: preflight.error };
      }

      const permitted = await abortable(
        ctx.signal,
        requestToolPermission(ctx, descriptor.toolName, descriptor.permission(input, ctx)),
      );
      if (!permitted) {
        return { ok: false as const, error: descriptor.deniedError };
      }

      throwIfAborted(ctx.signal);
      await emitToolStarted(ctx, descriptor.toolName, descriptor.describe(input));

      const nativeGate =
        descriptor.nativeGate === "none" ? null : gateNativeTool(ctx.native, descriptor.nativeGate);
      if (nativeGate !== null && !nativeGate.ok) {
        await emitToolCompleted(ctx, descriptor.toolName, nativeGate.timelineSummary);
        return { ok: false as const, error: nativeGate.error };
      }

      let cancelNative: (() => Promise<void>) | undefined;
      const executeCtx: ToolExecuteContext = {
        ...ctx,
        setNativeCancel: (cancel) => {
          cancelNative = cancel;
        },
      };
      const cancel = async () => {
        if (cancelNative !== undefined) {
          await cancelNative();
        }
      };

      try {
        const result =
          descriptor.nativeGate === "none"
            ? await withToolTimeout(
                descriptor.toolName,
                abortable(ctx.signal, descriptor.execute(input, executeCtx), cancel),
                cancel,
              )
            : await withToolTimeout(
                descriptor.toolName,
                abortable(
                  ctx.signal,
                  descriptor.execute(
                    input,
                    executeCtx,
                    nativeGate === null ? missingNativeGate() : nativeGate.native,
                  ),
                  cancel,
                ),
                cancel,
              );
        throwIfAborted(ctx.signal);
        await emitToolCompleted(ctx, descriptor.toolName, result.timelineSummary);
        return { ok: true as const, ...result.value };
      } catch (err) {
        if (ctx.signal.aborted || isCancellationError(err)) {
          await emitToolCancelled(ctx, descriptor.toolName, TOOL_CANCELLED_REASON);
          return { ok: false as const, error: TOOL_CANCELLED_REASON };
        }
        const timeoutError = toolTimeoutFromNativeError(err, descriptor.toolName);
        if (timeoutError !== null) {
          await emitToolError(ctx, descriptor.toolName, timeoutError.payload);
          return { ok: false as const, error: timeoutError.payload };
        }
        const message = err instanceof Error ? err.message : String(err);
        await emitToolCompleted(
          ctx,
          descriptor.toolName,
          descriptor.formatThrownErrorSummary?.(message) ?? message,
        );
        return { ok: false as const, error: message };
      }
    },
  });
}

function missingNativeGate(): never {
  throw new Error("Native gate was not initialized.");
}
