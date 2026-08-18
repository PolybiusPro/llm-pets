import type { ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CODEX_HOOK_EVENTS } from "../../../hooks/index.js";
import {
  createWrappedSession,
  hookProviderForAgent,
  hooksExplicitlyDisabled,
  startFromWrapper,
  terminalHookArguments,
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

function installRuntimeAssets(): NodeJS.ProcessEnv {
  home = mkdtempSync(path.join(os.tmpdir(), "llm-pets-wrap-"));
  const root = path.join(home, ".local", "share", "llm-pets");
  mkdirSync(path.join(root, "claude-terminal-plugin"), { recursive: true });
  writeFileSync(path.join(root, "terminal-hook.cjs"), "// test hook\n");
  return { HOME: home, XDG_RUNTIME_DIR: home };
}

describe("wrapperAction", () => {
  it("skips when stdin or stdout is not a tty", () => {
    expect(wrapperAction({}, { stdin: false, stdout: true })).toBe("skip");
    expect(wrapperAction({}, { stdin: true, stdout: false })).toBe("skip");
  });

  it("skips unsupported terminals", () => {
    expect(wrapperAction({ TERM: "foot" }, { stdin: true, stdout: true })).toBe("skip");
    expect(wrapperAction({ TERM_PROGRAM: "mlterm" }, { stdin: true, stdout: true })).toBe("skip");
  });

  it("selects panes inside tmux and overlays outside it", () => {
    expect(wrapperAction({ TMUX: "/tmp/tmux-1" }, { stdin: true, stdout: true })).toBe("pane");
    expect(wrapperAction({ TERM: "xterm-256color" }, { stdin: true, stdout: true })).toBe("overlay");
  });
});

describe("startFromWrapper", () => {
  it("passes the session event directory to a tmux pane", () => {
    const spawned: string[][] = [];
    startFromWrapper(
      { TMUX: "1" },
      (args) => {
        spawned.push(args);
        return undefined;
      },
      { stdin: true, stdout: true },
      undefined,
      "/tmp/llm-pets-session/events"
    );
    expect(spawned).toEqual([["pane", "--ensure", "--event-dir", "/tmp/llm-pets-session/events"]]);
  });

  it("owns and terminates an overlay child", () => {
    const killed: string[] = [];
    const handle = startFromWrapper(
      {},
      () => ({ kill: (signal: string) => { killed.push(signal); return true; } }) as unknown as ChildProcess,
      { stdin: true, stdout: true },
      "/dev/pts/9",
      "/tmp/llm-pets-session/events"
    );
    handle.stop();
    expect(killed).toEqual(["SIGTERM"]);
  });
});

describe("session hooks", () => {
  it("resolves only supported wrapped agents", () => {
    expect(hookProviderForAgent("codex")).toBe("codex");
    expect(hookProviderForAgent("/opt/bin/claude")).toBe("claude");
    expect(hookProviderForAgent("bash")).toBeUndefined();
  });

  it("preserves explicit hook-disabling arguments", () => {
    expect(hooksExplicitlyDisabled("claude", ["--bare"])).toBe(true);
    expect(hooksExplicitlyDisabled("claude", ["--safe-mode"])).toBe(true);
    expect(hooksExplicitlyDisabled("codex", ["--disable", "hooks"])).toBe(true);
    expect(hooksExplicitlyDisabled("codex", ["--disable=hooks"])).toBe(true);
    expect(hooksExplicitlyDisabled("codex", ["-c", "features.hooks=false"])).toBe(true);
    expect(hooksExplicitlyDisabled("codex", ["--model", "gpt-5"])).toBe(false);
  });

  it("builds invocation-scoped Codex hook overrides", () => {
    const environment = installRuntimeAssets();
    const result = terminalHookArguments("codex", environment, home);
    expect(result.args[0]).toBe("--dangerously-bypass-hook-trust");
    expect(result.args.filter((argument) => argument === "-c")).toHaveLength(CODEX_HOOK_EVENTS.length);
    for (const eventName of CODEX_HOOK_EVENTS) {
      expect(result.args).toContainEqual(expect.stringContaining(`hooks.${eventName}=`));
    }
    expect(result.args.join(" ")).toContain(`node \\"${result.scriptPath}\\" codex`);
  });

  it("uses only the installed Claude plugin directory", () => {
    const environment = installRuntimeAssets();
    const result = terminalHookArguments("claude", environment, home);
    expect(result.args).toEqual([
      "--plugin-dir",
      path.join(home as string, ".local", "share", "llm-pets", "claude-terminal-plugin")
    ]);
  });

  it("creates a private unique runtime spool", () => {
    const environment = installRuntimeAssets();
    const first = createWrappedSession("claude", ["--model", "sonnet"], environment);
    const second = createWrappedSession("claude", [], environment);
    expect(first.directory).not.toBe(second.directory);
    expect(statSync(first.directory).mode & 0o777).toBe(0o700);
    expect(first.environment.LLM_PETS_EVENT_DIR).toBe(path.join(first.directory, "events"));
    expect(first.agentArgs.slice(-2)).toEqual(["--model", "sonnet"]);
  });
});

describe("wrap", () => {
  it("starts hooks and renderer for the session, then cleans both up", async () => {
    const calls: string[] = [];
    const result = await wrap("claude", ["--version"], {
      environment: {},
      ttys: { stdin: true, stdout: true },
      createSession: (_provider, args) => ({
        directory: "/tmp/llm-pets-test-session",
        environment: { LLM_PETS_EVENT_DIR: "/tmp/llm-pets-test-session/events" },
        agentArgs: ["--plugin-dir", "/plugin", ...args]
      }),
      startRenderer: (_environment, eventDirectory) => {
        calls.push(`renderer:${eventDirectory}`);
        return { stop: () => calls.push("renderer:stop") };
      },
      runAgent: (agent, args) => {
        calls.push(`agent:${agent}:${args.join(",")}`);
        return { status: 0 };
      },
      cleanupSession: (directory) => calls.push(`cleanup:${directory}`)
    });
    expect(result).toBe(0);
    expect(calls).toEqual([
      "renderer:/tmp/llm-pets-test-session/events",
      "agent:claude:--plugin-dir,/plugin,--version",
      "renderer:stop",
      "cleanup:/tmp/llm-pets-test-session"
    ]);
  });

  it("launches the agent unchanged when setup is disabled or fails", async () => {
    const invocations: string[][] = [];
    const runAgent = (_agent: string, args: string[]) => {
      invocations.push(args);
      return { status: 7 };
    };
    expect(await wrap("claude", ["--safe-mode"], {
      environment: {}, ttys: { stdin: true, stdout: true }, runAgent
    })).toBe(7);
    expect(await wrap("codex", ["exec", "prompt"], {
      environment: {}, ttys: { stdin: false, stdout: true }, runAgent
    })).toBe(7);
    expect(await wrap("codex", ["--model", "gpt-5"], {
      environment: {},
      ttys: { stdin: true, stdout: true },
      createSession: () => { throw new Error("missing runtime assets"); },
      runAgent
    })).toBe(7);
    expect(invocations).toEqual([
      ["--safe-mode"],
      ["exec", "prompt"],
      ["--model", "gpt-5"]
    ]);
  });

  it("cleans renderer and session after agent failure", async () => {
    const calls: string[] = [];
    const result = await wrap("codex", [], {
      environment: {},
      ttys: { stdin: true, stdout: true },
      createSession: () => ({
        directory: "/tmp/llm-pets-failed-session",
        environment: { LLM_PETS_EVENT_DIR: "/tmp/llm-pets-failed-session/events" },
        agentArgs: ["--dangerously-bypass-hook-trust"]
      }),
      startRenderer: () => ({ stop: () => calls.push("renderer:stop") }),
      runAgent: () => ({ status: null, signal: "SIGTERM" }),
      cleanupSession: () => calls.push("session:cleanup")
    });
    expect(result).toBe(128 + os.constants.signals.SIGTERM);
    expect(calls).toEqual(["renderer:stop", "session:cleanup"]);
  });
});
