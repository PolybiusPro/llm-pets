import { describe, expect, it } from "vitest";
import { startFromWrapper, wrapperAction } from "../src/wrap.js";

describe("wrapperAction", () => {
  it("skips when stdin or stdout is not a tty", () => {
    expect(wrapperAction({}, { stdin: false, stdout: true })).toBe("skip");
    expect(wrapperAction({}, { stdin: true, stdout: false })).toBe("skip");
  });

  it("skips sixel, foot, and mlterm", () => {
    expect(wrapperAction({ TERM: "foot" }, { stdin: true, stdout: true })).toBe("skip");
    expect(wrapperAction({ TERM_PROGRAM: "mlterm" }, { stdin: true, stdout: true })).toBe("skip");
  });

  it("opens a pane inside tmux", () => {
    expect(wrapperAction({ TMUX: "/tmp/tmux-1" }, { stdin: true, stdout: true })).toBe("pane");
  });

  it("overlays outside tmux", () => {
    expect(wrapperAction({ TERM: "xterm-256color" }, { stdin: true, stdout: true })).toBe("overlay");
  });
});

describe("startFromWrapper", () => {
  it("spawns pane --ensure inside tmux", () => {
    const spawned: string[][] = [];
    startFromWrapper({ TMUX: "1" }, (args) => spawned.push(args), { stdin: true, stdout: true });
    expect(spawned).toEqual([["pane", "--ensure"]]);
  });
});
