import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { HookProviderTarget } from "./hookProvider.js";
import {
  hasPetHooks,
  hookCommand,
  mergePetHooks,
  removePetHooks
} from "./HookConfiguration.js";

export interface HookInstallResult {
  hooksPath: string;
  scriptPath: string;
  command: string;
}

export class HookInstaller {
  public constructor(
    private readonly target: HookProviderTarget,
    private readonly bundledScriptPath: string,
    private readonly installedScriptPath: string,
    private readonly legacyScriptPath?: string
  ) {}

  public get hooksPath(): string {
    return this.target.configPath;
  }

  public get scriptPath(): string {
    return this.installedScriptPath;
  }

  public async isInstalled(): Promise<boolean> {
    const existing = await readConfiguration(this.hooksPath);
    if (!hasPetHooks(existing, hookCommand(this.scriptPath, this.target.provider), this.target.events)) return false;
    try {
      await fs.access(this.scriptPath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  public async installScript(): Promise<void> {
    const installedScriptPath = this.scriptPath;
    await fs.mkdir(path.dirname(installedScriptPath), { recursive: true });
    const temporaryScriptPath = `${installedScriptPath}.llm-pet-${process.pid}.tmp`;
    await fs.copyFile(this.bundledScriptPath, temporaryScriptPath);
    await fs.rename(temporaryScriptPath, installedScriptPath);
  }

  public async install(copyScript = true): Promise<HookInstallResult> {
    const hooksPath = this.hooksPath;
    const installedScriptPath = this.scriptPath;
    if (copyScript) await this.installScript();
    const command = hookCommand(installedScriptPath, this.target.provider);
    const existing = await readConfiguration(hooksPath);
    const migrated = this.legacyScriptPath
      ? removePetHooks(existing, hookCommand(this.legacyScriptPath))
      : existing;
    await atomicWriteJson(hooksPath, mergePetHooks(migrated, command, this.target.events, {
      entryStyle: this.target.entryStyle,
      setSchemaVersion: this.target.setSchemaVersion,
      async: this.target.provider === "claude"
    }));
    return { hooksPath, scriptPath: installedScriptPath, command };
  }

  public async uninstall(): Promise<HookInstallResult> {
    const hooksPath = this.hooksPath;
    const installedScriptPath = this.scriptPath;
    const command = hookCommand(installedScriptPath, this.target.provider);
    const existing = await readConfiguration(hooksPath);
    const withoutCurrent = removePetHooks(existing, command);
    const removed = this.legacyScriptPath
      ? removePetHooks(withoutCurrent, hookCommand(this.legacyScriptPath))
      : withoutCurrent;
    await atomicWriteJson(hooksPath, removed);
    return { hooksPath, scriptPath: installedScriptPath, command };
  }
}

async function readConfiguration(filePath: string): Promise<unknown> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Existing hook configuration must contain a JSON object.");
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    if (error instanceof SyntaxError) {
      throw new Error(`Existing hook configuration is not valid JSON: ${error.message}`);
    }
    throw error;
  }
}

async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.llm-pet-${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, filePath);
}
