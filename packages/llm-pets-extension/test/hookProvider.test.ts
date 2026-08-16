import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLAUDE_HOOK_EVENTS,
  CODEX_HOOK_EVENTS,
  isHookProvider,
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
