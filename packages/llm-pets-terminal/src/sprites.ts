import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

export const DEFAULT_COLUMNS = 8;
export const DEFAULT_ROWS = 9;
export const V2_ROWS = 11;
export const LOOK_ROWS = [9, 10] as const;
export const LOOK_FRAME_MS = 280;

export const ATLAS_ROWS: Record<string, number> = {
  idle: 0,
  "running-right": 1,
  "running-left": 2,
  waving: 3,
  jumping: 4,
  failed: 5,
  waiting: 6,
  running: 7,
  review: 8
};

const V2_SEQUENCES: Record<string, readonly string[]> = {
  idle: ["idle", "look"],
  running: ["running-right", "running-left", "running"],
  waiting: ["waiting", "look"]
};

export type RgbaFrame = {
  width: number;
  height: number;
  data: Buffer;
};

export class Animation {
  constructor(
    readonly frames: number[],
    readonly durationsMs: number[],
    readonly loop: boolean
  ) {}

  indexAt(step: number): number {
    if (this.loop) {
      return step % this.frames.length;
    }
    return Math.min(step, this.frames.length - 1);
  }
}

export const DEFAULT_ANIMATIONS: Record<string, Animation> = {
  idle: new Animation([0, 1, 2, 3, 4, 5], [1680, 660, 660, 840, 840, 1920], true),
  waving: new Animation([24, 25, 26, 27], [140, 140, 140, 280], false),
  jumping: new Animation([32, 33, 34, 35, 36], [140, 140, 140, 140, 280], false),
  failed: new Animation([40, 41, 42, 43, 44, 45, 46, 47], [140, 140, 140, 140, 140, 140, 140, 240], true),
  waiting: new Animation([48, 49, 50, 51, 52, 53], [150, 150, 150, 150, 150, 260], true),
  running: new Animation([56, 57, 58, 59, 60, 61], [120, 120, 120, 120, 120, 220], true),
  review: new Animation([64, 65, 66, 67, 68, 69], [150, 150, 150, 150, 150, 280], true)
};

function integer(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) ? value : fallback;
}

function alphaBBox(frame: RgbaFrame): [number, number, number, number] | undefined {
  let minX = frame.width;
  let minY = frame.height;
  let maxX = 0;
  let maxY = 0;
  let found = false;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const alpha = frame.data[(y * frame.width + x) * 4 + 3] ?? 0;
      if (alpha === 0) {
        continue;
      }
      found = true;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + 1 > maxX) maxX = x + 1;
      if (y + 1 > maxY) maxY = y + 1;
    }
  }
  return found ? [minX, minY, maxX, maxY] : undefined;
}

function cropFrame(frame: RgbaFrame, box: [number, number, number, number]): RgbaFrame {
  const [left, top, right, bottom] = box;
  const width = right - left;
  const height = bottom - top;
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const src = ((top + y) * frame.width + left) * 4;
    frame.data.copy(data, y * width * 4, src, src + width * 4);
  }
  return { width, height, data };
}

export class PetSpriteSheet {
  readonly directory: string;
  readonly manifestPath: string;
  readonly manifestBytes: Buffer;
  readonly displayName: string;
  readonly sheetPath: string;
  readonly sheet: RgbaFrame;
  readonly spriteVersion: number;
  readonly columns: number;
  readonly rows: number;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly frameCount: number;
  readonly animations: Record<string, Animation>;
  private readonly cropped: Record<string, RgbaFrame[]> = {};

  private constructor(fields: {
    directory: string;
    manifestPath: string;
    manifestBytes: Buffer;
    displayName: string;
    sheetPath: string;
    sheet: RgbaFrame;
    spriteVersion: number;
    columns: number;
    rows: number;
    frameWidth: number;
    frameHeight: number;
    animations: Record<string, Animation>;
  }) {
    this.directory = fields.directory;
    this.manifestPath = fields.manifestPath;
    this.manifestBytes = fields.manifestBytes;
    this.displayName = fields.displayName;
    this.sheetPath = fields.sheetPath;
    this.sheet = fields.sheet;
    this.spriteVersion = fields.spriteVersion;
    this.columns = fields.columns;
    this.rows = fields.rows;
    this.frameWidth = fields.frameWidth;
    this.frameHeight = fields.frameHeight;
    this.frameCount = fields.columns * fields.rows;
    this.animations = fields.animations;
  }

