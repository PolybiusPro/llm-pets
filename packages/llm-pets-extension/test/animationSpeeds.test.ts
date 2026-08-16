import { describe, expect, it } from "vitest";
import { getStrings } from "../src/localization.js";
import {
  animationSpeedsForDisplay,
  ANIMATION_SPEED_VALUES
} from "../src/webview/animationSpeeds.js";

describe("Pet animation speeds", () => {
  it("defines unique presets in ascending order", () => {
    const values = ANIMATION_SPEED_VALUES;
    expect(new Set(values).size).toBe(values.length);
    expect(values).toEqual([...values].sort((left, right) => left - right));
  });

  it("includes the configured range and normal speed", () => {
    expect(ANIMATION_SPEED_VALUES[0]).toBe(0.25);
    expect(ANIMATION_SPEED_VALUES.at(-1)).toBe(3);
    expect(ANIMATION_SPEED_VALUES.includes(1)).toBe(true);
  });

  it("uses English descriptions", () => {
    expect(animationSpeedsForDisplay(getStrings("en"))[3]?.description).toBe("Normal");
    expect(animationSpeedsForDisplay(getStrings("ja"))[3]?.description).toBe("Normal");
  });
});
