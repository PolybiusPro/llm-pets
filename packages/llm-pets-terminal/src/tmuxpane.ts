import { spawnSync } from "node:child_process";
import { closeSync, mkdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ansiLines } from "./backends/blocks.js";
import { EventWatcher } from "./events.js";
import { agentInProcessTree } from "./hosts.js";
import { openLock, tryLock } from "./lock.js";
import { eventDirectory, petDirectory, runtimeDirectory } from "./paths.js";
import { Animator, PetSpriteSheet, type RgbaFrame } from "./sprites.js";

export const PANE_PERCENT = 40;
export const MIN_SOURCE_LINES = 8;
export const PANE_MARKER = "@llm_pet";
export const ENSURE_WAIT_SECONDS = 20;

export type PaneArgs = {
  pet: string;
  position: "right" | "bottom";
  paneSize: number;
  cwd?: string;
  width: number;
  sourcePane?: string;
  once?: boolean;
  state?: string;
  ensure?: boolean;
  watch?: boolean;
  render?: boolean;
};

export function tmux(...arguments_: string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync("tmux", arguments_, { encoding: "utf8" });
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

export function paneHasAgent(paneId: string): boolean {
  const result = tmux("display-message", "-p", "-t", paneId, "#{pane_pid}");
  if (result.status !== 0) {
    return false;
  }
  const pid = Number.parseInt(result.stdout.trim(), 10);
  return Number.isInteger(pid) && agentInProcessTree(pid);
}

export async function waitForAgent(
  paneId: string,
  timeout = ENSURE_WAIT_SECONDS,
  check: (paneId: string) => boolean = paneHasAgent
): Promise<boolean> {
  const deadline = performance.now() / 1000 + timeout;
  while (performance.now() / 1000 < deadline) {
    if (check(paneId)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return check(paneId);
}

function allFrames(sheet: PetSpriteSheet): RgbaFrame[] {
  const frames: RgbaFrame[] = [];
  for (const state of Object.keys(sheet.animations)) {
    frames.push(...sheet.croppedFrames(state));
  }
  return frames;
}

export function idealPaneSize(sheet: PetSpriteSheet, windowWidth: number, windowHeight: number, position: string): number {
  if (position === "right") {
    const desired = Math.floor((windowWidth * PANE_PERCENT + 50) / 100);
    return Math.max(4, Math.min(desired, windowWidth - 2));
  }
  const availableWidth = Math.max(4, windowWidth - 2);
  let artLines = 1;
  for (const frame of allFrames(sheet)) {
    const width = Math.min(frame.width, availableWidth);
    let pixelHeight = Math.max(2, Math.round((frame.height * width) / frame.width));
    if (pixelHeight % 2) {
      pixelHeight += 1;
    }
    artLines = Math.max(artLines, Math.floor(pixelHeight / 2));
  }
  return Math.min(artLines + 2, Math.max(4, windowHeight - MIN_SOURCE_LINES - 1));
}

export function petCommand(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "main.js");
}

export function markedPanes(target?: string, run = tmux): string[] {
  const extra = target ? ["-t", target] : [];
  const result = run("list-panes", ...extra, "-F", `#{pane_id}\t#{${PANE_MARKER}}`);
  if (result.status !== 0) {
    return [];
  }
  const found: string[] = [];
  for (const line of result.stdout.split("\n")) {
    const [paneId, marker] = line.split("\t");
    if (marker === "1" && paneId) {
      found.push(paneId);
    }
  }
  return found;
}

export function paneDimensions(paneId: string, run = tmux): [number, number, number, number] | undefined {
  const result = run(
    "display-message",
    "-p",
    "-t",
    paneId,
    "#{window_width}\t#{window_height}\t#{pane_width}\t#{pane_height}"
  );
  if (result.status !== 0) {
    return undefined;
  }
  const values = result.stdout.trim().split("\t").map((value) => Number.parseInt(value, 10));
  if (values.length !== 4 || values.some((value) => !Number.isInteger(value))) {
    return undefined;
  }
  return [values[0] as number, values[1] as number, values[2] as number, values[3] as number];
}

export async function openPetPane(
  sourcePane: string,
  args: PaneArgs,
  run = tmux
): Promise<number> {
  if (markedPanes(sourcePane, run).length > 0) {
    return 0;
  }
  const sheet = await PetSpriteSheet.load(petDirectory(args.pet));
  let paneSize = args.paneSize;
  if (paneSize === 0) {
    const dimensions = paneDimensions(sourcePane, run);
    if (!dimensions) {
      console.error("llm-pet: could not read the tmux window size");
      return 1;
    }
    paneSize = idealPaneSize(sheet, dimensions[0], dimensions[1], args.position);
  }
  const command = [
    petCommand(),
    "--pet",
    args.pet,
    "pane",
    "--render",
    "--width",
    String(args.width),
    "--pane-size",
    String(args.paneSize),
    "--position",
    args.position,
    "--cwd",
    realpathSync(args.cwd || process.cwd()),
    "--source-pane",
    sourcePane
  ]
    .map((part) => (part.includes(" ") ? `'${part}'` : part))
    .join(" ");
  const result = run(
    "split-window",
    "-t",
    sourcePane,
    args.position === "right" ? "-h" : "-v",
    "-l",
    String(paneSize),
    "-d",
    "-P",
    "-F",
    "#{pane_id}",
    command
  );
  if (result.status !== 0) {
    console.error(result.stderr.trim() || "llm-pet: tmux split-window failed");
    return 1;
  }
  const paneId = result.stdout.trim();
  run("set-option", "-p", "-t", paneId, PANE_MARKER, "1");
  run("select-pane", "-t", paneId, "-T", sheet.displayName);
  console.log(`Opened pet pane ${paneId}.`);
  return 0;
}

export async function watch(args: PaneArgs): Promise<number> {
  const runtime = runtimeDirectory();
  mkdirSync(runtime, { recursive: true });
  const lockFd = openLock(path.join(runtime, "tmux-watch.lock"));
  try {
    if (!tryLock(lockFd)) {
      return 0;
    }
    while (true) {
      const result = tmux(
        "list-panes",
        "-a",
        "-F",
        `#{pane_id}\t#{window_id}\t#{${PANE_MARKER}}\t#{pane_current_path}`
      );
      if (result.status !== 0) {
        return 0;
      }
      const panes = result.stdout
        .split("\n")
        .map((line) => line.split("\t"))
        .filter((fields) => fields.length === 4) as [string, string, string, string][];
      const petWindows = new Set(panes.filter(([, , marker]) => marker === "1").map(([, windowId]) => windowId));
      for (const [paneId, windowId, marker] of panes) {
        if (marker === "1" || petWindows.has(windowId)) {
          continue;
        }
        if (!paneHasAgent(paneId)) {
          continue;
        }
        if ((await openPetPane(paneId, args)) === 0) {
          petWindows.add(windowId);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } finally {
    closeSync(lockFd);
  }
}

export async function render(args: PaneArgs): Promise<number> {
  if (!args.sourcePane && !args.once) {
    console.error("llm-pet: continuous pane rendering needs a source pane");
    return 2;
  }
  if (args.sourcePane && !paneHasAgent(args.sourcePane)) {
    if (!(await waitForAgent(args.sourcePane, 5))) {
      return 0;
    }
  }
  const sheet = await PetSpriteSheet.load(petDirectory(args.pet));
  const watcher = new EventWatcher(eventDirectory(), { cwd: args.cwd });
  const petPane = process.env.TMUX_PANE;
  process.stdout.write("\x1b[?1049h\x1b[?25l");
  const animator = new Animator(sheet);
  let running = true;
  const stop = (): void => {
    running = false;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.on("SIGHUP", stop);
  try {
    while (running) {
      watcher.poll();
      const now = performance.now() / 1000;
      const [state, index] = animator.frame(args.state || watcher.state(), now);
      const frames = sheet.croppedFrames(state);
      const frame = frames[Math.min(index, frames.length - 1)] ?? frames[0];
      if (frame) {
        const columns = process.stdout.columns || 20;
        const lines = await ansiLines(frame, Math.max(4, Math.min(frame.width, columns - 2)));
        const caption = `${sheet.displayName} | ${state}`;
        process.stdout.write(`\x1b[H\x1b[2J\x1b[2m${caption}\x1b[0m\n${lines.join("\n")}`);
      }
      if (args.once) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } finally {
    process.stdout.write("\x1b[0m\x1b[?25h\x1b[?1049l");
    if (petPane && !args.once) {
      tmux("kill-pane", "-t", petPane);
    }
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    process.off("SIGHUP", stop);
  }
  return 0;
}

export async function toggle(args: PaneArgs): Promise<number> {
  if (!process.env.TMUX) {
    console.error("llm-pet: run this from inside tmux");
    return 2;
  }
  const sourcePane = process.env.TMUX_PANE;
  const existing = markedPanes(sourcePane);
  if (existing.length > 0) {
    if (args.ensure) {
      return 0;
    }
    for (const paneId of existing) {
      tmux("kill-pane", "-t", paneId);
    }
    console.log("Closed the pet pane.");
    return 0;
  }
  if (!sourcePane) {
    console.error("llm-pet: no tmux pane in the environment");
    return 2;
  }
  if (!paneHasAgent(sourcePane)) {
    if (!args.ensure || !(await waitForAgent(sourcePane))) {
      console.error("llm-pet: no agent running in this tmux pane");
      return 2;
    }
  }
  return openPetPane(sourcePane, args);
}
