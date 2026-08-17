import { describe, expect, it } from "vitest";
import {
  deletePlacements,
  drawSequence,
  eraseSequence,
  freeImages,
  placeFrame,
  transmitFrame
} from "../src/backends/kitty.js";
import { clearSequence } from "../src/terminal.js";

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

describe("kitty overlay", () => {
  it("does not erase terminal cells when placing a frame", () => {
    const sequence = drawSequence(10, 20, 7100);
    expect(sequence.includes(clearSequence(10, 20, 5, 9))).toBe(false);
    expect(sequence.includes(Buffer.from("\x1b[0m"))).toBe(false);
    expect(sequence.toString().includes("X")).toBe(false);
    expect(sequence.includes(deletePlacements())).toBe(true);
    expect(sequence.includes(placeFrame(7100))).toBe(true);
    expect(sequence.includes(Buffer.from("\x1b[10;20H"))).toBe(true);
  });

  it("does not erase terminal cells when removing the pet", () => {
    const sequence = eraseSequence();
    expect(sequence.includes(Buffer.from("\x1b[0m"))).toBe(false);
    expect(sequence.toString().includes("X")).toBe(false);
    expect(sequence.includes(freeImages())).toBe(true);
  });
});
