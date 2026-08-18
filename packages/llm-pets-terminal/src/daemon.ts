import { closeSync, mkdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { BlocksBackend } from "./backends/blocks.js";
import { KittyBackend } from "./backends/kitty.js";
import { EventWatcher } from "./events.js";
import { hostRunning } from "./hosts.js";
import { openLock, openOverlayTty, tryLock } from "./lock.js";
import { cacheRoot, eventDirectory, petDirectory, runtimeDirectory } from "./paths.js";
import { Animator, PetSpriteSheet } from "./sprites.js";

export const TICK = 0.05;
export const REDRAW_INTERVAL = 0.1;
export const IDLE_TIMEOUT = 6 * 60 * 60;
export const HOST_STARTUP_GRACE = 30.0;
export const HOST_EXIT_GRACE = 2.0;
export const TARGET_HEIGHT_PX = 75;

export function runtimeKey(tty: string): string {
  return createHash("sha256").update(tty).digest("hex").slice(0, 16);
}

function writeHeartbeat(filePath: string, tty: string, backend: string): void {
  const payload = JSON.stringify({
    pid: process.pid,
    tty,
    backend,
    updatedAt: Date.now() / 1000
  });
  const temporary = `${filePath}.${process.pid}.tmp`;
  writeFileSync(temporary, payload);
  renameSync(temporary, filePath);
}

type Backend = {
  name: string;
  frameCount: number;
  draw(state: string, animationIndex: number): Promise<void>;
  erase(): Promise<void>;
};

async function buildBackend(
  name: string,
  sheet: PetSpriteSheet,
  ttyFd: number,
  heightPx: number,
  cellRows: number
): Promise<Backend> {
  if (name === "kitty") {
    return new KittyBackend(sheet, ttyFd, cacheRoot(), heightPx);
  }
  if (name === "blocks") {
    return new BlocksBackend(sheet, ttyFd, cellRows);
  }
  throw new Error(`unknown backend: ${name}`);
}

function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, seconds * 1000);
  });
}

export async function run(
  tty: string,
  backendName: string,
  petId: string,
  options: { heightPx?: number; cellRows?: number; eventDirectory?: string } = {}
): Promise<number> {
  if (backendName === "none") {
    return 0;
  }
  const resolved = path.resolve(tty);
  if (!resolved.startsWith("/dev/pts/") && !resolved.startsWith("/dev/tty")) {
    throw new Error(`unsupported terminal device: ${tty}`);
  }
  const runtime = runtimeDirectory();
  mkdirSync(runtime, { recursive: true });
  const key = runtimeKey(resolved);
  const lockPath = `${runtime}/${key}.lock`;
  const heartbeatPath = `${runtime}/${key}.heartbeat`;
  const lockFd = openLock(lockPath);
  try {
    if (!tryLock(lockFd)) {
      return 0;
    }
    writeHeartbeat(heartbeatPath, resolved, backendName);
    const sheet = await PetSpriteSheet.load(petDirectory(petId));
    const watcher = new EventWatcher(options.eventDirectory ?? eventDirectory(), { tty: resolved });
    const ttyFd = openOverlayTty(resolved);
    const backend = await buildBackend(
      backendName,
      sheet,
      ttyFd,
      options.heightPx ?? TARGET_HEIGHT_PX,
      options.cellRows ?? 9
    );
    let running = true;
    const stop = (): void => {
      running = false;
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    process.on("SIGHUP", stop);
    const animator = new Animator(sheet);
    let now = performance.now() / 1000;
    let nextDrawAt = now;
    let nextHeartbeatAt = now;
    let deadline = now + HOST_STARTUP_GRACE;
    const ttyRdev = statSync(resolved).rdev;
    try {
      while (running) {
        watcher.poll();
        now = performance.now() / 1000;
        const incoming = watcher.state();
        const previous = animator.state;
        const [state, animationIndex] = animator.frame(incoming, now);
        if (state !== previous) {
          nextDrawAt = now;
        }
        if (now >= nextDrawAt) {
          try {
            await backend.draw(state, animationIndex);
          } catch {
            break;
          }
          nextDrawAt = now + REDRAW_INTERVAL;
        }
        if (now >= nextHeartbeatAt) {
          writeHeartbeat(heartbeatPath, resolved, backend.name);
          nextHeartbeatAt = now + 1.0;
          if (hostRunning(ttyRdev)) {
            deadline = now + HOST_EXIT_GRACE;
          } else if (now >= deadline) {
            break;
          }
        }
        if (Date.now() / 1000 - watcher.lastEventAt > IDLE_TIMEOUT) {
          break;
        }
        await sleep(TICK);
      }
    } finally {
      try {
        await backend.erase();
      } catch {
        // Terminal already gone.
      }
      closeSync(ttyFd);
      try {
        unlinkSync(heartbeatPath);
      } catch {
        // Missing heartbeat is fine.
      }
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      process.off("SIGHUP", stop);
    }
  } finally {
    closeSync(lockFd);
  }
  return 0;
}
