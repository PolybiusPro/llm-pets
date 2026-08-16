import * as os from "node:os";
import * as path from "node:path";

export function getCodexHome(
  environment: NodeJS.ProcessEnv = process.env,
  homeDirectory: string = os.homedir()
): string {
  const configured = environment.CODEX_HOME?.trim();
  return configured ? path.resolve(configured) : path.join(homeDirectory, ".codex");
}

export function getLlmPetsDirectory(homeDirectory: string = os.homedir()): string {
  return path.join(homeDirectory, ".pets");
}

export function getPetsDirectory(
  environment: NodeJS.ProcessEnv = process.env,
  homeDirectory: string = os.homedir()
): string {
  return path.join(getCodexHome(environment, homeDirectory), "pets");
}

export function getPetsDirectories(
  environment: NodeJS.ProcessEnv = process.env,
  homeDirectory: string = os.homedir()
): string[] {
  return [getLlmPetsDirectory(homeDirectory), getPetsDirectory(environment, homeDirectory)];
}
