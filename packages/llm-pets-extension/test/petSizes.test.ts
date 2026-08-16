import { describe, expect, it } from "vitest";
import { getStrings } from "../src/localization.js";
import {
  normalizePetScale,
  petScaleOptions,
  PET_SCALE_VALUES
} from "../src/webview/petSizes.js";

describe("Pet sizes", () => {
  it("normalizes persisted automatic and numeric values", () => {
    expect(normalizePetScale("auto")).toBe("auto");
    expect(normalizePetScale(1.25)).toBe(1.25);
    expect(normalizePetScale(10)).toBe(3);
    expect(normalizePetScale(0)).toBe(0.25);
    expect(normalizePetScale("large")).toBe(1);
  });

  it("offers automatic and fixed sizes in English", () => {
    expect(PET_SCALE_VALUES[0]).toBe("auto");
    expect(petScaleOptions(getStrings("en"))[0]).toMatchObject({
      value: "auto",
      label: "Auto"
    });
    expect(petScaleOptions(getStrings("ja"))[0]).toMatchObject({
      value: "auto",
      label: "Auto"
    });
    expect(petScaleOptions(getStrings("en")).find((option) => option.value === 1)?.label).toBe("100%");
  });
});
