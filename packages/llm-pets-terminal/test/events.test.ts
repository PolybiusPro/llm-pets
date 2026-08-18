import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EventWatcher } from "../src/events.js";

async function writeEvent(
  directory: string,
  name: string,
  session: string,
  extra: Record<string, unknown> = {}
): Promise<void> {
  const stem = `${Date.now()}-${name}-${session}-${readdirSync(directory).length}`;
  const payload = {
    version: 2,
    provider: "codex",
    eventName: name,
    sessionId: session,
    cwd: os.homedir(),
    occurredAt: Date.now(),
    tty: "/dev/pts/9",
    ...extra
  };
  await writeFile(path.join(directory, `${stem}.json`), JSON.stringify(payload), "utf8");
}

describe("EventWatcher", () => {
  it("maps events and prefers waiting over running", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "llm-pets-events-"));
    try {
      await writeEvent(directory, "SessionStart", "one");
      const watcher = new EventWatcher(directory, { tty: "/dev/pts/9" });
      expect(watcher.state()).toBe("idle");
      await writeEvent(directory, "PreToolUse", "one");
      watcher.poll();
      expect(watcher.state()).toBe("running");
      await writeEvent(directory, "Notification", "two");
      watcher.poll();
      expect(watcher.state()).toBe("waiting");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("ignores other terminals", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "llm-pets-events-"));
    try {
      await writeEvent(directory, "PreToolUse", "elsewhere", { tty: "/dev/pts/42" });
      const watcher = new EventWatcher(directory, { tty: "/dev/pts/9" });
      expect(watcher.state()).toBe("idle");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("shows review briefly when a session ends", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "llm-pets-events-"));
    try {
      await writeEvent(directory, "PreToolUse", "one");
      const watcher = new EventWatcher(directory, { tty: "/dev/pts/9" });
      expect(watcher.state()).toBe("running");
      await writeEvent(directory, "SessionEnd", "one");
      watcher.poll();
      expect(watcher.sessions.has("one")).toBe(true);
      expect(watcher.state()).toBe("review");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("decays review to idle after linger", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "llm-pets-events-"));
    try {
      await writeEvent(directory, "Stop", "one", { occurredAt: (Date.now() / 1000 - 60) * 1000 });
      const watcher = new EventWatcher(directory, { tty: "/dev/pts/9" });
      expect(watcher.state()).toBe("idle");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
