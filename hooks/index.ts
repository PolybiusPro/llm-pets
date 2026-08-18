import definitions from "./definitions.json" with { type: "json" };

export type HookPetState = "idle" | "running" | "waiting" | "review" | "failed";
export type HookEventName =
  | "SessionStart"
  | "UserPromptSubmit"
  | "PreToolUse"
  | "PostToolUse"
  | "PostToolUseFailure"
  | "AfterAgentThought"
  | "AfterAgentResponse"
  | "PermissionRequest"
  | "Stop"
  | "SessionEnd"
  | "PreCompact"
  | "PostCompact"
  | "SubagentStart"
  | "SubagentStop"
  | "Notification";

export type HookEntryStyle = "flat" | "nested";
export const HOOK_PROVIDERS = ["cursor", "codex", "claude"] as const;
export type HookProvider = typeof HOOK_PROVIDERS[number];

export type HookTransition = {
  state: HookPetState;
  settleAfterMs?: number;
};

export type HookEvent = {
  version: 2;
  provider: HookProvider;
  eventName: HookEventName;
  sessionId: string;
  cwd: string;
  occurredAt: number;
  tty?: string;
  term?: string;
  turnId?: string;
};

export type HookProviderDefinition = {
  events: readonly string[];
  entryStyle: HookEntryStyle;
  setSchemaVersion: boolean;
};

type JsonObject = Record<string, unknown>;

export const HOOK_EVENT_ALIASES = definitions.aliases as Readonly<Record<string, HookEventName>>;
export const HOOK_EVENT_TRANSITIONS = definitions.transitions as Readonly<Record<HookEventName, HookTransition>>;
export const HOOK_EVENT_STATES = Object.fromEntries(
  Object.entries(HOOK_EVENT_TRANSITIONS).map(([eventName, transition]) => [eventName, transition.state])
) as Readonly<Record<HookEventName, HookPetState>>;

export const SPOOL_HOOK_EVENTS = Object.keys(HOOK_EVENT_TRANSITIONS) as HookEventName[];
export const CURSOR_HOOK_EVENTS = definitions.providers.cursor.events as readonly string[];
export const CODEX_HOOK_EVENTS = definitions.providers.codex.events as readonly string[];
export const CLAUDE_HOOK_EVENTS = definitions.providers.claude.events as readonly string[];
export const STATE_PRIORITY: Readonly<Record<HookPetState, number>> = {
  idle: 0,
  review: 1,
  running: 2,
  waiting: 3,
  failed: 4
};
export const SESSION_TIMEOUT_MS = 4 * 60 * 60 * 1000;

const PROVIDER_DEFINITIONS = definitions.providers as Record<HookProvider, HookProviderDefinition>;

export function hookProviderDefinition(provider: HookProvider): HookProviderDefinition {
  return PROVIDER_DEFINITIONS[provider];
}

export function isHookProvider(value: unknown): value is HookProvider {
  return HOOK_PROVIDERS.includes(value as HookProvider);
}

export function normalizeHookEventName(value: string): HookEventName | undefined {
  return HOOK_EVENT_ALIASES[value];
}

export function hookEventTransition(eventName: HookEventName): HookTransition {
  return HOOK_EVENT_TRANSITIONS[eventName];
}

export function parseHookEvent(value: unknown): HookEvent | undefined {
  if (!isObject(value)) return undefined;
  const eventName = typeof value.eventName === "string"
    ? normalizeHookEventName(value.eventName)
    : undefined;
  if (
    value.version !== 2 ||
    !isHookProvider(value.provider) ||
    eventName === undefined ||
    typeof value.sessionId !== "string" ||
    value.sessionId.length === 0 ||
    typeof value.cwd !== "string" ||
    value.cwd.length === 0 ||
    typeof value.occurredAt !== "number" ||
    !Number.isFinite(value.occurredAt)
  ) {
    return undefined;
  }
  return {
    version: 2,
    provider: value.provider,
    eventName,
    sessionId: value.sessionId,
    cwd: value.cwd,
    occurredAt: value.occurredAt,
    ...optionalString(value, "tty"),
    ...optionalString(value, "term"),
    ...optionalString(value, "turnId")
  };
}

export type HookSessionState = {
  state: HookPetState;
  updatedAt: number;
  settleAfterMs?: number;
};

export class HookStateTracker {
  public readonly sessions = new Map<string, HookSessionState>();

