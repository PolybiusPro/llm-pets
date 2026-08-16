import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { UiStrings } from "../localization.js";
import { readImageDimensions, type ImageDimensions } from "../pet/imageDimensions.js";

const MAX_CUSTOM_BACKGROUND_BYTES = 20 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set([".png", ".webp", ".gif"]);

export interface CustomBackgroundValidation {
  path: string;
  dimensions: ImageDimensions;
}

export interface BackgroundOpacityOption {
  value: number;
  label: string;
  description: string;
}

export async function validateCustomBackground(filePath: string): Promise<CustomBackgroundValidation> {
  const resolved = path.resolve(filePath);
  if (!SUPPORTED_EXTENSIONS.has(path.extname(resolved).toLowerCase())) {
    throw new Error("Custom background must be a PNG, WebP, or GIF file.");
  }
  const stat = await fs.stat(resolved);
  if (!stat.isFile()) {
    throw new Error("Custom background must be a file.");
  }
  if (stat.size <= 0 || stat.size > MAX_CUSTOM_BACKGROUND_BYTES) {
    throw new Error("Custom background must be between 1 byte and 20 MB.");
  }
  let dimensions: ImageDimensions;
  try {
    dimensions = readImageDimensions(await fs.readFile(resolved));
  } catch {
    throw new Error("Custom background image is invalid or malformed.");
  }
  return { path: resolved, dimensions };
}

export function normalizeBackgroundOpacity(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 1;
}

export function backgroundOpacityOptions(strings: UiStrings): readonly BackgroundOpacityOption[] {
  return [0.25, 0.5, 0.75, 1].map((value) => ({
    value,
    label: `${Math.round(value * 100)}%`,
    description: strings.customBackground.opacityDescription(value)
  }));
}
