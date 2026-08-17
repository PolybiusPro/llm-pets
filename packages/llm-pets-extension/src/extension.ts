import * as path from "node:path";
import * as vscode from "vscode";
import { HookEventReceiver } from "./cursor/HookEventReceiver.js";
import { getCursorHome, getEventDirectory, getHookScriptInstallPath } from "./cursor/cursorHome.js";
import { HookInstaller } from "./cursor/HookInstaller.js";
import {
  hookProviderLabel,
  hookProvidersToUninstall,
  isCursorHost,
  nextHookProvider,
  resolveHookProviderForHost,
  resolveHookProviderTarget,
  type HookProvider
} from "./cursor/hookProvider.js";
import { getStrings } from "./localization.js";
import { getCodexHome, getPetsDirectories } from "./pet/codexHome.js";
import {
  LEGACY_PET_CONFIGURATION_SECTION,
  PET_CONFIGURATION_KEYS,
  PET_CONFIGURATION_SECTION,
  settingsToMigrate,
  type ConfigurationTargetName
} from "./pet/configuration.js";
import { PetLoader } from "./pet/PetLoader.js";
import { PetRepository } from "./pet/PetRepository.js";
import type { PetState } from "./pet/types.js";
import { PetViewProvider } from "./webview/PetViewProvider.js";
import {
  isPetBackgroundSelection,
  type PetBackgroundSelection
} from "./webview/backgrounds.js";
import { normalizeBackgroundOpacity } from "./webview/customBackground.js";
import { normalizePetScale, type PetScale } from "./webview/petSizes.js";

