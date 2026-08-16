import * as os from "node:os";
import * as path from "node:path";

export function getCursorHome(
  environment: NodeJS.ProcessEnv = process.env,
  homeDirectory = os.homedir()
): string {
  const configured = environment.CURSOR_HOME?.trim();
  return configured ? path.resolve(configured) : path.join(homeDirectory, ".cursor");
}

export function getDataHome(
  environment: NodeJS.ProcessEnv = process.env,
  homeDirectory = os.homedir()
): string {
  const configured = environment.XDG_DATA_HOME?.trim();
  return configured ? path.resolve(configured) : path.join(homeDirectory, ".local", "share");
}

export function getStateHome(
  environment: NodeJS.ProcessEnv = process.env,
  homeDirectory = os.homedir()
): string {
  const configured = environment.XDG_STATE_HOME?.trim();
  return configured ? path.resolve(configured) : path.join(homeDirectory, ".local", "state");
}

export function getHookScriptInstallPath(
  environment: NodeJS.ProcessEnv = process.env,
  homeDirectory = os.homedir()
): string {
  return path.join(getDataHome(environment, homeDirectory), "llm-pets", "hook.cjs");
}

export function getEventDirectory(
  environment: NodeJS.ProcessEnv = process.env,
  homeDirectory = os.homedir()
): string {
  const configured = environment.LLM_PETS_EVENT_DIR?.trim()
    || environment.CURSOR_PET_EVENT_DIR?.trim();
  if (configured) return path.resolve(configured);
  return path.join(getStateHome(environment, homeDirectory), "llm-pets", "events");
}
