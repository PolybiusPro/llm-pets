import { describe, expect, it } from "vitest";
import { getStrings } from "../src/localization.js";
import {
  isPetBackgroundSelection,
  petBackgroundsForDisplay,
  PET_BACKGROUND_IDS
} from "../src/webview/backgrounds.js";

describe("Pet backgrounds", () => {
  it("defines unique background IDs", () => {
    const ids = PET_BACKGROUND_IDS;
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("defines the twenty procedural scenes plus None", () => {
    expect(PET_BACKGROUND_IDS).toHaveLength(21);
    expect(PET_BACKGROUND_IDS[0]).toBe("none");
  });

  it("displays None and Custom first, followed by scene names alphabetically", () => {
    const labels = petBackgroundsForDisplay(getStrings("en")).map((background) => background.label);
    expect(labels[0]).toBe("None");
    expect(labels[1]).toBe("Custom Image");
    expect(labels.slice(2)).toEqual([...labels.slice(2)].sort((left, right) => left.localeCompare(right, "en")));
  });

  it("keeps scene names in English", () => {
    expect(petBackgroundsForDisplay(getStrings("ja"))[0]?.label).toBe("None");
  });

  it("validates persisted background IDs", () => {
    expect(isPetBackgroundSelection("underwater")).toBe(true);
    expect(isPetBackgroundSelection("custom")).toBe(true);
    expect(isPetBackgroundSelection("unknown-place")).toBe(false);
  });
});
