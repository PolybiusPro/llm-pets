import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { getCursorHome, getEventDirectory } from "../src/cursor/cursorHome.js";

describe("Cursor home resolution", () => {
  it("prefers a non-empty CURSOR_HOME", () => {
    expect(getCursorHome({ CURSOR_HOME: "  C:\\custom-cursor  " }, "C:\\Users\\tester")).toBe(
      path.resolve("C:\\custom-cursor")
    );
  });

  it("falls back to the user home and keeps events under XDG state", () => {
    expect(getCursorHome({ CURSOR_HOME: "  " }, "C:\\Users\\tester")).toBe(
      path.join("C:\\Users\\tester", ".cursor")
    );
    expect(getEventDirectory({}, "C:\\Users\\tester")).toBe(
      path.join("C:\\Users\\tester", ".local", "state", "llm-pets", "events")
    );
  });
});
