import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { PetSpriteSheet } from "../sprites.js";
import * as terminal from "../terminal.js";

export const CACHE_VERSION = "v4";
export const IMAGE_ID_BASE = 7100;
const CHUNK_SIZE = 3800;

export function graphicsCommand(controls: string, payload: Buffer = Buffer.alloc(0)): Buffer {
  return Buffer.concat([Buffer.from("\x1b_G"), Buffer.from(controls), Buffer.from(";"), payload, Buffer.from("\x1b\\")]);
}

export function transmitFrame(imageId: number, png: Buffer): Buffer {
  const payload = Buffer.from(png.toString("base64"));
  const chunks: Buffer[] = [];
  for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
    chunks.push(payload.subarray(i, i + CHUNK_SIZE));
  }
  if (chunks.length === 0) {
    return Buffer.alloc(0);
  }
  const out: Buffer[] = [];
  chunks.forEach((chunk, index) => {
    const more = index < chunks.length - 1 ? 1 : 0;
    const controls = index === 0 ? `f=100,a=t,q=2,i=${imageId},m=${more}` : `m=${more}`;
    out.push(graphicsCommand(controls, chunk));
  });
  return Buffer.concat(out);
}

export function placeFrame(imageId: number): Buffer {
  return graphicsCommand(`a=p,i=${imageId},p=1,q=2`);
}

export function deletePlacements(): Buffer {
  return graphicsCommand("a=d,d=a,q=2");
}

export function freeImages(): Buffer {
  return graphicsCommand("a=d,d=A,q=2");
}

export function drawSequence(row: number, column: number, imageId: number): Buffer {
  return Buffer.concat([
    terminal.SYNC_BEGIN,
    terminal.SAVE_CURSOR,
    deletePlacements(),
    Buffer.from(`\x1b[${row};${column}H`),
    placeFrame(imageId),
    terminal.RESTORE_CURSOR,
    terminal.SYNC_END
  ]);
}

export function eraseSequence(): Buffer {
  return Buffer.concat([
    terminal.SYNC_BEGIN,
    terminal.SAVE_CURSOR,
    freeImages(),
    terminal.RESTORE_CURSOR,
    terminal.SYNC_END
  ]);
}

function validPng(filePath: string): boolean {
  try {
    return readFileSync(filePath).subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  } catch {
    return false;
  }
}

class FrameCache {
  readonly directory: string;
  readonly widthPx: number;
  readonly heightPx: number;

  constructor(
    cacheRootDir: string,
    readonly sheet: PetSpriteSheet,
    heightPx: number
  ) {
    const digest = createHash("sha256");
    digest.update(CACHE_VERSION);
    digest.update(sheet.manifestBytes);
    digest.update(readFileSync(sheet.sheetPath));
    digest.update(String(heightPx));
    this.directory = path.join(cacheRootDir, "frames", digest.digest("hex"));
    mkdirSync(this.directory, { recursive: true });
    this.heightPx = heightPx;
    this.widthPx = Math.max(1, Math.round((sheet.frameWidth * heightPx) / sheet.frameHeight));
  }

  async pathFor(index: number): Promise<string> {
    const target = path.join(this.directory, `frame_${String(index).padStart(3, "0")}.png`);
    if (validPng(target)) {
      return target;
    }
    const frame = this.sheet.frame(index);
    const png = await sharp(frame.data, { raw: { width: frame.width, height: frame.height, channels: 4 } })
      .resize(this.widthPx, this.heightPx, { kernel: "lanczos3" })
      .png()
      .toBuffer();
    const temporary = `${target}.${process.pid}.tmp`;
    writeFileSync(temporary, png);
    renameSync(temporary, target);
    return target;
  }

  async prepare(): Promise<number[]> {
    const indices = this.sheet.frameIndices();
    for (const index of indices) {
      await this.pathFor(index);
    }
    return indices;
  }
}

export class KittyBackend {
  readonly name = "kitty";
  private readonly cache: FrameCache;
  private indices: number[] = [];
  private imageIds = new Map<number, number>();
  private transmitted = new Set<number>();
  private ready: Promise<void>;

  constructor(
    sheet: PetSpriteSheet,
    private readonly ttyFd: number,
    cacheRootDir: string,
    heightPx: number
  ) {
    this.cache = new FrameCache(cacheRootDir, sheet, heightPx);
    this.ready = this.cache.prepare().then((indices) => {
      this.indices = indices;
      this.imageIds = new Map(indices.map((index) => [index, IMAGE_ID_BASE + index]));
    });
  }

  get frameCount(): number {
    return this.indices.length;
  }

  async draw(state: string, animationIndex: number): Promise<void> {
    await this.ready;
    const animation = this.cache.sheet.animation(state);
    const index = animation.frames[animationIndex] ?? animation.frames[0] ?? 0;
    if (!this.transmitted.has(index)) {
      const png = readFileSync(await this.cache.pathFor(index));
      terminal.writeAll(this.ttyFd, transmitFrame(this.imageIds.get(index) ?? IMAGE_ID_BASE + index, png));
      this.transmitted.add(index);
    }
    const placement = terminal.region(this.ttyFd, this.cache.widthPx, this.cache.heightPx);
    if (!placement) {
      return;
    }
    const [row, column] = placement;
    terminal.writeAll(
      this.ttyFd,
      drawSequence(row, column, this.imageIds.get(index) ?? IMAGE_ID_BASE + index)
    );
  }

  async erase(): Promise<void> {
    await this.ready;
    terminal.writeAll(this.ttyFd, eraseSequence());
  }
}
