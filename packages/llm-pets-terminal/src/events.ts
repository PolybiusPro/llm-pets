import { readdirSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import {
  HOOK_EVENT_STATES,
  HookStateTracker,
  SESSION_TIMEOUT_MS,
  STATE_PRIORITY,
  hookEventTransition,
  parseHookEvent,
  type HookSessionState
} from "../../../hooks/index.js";

export const EVENT_STATES = HOOK_EVENT_STATES;
export { STATE_PRIORITY };
export const SESSION_END_EVENT = "SessionEnd";
export const REVIEW_LINGER_SECONDS = (hookEventTransition("Stop").settleAfterMs ?? 0) / 1000;
export const SESSION_TIMEOUT_SECONDS = SESSION_TIMEOUT_MS / 1000;
export type SessionState = HookSessionState;

export class EventWatcher {
  readonly eventDirectory: string;
  readonly tty: string | undefined;
  readonly cwd: string | undefined;
  readonly seen = new Set<string>();
  readonly tracker = new HookStateTracker();
  lastEventAt = Date.now() / 1000;

  constructor(eventDirectory: string, options: { tty?: string; cwd?: string } = {}) {
    this.eventDirectory = eventDirectory;
    this.tty = options.tty;
    this.cwd = options.cwd ? realpathSync(options.cwd) : undefined;
    this.prime();
  }

  get sessions(): Map<string, HookSessionState> {
    return this.tracker.sessions;
  }

  private jsonFiles(): string[] {
    try {
      return readdirSync(this.eventDirectory)
        .filter((name) => name.endsWith(".json"))
        .map((name) => path.join(this.eventDirectory, name))
        .sort();
    } catch {
      return [];
    }
  }

  private prime(): void {
    const files = this.jsonFiles();
    for (const file of files.slice(-1000)) this.read(file);
  }

  poll(): void {
    for (const file of this.jsonFiles()) {
      if (!this.seen.has(file)) this.read(file);
    }
  }

  private read(filePath: string): void {
    this.seen.add(filePath);
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(filePath, "utf8"));
    } catch {
      return;
    }
    if (!raw || typeof raw !== "object") return;
    const record = raw as Record<string, unknown>;
    if (this.tty !== undefined && record.tty !== this.tty) return;
    if (this.cwd !== undefined) {
      if (typeof record.cwd !== "string") return;
      try {
        if (realpathSync(record.cwd) !== this.cwd) return;
      } catch {
        return;
      }
    }

    const event = parseHookEvent(record);
    if (!event) return;
    this.tracker.handle(event);
    const updatedAt = event.occurredAt / 1000;
    this.lastEventAt = Math.max(this.lastEventAt, updatedAt);
  }

  state(): string {
    return this.tracker.state();
  }
}
