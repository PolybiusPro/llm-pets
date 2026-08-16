import * as vscode from "vscode";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { HOOK_PROVIDERS, type HookProvider } from "../cursor/hookProvider.js";
import type { UiStrings } from "../localization.js";
import { PetRepository } from "../pet/PetRepository.js";
import { PET_CONFIGURATION_SECTION } from "../pet/configuration.js";
import { PetStateMachine } from "../pet/PetStateMachine.js";
import type { PetState } from "../pet/types.js";
import type {
  ExtensionToWebviewMessage,
  HookIntegrationState,
  PetViewModel
} from "./messages.js";
import { isWebviewMessage } from "./messages.js";
import { getWebviewHtml } from "./getWebviewHtml.js";
import {
  petBackgroundsForDisplay,
  type PetBackgroundSelection
} from "./backgrounds.js";
import { animationSpeedsForDisplay } from "./animationSpeeds.js";
import { petScaleOptions, type PetScale } from "./petSizes.js";
import {
  backgroundOpacityOptions,
  validateCustomBackground
} from "./customBackground.js";

export interface PetViewProviderActions {
  setupHooks(): Promise<void>;
  showHooksHelp(): Promise<void>;
  cycleHookProvider(): Promise<void>;
}

interface DisplayOptions {
  enabled: boolean;
  scale: PetScale;
  animationSpeed: number;
  pauseWhenHidden: boolean;
  background: PetBackgroundSelection;
  customBackgroundPath: string;
  customBackgroundOpacity: number;
}

