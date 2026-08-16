import { describe, expect, it } from "vitest";
import {
  CLAUDE_HOOK_EVENTS,
  CODEX_HOOK_EVENTS
} from "../src/cursor/hookProvider.js";
import {
  CURSOR_HOOK_EVENTS,
  hasPetHooks,
  hookCommand,
  mergeCursorPetHooks,
  mergePetHooks,
  removeCursorPetHooks,
  removePetHooks,
  hasCursorPetHooks
} from "../src/cursor/HookConfiguration.js";

describe("Cursor Pet Hook configuration", () => {
  it("adds Cursor hook handlers without replacing existing hooks", () => {
    const command = hookCommand("C:\\Cursor Pet\\hook.cjs");
    const existing = {
      version: 1,
      description: "keep me",
      hooks: {
        stop: [{ command: "existing" }],
        afterFileEdit: [{ command: "custom" }]
      }
    };
    const merged = mergeCursorPetHooks(existing, command);
    expect(merged.version).toBe(1);
    expect(merged.description).toBe("keep me");
    expect((merged.hooks as Record<string, unknown[]>).stop).toHaveLength(2);
    expect((merged.hooks as Record<string, unknown[]>).afterFileEdit).toEqual(
      existing.hooks.afterFileEdit
    );
    for (const eventName of CURSOR_HOOK_EVENTS) {
      const entries = (merged.hooks as Record<string, Array<{ command?: string }>>)[eventName];
      expect(entries.some((entry) => entry.command === command)).toBe(true);
    }
  });

  it("merges nested Codex and Claude hook entries without wiping sibling settings", () => {
    const command = hookCommand("/tmp/llm-pets/hook.cjs");
    const existing = {
      theme: "dark",
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "existing" }] }]
      }
    };
    const merged = mergePetHooks(existing, command, CODEX_HOOK_EVENTS, {
      entryStyle: "nested",
      setSchemaVersion: false
    });
    expect(merged.version).toBeUndefined();
    expect(merged.theme).toBe("dark");
    const preToolUse = (merged.hooks as Record<string, unknown[]>).PreToolUse;
    expect(preToolUse).toHaveLength(2);
    expect(hasPetHooks(merged, command, CODEX_HOOK_EVENTS)).toBe(true);
    const claudeMerged = mergePetHooks(existing, command, CLAUDE_HOOK_EVENTS, {
      entryStyle: "nested",
      setSchemaVersion: false
    });
    expect(hasPetHooks(claudeMerged, command, CLAUDE_HOOK_EVENTS)).toBe(true);
    const removed = removePetHooks(merged, command);
    expect(hasPetHooks(removed, command, CODEX_HOOK_EVENTS)).toBe(false);
    expect((removed.hooks as Record<string, unknown[]>).PreToolUse).toEqual([
      { matcher: "Bash", hooks: [{ type: "command", command: "existing" }] }
    ]);
  });

  it("is idempotent and removes only its own command", () => {
    const command = hookCommand("/tmp/cursor-pet/hook.cjs");
    const once = mergeCursorPetHooks({}, command);
    expect(once.version).toBe(1);
    expect(hasCursorPetHooks(once, command)).toBe(true);
    const twice = mergeCursorPetHooks(once, command);
    expect((twice.hooks as Record<string, unknown[]>).stop).toHaveLength(1);
    const removed = removeCursorPetHooks(twice, command);
    expect(hasCursorPetHooks(removed, command)).toBe(false);
    expect((removed.hooks as Record<string, unknown[]>).stop).toEqual([]);
    expect((removed.hooks as Record<string, unknown[]>).afterFileEdit).toBeUndefined();
  });
});
