import { closeSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ansiLines, blockColumns, BlocksBackend, MINIMUM_CELL_ROWS } from "../src/backends/blocks.js";
import { openPty, setTerminalSize } from "../src/posix.js";
import { PetSpriteSheet, type RgbaFrame } from "../src/sprites.js";
import { buildPet } from "./helpers.js";

function solid(width: number, height: number, rgba: [number, number, number, number]): RgbaFrame {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = rgba[0];
    data[i * 4 + 1] = rgba[1];
    data[i * 4 + 2] = rgba[2];
    data[i * 4 + 3] = rgba[3];
  }
  return { width, height, data };
}

describe("blocks", () => {
  it("resets and overwrites transparent cells", async () => {
    const frame = solid(8, 8, [0, 0, 0, 0]);
    for (let x = 0; x < 4; x += 1) {
      for (let y = 0; y < 8; y += 1) {
        const offset = (y * 8 + x) * 4;
        frame.data[offset] = 255;
        frame.data[offset + 3] = 255;
      }
    }
    const lines = await ansiLines(frame, 8);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain("\x1b[0m ");
    expect(lines[0]).toContain("38;2;255;0;0");
  });

  it("shrinks to fit a short terminal", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "llm-pets-blocks-"));
    const { master, slave } = openPty();
    try {
      const sheet = await PetSpriteSheet.load(await buildPet(path.join(root, "dude"), { id: "dude" }));
      setTerminalSize(slave, 9, 60);
      const backend = new BlocksBackend(sheet, slave, 9);
      expect(backend.requestedRows).toBe(9);
      const placement = backend.placement();
      expect(placement).toBeDefined();
      expect(backend.cellRows).toBeLessThan(9);
      expect(backend.cellRows).toBeGreaterThanOrEqual(MINIMUM_CELL_ROWS);
    } finally {
      closeSync(master);
      closeSync(slave);
      await rm(root, { recursive: true, force: true });
    }
  });

  it("tracks aspect ratio in column count", () => {
    const wide = solid(40, 10, [0, 0, 0, 255]);
    const tall = solid(10, 40, [0, 0, 0, 255]);
    expect(blockColumns(wide, 5)).toBeGreaterThan(blockColumns(tall, 5));
  });
});
