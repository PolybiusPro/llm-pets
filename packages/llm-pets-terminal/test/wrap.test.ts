import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CLAUDE_HOOK_EVENTS, CODEX_HOOK_EVENTS } from "../../../hooks/index.js";
import {
  configureWrappedAgentHooks,
  hookProviderForAgent,
  startFromWrapper,
  wrap,
  wrapperAction
} from "../src/wrap.js";

let home: string | undefined;

afterEach(() => {
  if (home) {
    rmSync(home, { recursive: true, force: true });
    home = undefined;
  }
});

function installHookScript(): string {
  home = mkdtempSync(path.join(os.tmpdir(), "llm-pets-wrap-"));
  const scriptPath = path.join(home, ".local", "share", "llm-pets", "hook.cjs");
  mkdirSync(path.dirname(scriptPath), { recursive: true });
  writeFileSync(scriptPath, "// test hook\n");
  return scriptPath;
}

describe("wrapperAction", () => {
  it("skips when stdin or stdout is not a tty", () => {
    expect(wrapperAction({}, { stdin: false, stdout: true })).toBe("skip");
    expect(wrapperAction({}, { stdin: true, stdout: false })).toBe("skip");
  });

  it("skips sixel, foot, and mlterm", () => {
    expect(wrapperAction({ TERM: "foot" }, { stdin: true, stdout: true })).toBe("skip");
    expect(wrapperAction({ TERM_PROGRAM: "mlterm" }, { stdin: true, stdout: true })).toBe("skip");
  });

  it("opens a pane inside tmux", () => {
    expect(wrapperAction({ TMUX: "/tmp/tmux-1" }, { stdin: true, stdout: true })).toBe("pane");
  });

  it("overlays outside tmux", () => {
    expect(wrapperAction({ TERM: "xterm-256color" }, { stdin: true, stdout: true })).toBe("overlay");
  });
});

describe("startFromWrapper", () => {
  it("spawns pane --ensure inside tmux", () => {
    const spawned: string[][] = [];
    startFromWrapper({ TMUX: "1" }, (args) => spawned.push(args), { stdin: true, stdout: true });
    expect(spawned).toEqual([["pane", "--ensure"]]);
  });
});

describe("wrapped agent hooks", () => {
  it("resolves only supported wrapped agents", () => {
    expect(hookProviderForAgent("codex")).toBe("codex");
    expect(hookProviderForAgent("/opt/bin/claude")).toBe("claude");
    expect(hookProviderForAgent("bash")).toBeUndefined();
  });

  it("merges async Codex hooks without replacing unrelated entries", () => {
    const scriptPath = installHookScript();
    const configPath = path.join(home as string, ".codex", "hooks.json");
    mkdirSync(path.dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify({
      description: "existing hooks",
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "existing" }] }]
      }
    }));

    expect(configureWrappedAgentHooks("codex", { HOME: home }, home)).toBe(configPath);
    const configured = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    expect(configured.description).toBe("existing hooks");
    const hooks = configured.hooks as Record<string, Array<{ hooks: Array<Record<string, unknown>> }>>;
    expect(hooks.PreToolUse).toHaveLength(2);
    for (const eventName of CODEX_HOOK_EVENTS) {
      const handler = hooks[eventName]?.at(-1)?.hooks[0];
      expect(handler).toMatchObject({
        type: "command",
        command: `node "${scriptPath}"`,
        async: true
      });
    }
  });

  it("merges Claude hooks idempotently into its settings", () => {
    installHookScript();
    const configPath = path.join(home as string, ".claude", "settings.json");
    mkdirSync(path.dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify({ theme: "dark" }));

    configureWrappedAgentHooks("claude", { HOME: home }, home);
    const first = readFileSync(configPath, "utf8");
    configureWrappedAgentHooks("claude", { HOME: home }, home);
    expect(readFileSync(configPath, "utf8")).toBe(first);
    const configured = JSON.parse(first) as Record<string, unknown>;
    expect(configured.theme).toBe("dark");
    const hooks = configured.hooks as Record<string, unknown[]>;
    for (const eventName of CLAUDE_HOOK_EVENTS) {
      expect(hooks[eventName]).toHaveLength(1);
    }
  });

  it("configures hooks before starting the renderer and agent", () => {
    const calls: string[] = [];
    const result = wrap("claude", ["--version"], {
      configureHooks: (agent) => {
        calls.push(`hooks:${agent}`);
        return undefined;
      },
      startRenderer: () => calls.push("renderer"),
      runAgent: (agent) => {
        calls.push(`agent:${agent}`);
        return { status: 0 };
      }
    });
    expect(result).toBe(0);
    expect(calls).toEqual(["hooks:claude", "renderer", "agent:claude"]);
  });
});
