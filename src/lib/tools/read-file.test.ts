import { describe, it, expect, vi, beforeEach } from "vitest";
import { createReadFileTool } from "./read-file";

type ReadFileFn = (path: string) => Promise<string>;

describe("readFileTool", () => {
  let readMock: ReturnType<typeof vi.fn>;
  let tool: ReturnType<typeof createReadFileTool>;

  beforeEach(() => {
    readMock = vi.fn();
    tool = createReadFileTool(readMock as ReadFileFn);
  });

  // -- Definition --

  it("has correct tool definition", () => {
    expect(tool.definition.name).toBe("read_file");
    expect(tool.definition.description).toBeTruthy();
    expect(tool.definition.parameters).toBeDefined();
  });

  // -- Execution --

  it("reads an existing file and returns its contents", async () => {
    readMock.mockResolvedValue("file contents here");
    const result = await tool.execute(JSON.stringify({ path: "/tmp/test.txt" }));
    expect(result).toBe("file contents here");
  });

  it("passes the correct path to readFile", async () => {
    readMock.mockResolvedValue("data");
    await tool.execute(JSON.stringify({ path: "/some/path/file.ts" }));
    expect(readMock).toHaveBeenCalledWith("/some/path/file.ts");
  });

  it("returns error string for missing files", async () => {
    const err = Object.assign(new Error("ENOENT: no such file or directory"), { code: "ENOENT" });
    readMock.mockRejectedValue(err);
    const result = await tool.execute(JSON.stringify({ path: "/nonexistent.txt" }));
    expect(result).toContain("Error");
    expect(result).toContain("/nonexistent.txt");
  });

  it("does not throw on file error - returns error string", async () => {
    readMock.mockRejectedValue(new Error("permission denied"));
    await expect(tool.execute(JSON.stringify({ path: "/protected" }))).resolves.toBeTruthy();
  });

  // -- Argument validation --

  it("returns error string when path argument is missing", async () => {
    const result = await tool.execute(JSON.stringify({}));
    expect(result).toContain("path");
  });

  it("returns error on invalid JSON input", async () => {
    const result = await tool.execute("{broken json");
    expect(result).toContain("invalid JSON");
  });
});