const SELECTED_PET_KEY = "pet.selectedPet";
const HOOK_EVENT_OBSERVED_KEY = "pet.hookEventObserved";
const LEGACY_SELECTED_PET_KEY = "cursorPet.selectedPet";
const LEGACY_HOOK_EVENT_OBSERVED_KEY = "cursorPet.hookEventObserved";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  await migrateLegacyCursorPetSettings();
  await migrateLegacyGlobalState(context);
  const strings = getStrings(vscode.env.language);
  const codexHome = getCodexHome();
  const cursorHome = getCursorHome();
  const initialConfiguration = vscode.workspace.getConfiguration(PET_CONFIGURATION_SECTION);
  const configuredPetDirectory = initialConfiguration.get<string>("petDirectory", "").trim();
  const petsDirectories = configuredPetDirectory
    ? [path.resolve(configuredPetDirectory)]
    : getPetsDirectories();
  const petsDirectory = petsDirectories[0];
  const output = vscode.window.createOutputChannel(strings.appName);
  const log = (message: string): void => {
    output.appendLine(`[${new Date().toISOString()}] ${message}`);
  };
  log(`CODEX_HOME: ${codexHome}`);
  log(`CURSOR_HOME: ${cursorHome}`);
  log(`Host: ${vscode.env.appName} (${vscode.env.uriScheme})`);
  log(`Hook provider: ${readHookProvider()}`);
  log(`Pets directory: ${petsDirectories.join(", ")}`);

  const savedPetId = context.globalState.get<string>(SELECTED_PET_KEY);
  const repository = new PetRepository(new PetLoader(petsDirectories), savedPetId);
  const bundledHookScript = context.asAbsolutePath(path.join("scripts", "hook.cjs"));
  const createHookInstaller = (provider = readHookProvider()): HookInstaller =>
    new HookInstaller(
      resolveHookProviderTarget(provider),
      bundledHookScript,
      getHookScriptInstallPath()
    );
  let hookInstaller = createHookInstaller();
  let hookEventObserved = context.globalState.get<boolean>(HOOK_EVENT_OBSERVED_KEY, false);
  let provider: PetViewProvider;
  const providerLabel = (): string => hookProviderLabel(readHookProvider());
  const uninstallOtherHookProviders = async (keep: HookProvider): Promise<void> => {
    for (const provider of hookProvidersToUninstall(keep, runningInCursor())) {
      const installer = createHookInstaller(provider);
      if (await installer.isInstalled()) {
        const result = await installer.uninstall();
        log(`Removed LLM Pets hooks from ${result.hooksPath}`);
      }
    }
  };
  const showHooksHelp = async (): Promise<void> => {
    const choice = await vscode.window.showInformationMessage(
      strings.hooks.helpMessage(hookInstaller.hooksPath, providerLabel()),
      strings.hooks.openConfiguration
    );
    if (choice === strings.hooks.openConfiguration) {
      await vscode.window.showTextDocument(vscode.Uri.file(hookInstaller.hooksPath));
    }
  };
  const cycleHookProvider = async (): Promise<void> => {
    const next = nextHookProvider(readHookProvider(), runningInCursor());
    await vscode.workspace.getConfiguration(PET_CONFIGURATION_SECTION).update(
      "hookProvider",
      next,
      vscode.ConfigurationTarget.Global
    );
  };
  const setupHooks = async (): Promise<void> => {
    hookInstaller = createHookInstaller();
    const choice = await vscode.window.showWarningMessage(
      strings.hooks.confirmTitle(providerLabel()),
      { modal: true, detail: strings.hooks.confirmMessage(hookInstaller.hooksPath, hookInstaller.scriptPath, providerLabel()) },
      strings.hooks.enable
    );
    if (choice !== strings.hooks.enable) return;
    try {
      await uninstallOtherHookProviders(readHookProvider());
      hookInstaller = createHookInstaller();
      const result = await hookInstaller.install();
      hookEventObserved = false;
      await context.globalState.update(HOOK_EVENT_OBSERVED_KEY, false);
      log(`Installed LLM Pets hooks in ${result.hooksPath}`);
      await vscode.workspace.getConfiguration(PET_CONFIGURATION_SECTION).update(
        "integrationMode",
        "hooks",
        vscode.ConfigurationTarget.Global
      );
      await provider.setHookIntegrationState("awaitingTrust");
      const next = await vscode.window.showInformationMessage(
        strings.hooks.installedMessage(providerLabel()),
        strings.hooks.openConfiguration
      );
      if (next === strings.hooks.openConfiguration) {
        await vscode.window.showTextDocument(vscode.Uri.file(result.hooksPath));
      }
    } catch (error) {
      log(`Could not install LLM Pets hooks: ${String(error)}`);
      void vscode.window.showErrorMessage(
        strings.notifications.hooksInstallFailed(
          strings.translateError(error instanceof Error ? error.message : String(error))
        )
      );
    }
  };
  provider = new PetViewProvider(
    context.extensionUri,
    petsDirectory,
    repository,
    log,
    strings,
    { setupHooks, showHooksHelp, cycleHookProvider },
    petsDirectories
  );
  provider.setDisplayOptions(readDisplayOptions());
  void provider.setHookProviderState(readHookProvider(), providerLabel());
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 20);
  status.name = strings.appName;
  status.text = `$(loading~spin) ${strings.appName}`;
  status.tooltip = strings.statusLoading;
  status.command = "pet.focusPet";
  status.show();
  let hookEventReceiver: HookEventReceiver | undefined;
  const refreshHookIntegrationStatus = async (): Promise<void> => {
    try {
      const installed = await hookInstaller.isInstalled();
      const hooksMode = vscode.workspace.getConfiguration(PET_CONFIGURATION_SECTION).get<string>(
        "integrationMode",
        "manual"
      ) === "hooks";
      await provider.setHookIntegrationState(
        installed && hooksMode
          ? hookEventObserved ? "active" : "awaitingTrust"
          : "notConfigured"
      );
    } catch (error) {
      log(`Could not inspect LLM Pets hooks: ${String(error)}`);
      await provider.setHookIntegrationState("notConfigured");
    }
  };
  void refreshHookIntegrationStatus();

  const startHookReceiver = async (): Promise<void> => {
    if (hookEventReceiver) return;
    const workspaceRoots = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [];
    if (workspaceRoots.length === 0) {
      log("Hooks integration is waiting for a workspace folder.");
      return;
    }
    hookEventReceiver = new HookEventReceiver({
      eventDirectory: getEventDirectory(),
      workspaceRoots,
      log,
      onPetState: (state) => void provider.setState(state),
      onEventReceived: () => {
        if (hookEventObserved) return;
        hookEventObserved = true;
        void context.globalState.update(HOOK_EVENT_OBSERVED_KEY, true);
        void provider.setHookIntegrationState("active");
      }
    });
    try {
      await hookEventReceiver.start();
    } catch (error) {
      hookEventReceiver.dispose();
      hookEventReceiver = undefined;
      log(`Could not start Hooks receiver: ${String(error)}`);
      void vscode.window.showWarningMessage(
        strings.notifications.hooksReceiverFailed
      );
    }
  };
  const stopHookReceiver = (): void => {
    hookEventReceiver?.dispose();
    hookEventReceiver = undefined;
  };
  const reconcileIntegration = (): void => {
    const mode = vscode.workspace.getConfiguration(PET_CONFIGURATION_SECTION).get<string>("integrationMode", "manual");
    if (mode === "hooks") {
      void startHookReceiver();
    } else {
      stopHookReceiver();
    }
  };

  const watchers = petsDirectories.map((directory) =>
    vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(directory), "**/*"))
  );
  let refreshTimer: NodeJS.Timeout | undefined;
  const scheduleRefresh = (event: string, uri: vscode.Uri): void => {
    const relative = petsDirectories
      .map((directory) => path.relative(directory, uri.fsPath))
      .find((candidate) => candidate && !candidate.startsWith(".."));
    log(`File ${event}: ${relative ?? path.basename(uri.fsPath)}`);
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      void provider.refresh();
    }, 250);
  };

  const stateCommands: ReadonlyArray<readonly [string, PetState]> = [
    ["pet.setIdle", "idle"],
    ["pet.setRunning", "running"],
    ["pet.setWaiting", "waiting"],
    ["pet.setReview", "review"],
    ["pet.setFailed", "failed"]
  ];

  context.subscriptions.push(
    output,
    ...watchers,
    vscode.window.registerWebviewViewProvider(PetViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true }
    }),
    vscode.commands.registerCommand("pet.selectPet", () => provider.selectPet()),
    vscode.commands.registerCommand("pet.selectBackground", () => provider.selectBackground()),
    vscode.commands.registerCommand("pet.selectCustomBackground", () =>
      provider.selectCustomBackgroundImage()
    ),
    vscode.commands.registerCommand("pet.selectBackgroundOpacity", () =>
      provider.selectCustomBackgroundOpacity()
    ),
    vscode.commands.registerCommand("pet.selectAnimationSpeed", () => provider.selectAnimationSpeed()),
    vscode.commands.registerCommand("pet.selectSize", () => provider.selectSize()),
    vscode.commands.registerCommand("pet.refreshPets", () => provider.refresh()),
    vscode.commands.registerCommand("pet.openPetsDirectory", async () => {
      const uri = vscode.Uri.file(petsDirectory);
      await vscode.workspace.fs.createDirectory(uri);
      log("Opened the Pets directory.");
      await vscode.commands.executeCommand("revealFileInOS", uri);
    }),
    vscode.commands.registerCommand("pet.previewPet", () => provider.openPreview()),
    vscode.commands.registerCommand("pet.installHooks", async () => {
      await setupHooks();
    }),
    vscode.commands.registerCommand("pet.uninstallHooks", async () => {
      try {
        hookInstaller = createHookInstaller();
        const result = await hookInstaller.uninstall();
        log(`Removed LLM Pets hooks from ${result.hooksPath}`);
        stopHookReceiver();
        hookEventObserved = false;
        await context.globalState.update(HOOK_EVENT_OBSERVED_KEY, false);
        const configuration = vscode.workspace.getConfiguration(PET_CONFIGURATION_SECTION);
        if (configuration.get<string>("integrationMode") === "hooks") {
          await configuration.update("integrationMode", "manual", vscode.ConfigurationTarget.Global);
        }
        await provider.setHookIntegrationState("notConfigured");
        void vscode.window.showInformationMessage(strings.notifications.hooksRemoved);
      } catch (error) {
        log(`Could not remove LLM Pets hooks: ${String(error)}`);
        void vscode.window.showErrorMessage(
          strings.notifications.hooksRemoveFailed(
            strings.translateError(error instanceof Error ? error.message : String(error))
          )
        );
      }
    }),
    vscode.commands.registerCommand("pet.openHooksConfiguration", async () => {
      hookInstaller = createHookInstaller();
      await vscode.window.showTextDocument(vscode.Uri.file(hookInstaller.hooksPath));
    }),
    vscode.commands.registerCommand("pet.focusPet", () =>
      vscode.commands.executeCommand(`${PetViewProvider.viewType}.focus`)
    ),
    ...stateCommands.map(([command, state]) =>
      vscode.commands.registerCommand(command, () => provider.setState(state))
    ),
    provider.onDidSelectPet((petId) => {
      void context.globalState.update(SELECTED_PET_KEY, petId);
    }),
    provider.onDidChangePet((pet) => {
      if (!pet) {
        status.text = `$(warning) ${strings.appName}`;
        status.tooltip = strings.statusNoPet;
        return;
      }
      const icon = statusIcon(pet.state);
      const stateLabel = strings.stateLabels[pet.state];
      status.text = `${icon} ${pet.petName}: ${stateLabel}`;
      status.tooltip = strings.statusShowPet(pet.petName, stateLabel);
    }),
    ...watchers.flatMap((watcher) => [
      watcher.onDidCreate((uri) => watchEnabled() && scheduleRefresh("created", uri)),
      watcher.onDidChange((uri) => watchEnabled() && scheduleRefresh("changed", uri)),
      watcher.onDidDelete((uri) => watchEnabled() && scheduleRefresh("deleted", uri))
    ]),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration(PET_CONFIGURATION_SECTION)) {
        return;
      }
      provider.setDisplayOptions(readDisplayOptions());
      if (event.affectsConfiguration(`${PET_CONFIGURATION_SECTION}.petDirectory`)) {
        void vscode.window.showInformationMessage(
          strings.notifications.reloadRequired,
          strings.notifications.reload
        ).then((choice) => {
          if (choice === strings.notifications.reload) {
            void vscode.commands.executeCommand("workbench.action.reloadWindow");
          }
        });
      }
      if (event.affectsConfiguration(`${PET_CONFIGURATION_SECTION}.integrationMode`)) {
        reconcileIntegration();
        void refreshHookIntegrationStatus();
      }
      if (event.affectsConfiguration(`${PET_CONFIGURATION_SECTION}.hookProvider`)) {
        hookInstaller = createHookInstaller();
        log(`Hook provider: ${readHookProvider()}`);
        void refreshHookIntegrationStatus();
        void provider.setHookProviderState(readHookProvider(), providerLabel());
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      if (vscode.workspace.getConfiguration(PET_CONFIGURATION_SECTION).get<string>("integrationMode") === "hooks") {
        stopHookReceiver();
        void startHookReceiver();
      }
    }),
    {
      dispose: () => {
        if (refreshTimer) {
          clearTimeout(refreshTimer);
        }
        hookEventReceiver?.dispose();
      }
    },
    status
  );
  reconcileIntegration();
}

