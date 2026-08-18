import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import type { HookProvider } from "./hookProvider.js";
import type { PetState } from "../pet/types.js";
import {
  HookEventStateTracker,
  isWithinWorkspace,
  parseCursorHookEvent
} from "./HookEventStateTracker.js";

export interface HookEventReceiverOptions {
  eventDirectory: string;
  provider: HookProvider;
  workspaceRoots: readonly string[];
  log(message: string): void;
  onPetState(state: PetState): void;
  onEventReceived?(): void;
}

export class HookEventReceiver implements vscode.Disposable {
  private readonly tracker = new HookEventStateTracker();
  private readonly settleTimers = new Map<string, NodeJS.Timeout>();
  private readonly seen = new Set<string>();
  private watcher: vscode.FileSystemWatcher | undefined;
  private disposed = false;

  public constructor(private readonly options: HookEventReceiverOptions) {}

  public async start(): Promise<void> {
    if (this.watcher || this.disposed) return;
    await fs.mkdir(this.options.eventDirectory, { recursive: true });
    this.watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(this.options.eventDirectory), "*.json")
    );
    this.watcher.onDidCreate((uri) => void this.process(uri.fsPath));
    this.watcher.onDidChange((uri) => void this.process(uri.fsPath));
    this.options.log(`Hooks receiver watching: ${this.options.eventDirectory}`);
    for (const name of await fs.readdir(this.options.eventDirectory)) {
      if (name.endsWith(".json")) void this.process(path.join(this.options.eventDirectory, name));
    }
  }

  public dispose(): void {
    this.disposed = true;
    this.watcher?.dispose();
    this.watcher = undefined;
    for (const timer of this.settleTimers.values()) clearTimeout(timer);
    this.settleTimers.clear();
    this.seen.clear();
    this.tracker.reset();
  }

  private async process(eventPath: string): Promise<void> {
    if (this.disposed || this.seen.has(eventPath)) return;
    this.seen.add(eventPath);
    let raw: string;
    try {
      raw = await fs.readFile(eventPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        this.options.log(`Could not read Hook event ${path.basename(eventPath)}: ${String(error)}`);
      }
      return;
    }

    let event;
    try {
      event = parseCursorHookEvent(JSON.parse(raw));
    } catch {
      event = undefined;
    }
    if (!event) {
      this.options.log(`Ignored invalid Hook event: ${path.basename(eventPath)}`);
      await fs.unlink(eventPath).catch(() => undefined);
      return;
    }
    if (Date.now() - event.occurredAt > 5 * 60 * 1000) {
      this.options.log(`Removed stale Hook event: ${path.basename(eventPath)}`);
      await fs.unlink(eventPath).catch(() => undefined);
      return;
    }
    if (event.provider !== this.options.provider) {
      this.options.log(`Ignored ${event.provider} Hook event in ${this.options.provider} spool.`);
      return;
    }
    if (!isWithinWorkspace(event.cwd, this.options.workspaceRoots)) return;

    const transition = this.tracker.handle(event);
    this.options.onEventReceived?.();
    this.options.log(
      `Hook ${event.eventName} (${event.sessionId}) -> ${transition.state} [${event.cwd}]`
    );
    this.options.onPetState(transition.state);
    const previous = this.settleTimers.get(event.sessionId);
    if (previous) clearTimeout(previous);
    if (transition.settleAfterMs) {
      const timer = setTimeout(() => {
        this.settleTimers.delete(event.sessionId);
        this.options.onPetState(this.tracker.settle(event.sessionId));
      }, transition.settleAfterMs);
      this.settleTimers.set(event.sessionId, timer);
    }
  }
}
