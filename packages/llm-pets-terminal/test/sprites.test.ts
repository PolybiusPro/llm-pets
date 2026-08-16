import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Animator, DEFAULT_ANIMATIONS, PetSpriteSheet } from "../src/sprites.js";
import { buildPet } from "./helpers.js";

async function withTemp<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(path.join(os.tmpdir(), "llm-pets-sprite-"));
  try {
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("PetSpriteSheet", () => {
  it("uses default animations for a minimal manifest", async () => {
    await withTemp(async (root) => {
      const sheet = await PetSpriteSheet.load(await buildPet(path.join(root, "dude"), { id: "dude" }));
      expect(sheet.animations.running?.frames).toEqual([56, 57, 58, 59, 60, 61]);
      expect(sheet.animations.idle).toBeDefined();
      expect(sheet.frameCount).toBe(72);
    });
  });

  it("selects eleven rows from spriteVersionNumber 2", async () => {
    await withTemp(async (root) => {
      const sheet = await PetSpriteSheet.load(
        await buildPet(path.join(root, "banana-cat"), { id: "banana-cat", spriteVersionNumber: 2 }, { rows: 11, cell: 9 })
      );
      expect(sheet.rows).toBe(11);
      expect(sheet.frameCount).toBe(88);
    });
  });

  it("uses occupied cells in v2 idle row zero", async () => {
    const occupied = { 0: 7, 3: 4, 4: 5, 5: 8, 6: 6, 7: 6, 8: 6, 9: 8, 10: 8 };
    await withTemp(async (root) => {
      const sheet = await PetSpriteSheet.load(
        await buildPet(
          path.join(root, "banana-cat"),
          { id: "banana-cat", spriteVersionNumber: 2 },
          { rows: 11, occupied }
        )
      );
      expect(sheet.animations.idle?.frames).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(sheet.animations.running?.frames).toEqual([56, 57, 58, 59, 60, 61]);
    });
  });

  it("loads v2 side-run and look animations", async () => {
    const occupied = { 0: 7, 1: 8, 2: 8, 3: 4, 4: 5, 5: 8, 6: 6, 7: 6, 8: 6, 9: 8, 10: 8 };
    await withTemp(async (root) => {
      const sheet = await PetSpriteSheet.load(
        await buildPet(
          path.join(root, "banana-cat"),
          { id: "banana-cat", spriteVersionNumber: 2 },
          { rows: 11, occupied }
        )
      );
      expect(sheet.animations["running-right"]?.frames).toEqual([...Array(8).keys()].map((n) => n + 8));
      expect(sheet.animations["running-left"]?.frames).toEqual([...Array(8).keys()].map((n) => n + 16));
      expect(sheet.animations.look?.frames).toEqual([...Array(16).keys()].map((n) => n + 72));
    });
  });

  it("treats grid and index encodings as the same frames", async () => {
    await withTemp(async (root) => {
      const byGrid = await PetSpriteSheet.load(
        await buildPet(path.join(root, "a"), {
          id: "a",
          animations: { running: { row: 7, startColumn: 0, frameCount: 6 } }
        })
      );
      const byIndex = await PetSpriteSheet.load(
        await buildPet(path.join(root, "b"), {
          id: "b",
          animations: { running: { frames: [56, 57, 58, 59, 60, 61], fps: 8 } }
        })
      );
      expect(byGrid.animations.running?.frames).toEqual(byIndex.animations.running?.frames);
    });
  });

  it("falls back to default when an animation is invalid", async () => {
    await withTemp(async (root) => {
      const sheet = await PetSpriteSheet.load(
        await buildPet(path.join(root, "dude"), {
          id: "dude",
          animations: { running: { row: 99, startColumn: 0, frameCount: 6 } }
        })
      );
      expect(sheet.animations.running?.frames).toEqual(DEFAULT_ANIMATIONS.running.frames);
    });
  });

  it("crops animation frames to one shared box", async () => {
    await withTemp(async (root) => {
      const sheet = await PetSpriteSheet.load(await buildPet(path.join(root, "dude"), { id: "dude" }));
      const frames = sheet.croppedFrames("running");
      expect(new Set(frames.map((frame) => `${frame.width}x${frame.height}`)).size).toBe(1);
      expect(frames[0]?.width).toBeLessThan(sheet.frameWidth);
    });
  });
});

describe("Animation", () => {
  it("steps looping and one-shot clips", () => {
    const looping = DEFAULT_ANIMATIONS.running;
    const once = DEFAULT_ANIMATIONS.waving;
    expect(looping.indexAt(looping.frames.length)).toBe(0);
    expect(once.indexAt(99)).toBe(once.frames.length - 1);
  });
});

describe("Animator", () => {
  it("holds a frame until its duration elapses", async () => {
    await withTemp(async (root) => {
      const sheet = await PetSpriteSheet.load(
        await buildPet(path.join(root, "dude"), {
          id: "dude",
          animations: { idle: { frames: [0, 1], fps: 1 } }
        })
      );
      const animator = new Animator(sheet);
      expect(animator.frame("idle", 0.0)[1]).toBe(0);
      expect(animator.frame("idle", 0.5)[1]).toBe(0);
      expect(animator.frame("idle", 1.0)[1]).toBe(1);
    });
  });

  it("restarts when the state changes", async () => {
    await withTemp(async (root) => {
      const sheet = await PetSpriteSheet.load(
        await buildPet(path.join(root, "dude"), {
          id: "dude",
          animations: {
            idle: { frames: [0, 1], fps: 1 },
            running: { frames: [56, 57], fps: 10 }
          }
        })
      );
      const animator = new Animator(sheet);
      animator.frame("idle", 0.0);
      animator.frame("idle", 1.0);
      expect(animator.frame("running", 2.0)).toEqual(["running", 0]);
    });
  });

  it("plays look after the v2 idle cycle", async () => {
    await withTemp(async (root) => {
      const sheet = await PetSpriteSheet.load(
        await buildPet(
          path.join(root, "banana-cat"),
          {
            id: "banana-cat",
            spriteVersionNumber: 2,
            animations: {
              idle: { frames: [0, 1], fps: 1 },
              look: { frames: [72, 73], fps: 1 }
            }
          },
          { rows: 11 }
        )
      );
      const animator = new Animator(sheet);
      expect(animator.frame("idle", 0.0)).toEqual(["idle", 0]);
      expect(animator.frame("idle", 1.0)).toEqual(["idle", 1]);
      expect(animator.frame("idle", 2.0)).toEqual(["look", 0]);
    });
  });

  it("plays side runs before the v2 work cycle", async () => {
    await withTemp(async (root) => {
      const sheet = await PetSpriteSheet.load(
        await buildPet(
          path.join(root, "banana-cat"),
          {
            id: "banana-cat",
            spriteVersionNumber: 2,
            animations: {
              "running-right": { frames: [8, 9], fps: 1 },
              "running-left": { frames: [16], fps: 1 },
              running: { frames: [56], fps: 1 }
            }
          },
          { rows: 11 }
        )
      );
      const animator = new Animator(sheet);
      expect(animator.frame("running", 0.0)).toEqual(["running-right", 0]);
      expect(animator.frame("running", 1.0)).toEqual(["running-right", 1]);
      expect(animator.frame("running", 2.0)).toEqual(["running-left", 0]);
      expect(animator.frame("running", 3.0)).toEqual(["running", 0]);
    });
  });
});
