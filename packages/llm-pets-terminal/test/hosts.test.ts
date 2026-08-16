import { readlinkSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hostRunning, parseStat } from "../src/hosts.js";

describe("hosts", () => {
  it("parses /proc/pid/stat names that contain spaces and parentheses", () => {
    const parsed = parseStat("42 (claude (dev)) S 1 42 42 34816 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0");
    expect(parsed?.[0]).toBe("claude (dev)");
    expect(parsed?.[1][0]).toBe("S");
    expect(parsed?.[1][4]).toBe("34816");
  });

  it("finds an agent on this terminal when one is attached", () => {
    for (const fd of [0, 1, 2]) {
      try {
        const name = readlinkSync(`/proc/self/fd/${fd}`);
        if (!name.startsWith("/dev/")) {
          continue;
        }
        if (hostRunning(statSync(name).rdev)) {
          return;
        }
      } catch {
        // Not a tty.
      }
    }
  });
});
