import { describe, expect, it } from "vitest";
import { getStrings, selectLocale } from "../src/localization.js";

describe("localization", () => {
  it("uses English for every display language", () => {
    expect(selectLocale("en")).toBe("en");
    expect(selectLocale("en-US")).toBe("en");
    expect(selectLocale("ja")).toBe("en");
    expect(selectLocale("fr")).toBe("en");
  });

  it("keeps state labels and Hooks consent in English", () => {
    expect(getStrings("en").stateLabels.running).toBe("Running");
    expect(getStrings("ja").stateLabels.running).toBe("Running");
    expect(getStrings("ja").hooks.confirmMessage("hooks.json", "hook.cjs", "Cursor")).toContain("hooks.json");
    expect(getStrings("ja").languageTag).toBe("en");
  });
});
