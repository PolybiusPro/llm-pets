import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const APPLICATION = "llm-pets";

function home(): string {
  return process.env.HOME?.trim() || os.homedir();
}

function envHome(variable: string, fallback: string): string {
  const value = process.env[variable]?.trim();
  return value ? value : fallback;
}

export function stateRoot(): string {
  return path.join(envHome("XDG_STATE_HOME", path.join(home(), ".local", "state")), APPLICATION);
}

export function cacheRoot(): string {
  return path.join(envHome("XDG_CACHE_HOME", path.join(home(), ".cache")), APPLICATION);
}

export function dataRoot(): string {
  return path.join(envHome("XDG_DATA_HOME", path.join(home(), ".local", "share")), APPLICATION);
}

export function eventDirectory(): string {
  const configured = process.env.LLM_PETS_EVENT_DIR?.trim();
  if (configured) {
    return configured;
  }
  return path.join(stateRoot(), "events");
}

export function runtimeDirectory(): string {
  return path.join(stateRoot(), "runtime");
}

export function logPath(): string {
  return path.join(stateRoot(), "renderer.log");
}

export function codexHome(): string {
  const configured = process.env.CODEX_HOME?.trim();
  return configured ? configured : path.join(home(), ".codex");
}

export function llmPetsHome(): string {
  return path.join(home(), ".pets");
}

export function petDirectory(petId: string): string {
  const candidates: string[] = [];
  const configured = process.env.LLM_PETS_PET_DIR?.trim();
  if (configured) {
    candidates.push(configured);
  }
  candidates.push(path.join(llmPetsHome(), petId));
  candidates.push(path.join(dataRoot(), "pets", petId));
  candidates.push(path.join(codexHome(), "pets", petId));
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "pet.json"))) {
      return candidate;
    }
  }
  throw new Error(`no pet named ${JSON.stringify(petId)} found in: ${candidates.join(", ")}`);
}

export function configuredPetId(defaultId = "dude"): string {
  const configured = process.env.LLM_PETS_PET?.trim();
  if (configured) {
    return configured.replace(/^custom:/, "");
  }
  const configPath = path.join(codexHome(), "config.toml");
  try {
    const text = readFileSync(configPath, "utf8");
    const selected = tuiPet(text);
    if (selected) {
      return selected.replace(/^custom:/, "");
    }
  } catch {
    return defaultId;
  }
  return defaultId;
}

function tuiPet(toml: string): string | undefined {
  let inTui = false;
  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("[") && line.endsWith("]")) {
      inTui = line.slice(1, -1).trim() === "tui";
      continue;
    }
    if (!inTui) {
      continue;
    }
    const match = /^pet\s*=\s*"(.*)"\s*$/.exec(line);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}
