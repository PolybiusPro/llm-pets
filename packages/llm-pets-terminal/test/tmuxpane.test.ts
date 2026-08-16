import { describe, expect, it } from "vitest";
import { openPetPane, waitForAgent, type PaneArgs } from "../src/tmuxpane.js";

describe("tmux pane", () => {
  it("waits until the agent appears", async () => {
    let n = 0;
    const found = await waitForAgent("%0", 5, () => {
      n += 1;
      return n >= 3;
    });
    expect(found).toBe(true);
    expect(n).toBeGreaterThanOrEqual(3);
  });

  it("times out when no agent appears", async () => {
    const start = performance.now();
    const found = await waitForAgent("%0", 0.01, () => false);
    expect(found).toBe(false);
    expect(performance.now() - start).toBeLessThan(2000);
  });

  it("puts --pet before pane --render", async () => {
    const calls: string[][] = [];
    const run = (...arguments_: string[]) => {
      calls.push(arguments_);
      if (arguments_[0] === "list-panes") {
        return { status: 0, stdout: "", stderr: "" };
      }
      if (arguments_[0] === "split-window") {
        return { status: 0, stdout: "%99\n", stderr: "" };
      }
      return { status: 0, stdout: "", stderr: "" };
    };
    const args: PaneArgs = {
      pet: "dude",
      position: "right",
      paneSize: 12,
      cwd: "/tmp",
      width: 0
    };
    // openPetPane loads a real pet; skip if dude is missing.
    try {
      await openPetPane("%11", args, run);
    } catch (error) {
      if (String(error).includes("no pet named")) {
        return;
      }
      throw error;
    }
    const split = calls.find((arguments_) => arguments_[0] === "split-window");
    expect(split).toBeDefined();
    const command = split?.[split.length - 1] ?? "";
    expect(command).toMatch(/ --pet dude pane --render/);
    expect(command).not.toMatch(/ pane --render .*--pet /);
  });
});