  public handle(event: HookEvent): HookTransition & { sessionId: string } {
    const transition = hookEventTransition(event.eventName);
    const previous = this.sessions.get(event.sessionId);
    if (previous !== undefined && event.occurredAt < previous.updatedAt) {
      return { state: this.state(event.occurredAt), sessionId: event.sessionId };
    }
    this.sessions.set(event.sessionId, {
      state: transition.state,
      updatedAt: event.occurredAt,
      settleAfterMs: transition.settleAfterMs
    });
    return {
      state: this.state(event.occurredAt),
      sessionId: event.sessionId,
      settleAfterMs: transition.settleAfterMs
    };
  }

  public settle(sessionId: string): HookPetState {
    const session = this.sessions.get(sessionId);
    if (session) this.sessions.set(sessionId, { ...session, state: "idle", settleAfterMs: undefined });
    return this.state();
  }

  public state(now = Date.now()): HookPetState {
    let aggregate: HookPetState = "idle";
    for (const [sessionId, session] of this.sessions) {
      const age = now - session.updatedAt;
      if (age > SESSION_TIMEOUT_MS) {
        this.sessions.delete(sessionId);
        continue;
      }
      const state = session.settleAfterMs !== undefined && age > session.settleAfterMs
        ? "idle"
        : session.state;
      if (STATE_PRIORITY[state] > STATE_PRIORITY[aggregate]) aggregate = state;
    }
    return aggregate;
  }

  public reset(): void {
    this.sessions.clear();
  }
}

export interface MergePetHooksOptions {
  entryStyle: HookEntryStyle;
  setSchemaVersion?: boolean;
  async?: boolean;
}

export function hookCommand(scriptPath: string, provider?: HookProvider): string {
  const command = `node "${scriptPath.replaceAll('"', '\\"')}"`;
  return provider ? `${command} ${provider}` : command;
}

export function mergeCursorPetHooks(configuration: unknown, command: string): JsonObject {
  return mergePetHooks(configuration, command, CURSOR_HOOK_EVENTS, {
    entryStyle: "flat",
    setSchemaVersion: true
  });
}

export function mergePetHooks(
  configuration: unknown,
  command: string,
  events: readonly string[],
  options: MergePetHooksOptions
): JsonObject {
  const root = isObject(configuration) ? structuredClone(configuration) : {};
  if (options.setSchemaVersion && root.version === undefined) root.version = 1;
  const hooks = isObject(root.hooks) ? root.hooks : {};
  root.hooks = hooks;
  for (const eventName of events) {
    const entries = Array.isArray(hooks[eventName]) ? hooks[eventName] as unknown[] : [];
    const withoutOldEntries = removeCommandFromEntries(entries, command);
    withoutOldEntries.push(makeHookEntry(command, options.entryStyle, options.async));
    hooks[eventName] = withoutOldEntries;
  }
  return root;
}

export function removeCursorPetHooks(configuration: unknown, command: string): JsonObject {
  return removePetHooks(configuration, command);
}

export function removePetHooks(configuration: unknown, command: string): JsonObject {
  const root = isObject(configuration) ? structuredClone(configuration) : {};
  if (!isObject(root.hooks)) return root;
  for (const [eventName, entries] of Object.entries(root.hooks)) {
    if (!Array.isArray(entries)) continue;
    root.hooks[eventName] = removeCommandFromEntries(entries, command);
  }
  return root;
}

export function hasCursorPetHooks(configuration: unknown, command: string): boolean {
  return hasPetHooks(configuration, command, CURSOR_HOOK_EVENTS);
}

export function hasPetHooks(
  configuration: unknown,
  command: string,
  events: readonly string[]
): boolean {
  if (!isObject(configuration) || !isObject(configuration.hooks)) return false;
  const hooks = configuration.hooks;
  return events.every((eventName) => {
    const entries = hooks[eventName];
    return Array.isArray(entries) && entries.some((entry) => entryHasCommand(entry, command));
  });
}

function makeHookEntry(command: string, entryStyle: HookEntryStyle, asyncHook = false): JsonObject {
  if (entryStyle === "flat") return { command, timeout: 5 };
  return {
    hooks: [{
      type: "command",
      command,
      timeout: 5,
      statusMessage: "LLM Pets",
      ...(asyncHook ? { async: true } : {})
    }]
  };
}

function removeCommandFromEntries(entries: unknown[], command: string): unknown[] {
  return entries.filter((entry) => !entryHasCommand(entry, command));
}

function entryHasCommand(entry: unknown, command: string): boolean {
  if (!isObject(entry)) return false;
  if (entry.command === command) return true;
  return Array.isArray(entry.hooks) && entry.hooks.some((handler) =>
    isObject(handler) && (handler.command === command || handler.commandWindows === command)
  );
}

function optionalString<K extends "tty" | "term" | "turnId">(
  value: JsonObject,
  key: K
): Partial<Record<K, string>> {
  return typeof value[key] === "string" ? { [key]: value[key] } as Record<K, string> : {};
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
