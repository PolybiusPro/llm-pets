import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readlinkSync, renameSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  hookCommand,
  hookProviderDefinition,
  mergePetHooks,
  type HookProvider
} from "../../../hooks/index.js";
import { probeKittyGraphics, storeProbe } from "./terminal.js";

export const WRAPPER_SKIP = /sixel|foot|mlterm/i;

export type WrapperAction = "pane" | "overlay" | "skip";
export type WrappedHookProvider = Exclude<HookProvider, "cursor">;

type WrappedAgentResult = {
  error?: Error;
  status: number | null;
};

export type WrapDependencies = {
  configureHooks?: (agent: string) => string | undefined;
  startRenderer?: () => void;
  runAgent?: (agent: string, agentArgs: string[]) => WrappedAgentResult;
};

export function hookProviderForAgent(agent: string): WrappedHookProvider | undefined {
  const name = path.basename(agent).toLowerCase().replace(/\.exe$/, "");
  return name === "codex" || name === "claude" ? name : undefined;
}

export function configureWrappedAgentHooks(
  agent: string,
  environment: NodeJS.ProcessEnv = process.env,
  homeDirectory = environment.HOME?.trim() || os.homedir()
): string | undefined {
  const provider = hookProviderForAgent(agent);
  if (!provider) return undefined;

  const dataHome = environment.XDG_DATA_HOME?.trim() || path.join(homeDirectory, ".local", "share");
  const scriptPath = path.join(dataHome, "llm-pets", "hook.cjs");
  if (!existsSync(scriptPath)) {
    throw new Error(`hook script is missing: ${scriptPath}`);
  }

  const providerHome = provider === "codex"
    ? environment.CODEX_HOME?.trim() || path.join(homeDirectory, ".codex")
    : environment.CLAUDE_CONFIG_DIR?.trim() || path.join(homeDirectory, ".claude");
  const configPath = path.join(providerHome, provider === "codex" ? "hooks.json" : "settings.json");
  const existing = readJsonObject(configPath);
  const definition = hookProviderDefinition(provider);
  const merged = mergePetHooks(existing, hookCommand(scriptPath), definition.events, {
    entryStyle: definition.entryStyle,
    setSchemaVersion: definition.setSchemaVersion,
    async: true
  });
  atomicWriteJson(configPath, merged);
  return configPath;
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
  env: NodeJS.Dict<string> = process.env,
  spawnRenderer: (args: string[]) => void = spawnSelf,
  ttys = { stdin: Boolean(process.stdin.isTTY), stdout: Boolean(process.stdout.isTTY) },
  tty = controllingTty()
): void {
  const action = wrapperAction(env, ttys);
  if (action === "skip") {
    return;
  }
  if (action === "pane") {
    spawnRenderer(["pane", "--ensure"]);
    return;
  }
  const probed = probeKittyGraphics();
  if (probed !== undefined) {
    storeProbe(probed, env);
  }
  if (tty?.startsWith("/dev/pts/")) {
    spawnRenderer(["run", "--tty", tty]);
  }
}

function spawnSelf(args: string[]): void {
  const entry = process.argv[1];
  if (!entry) {
    return;
  }
  const child = spawn(process.execPath, [entry, ...args], {
    detached: true,
    stdio: "ignore",
    env: process.env
  });
  child.unref();
}

function readJsonObject(filePath: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`hook configuration must contain a JSON object: ${filePath}`);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    if (error instanceof SyntaxError) {
      throw new Error(`hook configuration is not valid JSON: ${filePath}: ${error.message}`);
    }
    throw error;
  }
}

function atomicWriteJson(filePath: string, value: unknown): void {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  try {
    if (readFileSync(filePath, "utf8") === serialized) return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.llm-pet-${process.pid}.tmp`;
  writeFileSync(temporaryPath, serialized, "utf8");
  renameSync(temporaryPath, filePath);
}

function runWrappedAgent(agent: string, agentArgs: string[]): WrappedAgentResult {
  return spawnSync(agent, agentArgs, { stdio: "inherit", env: process.env });
}

export function wrap(agent: string, agentArgs: string[], dependencies: WrapDependencies = {}): number {
  try {
    (dependencies.configureHooks ?? configureWrappedAgentHooks)(agent);
  } catch (error) {
    console.error(`llm-pet: could not configure hooks for ${agent}: ${error instanceof Error ? error.message : error}`);
  }
  (dependencies.startRenderer ?? startFromWrapper)();
  const result = (dependencies.runAgent ?? runWrappedAgent)(agent, agentArgs);
  if (result.error) {
    console.error(`llm-pet: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}
