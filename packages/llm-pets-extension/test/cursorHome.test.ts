import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getCursorHome,
  getExtensionEventDirectory,
  getExtensionEventRoot,
  getExtensionHookScriptInstallPath
} from "../src/cursor/cursorHome.js";

describe("Cursor home resolution", () => {
  it("prefers a non-empty CURSOR_HOME", () => {
    expect(getCursorHome({ CURSOR_HOME: "  C:\\custom-cursor  " }, "C:\\Users\\tester")).toBe(
      path.resolve("C:\\custom-cursor")
    );
  });

  it("falls back to the user home and separates provider event directories", () => {
    expect(getCursorHome({ CURSOR_HOME: "  " }, "C:\\Users\\tester")).toBe(
      path.join("C:\\Users\\tester", ".cursor")
    );
    expect(getExtensionEventDirectory("claude", {}, "C:\\Users\\tester")).toBe(
      path.join("C:\\Users\\tester", ".local", "state", "llm-pets", "extension-events", "claude")
    );
    expect(getExtensionHookScriptInstallPath({}, "C:\\Users\\tester")).toBe(
      path.join("C:\\Users\\tester", ".local", "share", "llm-pets", "extension-hook.cjs")
    );
  });

  it("prefers the extension override and retains the deprecated fallback", () => {
    expect(getExtensionEventRoot({
      LLM_PETS_EXTENSION_EVENT_DIR: "/tmp/extension-events",
      CURSOR_PET_EVENT_DIR: "/tmp/deprecated"
    }, "/home/tester")).toBe(path.resolve("/tmp/extension-events"));
    expect(getExtensionEventRoot({ CURSOR_PET_EVENT_DIR: "/tmp/deprecated" }, "/home/tester"))
      .toBe(path.resolve("/tmp/deprecated"));
  });
});
