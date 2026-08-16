import { promises as fs, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findRepoRoot, installPackage, type RunCommand } from "../src/install.js";

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "llm-pets-repo-"));
  await fs.writeFile(
    path.join(root, "pnpm-workspace.yaml"),
    "packages:\n  - packages/llm-pets-extension\n  - packages/llm-pets-cli\n"
  );
  await fs.mkdir(path.join(root, "packages", "llm-pets-extension"), { recursive: true });
  await fs.writeFile(
    path.join(root, "packages", "llm-pets-extension", "package.json"),
    JSON.stringify({
      name: "llm-pets-extension",
      version: "0.1.0",
      scripts: { "vscode:prepublish": "pnpm run check && pnpm test && pnpm run build" }
    })
  );
  await fs.mkdir(path.join(root, "packages", "llm-pets-terminal"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("findRepoRoot", () => {
  it("walks up until pnpm-workspace.yaml", async () => {
    const nested = path.join(root, "packages", "llm-pets-cli", "dist");
    await fs.mkdir(nested, { recursive: true });
    expect(findRepoRoot(nested)).toBe(root);
  });
});

describe("installPackage", () => {
  it("packages the extension and installs the VSIX into cursor", async () => {
    const calls: Array<{ command: string; args: string[]; cwd?: string }> = [];
    const run: RunCommand = (command, args, options) => {
      calls.push({ command, args, cwd: options?.cwd });
      return { status: 0 };
    };
    await fs.mkdir(path.join(root, "packages", "llm-pets-extension", "build"), { recursive: true });
    await fs.writeFile(
      path.join(root, "packages", "llm-pets-extension", "build", "llm-pets-extension-0.1.0.vsix"),
      "vsix"
    );
    await installPackage("extension", { repoRoot: root, run, which: (name) => (name === "cursor" ? "/usr/bin/cursor" : null) });
    expect(calls[0]).toMatchObject({
      command: "pnpm",
      args: ["--filter", "llm-pets-extension", "run", "package"],
      cwd: root
    });
    expect(calls[1]?.command).toBe("/usr/bin/cursor");
    expect(calls[1]?.args[0]).toBe("--install-extension");
    expect(calls[1]?.args[1]).toContain("llm-pets-extension-0.1.0.vsix");
  });

  it("packages the extension on Windows without VSCE invoking npm", async () => {
    const calls: Array<{ command: string; args: string[]; cwd?: string }> = [];
    const run: RunCommand = (command, args, options) => {
      calls.push({ command, args, cwd: options?.cwd });
      if (command === "node" && args[1] === "package") {
        const stagedManifest = JSON.parse(
          readFileSync(path.join(options?.cwd ?? "", "package.json"), "utf8")
        ) as { scripts?: Record<string, string> };
        expect(stagedManifest.scripts?.["vscode:prepublish"]).toBeUndefined();
      }
      return { status: 0 };
    };
    await fs.mkdir(path.join(root, "packages", "llm-pets-extension", "dist"), { recursive: true });
    await fs.writeFile(path.join(root, "packages", "llm-pets-extension", "dist", "extension.js"), "built");

    await installPackage("extension-windows", {
      repoRoot: root,
      run,
      which: (name) => (name === "code" ? "C:\\VS Code\\bin\\code.cmd" : null),
      platform: "win32"
    });

    expect(calls[0]).toMatchObject({
      command: "pnpm",
      args: ["--filter", "llm-pets-extension", "run", "vscode:prepublish"],
      cwd: root
    });
    expect(calls[1]?.command).toBe("node");
    expect(calls[1]?.args).toContain("--no-dependencies");
    expect(calls[1]?.args).toContain(
      path.join(root, "packages", "llm-pets-extension", "build", "llm-pets-extension-0.1.0.vsix")
    );
    expect(calls[2]).toMatchObject({
      command: "C:\\VS Code\\bin\\code.cmd",
      args: [
        "--install-extension",
        path.join(root, "packages", "llm-pets-extension", "build", "llm-pets-extension-0.1.0.vsix"),
        "--force"
      ]
    });
  });

  it("rejects the Windows extension installer on other platforms", async () => {
    await expect(installPackage("extension-windows", { repoRoot: root, platform: "linux" })).rejects.toThrow(
      /only supported on Windows/i
    );
  });

  it("compiles the terminal renderer then runs node dist/main.js install", async () => {
    const calls: Array<{ command: string; args: string[]; cwd?: string }> = [];
    const run: RunCommand = (command, args, options) => {
      calls.push({ command, args, cwd: options?.cwd });
      return { status: 0 };
    };
    await installPackage("terminal", { repoRoot: root, run });
    expect(calls[0]).toMatchObject({
      command: "pnpm",
      args: ["--filter", "llm-pets-terminal", "compile"],
      cwd: root
    });
    expect(calls[1]).toMatchObject({
      command: "node",
      args: [path.join(root, "packages", "llm-pets-terminal", "dist", "main.js"), "install"],
      cwd: path.join(root, "packages", "llm-pets-terminal")
    });
  });
});
