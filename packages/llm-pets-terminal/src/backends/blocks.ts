import sharp from "sharp";
import type { PetSpriteSheet, RgbaFrame } from "../sprites.js";
import * as terminal from "../terminal.js";

export const UPPER_HALF_BLOCK = "▀";
export const ALPHA_FLOOR = 48;
export const DEFAULT_CELL_ROWS = 9;
export const MINIMUM_CELL_ROWS = 3;

function pixelColor(data: Buffer, offset: number): [number, number, number] | undefined {
  const red = data[offset] ?? 0;
  const green = data[offset + 1] ?? 0;
  const blue = data[offset + 2] ?? 0;
  const alpha = data[offset + 3] ?? 0;
  if (alpha < ALPHA_FLOOR) {
    return undefined;
  }
  if (alpha < 255) {
    return [Math.floor((red * alpha) / 255), Math.floor((green * alpha) / 255), Math.floor((blue * alpha) / 255)];
  }
  return [red, green, blue];
}

async function resizeFrame(frame: RgbaFrame, columns: number, height: number): Promise<RgbaFrame> {
  const data = await sharp(frame.data, { raw: { width: frame.width, height: frame.height, channels: 4 } })
    .resize(columns, height, { kernel: "lanczos3" })
    .ensureAlpha()
    .raw()
    .toBuffer();
  return { width: columns, height, data };
}

export async function ansiLines(frame: RgbaFrame, columns: number): Promise<string[]> {
  columns = Math.max(4, columns);
  let height = Math.max(2, Math.round((frame.height * columns) / frame.width));
  if (height % 2) {
    height += 1;
  }
  const resized = await resizeFrame(frame, columns, height);
  const lines: string[] = [];
  for (let y = 0; y < height; y += 2) {
    const parts: string[] = [];
    for (let x = 0; x < columns; x += 1) {
      const top = pixelColor(resized.data, (y * columns + x) * 4);
      const bottom = pixelColor(resized.data, ((y + 1) * columns + x) * 4);
      if (!top && !bottom) {
        parts.push("\x1b[0m ");
      } else if (!bottom && top) {
        parts.push(`\x1b[49m\x1b[38;2;${top[0]};${top[1]};${top[2]}m${UPPER_HALF_BLOCK}`);
      } else if (!top && bottom) {
        parts.push(`\x1b[39m\x1b[48;2;${bottom[0]};${bottom[1]};${bottom[2]}m `);
      } else if (top && bottom) {
        parts.push(
          `\x1b[38;2;${top[0]};${top[1]};${top[2]}m\x1b[48;2;${bottom[0]};${bottom[1]};${bottom[2]}m${UPPER_HALF_BLOCK}`
        );
      }
    }
    lines.push(`${parts.join("")}\x1b[0m`);
  }
  return lines;
}

export function blockColumns(frame: RgbaFrame, cellRows: number): number {
  return Math.max(4, Math.round((frame.width * cellRows * 2) / frame.height));
}

export class BlocksBackend {
  readonly name = "blocks";
  requestedRows: number;
  cellRows: number;
  cellColumns: number;
  private readonly reference: RgbaFrame;
  private readonly rendered = new Map<string, string[]>();

  constructor(
    readonly sheet: PetSpriteSheet,
    private readonly ttyFd: number,
    cellRows = DEFAULT_CELL_ROWS
  ) {
    this.requestedRows = Math.max(MINIMUM_CELL_ROWS, cellRows);
    this.reference = sheet.croppedFrames("idle")[0] ?? sheet.frame(0);
    this.cellRows = this.requestedRows;
    this.cellColumns = blockColumns(this.reference, this.cellRows);
  }

  get frameCount(): number {
    return this.sheet.frameIndices().length;
  }

  private resize(cellRows: number): void {
    this.cellRows = cellRows;
    this.cellColumns = blockColumns(this.reference, cellRows);
    this.rendered.clear();
  }

  placement(): [number, number, number, number] | undefined {
    for (let rows = this.requestedRows; rows >= MINIMUM_CELL_ROWS; rows -= 1) {
      const columns = blockColumns(this.reference, rows);
      const found = terminal.region(this.ttyFd, columns * terminal.CELL_WIDTH_PX, rows * terminal.CELL_HEIGHT_PX);
      if (found) {
        if (rows !== this.cellRows) {
          this.resize(rows);
        }
        return found;
      }
    }
    return undefined;
  }

  async draw(state: string, animationIndex: number): Promise<void> {
    const found = this.placement();
    if (!found) {
      return;
    }
    const [row, column, imageRows, imageColumns] = found;
    const key = `${state}:${animationIndex}:${this.cellColumns}`;
    if (!this.rendered.has(key)) {
      const frames = this.sheet.croppedFrames(state);
      const frame = frames[Math.min(animationIndex, frames.length - 1)] ?? frames[0];
      if (frame) {
        this.rendered.set(key, await ansiLines(frame, this.cellColumns));
      }
    }
    const lines = this.rendered.get(key) ?? [];
    const parts = [terminal.SYNC_BEGIN, terminal.SAVE_CURSOR, terminal.clearSequence(row, column, imageRows, imageColumns)];
    for (const [offset, line] of lines.slice(0, imageRows).entries()) {
      parts.push(Buffer.from(`\x1b[${row + offset};${column}H${line}`));
    }
    terminal.writeAll(this.ttyFd, Buffer.concat([...parts, terminal.RESTORE_CURSOR, terminal.SYNC_END]));
  }

  async erase(): Promise<void> {
    const found = this.placement();
    if (!found) {
      return;
    }
    terminal.writeAll(
      this.ttyFd,
      Buffer.concat([
        terminal.SYNC_BEGIN,
        terminal.SAVE_CURSOR,
        terminal.clearSequence(...found),
        terminal.RESTORE_CURSOR,
        terminal.SYNC_END
      ])
    );
  }
}
