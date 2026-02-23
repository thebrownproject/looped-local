import { describe, it, expect, vi, beforeEach } from "vitest";
import { createBashTool } from "./bash";

type ExecCallback = (err: Error | null, stdout: string, stderr: string) => void;
type ExecFn = (cmd: string, opts: { timeout: number }, callback: ExecCallback) => void;

function makeExecMock(stdout: string, stderr: string, err: Error | null = null): ExecFn {
  return vi.fn((_cmd, _opts, callback) => callback(err, stdout, stderr));
}

describe("bashTool", () => {
  let execMock: ReturnType<typeof vi.fn>;
  let tool: ReturnType<typeof createBashTool>;

  beforeEach(() => {
    execMock = vi.fn();
    tool = createBashTool(execMock as ExecFn);
  });

  // -- Definition --

  it("has correct tool definition", () => {
    expect(tool.definition.name).toBe("bash");
    expect(tool.definition.description).toBeTruthy();
    expect(tool.definition.parameters).toBeDefined();
  });

  // -- Execution --

  it("executes command and returns stdout", async () => {
    execMock.mockImplementation(makeExecMock("hello world\n", ""));
    const result = await tool.execute(JSON.stringify({ cmd: "echo hello world" }));
    expect(result).toBe("hello world\n");
  });

  it("returns stderr when command fails", async () => {
    const err = Object.assign(new Error("exit 1"), { code: 1 });
    execMock.mockImplementation(makeExecMock("", "command not found", err));
    const result = await tool.execute(JSON.stringify({ cmd: "badcmd" }));
    expect(result).toContain("command not found");
  });

  it("returns stderr output even when exit code is non-zero", async () => {
    const err = Object.assign(new Error("exit 1"), { code: 1 });
    execMock.mockImplementation(makeExecMock("partial output", "some error", err));
    const result = await tool.execute(JSON.stringify({ cmd: "failing-cmd" }));
    expect(result).toContain("some error");
  });

  it("does not throw on failure - returns error string", async () => {
    const err = Object.assign(new Error("exit 1"), { code: 1 });
    execMock.mockImplementation(makeExecMock("", "fatal error", err));
    await expect(tool.execute(JSON.stringify({ cmd: "badcmd" }))).resolves.toBeTruthy();
  });

  // -- Timeout --

  it("passes timeout option to exec", async () => {
    execMock.mockImplementation(makeExecMock("ok", ""));
    await tool.execute(JSON.stringify({ cmd: "sleep 1", timeout: 500 }));
    expect(execMock.mock.calls[0][1]).toMatchObject({ timeout: 500 });
  });

  it("uses default timeout when not specified", async () => {
    execMock.mockImplementation(makeExecMock("ok", ""));
    await tool.execute(JSON.stringify({ cmd: "echo hi" }));
    const opts = execMock.mock.calls[0][1] as { timeout: number };
    expect(opts.timeout).toBeGreaterThan(0);
  });

  // -- Argument validation --

  it("returns error string when cmd argument is missing", async () => {
    const result = await tool.execute(JSON.stringify({}));
    expect(result).toContain("cmd");
  });
});
