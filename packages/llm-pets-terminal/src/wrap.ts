import { spawn, spawnSync } from "node:child_process";
import { readlinkSync } from "node:fs";
import { probeKittyGraphics, storeProbe } from "./terminal.js";

export const WRAPPER_SKIP = /sixel|foot|mlterm/i;

export type WrapperAction = "pane" | "overlay" | "skip";

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

export function wrap(agent: string, agentArgs: string[]): number {
  startFromWrapper();
  const result = spawnSync(agent, agentArgs, { stdio: "inherit", env: process.env });
  if (result.error) {
    console.error(`llm-pet: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}
