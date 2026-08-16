import type { LookCell } from "./types.js";

export const LOOK_DIRECTIONS = [
  0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5, 180, 202.5, 225, 247.5, 270, 292.5, 315, 337.5
] as const;

export interface LookVector {
  x: number;
  y: number;
}

export type LookDirection = number | LookVector;

export function resolveLookDirection(
  direction: LookDirection | undefined,
  deadzone = 0
): number | undefined {
  if (direction === undefined) {
    return undefined;
  }

  let degrees: number;
  if (typeof direction === "number") {
    degrees = direction;
  } else {
    if (!Number.isFinite(direction.x) || !Number.isFinite(direction.y)) {
      return undefined;
    }
    const magnitude = Math.hypot(direction.x, direction.y);
    if (magnitude === 0 || magnitude <= Math.max(0, deadzone)) {
      return undefined;
    }
    degrees = (Math.atan2(direction.x, -direction.y) * 180) / Math.PI;
  }

  if (!Number.isFinite(degrees)) {
    return undefined;
  }

  const normalized = ((degrees % 360) + 360) % 360;
  const index = Math.round(normalized / 22.5) % LOOK_DIRECTIONS.length;
  return LOOK_DIRECTIONS[index];
}

export function lookCell(degrees: number): LookCell {
  const direction = resolveLookDirection(degrees);
  const index = direction === undefined ? 0 : Math.round(direction / 22.5) % LOOK_DIRECTIONS.length;
  return {
    row: 9 + Math.floor(index / 8),
    column: index % 8
  };
}

export function lookCells(): LookCell[] {
  return LOOK_DIRECTIONS.map((degrees) => lookCell(degrees));
}
