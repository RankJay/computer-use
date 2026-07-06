import { z } from "zod";

import { invokeCapabilityCommand } from "./tauri-invoke";
import { defineCapability } from "./types";

export const searchFilesInputSchema = z.object({
  query: z.string().describe("Text to match against file paths or contents"),
  glob: z.string().min(1).describe("Glob pattern such as **/*.tsx"),
});

export type SearchFilesInput = z.infer<typeof searchFilesInputSchema>;

export type SearchFilesOutput = {
  matches: string[];
};

export const searchFilesCapability = defineCapability({
  name: "search_files",
  description: "Search workspace files by glob pattern and optional query",
  risk: "low",
  inputSchema: searchFilesInputSchema,
  execute: async (input, ctx) =>
    invokeCapabilityCommand<SearchFilesOutput>("search_files", {
      query: input.query,
      glob: input.glob,
      workspaceRoot: ctx.workspaceRoot,
    }),
});
