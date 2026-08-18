import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HookEventReceiver } from "../src/cursor/HookEventReceiver.js";

vi.mock("vscode", () => ({
  RelativePattern: class RelativePattern {
    public constructor(public readonly base: unknown, public readonly pattern: string) {}
  },
  Uri: { file: (fsPath: string) => ({ fsPath }) },
  workspace: {
    createFileSystemWatcher: () => ({
      onDidCreate: () => ({ dispose: () => undefined }),
      onDidChange: () => ({ dispose: () => undefined }),
      dispose: () => undefined
    })
  }
}));

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true })
  ));
});

async function eventDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "llm-pets-receiver-"));
  temporaryDirectories.push(directory);
  await fs.writeFile(path.join(directory, "event.json"), JSON.stringify({
    version: 2,
    provider: "codex",
    eventName: "PreToolUse",
    sessionId: "session-1",
    cwd: "/workspace/project",
    occurredAt: Date.now()
  }));
  return directory;
}

describe("HookEventReceiver", () => {
  it("lets multiple receivers observe the same immutable event", async () => {
    const directory = await eventDirectory();
    const first: string[] = [];
    const second: string[] = [];
    const receiverOne = new HookEventReceiver({
      eventDirectory: directory,
      provider: "codex",
      workspaceRoots: ["/workspace"],
      log: () => undefined,
      onPetState: (state) => first.push(state)
    });
    const receiverTwo = new HookEventReceiver({
      eventDirectory: directory,
      provider: "codex",
      workspaceRoots: ["/workspace"],
      log: () => undefined,
      onPetState: (state) => second.push(state)
    });

    await receiverOne.start();
    await receiverTwo.start();
    await vi.waitFor(() => {
      expect(first).toEqual(["running"]);
      expect(second).toEqual(["running"]);
    });
    await expect(fs.access(path.join(directory, "event.json"))).resolves.toBeUndefined();
    receiverOne.dispose();
    receiverTwo.dispose();
  });

  it("ignores events tagged for another provider", async () => {
    const directory = await eventDirectory();
    const states: string[] = [];
    const receiver = new HookEventReceiver({
      eventDirectory: directory,
      provider: "claude",
      workspaceRoots: ["/workspace"],
      log: () => undefined,
      onPetState: (state) => states.push(state)
    });
    await receiver.start();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(states).toEqual([]);
    await expect(fs.access(path.join(directory, "event.json"))).resolves.toBeUndefined();
    receiver.dispose();
  });
});
