import type { LiveAgentToolContext } from "@/agent/agentSessionContext";
import { createDisplayCaptureTool } from "@/agent/tools/displayCaptureTool";
import { createTerminalRunTool } from "@/agent/tools/terminalRunTool";
import {
  createPointerClickTool,
  createPointerMoveTool,
  createTypeTextTool,
} from "@/agent/tools/uiAutomationTools";
import {
  createReadFileTool,
  createWorkspaceInspectTool,
  createWriteFileTool,
} from "@/agent/tools/workspaceTools";

export function createActuateTools(ctx: LiveAgentToolContext) {
  return {
    terminal_run: createTerminalRunTool(ctx),
    workspace_inspect: createWorkspaceInspectTool(ctx),
    display_capture: createDisplayCaptureTool(ctx),
    read_file: createReadFileTool(ctx),
    write_file: createWriteFileTool(ctx),
    pointer_move: createPointerMoveTool(ctx),
    pointer_click: createPointerClickTool(ctx),
    type_text: createTypeTextTool(ctx),
  };
}

export type ActuateToolSet = ReturnType<typeof createActuateTools>;
