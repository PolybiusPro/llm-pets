import * as path from "node:path";
import type { HookEventName, HookTransition } from "../../../../hooks/index.js";

export {
  HookStateTracker as HookEventStateTracker,
  SPOOL_HOOK_EVENTS,
  parseHookEvent as parseCursorHookEvent
} from "../../../../hooks/index.js";
export type { HookEvent as CursorHookEvent, HookEventName } from "../../../../hooks/index.js";

/** @deprecated Use HookEventName. */
export type CursorHookEventName = HookEventName;
export type HookStateTransition = HookTransition & { sessionId: string };

export function isWithinWorkspace(cwd: string, workspaceRoots: readonly string[]): boolean {
  const candidate = path.resolve(cwd);
  return workspaceRoots.some((root) => {
    const relative = path.relative(path.resolve(root), candidate);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });
}
