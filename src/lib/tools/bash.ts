import { exec as nodeExec } from "child_process";
import type { ToolDefinition } from "@/lib/tools/types";

const DEFAULT_TIMEOUT_MS = 10_000;

type ExecFn = (
  cmd: string,
  opts: { timeout: number },
  callback: (err: Error | null, stdout: string, stderr: string) => void
) => void;

export function createBashTool(exec: ExecFn = nodeExec): ToolDefinition {
  return {
    definition: {
      name: "bash",
      description: "Execute a shell command and return its output.",
      parameters: {
        type: "object",
        properties: {
          cmd: { type: "string", description: "The shell command to execute." },
          timeout: { type: "number", description: "Timeout in milliseconds (default: 10000)." },
        },
        required: ["cmd"],
      },
    },

    async execute(args: string): Promise<string> {
      let parsed: { cmd?: string; timeout?: number };
      try {
        parsed = JSON.parse(args);
      } catch {
        return "Error: invalid JSON arguments";
      }

      if (!parsed.cmd || typeof parsed.cmd !== "string") {
        return "Error: missing required argument: cmd";
      }

      const timeout = parsed.timeout ?? DEFAULT_TIMEOUT_MS;

      return new Promise((resolve) => {
        exec(parsed.cmd as string, { timeout }, (err, stdout, stderr) => {
          if (err) {
            resolve(stderr || err.message);
            return;
          }
          resolve(stdout);
        });
      });
    },
  };
}

export const bashTool = createBashTool();
