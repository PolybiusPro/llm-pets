import { describe, expect, it } from "vitest";
import { lookCell, resolveLookDirection } from "../src/pet/lookMath.js";

describe("v2 look directions", () => {
  it("maps clockwise degrees from up onto the 16 atlas cells", () => {
    expect(lookCell(0)).toEqual({ row: 9, column: 0 });
    expect(lookCell(90)).toEqual({ row: 9, column: 4 });
    expect(lookCell(180)).toEqual({ row: 10, column: 0 });
    expect(lookCell(270)).toEqual({ row: 10, column: 4 });
    expect(lookCell(-22.5)).toEqual({ row: 10, column: 7 });
  });

  it("quantizes screen-space vectors and honors the deadzone", () => {
    expect(resolveLookDirection({ x: 0, y: -1 })).toBe(0);
    expect(resolveLookDirection({ x: 1, y: 0 })).toBe(90);
    expect(resolveLookDirection({ x: 0, y: 1 })).toBe(180);
    expect(resolveLookDirection({ x: -1, y: 0 })).toBe(270);
    expect(resolveLookDirection(31)).toBe(22.5);
    expect(resolveLookDirection({ x: 0.1, y: 0.1 }, 0.2)).toBeUndefined();
    expect(resolveLookDirection({ x: 0, y: 0 })).toBeUndefined();
    expect(resolveLookDirection(undefined)).toBeUndefined();
  });
});
