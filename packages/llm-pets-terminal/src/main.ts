import path from "node:path";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { EventWatcher } from "./events.js";
import { install, uninstall } from "./install.js";
import { run } from "./daemon.js";
import { configuredPetId, eventDirectory, petDirectory } from "./paths.js";
import { PetSpriteSheet } from "./sprites.js";
import { cachedProbe, probeKittyGraphics, selectBackend, storeProbe } from "./terminal.js";
import * as tmuxpane from "./tmuxpane.js";
import { DEFAULT_CELL_ROWS } from "./backends/blocks.js";
import { wrap } from "./wrap.js";

export const BACKEND_NAMES = ["auto", "kitty", "blocks"] as const;

export type Command =
  | { command: "run"; tty: string; backend: string; pet: string; height: number; rows: number }
  | { command: "probe"; quiet: boolean }
  | { command: "check"; backend: string; pet: string }
  | { command: "pane"; args: tmuxpane.PaneArgs }
  | { command: "wrap"; agent: string; agentArgs: string[] }
  | { command: "install" }
  | { command: "uninstall" }
  | { command: "help" };

export function parseArgs(argv: string[]): Command {
  const args = [...argv];
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    return { command: "help" };
  }
  if (args[0]?.startsWith("-") && args.includes("--tty")) {
    args.unshift("run");
  }
  let pet = configuredPetId();
  while (args[0] === "--pet") {
    args.shift();
    const value = args.shift();
    if (!value) {
      throw new Error("--pet requires a value");
    }
    pet = value;
  }
  const command = args.shift();
  if (command === "install") {
    return { command: "install" };
  }
  if (command === "uninstall") {
    return { command: "uninstall" };
  }
  if (command === "probe") {
    return { command: "probe", quiet: args.includes("--quiet") };
  }
  if (command === "check") {
    return { command: "check", backend: flag(args, "--backend") ?? "auto", pet };
  }
  if (command === "wrap") {
    if (args[0] === "--") {
      args.shift();
    }
    const agent = args.shift();
    if (!agent) {
      throw new Error("wrap requires an agent command");
    }
    return { command: "wrap", agent, agentArgs: args };
  }
  if (command === "run") {
    return {
      command: "run",
      tty: requiredFlag(args, "--tty"),
      backend: flag(args, "--backend") ?? "auto",
      pet,
      height: Number(flag(args, "--height") ?? 75),
      rows: Number(flag(args, "--rows") ?? DEFAULT_CELL_ROWS)
    };
  }
  if (command === "pane") {
    return {
      command: "pane",
      args: {
        pet,
        position: (flag(args, "--position") as "right" | "bottom") || "right",
        paneSize: Number(flag(args, "--pane-size") ?? 0),
        cwd: flag(args, "--cwd"),
        width: Number(flag(args, "--width") ?? 0),
        sourcePane: flag(args, "--source-pane"),
        once: args.includes("--once"),
        state: flag(args, "--state"),
        ensure: args.includes("--ensure"),
        watch: args.includes("--watch"),
        render: args.includes("--render")
      }
    };
  }
  throw new Error(`unknown command: ${command}`);
}

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  const value = args[index + 1];
  args.splice(index, 2);
  return value;
}

function requiredFlag(args: string[], name: string): string {
  const value = flag(args, name);
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  try {
    const parsed = parseArgs(argv);
    if (parsed.command === "help") {
      console.log("llm-pet run | probe | check | pane | wrap | install | uninstall");
      return 0;
    }
    if (parsed.command === "install") {
      install();
      return 0;
    }
    if (parsed.command === "uninstall") {
      uninstall();
      return 0;
    }
    if (parsed.command === "probe") {
      const result = probeKittyGraphics();
      if (result === undefined) {
        if (!parsed.quiet) {
          console.log("no answer from the terminal; leaving the cached result alone");
        }
        return 1;
      }
      storeProbe(result);
      if (!parsed.quiet) {
        console.log(`kitty graphics: ${result ? "supported" : "not supported"}`);
        console.log(`backend: ${selectBackend()}`);
      }
      return 0;
    }
    if (parsed.command === "check") {
      const directory = petDirectory(parsed.pet);
      const sheet = await PetSpriteSheet.load(directory);
      const watcher = new EventWatcher(eventDirectory());
      const probed = cachedProbe();
      const animations = Object.entries(sheet.animations)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, animation]) => `${name}=${animation.frames.length}`)
        .join(", ");
      console.log(`Pet:        ${sheet.displayName} (${directory})`);
      console.log(`Sheet:      ${sheet.columns}x${sheet.rows} grid, ${sheet.frameCount} cells`);
      console.log(`Animations: ${animations}`);
      console.log(`Backend:    ${selectBackend()} (requested: ${parsed.backend})`);
      console.log(
        `Kitty:      ${
          probed === true ? "probed, supported" : probed === false ? "probed, unsupported" : "not probed; using environment heuristics"
        }`
      );
      console.log(`Events:     ${watcher.seen.size} in ${eventDirectory()}`);
      console.log(`State:      ${watcher.state()}`);
      return 0;
    }
    if (parsed.command === "wrap") {
      return wrap(parsed.agent, parsed.agentArgs);
    }
    if (parsed.command === "run") {
      const backend = parsed.backend === "auto" ? selectBackend() : parsed.backend;
      return run(parsed.tty, backend, parsed.pet, { heightPx: parsed.height, cellRows: parsed.rows });
    }
    if (parsed.command === "pane") {
      if (parsed.args.watch) {
        return tmuxpane.watch(parsed.args);
      }
      if (parsed.args.render) {
        return tmuxpane.render(parsed.args);
      }
      return tmuxpane.toggle(parsed.args);
    }
    return 2;
  } catch (error) {
    console.error(`llm-pet: ${error instanceof Error ? error.message : error}`);
    return 1;
  }
}

export function isDirectRun(entry = process.argv[1], metaUrl = import.meta.url): boolean {
  if (!entry) {
    return false;
  }
  try {
    return metaUrl === pathToFileURL(realpathSync(entry)).href;
  } catch {
    try {
      return metaUrl === pathToFileURL(path.resolve(entry)).href;
    } catch {
      return false;
    }
  }
}

if (isDirectRun()) {
  void main().then((code) => process.exit(code));
}