function configurationTarget(name: ConfigurationTargetName): vscode.ConfigurationTarget {
  switch (name) {
    case "workspace":
      return vscode.ConfigurationTarget.Workspace;
    case "workspaceFolder":
      return vscode.ConfigurationTarget.WorkspaceFolder;
    default:
      return vscode.ConfigurationTarget.Global;
  }
}

async function migrateLegacyGlobalState(context: vscode.ExtensionContext): Promise<void> {
  if (context.globalState.get(SELECTED_PET_KEY) === undefined) {
    const legacy = context.globalState.get<string>(LEGACY_SELECTED_PET_KEY);
    if (legacy !== undefined) {
      await context.globalState.update(SELECTED_PET_KEY, legacy);
      await context.globalState.update(LEGACY_SELECTED_PET_KEY, undefined);
    }
  }
  if (context.globalState.get(HOOK_EVENT_OBSERVED_KEY) === undefined) {
    const legacy = context.globalState.get<boolean>(LEGACY_HOOK_EVENT_OBSERVED_KEY);
    if (legacy !== undefined) {
      await context.globalState.update(HOOK_EVENT_OBSERVED_KEY, legacy);
      await context.globalState.update(LEGACY_HOOK_EVENT_OBSERVED_KEY, undefined);
    }
  }
}

