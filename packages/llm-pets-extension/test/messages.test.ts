import { describe, expect, it } from "vitest";
import { isWebviewMessage } from "../src/webview/messages.js";

describe("webview message validation", () => {
  it("accepts supported messages", () => {
    expect(isWebviewMessage({ type: "ready" })).toBe(true);
    expect(isWebviewMessage({ type: "animationComplete", state: "review" })).toBe(true);
    expect(isWebviewMessage({ type: "setupHooks" })).toBe(true);
    expect(isWebviewMessage({ type: "showHooksHelp" })).toBe(true);
    expect(isWebviewMessage({ type: "customBackgroundLoadFailed" })).toBe(true);
    expect(isWebviewMessage({ type: "cycleHookProvider" })).toBe(true);
  });

  it("rejects unknown message types and states", () => {
    expect(isWebviewMessage({ type: "unknown" })).toBe(false);
    expect(isWebviewMessage({ type: "animationComplete", state: "waving" })).toBe(false);
    expect(isWebviewMessage(null)).toBe(false);
  });
});
