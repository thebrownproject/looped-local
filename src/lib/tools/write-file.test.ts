import { describe, it, expect, vi, beforeEach } from "vitest";
import { createWriteFileTool } from "./write-file";

type WriteFn = (path: string, content: string) => Promise<void>;

describe("writeFileTool", () => {
  let writeMock: ReturnType<typeof vi.fn>;
  let tool: ReturnType<typeof createWriteFileTool>;

  beforeEach(() => {
    writeMock = vi.fn().mockResolvedValue(undefined);
    tool = createWriteFileTool(writeMock as WriteFn);
  });

  // -- Definition --

  it("has correct tool definition", () => {
    expect(tool.definition.name).toBe("write_file");
    expect(tool.definition.description).toBeTruthy();
    expect(tool.definition.parameters).toBeDefined();
  });

  // -- Execution --

  it("writes content to the specified path", async () => {
    const result = await tool.execute(JSON.stringify({ path: "/tmp/out.txt", content: "hello" }));
    expect(writeMock).toHaveBeenCalledWith("/tmp/out.txt", "hello");
    expect(result).toContain("written");
  });

  it("returns success string after write", async () => {
    const result = await tool.execute(
      JSON.stringify({ path: "/tmp/out.txt", content: "some data" })
    );
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("creates parent directories (write function handles mkdir)", async () => {
    await tool.execute(
      JSON.stringify({ path: "/tmp/nested/dir/file.txt", content: "data" })
    );
    // mkdir is handled by the write implementation; we verify the path is passed correctly
    expect(writeMock).toHaveBeenCalledWith("/tmp/nested/dir/file.txt", "data");
  });

  it("does not throw on write error - returns error string", async () => {
    writeMock.mockRejectedValue(new Error("EACCES: permission denied"));
    await expect(
      tool.execute(JSON.stringify({ path: "/protected/file.txt", content: "data" }))
    ).resolves.toBeTruthy();
  });

  it("returns error string on failure containing the path", async () => {
    writeMock.mockRejectedValue(new Error("disk full"));
    const result = await tool.execute(
      JSON.stringify({ path: "/full/disk.txt", content: "data" })
    );
    expect(result).toContain("Error");
    expect(result).toContain("/full/disk.txt");
  });

  // -- Argument validation --

  it("returns error string when path argument is missing", async () => {
    const result = await tool.execute(JSON.stringify({ content: "data" }));
    expect(result).toContain("path");
  });

  it("returns error string when content argument is missing", async () => {
    const result = await tool.execute(JSON.stringify({ path: "/tmp/file.txt" }));
    expect(result).toContain("content");
  });

  it("returns error when content is a number instead of string", async () => {
    const result = await tool.execute(JSON.stringify({ path: "/tmp/file.txt", content: 123 }));
    expect(result).toContain("content");
    expect(writeMock).not.toHaveBeenCalled();
  });

  it("returns error when content is a boolean instead of string", async () => {
    const result = await tool.execute(JSON.stringify({ path: "/tmp/file.txt", content: true }));
    expect(result).toContain("content");
    expect(writeMock).not.toHaveBeenCalled();
  });

  it("returns error when content is an object instead of string", async () => {
    const result = await tool.execute(JSON.stringify({ path: "/tmp/file.txt", content: { key: "val" } }));
    expect(result).toContain("content");
    expect(writeMock).not.toHaveBeenCalled();
  });

  it("returns error on invalid JSON input", async () => {
    const result = await tool.execute("not valid json");
    expect(result).toContain("invalid JSON");
  });
});
