import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { isDirectRun, parseArgs } from "../src/main.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("parseArgs", () => {
  it("treats --tty as run", () => {
    const parsed = parseArgs(["--tty", "/dev/pts/1"]);
    expect(parsed).toMatchObject({ command: "run", tty: "/dev/pts/1" });
  });

  it("parses install and uninstall", () => {
    expect(parseArgs(["install"])).toEqual({ command: "install" });
    expect(parseArgs(["uninstall"])).toEqual({ command: "uninstall" });
  });

  it("parses wrap", () => {
    expect(parseArgs(["wrap", "codex", "--help"])).toEqual({
      command: "wrap",
      agent: "codex",
      agentArgs: ["--help"]
    });
  });

  it("parses probe", () => {
    expect(parseArgs(["probe", "--quiet"])).toEqual({ command: "probe", quiet: true });
  });
});

describe("isDirectRun", () => {
  it("treats a symlink to the entry file as a direct invocation", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "llm-pet-entry-"));
    temporaryDirectories.push(directory);
    const target = path.join(directory, "main.js");
    writeFileSync(target, "console.log(1)\n");
    const link = path.join(directory, "llm-pet");
    symlinkSync(target, link);
    expect(isDirectRun(link, pathToFileURL(target).href)).toBe(true);
    expect(isDirectRun(target, pathToFileURL(target).href)).toBe(true);
    expect(isDirectRun(path.join(directory, "other.js"), pathToFileURL(target).href)).toBe(false);
  });
});
