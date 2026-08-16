import { promises as fs } from "node:fs";
import * as path from "node:path";
import { getPetsDirectories } from "./codexHome.js";
import { readImageDimensions } from "./imageDimensions.js";
import { lookCells } from "./lookMath.js";
import type {
  CodexPet,
  PetAnimationName,
  PetLoadResult,
  SpriteAnimation
} from "./types.js";

const SUPPORTED_SPRITE_NAMES = [
  "spritesheet.webp",
  "spritesheet.png",
  "spritesheet.gif"
] as const;

const DEFAULT_ANIMATIONS: Record<PetAnimationName, SpriteAnimation> = {
  idle: animation(0, 6, 160, [280, 110, 110, 140, 140, 320]),
  waving: animation(3, 4, 140, [140, 140, 140, 280], false),
  failed: animation(5, 8, 140, [140, 140, 140, 140, 140, 140, 140, 240]),
  waiting: animation(6, 6, 150, [150, 150, 150, 150, 150, 260]),
  running: animation(7, 6, 120, [120, 120, 120, 120, 120, 220]),
  review: animation(8, 6, 150, [150, 150, 150, 150, 150, 280])
};

interface PetManifest {
  id?: unknown;
  displayName?: unknown;
  name?: unknown;
  description?: unknown;
  spriteVersionNumber?: unknown;
  spritesheetPath?: unknown;
  spriteSheetPath?: unknown;
  columns?: unknown;
  rows?: unknown;
  frameWidth?: unknown;
  frameHeight?: unknown;
  animations?: unknown;
}

export class PetLoader {
  private readonly petsDirectories: readonly string[];

  public constructor(petsDirectory: string | readonly string[] = getPetsDirectories()) {
    this.petsDirectories = typeof petsDirectory === "string" ? [petsDirectory] : petsDirectory;
  }

  public async load(): Promise<PetLoadResult> {
    const pets: CodexPet[] = [];
    const issues: PetLoadResult["issues"] = [];
    const seenIds = new Set<string>();
    let directoryExists = false;
    const primaryDirectory = this.petsDirectories[0] ?? "";

    for (const petsDirectory of this.petsDirectories) {
      let entries;
      try {
        entries = await fs.readdir(petsDirectory, { withFileTypes: true });
        directoryExists = true;
      } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
          continue;
        }
        throw error;
      }

      for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
        try {
          const pet = await this.loadPet(petsDirectory, entry.name);
          if (seenIds.has(pet.id)) {
            continue;
          }
          seenIds.add(pet.id);
          pets.push(pet);
        } catch (error) {
          issues.push({
            directoryName: entry.name,
            message: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }

    pets.sort((left, right) => left.name.localeCompare(right.name));
    return { petsDirectory: primaryDirectory, pets, issues, directoryExists };
  }

  private async loadPet(petsDirectory: string, directoryName: string): Promise<CodexPet> {
    const directoryPath = path.join(petsDirectory, directoryName);
    const manifestPath = path.join(directoryPath, "pet.json");
    let manifest: PetManifest;
    try {
      manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as PetManifest;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        throw new Error("pet.json was not found.");
      }
      throw new Error(`pet.json could not be read: ${error instanceof Error ? error.message : String(error)}`);
    }

    const spriteSheetPath = await resolveSpritePath(directoryPath, manifest);
    const dimensions = readImageDimensions(await fs.readFile(spriteSheetPath));
    const version = positiveInteger(manifest.spriteVersionNumber);
    const configuredColumns = positiveInteger(manifest.columns);
    const configuredRows = positiveInteger(manifest.rows);
    const configuredFrameWidth = positiveInteger(manifest.frameWidth);
    const configuredFrameHeight = positiveInteger(manifest.frameHeight);

    const columns = configuredColumns ?? inferColumns(dimensions.width, configuredFrameWidth);
    const rows = configuredRows ?? inferRows(dimensions.height, configuredFrameHeight, version);
    if (dimensions.width % columns !== 0 || dimensions.height % rows !== 0) {
      throw new Error(
        `Sprite dimensions ${dimensions.width}x${dimensions.height} are not divisible by the ${columns}x${rows} layout.`
      );
    }

    const frameWidth = configuredFrameWidth ?? dimensions.width / columns;
    const frameHeight = configuredFrameHeight ?? dimensions.height / rows;
    if (frameWidth * columns !== dimensions.width || frameHeight * rows !== dimensions.height) {
      throw new Error("Configured frame dimensions do not match the sprite image dimensions.");
    }

    const animations = parseAnimations(manifest.animations);
    applyDefaultAnimations(animations, columns, rows);
    for (const configured of Object.values(animations)) {
      if (configured) {
        validateAnimation(configured, columns, rows);
      }
    }

    return {
      id: nonEmptyString(manifest.id) ?? directoryName,
      name: nonEmptyString(manifest.displayName) ?? nonEmptyString(manifest.name) ?? directoryName,
      description: nonEmptyString(manifest.description),
      directoryPath,
      spriteSheetPath,
      spriteVersionNumber: version,
      columns,
      rows,
      frameWidth,
      frameHeight,
      animations,
      lookDirections: version === 2 && columns === 8 && rows === 11 ? lookCells() : undefined
    };
  }
}