export class PetViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "pet.panelView";
  private view: vscode.WebviewView | undefined;
  private previewPanel: vscode.WebviewPanel | undefined;
  private displayOptions: DisplayOptions = {
    enabled: true,
    scale: 1,
    animationSpeed: 1,
    pauseWhenHidden: true,
    background: "grassland",
    customBackgroundPath: "",
    customBackgroundOpacity: 1
  };
  private validatedCustomBackgroundPath: string | undefined;
  private reportedCustomBackgroundError: string | undefined;
  private readonly stateMachine = new PetStateMachine();
  private hookIntegrationState: HookIntegrationState = "notConfigured";
  private hookProviderState: { provider: HookProvider; label: string } = {
    provider: "cursor",
    label: "Cursor"
  };
  private readonly petChangeEmitter = new vscode.EventEmitter<
    { petName: string; state: PetState } | undefined
  >();
  public readonly onDidChangePet = this.petChangeEmitter.event;
  private readonly selectionEmitter = new vscode.EventEmitter<string>();
  public readonly onDidSelectPet = this.selectionEmitter.event;

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly petsDirectory: string,
    private readonly repository: PetRepository,
    private readonly log: (message: string) => void,
    private readonly strings: UiStrings,
    private readonly actions: PetViewProviderActions,
    private readonly petsDirectories: readonly string[] = []
  ) {}

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    this.configureWebview(webviewView.webview);
  }

  public setDisplayOptions(options: DisplayOptions): void {
    this.displayOptions = options;
    void this.refreshCustomBackground();
  }

  public async openPreview(): Promise<void> {
    if (this.previewPanel) {
      this.previewPanel.reveal(vscode.ViewColumn.Beside);
      await this.render();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "pet.preview",
      this.strings.previewTitle,
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: this.petResourceRoots() }
    );
    this.previewPanel = panel;
    this.configureWebview(panel.webview);
    panel.onDidDispose(() => {
      if (this.previewPanel === panel) {
        this.previewPanel = undefined;
      }
    });
  }

  private petResourceRoots(): vscode.Uri[] {
    const directories = this.petsDirectories.length > 0 ? this.petsDirectories : [this.petsDirectory];
    return [this.extensionUri, ...directories.map((directory) => vscode.Uri.file(directory))];
  }

  private configureWebview(webview: vscode.Webview): void {
    this.refreshWebviewDocument(webview);
    webview.onDidReceiveMessage((message: unknown) => this.handleMessage(message));
  }

  private refreshWebviewDocument(webview: vscode.Webview): void {
    const localResourceRoots = this.petResourceRoots();
    if (this.validatedCustomBackgroundPath) {
      localResourceRoots.push(vscode.Uri.file(path.dirname(this.validatedCustomBackgroundPath)));
    }
    webview.options = {
      enableScripts: true,
      localResourceRoots
    };
    const providerIconUris = Object.fromEntries(
      HOOK_PROVIDERS.map((provider) => [
        provider,
        webview
          .asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "provider-icons", `${provider}-32.png`))
          .toString()
      ])
    ) as Record<HookProvider, string>;
    webview.html = getWebviewHtml(webview, this.strings, providerIconUris);
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!isWebviewMessage(message)) {
      return;
    }
    if (message.type === "ready") {
      await this.refresh();
      await this.post({ type: "setHookIntegration", state: this.hookIntegrationState });
      await this.post({
        type: "setHookProvider",
        provider: this.hookProviderState.provider,
        label: this.hookProviderState.label
      });
    } else if (message.type === "setupHooks") {
      await this.actions.setupHooks();
    } else if (message.type === "showHooksHelp") {
      await this.actions.showHooksHelp();
    } else if (message.type === "cycleHookProvider") {
      await this.actions.cycleHookProvider();
    } else if (message.type === "customBackgroundLoadFailed") {
      void vscode.window.showWarningMessage(this.strings.customBackground.loadFailed);
    } else if (
      message.type === "animationComplete" &&
      message.state === this.stateMachine.state
    ) {
      const animation = this.repository.selectedPet?.animations[message.state];
      if (animation && this.stateMachine.completeAnimation(animation)) {
        this.log("Non-looping animation completed; state returned to idle.");
        await this.render();
      }
    }
  }

  private async refreshCustomBackground(): Promise<void> {
    const previous = this.validatedCustomBackgroundPath;
    this.validatedCustomBackgroundPath = undefined;
    if (this.displayOptions.background === "custom" && this.displayOptions.customBackgroundPath) {
      try {
        const result = await validateCustomBackground(this.displayOptions.customBackgroundPath);
        this.validatedCustomBackgroundPath = result.path;
        this.reportedCustomBackgroundError = undefined;
      } catch (error) {
        const message = this.strings.customBackground.invalid(
          this.strings.translateError(error instanceof Error ? error.message : String(error))
        );
        this.log(message);
        if (this.reportedCustomBackgroundError !== message) {
          this.reportedCustomBackgroundError = message;
          void vscode.window.showWarningMessage(message);
        }
      }
    }
    if (previous !== this.validatedCustomBackgroundPath) {
      for (const webview of this.webviews()) this.refreshWebviewDocument(webview);
      return;
    }
    await this.render();
  }

  public async setHookIntegrationState(state: HookIntegrationState): Promise<void> {
    this.hookIntegrationState = state;
    await this.post({ type: "setHookIntegration", state });
  }

  public async setHookProviderState(provider: HookProvider, label: string): Promise<void> {
    this.hookProviderState = { provider, label };
    await this.post({ type: "setHookProvider", provider, label });
  }

  public async refresh(): Promise<void> {
    try {
      const result = await this.repository.refresh();
      this.log(`Found ${result.pets.length} Pet(s).`);
      for (const issue of result.issues) {
        this.log(`Skipped ${issue.directoryName}: ${issue.message}`);
      }
      if (result.pets.length === 0 && result.issues.length > 0) {
        await this.post({
          type: "showError",
          message: `${this.strings.webview.loadFailed} ${result.issues[0]?.directoryName}: ${this.strings.translateError(result.issues[0]?.message ?? "")}`
        });
        this.petChangeEmitter.fire(undefined);
        return;
      }
      await this.render();
    } catch (error) {
      await this.post({
        type: "showError",
        message: this.strings.translateError(error instanceof Error ? error.message : String(error))
      });
    }
  }

  public async selectPet(): Promise<void> {
    const result = this.repository.loadResult ?? (await this.repository.refresh());
    if (result.pets.length === 0) {
      await this.render();
      void vscode.window.showInformationMessage(this.strings.notifications.noPets);
      return;
    }

    const selected = await vscode.window.showQuickPick(
      result.pets.map((pet) => ({ label: pet.name, description: pet.description, petId: pet.id })),
      {
        title: this.strings.quickPick.petTitle,
        placeHolder: this.strings.quickPick.petPlaceholder
      }
    );
    if (selected && this.repository.select(selected.petId)) {
      this.log(`Selected Pet: ${selected.label}`);
      this.selectionEmitter.fire(selected.petId);
      await this.render();
    }
  }

  public async selectBackground(): Promise<void> {
    const selected = await vscode.window.showQuickPick(
      petBackgroundsForDisplay(this.strings).map((background) => ({
        label: background.label,
        description: background.description,
        backgroundId: background.id,
        picked: background.id === this.displayOptions.background
      })),
      {
        title: this.strings.quickPick.backgroundTitle,
        placeHolder: this.strings.quickPick.backgroundPlaceholder
      }
    );
    if (!selected || selected.backgroundId === this.displayOptions.background) {
      return;
    }
    if (selected.backgroundId === "custom" && !this.validatedCustomBackgroundPath) {
      if (this.displayOptions.customBackgroundPath) {
        try {
          await validateCustomBackground(this.displayOptions.customBackgroundPath);
        } catch {
          await this.selectCustomBackgroundImage();
          return;
        }
      } else {
        await this.selectCustomBackgroundImage();
        return;
      }
    }
    await vscode.workspace.getConfiguration(PET_CONFIGURATION_SECTION).update(
      "background",
      selected.backgroundId,
      vscode.ConfigurationTarget.Global
    );
    this.log(`Selected background: ${selected.label}`);
  }

  public async selectCustomBackgroundImage(): Promise<void> {
    const selected = await vscode.window.showOpenDialog({
      title: this.strings.customBackground.selectImageTitle,
      openLabel: this.strings.customBackground.selectImageOpenLabel,
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        "PNG, WebP, GIF": ["png", "webp", "gif"]
      }
    });
    const uri = selected?.[0];
    if (!uri) return;
    try {
      const result = await validateCustomBackground(uri.fsPath);
      const configuration = vscode.workspace.getConfiguration(PET_CONFIGURATION_SECTION);
      await configuration.update(
        "customBackground.imagePath",
        result.path,
        vscode.ConfigurationTarget.Global
      );
      await configuration.update("background", "custom", vscode.ConfigurationTarget.Global);
      this.log(`Selected custom background: ${result.path}`);
    } catch (error) {
      const message = this.strings.customBackground.invalid(
        this.strings.translateError(error instanceof Error ? error.message : String(error))
      );
      void vscode.window.showErrorMessage(message);
    }
  }

  public async selectCustomBackgroundOpacity(): Promise<void> {
    const selected = await vscode.window.showQuickPick(
      backgroundOpacityOptions(this.strings).map((opacity) => ({
        label: opacity.label,
        description: opacity.description,
        opacity: opacity.value,
        picked: opacity.value === this.displayOptions.customBackgroundOpacity
      })),
      {
        title: this.strings.customBackground.opacityTitle,
        placeHolder: this.strings.customBackground.opacityPlaceholder
      }
    );
    if (!selected || selected.opacity === this.displayOptions.customBackgroundOpacity) return;
    await vscode.workspace.getConfiguration(PET_CONFIGURATION_SECTION).update(
      "customBackground.opacity",
      selected.opacity,
      vscode.ConfigurationTarget.Global
    );
  }

  public async selectAnimationSpeed(): Promise<void> {
    const selected = await vscode.window.showQuickPick(
      animationSpeedsForDisplay(this.strings).map((speed) => ({
        label: speed.label,
        description: speed.description,
        speed: speed.value,
        picked: speed.value === this.displayOptions.animationSpeed
      })),
      {
        title: this.strings.quickPick.speedTitle,
        placeHolder: this.strings.quickPick.speedPlaceholder
      }
    );
    if (!selected || selected.speed === this.displayOptions.animationSpeed) {
      return;
    }
    await vscode.workspace.getConfiguration(PET_CONFIGURATION_SECTION).update(
      "animationSpeed",
      selected.speed,
      vscode.ConfigurationTarget.Global
    );
    this.log(`Selected animation speed: ${selected.label}`);
  }

  public async selectSize(): Promise<void> {
    const selected = await vscode.window.showQuickPick(
      petScaleOptions(this.strings).map((size) => ({
        label: size.label,
        description: size.description,
        scale: size.value,
        picked: size.value === this.displayOptions.scale
      })),
      {
        title: this.strings.quickPick.sizeTitle,
        placeHolder: this.strings.quickPick.sizePlaceholder
      }
    );
    if (!selected || selected.scale === this.displayOptions.scale) {
      return;
    }
    await vscode.workspace.getConfiguration(PET_CONFIGURATION_SECTION).update(
      "scale",
      selected.scale,
      vscode.ConfigurationTarget.Global
    );
    this.log(`Selected Pet size: ${selected.label}`);
  }

  public async setState(state: PetState): Promise<void> {
    if (!this.repository.loadResult) {
      await this.repository.refresh();
    }
    const selected = this.repository.selectedPet;
    if (!selected) {
      void vscode.window.showInformationMessage(this.strings.notifications.noPet);
      return;
    }
    if (!selected.animations[state]) {
      void vscode.window.showWarningMessage(
        this.strings.notifications.missingAnimation(selected.name, this.strings.stateLabels[state])
      );
      return;
    }
    this.stateMachine.setState(state);
    this.log(`State changed to ${state}.`);
    await this.render();
  }

  private async render(): Promise<void> {
    if (!this.displayOptions.enabled) {
      this.petChangeEmitter.fire(undefined);
      await this.post({ type: "showDisabled" });
      return;
    }
    const result = this.repository.loadResult;
    const selected = this.repository.selectedPet;
    if (!result || !selected) {
      this.petChangeEmitter.fire(undefined);
      await this.post({
        type: "showEmpty",
        petsDirectory: result?.petsDirectory ?? this.petsDirectory,
        directoryExists: result?.directoryExists ?? false
      });
      return;
    }

    const state = this.stateMachine.state;
    const animation = selected.animations[state] ?? selected.animations.idle;
    if (!animation) {
      await this.post({
        type: "showError",
        message: this.strings.notifications.missingAnimation(
          selected.name,
          this.strings.stateLabels[state]
        )
      });
      return;
    }
    const modifiedAt = await fs.stat(selected.spriteSheetPath).then((stat) => stat.mtimeMs).catch(() => Date.now());
    this.petChangeEmitter.fire({ petName: selected.name, state });
    const fileUri = vscode.Uri.file(selected.spriteSheetPath).with({ query: `v=${modifiedAt}` });
    const customBackgroundModifiedAt = this.validatedCustomBackgroundPath
      ? await fs.stat(this.validatedCustomBackgroundPath).then((stat) => stat.mtimeMs).catch(() => Date.now())
      : undefined;
    await Promise.all(this.webviews().map(async (webview) => {
      const customBackgroundUri = this.validatedCustomBackgroundPath && customBackgroundModifiedAt
        ? webview.asWebviewUri(
            vscode.Uri.file(this.validatedCustomBackgroundPath).with({
              query: `v=${customBackgroundModifiedAt}`
            })
          ).toString()
        : undefined;
      const pet: PetViewModel = {
        id: selected.id,
        name: selected.name,
        animationAriaLabel: this.strings.webview.animationAria(
          selected.name,
          this.strings.stateLabels[state]
        ),
        wavingAriaLabel: this.strings.webview.wavingAria(selected.name),
        description: selected.description,
        spriteUri: webview.asWebviewUri(fileUri).toString(),
        columns: selected.columns,
        rows: selected.rows,
        frameWidth: selected.frameWidth,
        frameHeight: selected.frameHeight,
        state,
        animation,
        wavingAnimation: selected.animations.waving,
        lookDirections: selected.lookDirections,
        scale: this.displayOptions.scale,
        animationSpeed: this.displayOptions.animationSpeed,
        pauseWhenHidden: this.displayOptions.pauseWhenHidden,
        backgroundId:
          this.displayOptions.background === "none" || this.displayOptions.background === "custom"
            ? undefined
            : this.displayOptions.background,
        customBackgroundUri:
          this.displayOptions.background === "custom" ? customBackgroundUri : undefined,
        customBackgroundOpacity: this.displayOptions.customBackgroundOpacity
      };
      await webview.postMessage({ type: "showPet", pet } satisfies ExtensionToWebviewMessage);
    }));
  }

  private async post(message: ExtensionToWebviewMessage): Promise<void> {
    await Promise.all(this.webviews().map((webview) => webview.postMessage(message)));
  }

  private webviews(): vscode.Webview[] {
    return [this.view?.webview, this.previewPanel?.webview].filter(
      (webview): webview is vscode.Webview => webview !== undefined
    );
  }
}
