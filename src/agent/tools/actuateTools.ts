import type { LiveAgentToolContext } from "@/agent/agentSessionContext";
import { MODEL_TOOL_KEYS } from "@/agent/toolContract";
import { createDisplayCaptureTool } from "@/agent/tools/displayCaptureTool";
import { createTerminalRunTool } from "@/agent/tools/terminalRunTool";
import {
  createKeyTapTool,
  createPointerClickTool,
  createPointerMoveTool,
  createTypeTextTool,
} from "@/agent/tools/uiAutomationTools";
import {
  createCopyFileTool,
  createMovePathTool,
  createReadFileTool,
  createWorkspaceInspectTool,
  createWriteFileTool,
} from "@/agent/tools/workspaceTools";

/** Model registry keys (MODEL_TOOL_KEYS) → tool factories bound to internal contract ids inside each factory. */
export function createActuateTools(ctx: LiveAgentToolContext) {
  return {
    [MODEL_TOOL_KEYS.TERMINAL_RUN]: createTerminalRunTool(ctx),
    [MODEL_TOOL_KEYS.WORKSPACE_INSPECT]: createWorkspaceInspectTool(ctx),
    [MODEL_TOOL_KEYS.DISPLAY_CAPTURE]: createDisplayCaptureTool(ctx),
    [MODEL_TOOL_KEYS.READ_FILE]: createReadFileTool(ctx),
    [MODEL_TOOL_KEYS.WRITE_FILE]: createWriteFileTool(ctx),
    [MODEL_TOOL_KEYS.COPY_FILE]: createCopyFileTool(ctx),
    [MODEL_TOOL_KEYS.MOVE_PATH]: createMovePathTool(ctx),
    [MODEL_TOOL_KEYS.POINTER_MOVE]: createPointerMoveTool(ctx),
    [MODEL_TOOL_KEYS.POINTER_CLICK]: createPointerClickTool(ctx),
    [MODEL_TOOL_KEYS.TYPE_TEXT]: createTypeTextTool(ctx),
    [MODEL_TOOL_KEYS.KEY_TAP]: createKeyTapTool(ctx),
  };
}

export type ActuateToolSet = ReturnType<typeof createActuateTools>;
