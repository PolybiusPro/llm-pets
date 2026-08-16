import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { parseHookEvent } from "../index.js";

const temporaryDirectories: string[] = [];
const scriptPath = path.resolve("hooks", "hook.cjs");

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function runHook(input: unknown, eventDirectory: string): { status: number; stdout: string } {
  try {
    const stdout = execFileSync(process.execPath, [scriptPath], {
      input: JSON.stringify(input),
      env: { ...process.env, LLM_PETS_EVENT_DIR: eventDirectory, LLM_PETS_BIN: path.join(eventDirectory, "missing-llm-pet") },
      encoding: "utf8"
    });
    return { status: 0, stdout };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string };
    return { status: failure.status ?? 1, stdout: failure.stdout ?? "" };
  }
}

describe("llm-pets hook", () => {
  it("writes one validated event without stdout", () => {
    const eventDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "llm-pets-hook-"));
    temporaryDirectories.push(eventDirectory);
    const result = runHook({
      hook_event_name: "preToolUse",
      conversation_id: "session-1",
      cwd: process.cwd()
    }, eventDirectory);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    const files = fs.readdirSync(eventDirectory);
    expect(files).toHaveLength(1);
    const value = JSON.parse(fs.readFileSync(path.join(eventDirectory, files[0]), "utf8"));
    expect(parseHookEvent(value)).toMatchObject({
      version: 1,
      eventName: "PreToolUse",
      sessionId: "session-1",
      cwd: process.cwd()
    });
  });

  it("uses conversation_id or session_id and workspace_roots for cwd", () => {
    const eventDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "llm-pets-hook-"));
    temporaryDirectories.push(eventDirectory);
    const result = runHook({
      hook_event_name: "sessionStart",
      session_id: "composer-9",
      workspace_roots: ["/tmp/workspace"]
    }, eventDirectory);
    expect(result.status).toBe(0);
    const files = fs.readdirSync(eventDirectory);
    const value = JSON.parse(fs.readFileSync(path.join(eventDirectory, files[0]), "utf8"));
    expect(parseHookEvent(value)).toMatchObject({
      eventName: "SessionStart",
      sessionId: "composer-9",
      cwd: "/tmp/workspace"
    });
  });

  it("canonicalizes Codex and Claude PascalCase events", () => {
    const eventDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "llm-pets-hook-"));
    temporaryDirectories.push(eventDirectory);
    const result = runHook({
      hook_event_name: "PermissionRequest",
      session_id: "thr_123",
      cwd: "/tmp/workspace"
    }, eventDirectory);
    expect(result.status).toBe(0);
    const files = fs.readdirSync(eventDirectory);
    const value = JSON.parse(fs.readFileSync(path.join(eventDirectory, files[0]), "utf8"));
    expect(parseHookEvent(value)).toMatchObject({
      eventName: "PermissionRequest",
      sessionId: "thr_123",
      cwd: "/tmp/workspace"
    });
  });

  it("fails open on invalid input", () => {
    const eventDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "llm-pets-hook-"));
    temporaryDirectories.push(eventDirectory);
    const stdout = execFileSync(process.execPath, [scriptPath], {
      input: "{not-json",
      env: { ...process.env, LLM_PETS_EVENT_DIR: eventDirectory, LLM_PETS_BIN: path.join(eventDirectory, "missing-llm-pet") },
      encoding: "utf8"
    });
    expect(stdout).toBe("");
    expect(fs.readdirSync(eventDirectory)).toEqual([]);
  });
});
