import { readFile as nodeReadFile } from "fs/promises";
import type { ToolDefinition } from "@/lib/tools/types";

type ReadFileFn = (path: string) => Promise<string>;

export function createReadFileTool(readFile: ReadFileFn = (p) => nodeReadFile(p, "utf8")): ToolDefinition {
  return {
    definition: {
      name: "read_file",
      description: "Read the contents of a file at the given path.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute or relative path to the file." },
        },
        required: ["path"],
      },
    },

    async execute(args: string): Promise<string> {
      let parsed: { path?: string };
      try {
        parsed = JSON.parse(args);
      } catch {
        return "Error: invalid JSON arguments";
      }

      if (!parsed.path || typeof parsed.path !== "string") {
        return "Error: missing required argument: path";
      }

      try {
        return await readFile(parsed.path);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Error reading file "${parsed.path}": ${msg}`;
      }
    },
  };
}

export const readFileTool = createReadFileTool();
