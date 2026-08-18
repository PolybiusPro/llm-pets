import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readlinkSync,
  rmSync,
  statSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  hookCommand,
  hookProviderDefinition,
  type HookProvider
} from "../../../hooks/index.js";
import { probeKittyGraphics, storeProbe } from "./terminal.js";

export const WRAPPER_SKIP = /sixel|foot|mlterm/i;

export type WrapperAction = "pane" | "overlay" | "skip";
export type WrappedHookProvider = Exclude<HookProvider, "cursor">;

type WrappedAgentResult = {
  error?: Error;
  status: number | null;
  signal?: NodeJS.Signals | null;
};

export type WrappedSession = {
  directory: string;
  environment: NodeJS.ProcessEnv;
  agentArgs: string[];
};

export type RendererHandle = {
  stop(): void;
};

export type WrapDependencies = {
  environment?: NodeJS.ProcessEnv;
  ttys?: { stdin: boolean; stdout: boolean };
  tty?: string;
  createSession?: (provider: WrappedHookProvider, agentArgs: string[], environment: NodeJS.ProcessEnv) => WrappedSession;
  startRenderer?: (environment: NodeJS.ProcessEnv, eventDirectory: string) => RendererHandle;
  runAgent?: (
    agent: string,
    agentArgs: string[],
    environment: NodeJS.ProcessEnv
  ) => WrappedAgentResult | Promise<WrappedAgentResult>;
  cleanupSession?: (directory: string) => void;
};

export function hookProviderForAgent(agent: string): WrappedHookProvider | undefined {
  const name = path.basename(agent).toLowerCase().replace(/\.exe$/, "");
  return name === "codex" || name === "claude" ? name : undefined;
}

export function hooksExplicitlyDisabled(provider: WrappedHookProvider, agentArgs: readonly string[]): boolean {
  if (provider === "claude") {
    return agentArgs.includes("--bare") || agentArgs.includes("--safe-mode");
  }
  for (let index = 0; index < agentArgs.length; index += 1) {
    const argument = agentArgs[index];
    if (argument === "--disable" && agentArgs[index + 1] === "hooks") return true;
    if (argument === "--disable=hooks") return true;
    if (argument !== "-c" && argument !== "--config") continue;
    const override = agentArgs[index + 1]?.replaceAll(" ", "").toLowerCase();
    if (override === "features.hooks=false" || override === "features.codex_hooks=false") return true;
  }
  return false;
}

function dataHome(environment: NodeJS.ProcessEnv, homeDirectory: string): string {
  return environment.XDG_DATA_HOME?.trim() || path.join(homeDirectory, ".local", "share");
}

function sessionRoot(environment: NodeJS.ProcessEnv): string {
  const uid = typeof process.getuid === "function" ? process.getuid() : process.pid;
  const base = environment.XDG_RUNTIME_DIR?.trim() || os.tmpdir();
  return path.join(base, `llm-pets-${uid}`);
}

function pruneSessionDirectories(root: string): void {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  try {
    for (const name of readdirSync(root)) {
      const candidate = path.join(root, name);
      try {
        if (statSync(candidate).mtimeMs < cutoff) rmSync(candidate, { recursive: true, force: true });
      } catch {
        // Another wrapper may be cleaning the same abandoned session.
      }
    }
  } catch {
    // The root is created immediately below.
  }
}

function codexHookValue(command: string): string {
  return `[{ hooks = [{ type = "command", command = ${JSON.stringify(command)}, timeout = 5, statusMessage = "LLM Pets", async = true }] }]`;
}

export function terminalHookArguments(
  provider: WrappedHookProvider,
  environment: NodeJS.ProcessEnv = process.env,
  homeDirectory = environment.HOME?.trim() || os.homedir()
): { args: string[]; scriptPath: string } {
  const root = path.join(dataHome(environment, homeDirectory), "llm-pets");
  const scriptPath = path.join(root, "terminal-hook.cjs");
  if (!existsSync(scriptPath)) {
    throw new Error(`hook script is missing: ${scriptPath}`);
  }
  if (provider === "claude") {
    const pluginPath = path.join(root, "claude-terminal-plugin");
    if (!existsSync(pluginPath)) throw new Error(`Claude plugin is missing: ${pluginPath}`);
    return { args: ["--plugin-dir", pluginPath], scriptPath };
  }
  const definition = hookProviderDefinition(provider);
  const command = hookCommand(scriptPath, provider);
  const args = ["--dangerously-bypass-hook-trust"];
  for (const eventName of definition.events) {
    args.push("-c", `hooks.${eventName}=${codexHookValue(command)}`);
  }
  return { args, scriptPath };
}

