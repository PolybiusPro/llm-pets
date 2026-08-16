import { describe, expect, it } from "vitest";
import {
  CLAUDE_HOOK_EVENTS,
  CODEX_HOOK_EVENTS,
  CURSOR_HOOK_EVENTS,
  HookStateTracker,
  SPOOL_HOOK_EVENTS,
  hookEventTransition,
  normalizeHookEventName,
  parseHookEvent,
  type HookEvent,
  type HookEventName
} from "../index.js";

function event(eventName: HookEventName, sessionId = "session-a", occurredAt = 1000): HookEvent {
  return { version: 1, eventName, sessionId, cwd: "/workspace", occurredAt };
}

describe("shared hook protocol", () => {
  it("canonicalizes every provider vocabulary", () => {
    expect(normalizeHookEventName("preToolUse")).toBe("PreToolUse");
    expect(normalizeHookEventName("PreToolUse")).toBe("PreToolUse");
    expect(CURSOR_HOOK_EVENTS).toContain("sessionEnd");
    expect(CODEX_HOOK_EVENTS).toContain("SessionEnd");
    expect(CLAUDE_HOOK_EVENTS).toContain("PostToolUseFailure");
    for (const eventName of SPOOL_HOOK_EVENTS) {
      expect(normalizeHookEventName(eventName)).toBe(eventName);
    }
    for (const eventName of [...CURSOR_HOOK_EVENTS, ...CODEX_HOOK_EVENTS, ...CLAUDE_HOOK_EVENTS]) {
      expect(normalizeHookEventName(eventName)).toBeDefined();
    }
  });

  it("uses one transition table for state and settling behavior", () => {
    expect(hookEventTransition("PostToolUseFailure")).toEqual({
      state: "failed",
      settleAfterMs: 5000
    });
    expect(hookEventTransition("SessionEnd")).toEqual({
      state: "review",
      settleAfterMs: 3000
    });
  });

  it("validates the spool contract and tracks aggregate state", () => {
    const parsed = parseHookEvent({ ...event("PreToolUse"), eventName: "preToolUse" });
    expect(parsed?.eventName).toBe("PreToolUse");
    expect(parseHookEvent({ ...event("PreToolUse"), version: 2 })).toBeUndefined();

    const tracker = new HookStateTracker();
    expect(tracker.handle(event("PreToolUse", "running")).state).toBe("running");
    expect(tracker.handle(event("PermissionRequest", "waiting")).state).toBe("waiting");
    expect(tracker.handle(event("PostToolUseFailure", "failed")).state).toBe("failed");
    expect(tracker.state(6001)).toBe("waiting");

    const completed = new HookStateTracker();
    expect(completed.handle(event("SessionEnd", "finished", 7000)).state).toBe("review");
    expect(completed.state(10001)).toBe("idle");

    const ordered = new HookStateTracker();
    ordered.handle(event("PermissionRequest", "ordered", 2000));
    expect(ordered.handle(event("PreToolUse", "ordered", 1000))).toEqual({
      state: "waiting",
      sessionId: "ordered"
    });
  });
});
