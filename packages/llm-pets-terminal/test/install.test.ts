import { mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { BASHRC_MARKER, install, uninstall } from "../src/install.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let home: string | undefined;

afterEach(() => {
  if (home) {
    rmSync(home, { recursive: true, force: true });
    home = undefined;
  }
});

describe("install", () => {
  it("links the renderer and writes the bashrc wrapper", () => {
    home = mkdtempSync(path.join(os.tmpdir(), "llm-pets-install-"));
    install({ home, repoRoot });
    expect(readlinkSync(path.join(home, ".local", "bin", "llm-pet"))).toBe(path.join(repoRoot, "dist", "main.js"));
    expect(readlinkSync(path.join(home, ".local", "share", "llm-pets", "hook.cjs"))).toBe(
      path.resolve(repoRoot, "..", "..", "hooks", "hook.cjs")
    );
    const bashrc = readFileSync(path.join(home, ".bashrc.d", "llm-pets.sh"), "utf8");
    expect(bashrc).toContain(BASHRC_MARKER);
    expect(bashrc).toContain("llm-pet wrap codex");
    expect(bashrc).toContain("llm-pet wrap claude");
  });

  it("refuses to replace a non-symlink", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "llm-pets-install-"));
    home = dir;
    const bin = path.join(dir, ".local", "bin", "llm-pet");
    mkdirSync(path.dirname(bin), { recursive: true });
    writeFileSync(bin, "nope");
    expect(() => install({ home: dir, repoRoot })).toThrow(/non-symlink/);
  });

  it("replaces a leftover symlink from another checkout", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "llm-pets-install-"));
    home = dir;
    const bin = path.join(dir, ".local", "bin", "llm-pet");
    mkdirSync(path.dirname(bin), { recursive: true });
    symlinkSync("/tmp/old-llm-pets/package/llm-pets-terminal/dist/main.js", bin);
    install({ home: dir, repoRoot });
    expect(readlinkSync(bin)).toBe(path.join(repoRoot, "dist", "main.js"));
  });

  it("uninstalls only files this checkout owns", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "llm-pets-install-"));
    home = dir;
    install({ home: dir, repoRoot });
    uninstall({ home: dir, repoRoot });
    expect(() => readlinkSync(path.join(dir, ".local", "bin", "llm-pet"))).toThrow();
    expect(() => readFileSync(path.join(dir, ".bashrc.d", "llm-pets.sh"))).toThrow();
  });
});