export function createWrappedSession(
  provider: WrappedHookProvider,
  agentArgs: string[],
  environment: NodeJS.ProcessEnv = process.env
): WrappedSession {
  const homeDirectory = environment.HOME?.trim() || os.homedir();
  const root = sessionRoot(environment);
  pruneSessionDirectories(root);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const directory = mkdtempSync(path.join(root, "session-"));
  chmodSync(directory, 0o700);
  const eventDirectory = path.join(directory, "events");
  mkdirSync(eventDirectory, { mode: 0o700 });
  try {
    const hook = terminalHookArguments(provider, environment, homeDirectory);
    return {
      directory,
      environment: {
        ...environment,
        LLM_PETS_EVENT_DIR: eventDirectory,
        LLM_PETS_TERMINAL_HOOK: hook.scriptPath
      },
      agentArgs: [...hook.args, ...agentArgs]
    };
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

export function wrapperAction(
  env: NodeJS.Dict<string>,
  ttys: { stdin: boolean; stdout: boolean }
): WrapperAction {
  if (!ttys.stdin || !ttys.stdout) {
    return "skip";
  }
  const hint = `${env.TERM ?? ""} ${env.TERM_PROGRAM ?? ""}`;
  if (WRAPPER_SKIP.test(hint)) {
    return "skip";
  }
  if (env.TMUX) {
    return "pane";
  }
  return "overlay";
}

export function controllingTty(): string | undefined {
  try {
    const target = readlinkSync("/proc/self/fd/0");
    if (target.startsWith("/dev/pts/") || /^\/dev\/tty\d+$/.test(target)) {
      return target;
    }
  } catch {
    // Not a tty.
  }
  return undefined;
}

export function startFromWrapper(
  env: NodeJS.ProcessEnv = process.env,
  spawnRenderer: (args: string[], environment: NodeJS.ProcessEnv) => ChildProcess | undefined = spawnSelf,
  ttys = { stdin: Boolean(process.stdin.isTTY), stdout: Boolean(process.stdout.isTTY) },
  tty = controllingTty(),
  eventDirectory = env.LLM_PETS_EVENT_DIR
): RendererHandle {
  const action = wrapperAction(env, ttys);
  if (action === "skip") {
    return { stop: () => undefined };
  }
  if (action === "pane") {
    const args = ["pane", "--ensure"];
    if (eventDirectory) args.push("--event-dir", eventDirectory);
    spawnRenderer(args, env);
    return {
      stop: () => {
        spawnSelfSync(["pane"], env);
      }
    };
  }
  const probed = probeKittyGraphics();
  if (probed !== undefined) {
    storeProbe(probed, env);
  }
  if (tty?.startsWith("/dev/pts/")) {
    const args = ["run", "--tty", tty];
    if (eventDirectory) args.push("--event-dir", eventDirectory);
    const child = spawnRenderer(args, env);
    return { stop: () => child?.kill("SIGTERM") };
  }
  return { stop: () => undefined };
}

function spawnSelf(args: string[], environment: NodeJS.ProcessEnv): ChildProcess | undefined {
  const entry = process.argv[1];
  if (!entry) {
    return undefined;
  }
  const child = spawn(process.execPath, [entry, ...args], {
    stdio: "ignore",
    env: environment
  });
  child.on("error", () => undefined);
  return child;
}

function spawnSelfSync(args: string[], environment: NodeJS.ProcessEnv): void {
  const entry = process.argv[1];
  if (entry) spawnSync(process.execPath, [entry, ...args], { stdio: "ignore", env: environment });
}

function runWrappedAgent(
  agent: string,
  agentArgs: string[],
  environment: NodeJS.ProcessEnv
): Promise<WrappedAgentResult> {
  return new Promise((resolve) => {
    const child = spawn(agent, agentArgs, { stdio: "inherit", env: environment });
    const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];
    const handlers = new Map<NodeJS.Signals, () => void>();
    const cleanup = (): void => {
      for (const [signal, handler] of handlers) process.off(signal, handler);
    };
    for (const signal of signals) {
      const handler = (): void => {
        child.kill(signal);
      };
      handlers.set(signal, handler);
      process.on(signal, handler);
    }
    child.once("error", (error) => {
      cleanup();
      resolve({ error, status: null });
    });
    child.once("exit", (status, signal) => {
      cleanup();
      resolve({ status, signal });
    });
  });
}

export async function wrap(
  agent: string,
  agentArgs: string[],
  dependencies: WrapDependencies = {}
): Promise<number> {
  const environment = dependencies.environment ?? process.env;
  const provider = hookProviderForAgent(agent);
  const ttys = dependencies.ttys ?? {
    stdin: Boolean(process.stdin.isTTY),
    stdout: Boolean(process.stdout.isTTY)
  };
  const runAgent = dependencies.runAgent ?? runWrappedAgent;
  if (!provider || wrapperAction(environment, ttys) === "skip" || hooksExplicitlyDisabled(provider, agentArgs)) {
    return resultCode(await runAgent(agent, agentArgs, environment));
  }

  let session: WrappedSession;
  try {
    session = (dependencies.createSession ?? createWrappedSession)(provider, agentArgs, environment);
  } catch (error) {
    console.error(`llm-pet: could not configure session hooks for ${agent}: ${error instanceof Error ? error.message : error}`);
    return resultCode(await runAgent(agent, agentArgs, environment));
  }

  let renderer: RendererHandle;
  try {
    renderer = dependencies.startRenderer
      ? dependencies.startRenderer(session.environment, session.environment.LLM_PETS_EVENT_DIR as string)
      : startFromWrapper(session.environment, spawnSelf, ttys, dependencies.tty ?? controllingTty());
  } catch (error) {
    console.error(`llm-pet: could not start the renderer for ${agent}: ${error instanceof Error ? error.message : error}`);
    (dependencies.cleanupSession ?? cleanupWrappedSession)(session.directory);
    return resultCode(await runAgent(agent, agentArgs, environment));
  }

  try {
    return resultCode(await runAgent(agent, session.agentArgs, session.environment));
  } finally {
    renderer.stop();
    (dependencies.cleanupSession ?? cleanupWrappedSession)(session.directory);
  }
}

function cleanupWrappedSession(directory: string): void {
  rmSync(directory, { recursive: true, force: true });
}

function resultCode(result: WrappedAgentResult): number {
  if (result.error) {
    console.error(`llm-pet: ${result.error.message}`);
    return 1;
  }
  if (result.status !== null) return result.status;
  return result.signal ? 128 + os.constants.signals[result.signal] : 1;
}
