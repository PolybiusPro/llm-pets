import { existsSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  CLAUDE_HOOK_EVENTS,
  CODEX_HOOK_EVENTS,
  CURSOR_HOOK_EVENTS,
  HOOK_PROVIDERS,
  hookProviderDefinition,
  isHookProvider,
  type HookEntryStyle,
  type HookProvider
} from "../../../../hooks/index.js";
import { getCodexHome } from "../pet/codexHome.js";
import { getCursorHome } from "./cursorHome.js";

export {
  CLAUDE_HOOK_EVENTS,
  CODEX_HOOK_EVENTS,
  CURSOR_HOOK_EVENTS,
  HOOK_PROVIDERS,
  isHookProvider
};
export type { HookEntryStyle, HookProvider };

export interface HookProviderTarget {
  provider: HookProvider;
  homeDirectory: string;
  configPath: string;
  events: readonly string[];
  entryStyle: HookEntryStyle;
  setSchemaVersion: boolean;
}

export function isCursorHost(appName?: string, uriScheme?: string): boolean {
  return appName?.toLowerCase() === "cursor" || uriScheme?.toLowerCase() === "cursor";
}

export function hookProvidersForHost(cursorHost: boolean): HookProvider[] {
  return cursorHost ? [...HOOK_PROVIDERS] : HOOK_PROVIDERS.filter((provider) => provider !== "cursor");
}

export function availableHookProvidersForHost(
  cursorHost: boolean,
  environment: NodeJS.ProcessEnv = process.env,
  homeDirectory = os.homedir(),
  exists: (path: string) => boolean = existsSync
): HookProvider[] {
  return hookProvidersForHost(cursorHost).filter((provider) =>
    provider === "cursor" && cursorHost
      ? true
      : exists(resolveHookProviderTarget(provider, environment, homeDirectory).homeDirectory)
  );
}

export function resolveHookProviderForHost(configured: unknown, cursorHost: boolean): HookProvider {
  const available = hookProvidersForHost(cursorHost);
  if (isHookProvider(configured) && available.includes(configured)) {
    return configured;
  }
  return available[0] ?? "codex";
}

export function nextHookProvider(current: HookProvider, cursorHost: boolean): HookProvider {
  const available = hookProvidersForHost(cursorHost);
  const resolved = resolveHookProviderForHost(current, cursorHost);
  const index = available.indexOf(resolved);
  return available[(index + 1) % available.length] ?? resolved;
}

export function hookProviderLabel(provider: HookProvider): string {
  switch (provider) {
    case "cursor":
      return "Cursor";
    case "codex":
      return "Codex";
    case "claude":
      return "Claude";
  }
}

export function getClaudeHome(
  environment: NodeJS.ProcessEnv = process.env,
  homeDirectory = os.homedir()
): string {
  const configured = environment.CLAUDE_CONFIG_DIR?.trim();
  return configured ? path.resolve(configured) : path.join(homeDirectory, ".claude");
}

export function resolveHookProviderTarget(
  provider: HookProvider,
  environment: NodeJS.ProcessEnv = process.env,
  homeDirectory = os.homedir()
): HookProviderTarget {
  const definition = hookProviderDefinition(provider);
  let providerHome: string;
  let configName: string;
  if (provider === "cursor") {
    providerHome = getCursorHome(environment, homeDirectory);
    configName = "hooks.json";
  } else if (provider === "codex") {
    providerHome = getCodexHome(environment, homeDirectory);
    configName = "hooks.json";
  } else {
    providerHome = getClaudeHome(environment, homeDirectory);
    configName = "settings.json";
  }
  return {
    provider,
    homeDirectory: providerHome,
    configPath: path.join(providerHome, configName),
    ...definition
  };
}
