import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseHookEvent, type HookProvider } from "../index.js";

const temporaryDirectories: string[] = [];
const extensionScriptPath = path.resolve("hooks", "extension-hook.cjs");
const terminalScriptPath = path.resolve("hooks", "terminal-hook.cjs");
const require = createRequire(import.meta.url);
type GeneratedHook = {
  handleHookInput(input: unknown, provider: string, environment: NodeJS.ProcessEnv): void;
};
const extensionHook = require(extensionScriptPath) as GeneratedHook;
const terminalHook = require(terminalScriptPath) as GeneratedHook;

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "llm-pets-hook-"));
  temporaryDirectories.push(directory);
  return directory;
}

function runHook(
  hook: GeneratedHook,
  provider: HookProvider,
  input: unknown,
  environment: NodeJS.ProcessEnv
): void {
  hook.handleHookInput(input, provider, { ...process.env, ...environment });
}

function input(eventName = "preToolUse"): Record<string, unknown> {
  return {
    hook_event_name: eventName,
    conversation_id: "session-1",
    cwd: process.cwd()
  };
}

describe("extension hook", () => {
  it("writes version 2 events beneath the provider directory", () => {
    const root = temporaryDirectory();
    runHook(extensionHook, "cursor", input(), {
      LLM_PETS_EXTENSION_EVENT_DIR: root,
      LLM_PETS_EVENT_DIR: path.join(root, "terminal-must-not-be-used")
    });
    const providerDirectory = path.join(root, "cursor");
    const files = fs.readdirSync(providerDirectory);
    expect(files).toHaveLength(1);
    const value = JSON.parse(fs.readFileSync(path.join(providerDirectory, files[0]), "utf8"));
    expect(parseHookEvent(value)).toMatchObject({
      version: 2,
      provider: "cursor",
      eventName: "PreToolUse",
      sessionId: "session-1",
      cwd: process.cwd()
    });
    expect(fs.existsSync(path.join(root, "terminal-must-not-be-used"))).toBe(false);
  });

  it("retains the deprecated extension-only directory fallback", () => {
    const root = temporaryDirectory();
    runHook(extensionHook, "claude", input("SessionStart"), {
      LLM_PETS_EXTENSION_EVENT_DIR: "",
      CURSOR_PET_EVENT_DIR: root
    });
    expect(fs.readdirSync(path.join(root, "claude"))).toHaveLength(1);
  });

  it("uses session_id and workspace_roots fallbacks", () => {
    const root = temporaryDirectory();
    runHook(extensionHook, "codex", {
      hook_event_name: "sessionStart",
      session_id: "composer-9",
      workspace_roots: ["/tmp/workspace"]
    }, { LLM_PETS_EXTENSION_EVENT_DIR: root });
    const providerDirectory = path.join(root, "codex");
    const [file] = fs.readdirSync(providerDirectory);
    const value = JSON.parse(fs.readFileSync(path.join(providerDirectory, file), "utf8"));
    expect(parseHookEvent(value)).toMatchObject({
      provider: "codex",
      eventName: "SessionStart",
      sessionId: "composer-9",
      cwd: "/tmp/workspace"
    });
  });
});

describe("terminal hook", () => {
  it("writes only to the supplied session event directory", () => {
    const directory = temporaryDirectory();
    runHook(terminalHook, "claude", input("PermissionRequest"), {
      LLM_PETS_EVENT_DIR: directory,
      LLM_PETS_EXTENSION_EVENT_DIR: path.join(directory, "extension-must-not-be-used")
    });
    const files = fs.readdirSync(directory).filter((name) => name.endsWith(".json"));
    expect(files).toHaveLength(1);
    const value = JSON.parse(fs.readFileSync(path.join(directory, files[0]), "utf8"));
    expect(parseHookEvent(value)).toMatchObject({
      version: 2,
      provider: "claude",
      eventName: "PermissionRequest"
    });
    expect(fs.existsSync(path.join(directory, "extension-must-not-be-used"))).toBe(false);
  });

  it("does nothing without a wrapped-session directory", () => {
    const home = temporaryDirectory();
    runHook(terminalHook, "codex", input(), {
      HOME: home,
      LLM_PETS_EVENT_DIR: "",
      LLM_PETS_EXTENSION_EVENT_DIR: path.join(home, "extension")
    });
    expect(fs.readdirSync(home)).toEqual([]);
  });
});

describe("generated hooks", () => {
  it("fail open on invalid input or provider", () => {
    for (const hook of [extensionHook, terminalHook]) {
      const directory = temporaryDirectory();
      expect(() => runHook(hook, "cursor", "{not-json", {
        LLM_PETS_EXTENSION_EVENT_DIR: directory,
        LLM_PETS_EVENT_DIR: directory
      })).not.toThrow();
      expect(() => runHook(hook, "gemini" as HookProvider, input(), {
        LLM_PETS_EXTENSION_EVENT_DIR: directory,
        LLM_PETS_EVENT_DIR: directory
      })).not.toThrow();
      expect(fs.readdirSync(directory)).toEqual([]);
    }
  });
});
