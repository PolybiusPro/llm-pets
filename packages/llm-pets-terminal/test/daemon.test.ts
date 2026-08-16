import { readFileSync } from "node:fs";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { run } from "../src/daemon.js";
import { OVERLAY_OPEN_FLAGS } from "../src/lock.js";

describe("daemon", () => {
  it("exits without opening a tty for the none backend", async () => {
    expect(await run("/dev/pts/999", "none", "unused")).toBe(0);
  });

  it("opens overlay ttys write-only without stealing the controlling terminal", () => {
    expect(OVERLAY_OPEN_FLAGS & constants.O_WRONLY).toBeTruthy();
    expect(OVERLAY_OPEN_FLAGS & constants.O_NOCTTY).toBeTruthy();
  });

  it("does not call probe from the overlay daemon", () => {
    const source = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/daemon.ts"), "utf8");
    expect(source).not.toContain("probeKittyGraphics");
  });
});
