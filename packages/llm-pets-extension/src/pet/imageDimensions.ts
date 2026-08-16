export interface ImageDimensions {
  width: number;
  height: number;
  format: "png" | "gif" | "webp";
}

function assertPositiveDimensions(width: number, height: number, format: ImageDimensions["format"]): ImageDimensions {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`Invalid ${format.toUpperCase()} image dimensions.`);
  }
  return { width, height, format };
}

export function readImageDimensions(buffer: Buffer): ImageDimensions {
  if (
    buffer.length >= 24 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) &&
    buffer.subarray(12, 16).toString("ascii") === "IHDR"
  ) {
    return assertPositiveDimensions(buffer.readUInt32BE(16), buffer.readUInt32BE(20), "png");
  }

  const gifHeader = buffer.subarray(0, 6).toString("ascii");
  if (buffer.length >= 10 && (gifHeader === "GIF87a" || gifHeader === "GIF89a")) {
    return assertPositiveDimensions(buffer.readUInt16LE(6), buffer.readUInt16LE(8), "gif");
  }

  if (
    buffer.length >= 30 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    const chunkType = buffer.subarray(12, 16).toString("ascii");
    if (chunkType === "VP8X") {
      const width = 1 + buffer.readUIntLE(24, 3);
      const height = 1 + buffer.readUIntLE(27, 3);
      return assertPositiveDimensions(width, height, "webp");
    }
    if (chunkType === "VP8 " && buffer.length >= 30) {
      const width = buffer.readUInt16LE(26) & 0x3fff;
      const height = buffer.readUInt16LE(28) & 0x3fff;
      return assertPositiveDimensions(width, height, "webp");
    }
    if (chunkType === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
      const bits = buffer.readUInt32LE(21);
      const width = (bits & 0x3fff) + 1;
      const height = ((bits >>> 14) & 0x3fff) + 1;
      return assertPositiveDimensions(width, height, "webp");
    }
  }

  throw new Error("Unsupported or malformed sprite image. Expected PNG, WebP, or GIF.");
}
