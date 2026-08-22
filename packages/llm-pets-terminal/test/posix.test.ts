import { closeSync, readSync, writeSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { flushInput, openPty } from "../src/posix.js";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("flushInput", () => {
  it("discards bytes already queued on the fd instead of leaving them for the next reader", async () => {
    const { master, slave } = openPty();
    try {
      // A trailing newline is needed so the pty's line discipline (canonical
      // mode) ever releases the bytes to a reader in the first place.
      writeSync(master, Buffer.from("\x1b[?62c\n"));
      await wait(20); // let the kernel move the bytes into the slave's input queue

      flushInput(slave);

      writeSync(master, Buffer.from("OK\n"));
      await wait(20);

      const buffer = Buffer.alloc(64);
      const bytesRead = readSync(slave, buffer, 0, buffer.length, null);
      expect(buffer.subarray(0, bytesRead).toString().trim()).toBe("OK");
    } finally {
      closeSync(master);
      closeSync(slave);
    }
  });
});
