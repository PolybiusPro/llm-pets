import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { cachedProbe, clearSequence, ensureProbed, readReply, selectBackend } from "../src/terminal.js";

const previousEnv: Record<string, string | undefined> = {};

function setEnv(key: string, value: string | undefined): void {
  if (!(key in previousEnv)) {
    previousEnv[key] = process.env[key];
  }
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

afterEach(() => {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
    delete previousEnv[key];
  }
});

describe("clearSequence", () => {
  it("resets SGR before ECH", () => {
    const sequence = clearSequence(10, 5, 3, 9);
    expect(sequence.subarray(0, 4).equals(Buffer.from("\x1b[0m"))).toBe(true);
    expect(sequence.toString().split("\x1b[9X").length - 1).toBe(3);
  });
});

describe("selectBackend", () => {
  it("has no overlay inside tmux", () => {
    expect(selectBackend({ TMUX: "/tmp/x", TERM: "xterm-kitty" })).toBe("none");
  });

  it("detects kitty-family terminals", () => {
    expect(selectBackend({ TERM: "xterm-kitty" })).toBe("kitty");
    expect(selectBackend({ KITTY_WINDOW_ID: "1", TERM: "xterm" })).toBe("kitty");
    expect(selectBackend({ TERM_PROGRAM: "ghostty" })).toBe("kitty");
  });

  it("uses the Konsole version boundary", () => {
    expect(selectBackend({ KONSOLE_VERSION: "220400" })).toBe("kitty");
    expect(selectBackend({ KONSOLE_VERSION: "211200" })).toBe("none");
  });

  it("has no overlay on a plain terminal", () => {
    expect(selectBackend({ TERM: "xterm-256color" })).toBe("none");
  });
});

describe("readReply", () => {
  it("captures a reply that arrives after the query round-trip, without blocking on it", async () => {
    const source = new PassThrough();
    const promise = readReply(source, 0.5);
    setTimeout(() => {
      source.write(Buffer.from("\x1b_Gi=4294967295;OK\x1b\\"));
      source.write(Buffer.from("\x1b[?62c"));
    }, 50);
    const reply = await promise;
    expect(reply).toContain("_G");
    expect(reply).toContain(";OK");
  });

  it("gives up empty-handed once the timeout elapses with no reply", async () => {
    const source = new PassThrough();
    const reply = await readReply(source, 0.05);
    expect(reply).toBe("");
  });

  it("leaves the source paused so a later inherited child owns the fd exclusively", async () => {
    const source = new PassThrough();
    await readReply(source, 0.05);
    expect(source.isPaused()).toBe(true);
  });
});

describe("ensureProbed", () => {
  it("trusts a cached result instead of probing the terminal again", async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "llm-pets-cache-"));
    try {
      setEnv("HOME", home);
      setEnv("XDG_CACHE_HOME", undefined);
      const environment = { TERM: "xterm-kitty" };
      let probeCalls = 0;
      const seed = async (): Promise<boolean | undefined> => {
        probeCalls += 1;
        return true;
      };
      expect(await ensureProbed(environment, seed)).toBe(true);
      expect(probeCalls).toBe(1);

      const probeAgain = async (): Promise<boolean | undefined> => {
        probeCalls += 1;
        return false;
      };
      expect(await ensureProbed(environment, probeAgain)).toBe(true);
      expect(probeCalls).toBe(1);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("probes and caches the result when nothing is cached yet", async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "llm-pets-cache-"));
    try {
      setEnv("HOME", home);
      setEnv("XDG_CACHE_HOME", undefined);
      const environment = { TERM: "xterm-kitty" };
      const probe = async (): Promise<boolean | undefined> => true;
      expect(await ensureProbed(environment, probe)).toBe(true);
      expect(cachedProbe(environment)).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