  static async load(petDirectory: string): Promise<PetSpriteSheet> {
    const manifestPath = path.join(petDirectory, "pet.json");
    const manifestBytes = readFileSync(manifestPath);
    const manifest = JSON.parse(manifestBytes.toString("utf8")) as Record<string, unknown>;
    const displayName = String(manifest.displayName ?? manifest.id ?? path.basename(petDirectory));
    const sheetPath = sheetFile(petDirectory, manifest);
    const decoded = sharp(sheetPath).ensureAlpha();
    const metadata = await decoded.metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    const data = await decoded.raw().toBuffer();
    const sheet: RgbaFrame = { width, height, data };
    const spriteVersion = integer(manifest.spriteVersionNumber, 1);
    const frame = manifest.frame && typeof manifest.frame === "object" ? (manifest.frame as Record<string, unknown>) : {};
    const columns = integer(frame.columns, integer(manifest.columns, DEFAULT_COLUMNS));
    const rows = integer(frame.rows, integer(manifest.rows, defaultRows(spriteVersion, height)));
    const frameWidth = integer(frame.width, integer(manifest.frameWidth, Math.floor(width / columns)));
    const frameHeight = integer(frame.height, integer(manifest.frameHeight, Math.floor(height / rows)));
    const loaded = new PetSpriteSheet({
      directory: petDirectory,
      manifestPath,
      manifestBytes,
      displayName,
      sheetPath,
      sheet,
      spriteVersion,
      columns,
      rows,
      frameWidth,
      frameHeight,
      animations: {}
    });
    Object.assign(loaded.animations, loaded.buildAnimations(manifest));
    if (!loaded.animations.idle) {
      throw new Error(`${petDirectory} has no usable idle animation`);
    }
    return loaded;
  }

  private buildAnimations(manifest: Record<string, unknown>): Record<string, Animation> {
    let animations: Record<string, Animation>;
    if (this.spriteVersion === 2) {
      animations = this.atlasAnimations();
    } else {
      animations = {};
      for (const [name, animation] of Object.entries(DEFAULT_ANIMATIONS)) {
        if (animation.frames.every((index) => index < this.frameCount)) {
          animations[name] = animation;
        }
      }
    }
    const configured = manifest.animations;
    if (!configured || typeof configured !== "object") {
      return animations;
    }
    for (const [name, value] of Object.entries(configured as Record<string, unknown>)) {
      if (typeof name !== "string" || !value || typeof value !== "object") {
        continue;
      }
      const parsed = this.parseAnimation(value as Record<string, unknown>);
      if (parsed) {
        animations[name] = parsed;
      }
    }
    return animations;
  }

  private atlasAnimations(): Record<string, Animation> {
    const animations: Record<string, Animation> = {};
    for (const [name, row] of Object.entries(ATLAS_ROWS)) {
      if (row >= this.rows) {
        continue;
      }
      const frames = this.leadingFrames(row);
      if (frames.length === 0) {
        continue;
      }
      let fallback = DEFAULT_ANIMATIONS[name];
      if (!fallback && (name === "running-right" || name === "running-left")) {
        fallback = DEFAULT_ANIMATIONS.running;
      }
      const durations = fallback ? [...fallback.durationsMs] : [160];
      while (durations.length < frames.length) {
        durations.push(durations[durations.length - 1] ?? 160);
      }
      const loop = fallback?.loop ?? true;
      animations[name] = new Animation(frames, durations.slice(0, frames.length), loop);
    }
    const look: number[] = [];
    for (const row of LOOK_ROWS) {
      if (row < this.rows) {
        look.push(...this.leadingFrames(row));
      }
    }
    if (look.length > 0) {
      animations.look = new Animation(
        look,
        look.map(() => LOOK_FRAME_MS),
        false
      );
    }
    return animations;
  }

  private leadingFrames(row: number): number[] {
    const frames: number[] = [];
    for (let column = 0; column < this.columns; column += 1) {
      const index = row * this.columns + column;
      if (!alphaBBox(this.frame(index))) {
        break;
      }
      frames.push(index);
    }
    return frames;
  }

