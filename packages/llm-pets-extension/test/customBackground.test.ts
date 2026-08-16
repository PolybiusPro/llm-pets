import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getStrings } from "../src/localization.js";
import {
  backgroundOpacityOptions,
  normalizeBackgroundOpacity,
  validateCustomBackground
} from "../src/webview/customBackground.js";

let temporaryRoot: string;

beforeEach(async () => {
  temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-pet-background-"));
});

afterEach(async () => {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
});

describe("custom backgrounds", () => {
  it("accepts a supported local image and reads its dimensions", async () => {
    const filePath = path.join(temporaryRoot, "background.png");
    const image = Buffer.alloc(24);
    image.set(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 0);
    image.write("IHDR", 12, "ascii");
    image.writeUInt32BE(1280, 16);
    image.writeUInt32BE(720, 20);
    await fs.writeFile(filePath, image);

    await expect(validateCustomBackground(filePath)).resolves.toEqual({
      path: path.resolve(filePath),
      dimensions: { width: 1280, height: 720, format: "png" }
    });
  });

  it("rejects unsupported extensions and malformed images", async () => {
    const textPath = path.join(temporaryRoot, "background.jpg");
    await fs.writeFile(textPath, "not an image");
    await expect(validateCustomBackground(textPath)).rejects.toThrow(/PNG, WebP, or GIF/);

    const malformedPath = path.join(temporaryRoot, "background.webp");
    await fs.writeFile(malformedPath, "not a webp");
    await expect(validateCustomBackground(malformedPath)).rejects.toThrow(/invalid or malformed/);
  });

  it("normalizes opacity and localizes the picker", () => {
    expect(normalizeBackgroundOpacity(-1)).toBe(0);
    expect(normalizeBackgroundOpacity(0.45)).toBe(0.45);
    expect(normalizeBackgroundOpacity(2)).toBe(1);
    expect(normalizeBackgroundOpacity("0.5")).toBe(1);
    expect(backgroundOpacityOptions(getStrings("en"))[2]).toMatchObject({
      value: 0.75,
      label: "75%",
      description: "75% opaque"
    });
    expect(backgroundOpacityOptions(getStrings("ja"))[2]?.description).toBe("75% opaque");
  });
});
