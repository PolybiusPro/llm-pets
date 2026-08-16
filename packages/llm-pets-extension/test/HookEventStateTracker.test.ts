import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  HookEventStateTracker,
  isWithinWorkspace,
  parseCursorHookEvent,
  type CursorHookEvent,
  type CursorHookEventName
} from "../src/cursor/HookEventStateTracker.js";

function event(eventName: CursorHookEventName, sessionId = "session-a"): CursorHookEvent {
  return { version: 1, eventName, sessionId, cwd: path.resolve("workspace"), occurredAt: Date.now() };
}

describe("HookEventStateTracker", () => {
  it("maps Cursor lifecycle events and settles completed sessions", () => {
    const tracker = new HookEventStateTracker();
    expect(tracker.handle(event("SessionStart")).state).toBe("idle");
    expect(tracker.handle(event("UserPromptSubmit")).state).toBe("running");
    expect(tracker.handle(event("PreToolUse")).state).toBe("running");
    expect(tracker.handle(event("AfterAgentThought")).state).toBe("running");
    expect(tracker.handle(event("PostToolUseFailure")).settleAfterMs).toBe(5000);
    expect(tracker.handle(event("PostToolUseFailure")).state).toBe("failed");
    expect(tracker.handle(event("AfterAgentResponse")).state).toBe("review");
    expect(tracker.handle(event("AfterAgentResponse")).settleAfterMs).toBe(3000);
    expect(tracker.handle(event("Stop")).state).toBe("review");
    expect(tracker.handle(event("SessionEnd")).state).toBe("review");
    expect(tracker.handle(event("PostToolUse")).state).toBe("running");
    expect(tracker.handle(event("PermissionRequest")).state).toBe("waiting");
    expect(tracker.settle("session-a")).toBe("idle");
  });

  it("aggregates multiple sessions by visible priority", () => {
    const tracker = new HookEventStateTracker();
    tracker.handle(event("PreToolUse", "running"));
    expect(tracker.handle(event("SessionEnd", "finished")).state).toBe("running");
    expect(tracker.handle(event("PostToolUseFailure", "broken")).state).toBe("failed");
    expect(tracker.settle("broken")).toBe("running");
  });

  it("validates events and workspace containment", () => {
    expect(parseCursorHookEvent(event("SessionStart"))).toBeDefined();
    expect(parseCursorHookEvent({ ...event("SessionStart"), version: 2 })).toBeUndefined();
    expect(parseCursorHookEvent({ ...event("SessionStart"), eventName: "sessionStart" })).toMatchObject({
      eventName: "SessionStart"
    });
    const root = path.resolve("workspace");
    expect(isWithinWorkspace(path.join(root, "child"), [root])).toBe(true);
    expect(isWithinWorkspace(path.resolve("elsewhere"), [root])).toBe(false);
  });
});
