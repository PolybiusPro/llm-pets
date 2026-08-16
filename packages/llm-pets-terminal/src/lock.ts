import { constants, openSync } from "node:fs";
import { tryFlockExclusive } from "./posix.js";

export function openLock(lockPath: string): number {
  return openSync(lockPath, "a+");
}

export function tryLock(fd: number): boolean {
  return tryFlockExclusive(fd);
}

export const OVERLAY_OPEN_FLAGS = constants.O_WRONLY | constants.O_NOCTTY;

export function openOverlayTty(tty: string): number {
  // Write-only, and do not steal the controlling terminal: the agent
  // owns this pts. O_WRONLY means we cannot read the user's keystrokes.
  // O_NOCTTY means this process does not become the session boss of the
  // tty (job control, ^C, hangup). Probe is the only path that reads
  // stdin, and it runs before the agent starts.
  return openSync(tty, OVERLAY_OPEN_FLAGS);
}
