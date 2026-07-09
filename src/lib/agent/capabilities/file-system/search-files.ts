import { z } from "zod";

import { defineCapability } from "../types";

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
  needsWorkspaceRoot: true,
  inputSchema: searchFilesInputSchema,
});
