import { describe, expect, it } from "vitest";
import { deletePlacements, freeImages, placeFrame, transmitFrame } from "../src/backends/kitty.js";

describe("kitty protocol", () => {
  it("suppresses replies on every command", () => {
    const commands = [
      placeFrame(1),
      deletePlacements(),
      freeImages(),
      transmitFrame(1, Buffer.concat([Buffer.from("\x89PNG\r\n\x1a\n"), Buffer.alloc(32, 0x78)]))
    ];
    for (const command of commands) {
      expect(command.includes(Buffer.from("q=2"))).toBe(true);
      expect(command.subarray(0, 3).equals(Buffer.from("\x1b_G"))).toBe(true);
      expect(command.subarray(-2).equals(Buffer.from("\x1b\\"))).toBe(true);
    }
  });

  it("chunks large frames", () => {
    const payload = transmitFrame(
      7,
      Buffer.concat([Buffer.from("\x89PNG\r\n\x1a\n"), Buffer.alloc(12000, 0x79)])
    );
    expect(payload.toString().split("\x1b_G").length - 1).toBeGreaterThan(1);
    expect(payload.includes(Buffer.from("m=1"))).toBe(true);
    expect(payload.includes(Buffer.from("m=0"))).toBe(true);
    expect(payload.includes(Buffer.from("i=7"))).toBe(true);
  });
});
