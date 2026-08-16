import { describe, expect, it } from "vitest";
import {
  PET_CONFIGURATION_KEYS,
  PET_CONFIGURATION_SECTION,
  settingsToMigrate
} from "../src/pet/configuration.js";

describe("pet configuration", () => {
  it("uses the pet settings section", () => {
    expect(PET_CONFIGURATION_SECTION).toBe("pet");
    expect(PET_CONFIGURATION_KEYS).toContain("enabled");
    expect(PET_CONFIGURATION_KEYS).toContain("hookProvider");
  });

  it("copies a legacy global value when the new key is unset", () => {
    expect(
      settingsToMigrate({ globalValue: "codex" }, undefined)
    ).toEqual([{ target: "global", value: "codex" }]);
  });

  it("leaves a new value alone when both sections are set", () => {
    expect(
      settingsToMigrate({ globalValue: "codex" }, { globalValue: "cursor" })
    ).toEqual([]);
  });
});
