import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HookReconciler } from "../src/cursor/HookReconciler.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true })
  ));
});

async function fixture(cursorHost: boolean): Promise<{
  root: string;
  reconciler: HookReconciler;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "llm-pets-reconciler-"));
  temporaryDirectories.push(root);
  const bundled = path.join(root, "bundled.cjs");
  await fs.writeFile(bundled, "// extension hook\n", "utf8");
  await fs.mkdir(path.join(root, ".codex"));
  await fs.mkdir(path.join(root, ".claude"));
  return {
    root,
    reconciler: new HookReconciler(
      cursorHost,
      bundled,
      path.join(root, ".local", "share", "llm-pets", "extension-hook.cjs"),
      path.join(root, ".local", "share", "llm-pets", "hook.cjs"),
      { HOME: root },
      root
    )
  };
}

describe("HookReconciler", () => {
  it("installs all available providers in Cursor and excludes Cursor in VS Code", async () => {
    const cursor = await fixture(true);
    expect(cursor.reconciler.availableProviders()).toEqual(["cursor", "codex", "claude"]);
    expect((await cursor.reconciler.installAvailable()).map(({ provider }) => provider))
      .toEqual(["cursor", "codex", "claude"]);

    const vscode = await fixture(false);
    expect(vscode.reconciler.availableProviders()).toEqual(["codex", "claude"]);
    await vscode.reconciler.installAvailable();
    await expect(fs.access(path.join(vscode.root, ".cursor", "hooks.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("continues after one provider has malformed configuration", async () => {
    const { root, reconciler } = await fixture(true);
    await fs.writeFile(path.join(root, ".codex", "hooks.json"), "not json", "utf8");
    const results = await reconciler.installAvailable();
    expect(results.find(({ provider }) => provider === "codex")?.error).toBeDefined();
    expect(results.find(({ provider }) => provider === "cursor")?.result).toBeDefined();
    expect(results.find(({ provider }) => provider === "claude")?.result).toBeDefined();
    await expect(fs.access(path.join(root, ".claude", "settings.json"))).resolves.toBeUndefined();
  });

  it("removes managed entries from every available provider", async () => {
    const { root, reconciler } = await fixture(true);
    await reconciler.installAvailable();
    const results = await reconciler.uninstallAvailable();
    expect(results.every(({ error }) => error === undefined)).toBe(true);
    for (const configPath of [
      path.join(root, ".cursor", "hooks.json"),
      path.join(root, ".codex", "hooks.json"),
      path.join(root, ".claude", "settings.json")
    ]) {
      expect(await fs.readFile(configPath, "utf8")).not.toContain("extension-hook.cjs");
    }
  });
});