async function resolveSpritePath(directoryPath: string, manifest: PetManifest): Promise<string> {
  const configured = nonEmptyString(manifest.spritesheetPath) ?? nonEmptyString(manifest.spriteSheetPath);
  if (configured) {
    const candidate = path.resolve(directoryPath, configured);
    const relative = path.relative(directoryPath, candidate);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("spritesheetPath must stay inside the Pet directory.");
    }
    if (!isSupportedExtension(candidate)) {
      throw new Error("Sprite image must be a PNG, WebP, or GIF file.");
    }
    return resolveContainedFile(directoryPath, candidate);
  }

  for (const name of SUPPORTED_SPRITE_NAMES) {
    const candidate = path.join(directoryPath, name);
    try {
      return await resolveContainedFile(directoryPath, candidate);
    } catch (error) {
      if (!isNodeError(error) || error.code !== "ENOENT") {
        throw error;
      }
    }
  }
  throw new Error("No supported sprite image was found.");
}

async function resolveContainedFile(directoryPath: string, candidate: string): Promise<string> {
  const [realDirectory, realCandidate] = await Promise.all([
    fs.realpath(directoryPath),
    fs.realpath(candidate)
  ]);
  const relative = path.relative(realDirectory, realCandidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Sprite image must stay inside the Pet directory, including through symbolic links.");
  }
  return realCandidate;
}

function parseAnimations(value: unknown): Partial<Record<PetAnimationName, SpriteAnimation>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const result: Partial<Record<PetAnimationName, SpriteAnimation>> = {};
  for (const state of ["idle", "waving", "running", "waiting", "review", "failed"] as const) {
    const candidate = (value as Record<string, unknown>)[state];
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }
    const animation = candidate as Record<string, unknown>;
    const row = nonNegativeInteger(animation.row);
    const startColumn = nonNegativeInteger(animation.startColumn);
    const frameCount = positiveInteger(animation.frameCount);
    const frameDurationMs = positiveInteger(animation.frameDurationMs);
    if (row === undefined || startColumn === undefined || frameCount === undefined || frameDurationMs === undefined) {
      continue;
    }
    const frameDurationsMs = Array.isArray(animation.frameDurationsMs)
      ? animation.frameDurationsMs.filter(positiveInteger).slice(0, frameCount)
      : undefined;
    result[state] = {
      row,
      startColumn,
      frameCount,
      frameDurationMs,
      frameDurationsMs:
        frameDurationsMs?.length === frameCount ? frameDurationsMs : undefined,
      loop: typeof animation.loop === "boolean" ? animation.loop : true
    };
  }
  return result;
}

function applyDefaultAnimations(
  animations: Partial<Record<PetAnimationName, SpriteAnimation>>,
  columns: number,
  rows: number
): void {
  const isKnownCodexLayout = columns === 8 && (rows === 9 || rows === 11);
  if (!animations.idle) {
    animations.idle = isKnownCodexLayout
      ? cloneAnimation(DEFAULT_ANIMATIONS.idle)
      : animation(0, columns, 160);
  }
  if (isKnownCodexLayout) {
    for (const state of ["waving", "running", "waiting", "review", "failed"] as const) {
      animations[state] ??= cloneAnimation(DEFAULT_ANIMATIONS[state]);
    }
  }
}

function validateAnimation(animation: SpriteAnimation, columns: number, rows: number): void {
  if (animation.row >= rows || animation.startColumn + animation.frameCount > columns) {
    throw new Error("Idle animation points outside the sprite layout.");
  }
}

function inferColumns(width: number, configuredFrameWidth?: number): number {
  if (configuredFrameWidth && width % configuredFrameWidth === 0) {
    return width / configuredFrameWidth;
  }
  if (width % 8 === 0) {
    return 8;
  }
  throw new Error("Unable to infer sprite columns; add columns or frameWidth to pet.json.");
}

function inferRows(height: number, configuredFrameHeight?: number, version?: number): number {
  if (configuredFrameHeight && height % configuredFrameHeight === 0) {
    return height / configuredFrameHeight;
  }
  const expectedRows = version === 2 ? 11 : version === 1 ? 9 : undefined;
  if (expectedRows && height % expectedRows === 0) {
    return expectedRows;
  }
  if (height % 11 === 0) {
    return 11;
  }
  if (height % 9 === 0) {
    return 9;
  }
  throw new Error("Unable to infer sprite rows; add rows or frameHeight to pet.json.");
}

function isSupportedExtension(filePath: string): boolean {
  return [".png", ".webp", ".gif"].includes(path.extname(filePath).toLowerCase());
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function animation(
  row: number,
  frameCount: number,
  frameDurationMs: number,
  frameDurationsMs?: readonly number[],
  loop = true
): SpriteAnimation {
  return { row, startColumn: 0, frameCount, frameDurationMs, frameDurationsMs, loop };
}

function cloneAnimation(value: SpriteAnimation): SpriteAnimation {
  return { ...value, frameDurationsMs: value.frameDurationsMs ? [...value.frameDurationsMs] : undefined };
}
