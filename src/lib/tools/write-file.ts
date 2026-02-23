import { writeFile as nodeWriteFile, mkdir } from "fs/promises";
import path from "path";
import type { ToolDefinition } from "@/lib/tools/types";

type WriteFn = (path: string, content: string) => Promise<void>;

async function defaultWrite(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await nodeWriteFile(filePath, content, "utf8");
}

export function createWriteFileTool(write: WriteFn = defaultWrite): ToolDefinition {
  return {
    definition: {
      name: "write_file",
      description: "Write content to a file, creating parent directories as needed.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute or relative path to write to." },
          content: { type: "string", description: "Content to write to the file." },
        },
        required: ["path", "content"],
      },
    },

    async execute(args: string): Promise<string> {
      let parsed: { path?: string; content?: string };
      try {
        parsed = JSON.parse(args);
      } catch {
        return "Error: invalid JSON arguments";
      }

      if (!parsed.path || typeof parsed.path !== "string") {
        return "Error: missing required argument: path";
      }
      if (parsed.content === undefined || parsed.content === null) {
        return "Error: missing required argument: content";
      }

      try {
        await write(parsed.path, parsed.content);
        return `File written: "${parsed.path}"`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Error writing file "${parsed.path}": ${msg}`;
      }
    },
  };
}

export const writeFileTool = createWriteFileTool();