  private parseAnimation(value: Record<string, unknown>): Animation | undefined {
    const loop = value.loop !== false;
    const frames = value.frames;
    if (Array.isArray(frames) && frames.length > 0 && frames.every((index) => Number.isInteger(index) && index >= 0 && index < this.frameCount)) {
      const fps = value.fps ?? 8.0;
      if (typeof fps !== "number" || fps <= 0 || fps > 60) {
        return undefined;
      }
      const duration = Math.max(1, Math.round(1000 / fps));
      return new Animation(frames as number[], frames.map(() => duration), loop);
    }
    const row = value.row;
    const start = value.startColumn ?? 0;
    const count = value.frameCount;
    if (![row, start, count].every((number) => Number.isInteger(number))) {
      return undefined;
    }
    if (typeof row !== "number" || typeof start !== "number" || typeof count !== "number") {
      return undefined;
    }
    if (row < 0 || row >= this.rows || start < 0 || count <= 0 || start + count > this.columns) {
      return undefined;
    }
    let durations = value.frameDurationsMs;
    if (
      !Array.isArray(durations) ||
      durations.length !== count ||
      !durations.every((duration) => Number.isInteger(duration) && duration > 0)
    ) {
      const duration = Math.max(1, integer(value.frameDurationMs, 160));
      durations = Array.from({ length: count }, () => duration);
    }
    const indices = Array.from({ length: count }, (_, column) => row * this.columns + start + column);
    return new Animation(indices, durations as number[], loop);
  }

  animation(state: string): Animation {
    return this.animations[state] ?? this.animations.idle as Animation;
  }

  frame(index: number): RgbaFrame {
    if (index < 0 || index >= this.frameCount) {
      throw new Error(`sprite index ${index} is outside the frame grid`);
    }
    const left = (index % this.columns) * this.frameWidth;
    const top = Math.floor(index / this.columns) * this.frameHeight;
    return cropFrame(this.sheet, [left, top, left + this.frameWidth, top + this.frameHeight]);
  }

  croppedFrames(state: string): RgbaFrame[] {
    if (this.cropped[state]) {
      return this.cropped[state];
    }
    const animation = this.animation(state);
    let frames = animation.frames.map((index) => this.frame(index));
    const boxes = frames.map((frame) => alphaBBox(frame)).filter((box): box is [number, number, number, number] => box !== undefined);
    if (boxes.length > 0) {
      const union: [number, number, number, number] = [
        Math.min(...boxes.map((box) => box[0])),
        Math.min(...boxes.map((box) => box[1])),
        Math.max(...boxes.map((box) => box[2])),
        Math.max(...boxes.map((box) => box[3]))
      ];
      frames = frames.map((frame) => cropFrame(frame, union));
    }
    this.cropped[state] = frames;
    return frames;
  }

  frameIndices(): number[] {
    return [...new Set(Object.values(this.animations).flatMap((animation) => animation.frames))].sort((a, b) => a - b);
  }
}

export class Animator {
  logicalState = "";
  state = "";
  sequence: string[] = [];
  clip = 0;
  step = 0;
  index = 0;
  nextAt = 0;

  constructor(readonly sheet: PetSpriteSheet) {}

  private sequenceFor(state: string): string[] {
    if (this.sheet.spriteVersion !== 2) {
      return [state];
    }
    const names = V2_SEQUENCES[state] ?? [state];
    const available = names.filter((name) => name in this.sheet.animations);
    return available.length > 0 ? available : [state];
  }

  frame(state: string, now: number): [string, number] {
    const sequence = this.sequenceFor(state);
    if (state !== this.logicalState) {
      this.logicalState = state;
      this.sequence = sequence;
      this.clip = 0;
      this.step = 0;
      this.index = 0;
      this.nextAt = now;
      this.state = sequence[0] ?? state;
    }
    if (now >= this.nextAt) {
      let animation = this.sheet.animation(this.state);
      if (this.step >= animation.frames.length) {
        this.clip = (this.clip + 1) % this.sequence.length;
        this.step = 0;
        this.state = this.sequence[this.clip] ?? this.state;
        animation = this.sheet.animation(this.state);
      }
      this.index = animation.indexAt(this.step);
      this.nextAt = now + (animation.durationsMs[this.index] ?? 160) / 1000;
      this.step += 1;
    }
    return [this.state, this.index];
  }
}

function defaultRows(spriteVersion: number, height: number): number {
  if (spriteVersion === 2) {
    return V2_ROWS;
  }
  if (height % DEFAULT_ROWS === 0) {
    return DEFAULT_ROWS;
  }
  if (height % V2_ROWS === 0) {
    return V2_ROWS;
  }
  return DEFAULT_ROWS;
}

function sheetFile(petDirectory: string, manifest: Record<string, unknown>): string {
  const configured = manifest.spritesheetPath;
  if (typeof configured === "string" && configured) {
    const candidate = path.join(petDirectory, configured);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  for (const name of ["spritesheet.webp", "spritesheet.png", "spritesheet.gif"]) {
    const candidate = path.join(petDirectory, name);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`no sprite sheet found in ${petDirectory}`);
}
