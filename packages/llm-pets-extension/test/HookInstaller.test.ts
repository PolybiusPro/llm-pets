import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HookInstaller } from "../src/cursor/HookInstaller.js";
import { resolveHookProviderTarget } from "../src/cursor/hookProvider.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true })
  ));
});

describe("HookInstaller", () => {
  it("detects installation, preserves existing hooks, and leaves the extension script", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cursor-pet-installer-"));
    temporaryDirectories.push(root);
    const bundledScript = path.join(root, "bundled.cjs");
    await fs.writeFile(bundledScript, "process.stdin.resume();\n", "utf8");
    await fs.writeFile(
      path.join(root, "hooks.json"),
      JSON.stringify({
        version: 1,
        hooks: { stop: [{ command: "existing" }], afterFileEdit: [{ command: "keep" }] }
      }),
      "utf8"
    );
    const installer = new HookInstaller(
      resolveHookProviderTarget("cursor", { CURSOR_HOME: root }, root),
      bundledScript,
      path.join(root, "share", "llm-pets", "extension-hook.cjs")
    );

    expect(installer.hooksPath).toBe(path.join(root, "hooks.json"));
    expect(installer.scriptPath).toBe(path.join(root, "share", "llm-pets", "extension-hook.cjs"));
    expect(await installer.isInstalled()).toBe(false);
    await installer.install();
    expect(await installer.isInstalled()).toBe(true);
    const installed = JSON.parse(await fs.readFile(installer.hooksPath, "utf8"));
    expect(installed.hooks.stop).toHaveLength(2);
    expect(installed.hooks.afterFileEdit).toEqual([{ command: "keep" }]);
    await expect(fs.access(installer.scriptPath)).resolves.toBeUndefined();

    await installer.uninstall();
    expect(await installer.isInstalled()).toBe(false);
    await expect(fs.access(installer.scriptPath)).resolves.toBeUndefined();
    const removed = JSON.parse(await fs.readFile(installer.hooksPath, "utf8"));
    expect(removed.hooks.stop).toEqual([{ command: "existing" }]);
    expect(removed.hooks.afterFileEdit).toEqual([{ command: "keep" }]);
  });

  it("merges nested hooks into an existing Claude settings.json", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "claude-pet-installer-"));
    temporaryDirectories.push(root);
    const bundledScript = path.join(root, "bundled.cjs");
    await fs.writeFile(bundledScript, "process.stdin.resume();\n", "utf8");
    await fs.writeFile(
      path.join(root, "settings.json"),
      JSON.stringify({
        theme: "dark",
        hooks: {
          Stop: [{ hooks: [{ type: "command", command: "existing" }] }]
        }
      }),
      "utf8"
    );
    const installer = new HookInstaller(
      resolveHookProviderTarget("claude", { CLAUDE_CONFIG_DIR: root }, root),
      bundledScript,
      path.join(root, "share", "llm-pets", "extension-hook.cjs")
    );

    expect(installer.hooksPath).toBe(path.join(root, "settings.json"));
    await installer.install();
    const installed = JSON.parse(await fs.readFile(installer.hooksPath, "utf8"));
    expect(installed.theme).toBe("dark");
    expect(installed.version).toBeUndefined();
    expect(installed.hooks.Stop).toHaveLength(2);
    expect(installed.hooks.PreToolUse[0].hooks[0]).toMatchObject({
      type: "command",
      command: expect.stringMatching(/extension-hook\.cjs\" claude$/),
      async: true
    });
  });

  it("installs synchronous nested hooks for Codex", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-pet-installer-"));
    temporaryDirectories.push(root);
    const bundledScript = path.join(root, "bundled.cjs");
    await fs.writeFile(bundledScript, "process.stdin.resume();\n", "utf8");
    const installer = new HookInstaller(
      resolveHookProviderTarget("codex", { CODEX_HOME: root }, root),
      bundledScript,
      path.join(root, "share", "llm-pets", "extension-hook.cjs")
    );

    await installer.install();
    const installed = JSON.parse(await fs.readFile(installer.hooksPath, "utf8"));
    expect(installed.hooks.PreToolUse[0].hooks[0]).toMatchObject({
      type: "command",
      command: expect.stringMatching(/extension-hook\.cjs\" codex$/)
    });
    expect(installed.hooks.PreToolUse[0].hooks[0]).not.toHaveProperty("async");
  });
});
