import { describe, expect, it } from "vitest";
import { clearSequence, selectBackend } from "../src/terminal.js";

describe("clearSequence", () => {
  it("resets SGR before ECH", () => {
    const sequence = clearSequence(10, 5, 3, 9);
    expect(sequence.subarray(0, 4).equals(Buffer.from("\x1b[0m"))).toBe(true);
    expect(sequence.toString().split("\x1b[9X").length - 1).toBe(3);
  });
});

describe("selectBackend", () => {
  it("has no overlay inside tmux", () => {
    expect(selectBackend({ TMUX: "/tmp/x", TERM: "xterm-kitty" })).toBe("none");
  });

  it("detects kitty-family terminals", () => {
    expect(selectBackend({ TERM: "xterm-kitty" })).toBe("kitty");
    expect(selectBackend({ KITTY_WINDOW_ID: "1", TERM: "xterm" })).toBe("kitty");
    expect(selectBackend({ TERM_PROGRAM: "ghostty" })).toBe("kitty");
  });

  it("uses the Konsole version boundary", () => {
    expect(selectBackend({ KONSOLE_VERSION: "220400" })).toBe("kitty");
    expect(selectBackend({ KONSOLE_VERSION: "211200" })).toBe("none");
  });

  it("has no overlay on a plain terminal", () => {
    expect(selectBackend({ TERM: "xterm-256color" })).toBe("none");
  });
});
