import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { petDirectory } from "../src/paths.js";

const previous: Record<string, string | undefined> = {};

function setEnv(key: string, value: string | undefined): void {
  if (!(key in previous)) {
    previous[key] = process.env[key];
  }
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

afterEach(async () => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
    delete previous[key];
  }
});

async function writePet(directory: string, id: string, displayName?: string): Promise<string> {
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "pet.json"),
    JSON.stringify({ id, displayName: displayName ?? id }),
    "utf8"
  );
  return directory;
}

describe("petDirectory", () => {
  it("prefers ~/.pets over Codex pets", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "llm-pets-home-"));
    try {
      const local = await writePet(path.join(home, ".pets", "dude"), "dude", "Local");
      await writePet(path.join(home, ".codex", "pets", "dude"), "dude", "Codex");
      setEnv("HOME", home);
      setEnv("LLM_PETS_PET_DIR", undefined);
      setEnv("CODEX_HOME", undefined);
      setEnv("XDG_DATA_HOME", undefined);
      expect(petDirectory("dude")).toBe(local);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("falls back to Codex pets", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "llm-pets-home-"));
    try {
      const codex = await writePet(path.join(home, ".codex", "pets", "penguin"), "penguin");
      setEnv("HOME", home);
      setEnv("LLM_PETS_PET_DIR", undefined);
      setEnv("CODEX_HOME", undefined);
      setEnv("XDG_DATA_HOME", undefined);
      expect(petDirectory("penguin")).toBe(codex);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
