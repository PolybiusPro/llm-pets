import * as os from "node:os";
import {
  availableHookProvidersForHost,
  resolveHookProviderTarget,
  type HookProvider
} from "./hookProvider.js";
import { HookInstaller, type HookInstallResult } from "./HookInstaller.js";

export type HookReconcileResult = {
  provider: HookProvider;
  result?: HookInstallResult;
  error?: unknown;
};

export class HookReconciler {
  public constructor(
    private readonly cursorHost: boolean,
    private readonly bundledScriptPath: string,
    private readonly installedScriptPath: string,
    private readonly legacyScriptPath: string,
    private readonly environment: NodeJS.ProcessEnv = process.env,
    private readonly homeDirectory = os.homedir(),
    private readonly exists?: (path: string) => boolean
  ) {}

  public availableProviders(): HookProvider[] {
    return availableHookProvidersForHost(
      this.cursorHost,
      this.environment,
      this.homeDirectory,
      this.exists
    );
  }

  public installer(provider: HookProvider): HookInstaller {
    return new HookInstaller(
      resolveHookProviderTarget(provider, this.environment, this.homeDirectory),
      this.bundledScriptPath,
      this.installedScriptPath,
      this.legacyScriptPath
    );
  }

  public async installAvailable(): Promise<HookReconcileResult[]> {
    const providers = this.availableProviders();
    if (providers.length === 0) return [];
    try {
      await this.installer(providers[0]).installScript();
    } catch (error) {
      return providers.map((provider) => ({ provider, error }));
    }
    return this.run((installer) => installer.install(false), providers);
  }

  public async uninstallAvailable(): Promise<HookReconcileResult[]> {
    return this.run((installer) => installer.uninstall());
  }

  public async isInstalled(provider: HookProvider): Promise<boolean> {
    if (!this.availableProviders().includes(provider)) return false;
    return this.installer(provider).isInstalled();
  }

  private async run(
    operation: (installer: HookInstaller) => Promise<HookInstallResult>,
    providers = this.availableProviders()
  ): Promise<HookReconcileResult[]> {
    const results: HookReconcileResult[] = [];
    for (const provider of providers) {
      try {
        results.push({ provider, result: await operation(this.installer(provider)) });
      } catch (error) {
        results.push({ provider, error });
      }
    }
    return results;
  }
}
