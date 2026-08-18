import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLAUDE_HOOK_EVENTS,
  CODEX_HOOK_EVENTS,
  availableHookProvidersForHost,
  isCursorHost,
  isHookProvider,
  hookProvidersForHost,
  nextHookProvider,
  resolveHookProviderForHost,
  resolveHookProviderTarget
} from "../src/cursor/hookProvider.js";

describe("hook provider targets", () => {
  it("resolves Cursor, Codex, and Claude user hook files", () => {
    expect(isHookProvider("cursor")).toBe(true);
    expect(isHookProvider("gemini")).toBe(false);

    const cursor = resolveHookProviderTarget("cursor", {}, "/home/tester");
    expect(cursor.configPath).toBe(path.join("/home/tester", ".cursor", "hooks.json"));
    expect(cursor.entryStyle).toBe("flat");
    expect(cursor.events).toContain("beforeSubmitPrompt");

    const codex = resolveHookProviderTarget(
      "codex",
      { CODEX_HOME: " /tmp/codex-home " },
      "/home/tester"
    );
    expect(codex.configPath).toBe(path.resolve("/tmp/codex-home", "hooks.json"));
    expect(codex.entryStyle).toBe("nested");
    expect(codex.setSchemaVersion).toBe(false);
    expect([...codex.events]).toEqual([...CODEX_HOOK_EVENTS]);

    const claude = resolveHookProviderTarget(
      "claude",
      { CLAUDE_CONFIG_DIR: "/tmp/claude-home" },
      "/home/tester"
    );
    expect(claude.configPath).toBe(path.resolve("/tmp/claude-home", "settings.json"));
    expect(claude.setSchemaVersion).toBe(false);
    expect([...claude.events]).toEqual([...CLAUDE_HOOK_EVENTS]);
  });
});

describe("cursor host", () => {
  it("detects Cursor from app name or uri scheme", () => {
    expect(isCursorHost("Cursor", "cursor")).toBe(true);
    expect(isCursorHost("Cursor", "vscode")).toBe(true);
    expect(isCursorHost("Visual Studio Code", "cursor")).toBe(true);
    expect(isCursorHost("Visual Studio Code", "vscode")).toBe(false);
    expect(isCursorHost("VSCodium", "vscodium")).toBe(false);
  });

  it("keeps Cursor and VS Code hook files on separate hosts", () => {
    expect(hookProvidersForHost(true)).toEqual(["cursor", "codex", "claude"]);
    expect(hookProvidersForHost(false)).toEqual(["codex", "claude"]);
  });

  it("installs only providers whose homes exist, with Cursor available in its host", () => {
    const existing = new Set([path.join("/home/tester", ".codex")]);
    const exists = (candidate: string) => existing.has(candidate);
    expect(availableHookProvidersForHost(true, {}, "/home/tester", exists)).toEqual(["cursor", "codex"]);
    expect(availableHookProvidersForHost(false, {}, "/home/tester", exists)).toEqual(["codex"]);
  });

  it("does not keep a Cursor provider selection in VS Code", () => {
    expect(resolveHookProviderForHost("cursor", true)).toBe("cursor");
    expect(resolveHookProviderForHost("cursor", false)).toBe("codex");
    expect(resolveHookProviderForHost("codex", true)).toBe("codex");
    expect(resolveHookProviderForHost("codex", false)).toBe("codex");
    expect(resolveHookProviderForHost("claude", false)).toBe("claude");
    expect(resolveHookProviderForHost("nope", true)).toBe("cursor");
    expect(resolveHookProviderForHost("nope", false)).toBe("codex");
  });

  it("does not cycle into the other host's providers", () => {
    expect(nextHookProvider("codex", false)).toBe("claude");
    expect(nextHookProvider("claude", false)).toBe("codex");
    expect(nextHookProvider("cursor", false)).toBe("claude");
    expect(nextHookProvider("cursor", true)).toBe("codex");
    expect(nextHookProvider("claude", true)).toBe("cursor");
  });
});
