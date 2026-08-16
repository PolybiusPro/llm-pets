import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/parseArgs.js";

describe("parseArgs", () => {
  it("parses get with the default CodexPetHub registry", () => {
    expect(parseArgs(["get", "null-puff"])).toEqual({
      command: "get",
      slug: "null-puff",
      registry: "codexpethub",
      overwrite: false
    });
  });

  it("parses get flags", () => {
    expect(
      parseArgs(["get", "boba", "--registry", "petdex", "--overwrite", "--pets-dir", "/tmp/pets"])
    ).toEqual({
      command: "get",
      slug: "boba",
      registry: "petdex",
      overwrite: true,
      petsDir: "/tmp/pets"
    });
  });

  it("parses install targets", () => {
    expect(parseArgs(["install", "extension"])).toEqual({ command: "install", target: "extension" });
    expect(parseArgs(["install", "extension-windows"])).toEqual({
      command: "install",
      target: "extension-windows"
    });
    expect(parseArgs(["install", "terminal"])).toEqual({ command: "install", target: "terminal" });
  });

  it("ignores a leading -- from pnpm script forwarding", () => {
    expect(parseArgs(["--", "install", "terminal"])).toEqual({ command: "install", target: "terminal" });
    expect(parseArgs(["--", "--help"])).toEqual({ command: "help" });
  });

  it("treats help flags as help", () => {
    expect(parseArgs([])).toEqual({ command: "help" });
    expect(parseArgs(["--help"])).toEqual({ command: "help" });
    expect(parseArgs(["-h"])).toEqual({ command: "help" });
  });

  it("rejects unknown commands", () => {
    expect(() => parseArgs(["dance"])).toThrow(/unknown command/i);
    expect(() => parseArgs(["install"])).toThrow(/extension-windows/i);
    expect(() => parseArgs(["get"])).toThrow(/slug/i);
  });
});
