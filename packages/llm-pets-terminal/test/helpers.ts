import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export async function buildPet(
  directory: string,
  manifest: Record<string, unknown>,
  options: { rows?: number; cell?: number; occupied?: Record<number, number> } = {}
): Promise<string> {
  const columns = 8;
  const rows = options.rows ?? 9;
  const cell = options.cell ?? 10;
  const occupied = options.occupied;
  const width = columns * cell;
  const height = rows * cell;
  const data = Buffer.alloc(width * height * 4);
  for (let index = 0; index < columns * rows; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    if (occupied !== undefined && column >= (occupied[row] ?? 0)) {
      continue;
    }
    const originX = column * cell;
    const originY = row * cell;
    for (let dx = 2; dx < cell - 2; dx += 1) {
      for (let dy = 2; dy < cell - 2; dy += 1) {
        const offset = ((originY + dy) * width + originX + dx) * 4;
        data[offset] = index;
        data[offset + 1] = 40;
        data[offset + 2] = 200;
        data[offset + 3] = 255;
      }
    }
  }
  await mkdir(directory, { recursive: true });
  await sharp(data, { raw: { width, height, channels: 4 } })
    .png()
    .toFile(path.join(directory, "spritesheet.png"));
  await writeFile(path.join(directory, "pet.json"), JSON.stringify(manifest), "utf8");
  return directory;
}