async function migrateLegacyCursorPetSettings(): Promise<void> {
  const legacy = vscode.workspace.getConfiguration(LEGACY_PET_CONFIGURATION_SECTION);
  const next = vscode.workspace.getConfiguration(PET_CONFIGURATION_SECTION);
  for (const key of PET_CONFIGURATION_KEYS) {
    const copies = settingsToMigrate(legacy.inspect(key), next.inspect(key));
    for (const copy of copies) {
      const target = configurationTarget(copy.target);
      await next.update(key, copy.value, target);
      await legacy.update(key, undefined, target);
    }
  }
}

function readDisplayOptions(): {
  enabled: boolean;
  scale: PetScale;
  animationSpeed: number;
  pauseWhenHidden: boolean;
  background: PetBackgroundSelection;
  customBackgroundPath: string;
  customBackgroundOpacity: number;
} {
  const configuration = vscode.workspace.getConfiguration(PET_CONFIGURATION_SECTION);
  const configuredBackground = configuration.get<string>("background", "grassland");
  return {
    enabled: configuration.get<boolean>("enabled", true),
    scale: normalizePetScale(configuration.get<unknown>("scale", 1)),
    animationSpeed: configuration.get<number>("animationSpeed", 1),
    pauseWhenHidden: configuration.get<boolean>("pauseWhenHidden", true),
    background: isPetBackgroundSelection(configuredBackground) ? configuredBackground : "grassland",
    customBackgroundPath: configuration
      .get<string>("customBackground.imagePath", "")
      .trim(),
    customBackgroundOpacity: normalizeBackgroundOpacity(
      configuration.get<unknown>("customBackground.opacity", 1)
    )
  };
}

function runningInCursor(): boolean {
  return isCursorHost(vscode.env.appName, vscode.env.uriScheme);
}

function readHookProvider(): HookProvider {
  const configured = vscode.workspace.getConfiguration(PET_CONFIGURATION_SECTION).get<string>("hookProvider", "cursor");
  return resolveHookProviderForHost(configured, runningInCursor());
}

function watchEnabled(): boolean {
  return vscode.workspace.getConfiguration(PET_CONFIGURATION_SECTION).get<boolean>("watchPetDirectory", true);
}

function statusIcon(state: PetState): string {
  switch (state) {
    case "running":
      return "$(loading~spin)";
    case "waiting":
      return "$(question)";
    case "review":
      return "$(eye)";
    case "failed":
      return "$(error)";
    default:
      return "$(circle-filled)";
  }
}

export function deactivate(): void {}
