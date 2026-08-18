import type { PetState } from "./pet/types.js";

export type AppLocale = "en";

export interface UiStrings {
  locale: AppLocale;
  languageTag: string;
  appName: string;
  translateError(message: string): string;
  previewTitle: string;
  statusLoading: string;
  statusNoPet: string;
  statusShowPet(petName: string, state: string): string;
  stateLabels: Record<PetState, string>;
  quickPick: {
    petTitle: string;
    petPlaceholder: string;
    backgroundTitle: string;
    backgroundPlaceholder: string;
    speedTitle: string;
    speedPlaceholder: string;
    sizeTitle: string;
    sizePlaceholder: string;
  };
  size: {
    autoLabel: string;
    autoDescription: string;
    fixedDescription(value: number): string;
  };
  customBackground: {
    selectImageTitle: string;
    selectImageOpenLabel: string;
    opacityTitle: string;
    opacityPlaceholder: string;
    opacityDescription(value: number): string;
    invalid(error: string): string;
    loadFailed: string;
  };
  notifications: {
    noPets: string;
    noPet: string;
    missingAnimation(petName: string, state: string): string;
    hooksReceiverFailed: string;
    hooksRemoved: string;
    hooksInstallFailed(error: string): string;
    hooksRemoveFailed(error: string): string;
    reloadRequired: string;
    reload: string;
  };
  hooks: {
    enable: string;
    cancel: string;
    openConfiguration: string;
    confirmTitle(providerLabel: string): string;
    confirmMessage(hooksPath: string, scriptPath: string, providerLabel: string): string;
    installedMessage(providerLabel: string): string;
    helpMessage(hooksPath: string, providerLabel: string): string;
    notConfiguredTitle: string;
    notConfiguredBody: string;
    awaitingTrustTitle: string;
    awaitingTrustBody: string;
    activeTitle: string;
    activeBody: string;
    showHelp: string;
  };
  webview: {
    expected: string;
    loadFailed: string;
    statusPrefix: string;
    animationAria(petName: string, state: string): string;
    waveAction: string;
    wavingStatus: string;
    wavingAria(petName: string): string;
    canvasUnavailable: string;
    spriteLoadFailed: string;
    noPets: string;
    directoryMissing: string;
    disabled: string;
    enableSetting: string;
    hookProviderLabel: string;
    hookProviderHint: string;
  };
  backgroundDescriptions: Record<string, readonly [string, string]>;
  speedDescriptions: Record<string, string>;
}

const english: UiStrings = {
  locale: "en",
  languageTag: "en",
  appName: "LLM Pets",
  translateError: (message) => message,
  previewTitle: "LLM Pets Preview",
  statusLoading: "LLM Pets is loading",
  statusNoPet: "No Codex Pet is currently available",
  statusShowPet: (petName, state) => `Show ${petName} in the PET view (${state})`,
  stateLabels: {
    idle: "Idle",
    running: "Running",
    waiting: "Waiting",
    review: "Review",
    failed: "Failed"
  },
  quickPick: {
    petTitle: "Select a Codex Pet",
    petPlaceholder: "Choose the Pet shown in the panel",
    backgroundTitle: "Change Pet Background",
    backgroundPlaceholder: "Choose a background for the PET view",
    speedTitle: "Change Pet Animation Speed",
    speedPlaceholder: "Choose an animation speed",
    sizeTitle: "Change Pet Size",
    sizePlaceholder: "Choose automatic sizing or a fixed scale"
  },
  size: {
    autoLabel: "Auto",
    autoDescription: "Fit the Pet to the available display area",
    fixedDescription: (value) => `Display at ${Math.round(value * 100)}% unless the panel is smaller`
  },
  customBackground: {
    selectImageTitle: "Select a Custom Pet Background",
    selectImageOpenLabel: "Use as Pet Background",
    opacityTitle: "Change Custom Background Opacity",
    opacityPlaceholder: "Choose the custom image opacity",
    opacityDescription: (value) => `${Math.round(value * 100)}% opaque`,
    invalid: (error) => `The custom background could not be used: ${error}`,
    loadFailed: "The custom background image could not be loaded."
  },
  notifications: {
    noPets: "No Codex Pets were found.",
    noPet: "No Codex Pet is available.",
    missingAnimation: (petName, state) => `${petName} does not define a ${state} animation.`,
    hooksReceiverFailed: "LLM Pets could not start the Hooks receiver. See its output channel.",
    hooksRemoved: "LLM Pets Hooks removed.",
    hooksInstallFailed: (error) => `LLM Pets Hooks installation failed: ${error}`,
    hooksRemoveFailed: (error) => `LLM Pets Hooks removal failed: ${error}`,
    reloadRequired: "Reload the window to apply the new Codex Pet directory.",
    reload: "Reload"
  },
  hooks: {
    enable: "Enable integration",
    cancel: "Cancel",
    openConfiguration: "Open hook configuration",
    confirmTitle: () => "Enable Hooks integration?",
    confirmMessage: (hooksPath, scriptPath, providerLabel) =>
      `LLM Pets will reconcile hooks for every available provider, including ${providerLabel}:\n\n- ${hooksPath}\n- ${scriptPath}\n\nIt will preserve unrelated hooks, add lifecycle commands for this extension, install the receiver script, and switch the global integration mode to Hooks.\n\nThe hook script is fail-open: it writes an event file and exits 0. It never denies, blocks, or rewrites agent tool calls.`,
    installedMessage: (providerLabel) =>
      `Available providers were configured. Start a ${providerLabel} agent session so this view can receive its first selected event.`,
    helpMessage: (hooksPath, providerLabel) =>
      `LLM Pets automatically maintains hooks for every available provider allowed by this host. The selected ${providerLabel} listener reads events associated with ${hooksPath}; changing listeners does not edit provider configuration. The extension script is installed as ~/.local/share/llm-pets/extension-hook.cjs, and unrelated hooks are left untouched.`,
    notConfiguredTitle: "Agent activity is not connected",
    notConfiguredBody: "Enable Hooks integration to let this Pet react to agent activity.",
    awaitingTrustTitle: "Waiting for the first hook event",
    awaitingTrustBody: "Hooks are installed. This notice clears after the first agent event is received.",
    activeTitle: "Connected to Hooks",
    activeBody: "LLM Pets is receiving agent lifecycle events.",
    showHelp: "How hooks are installed"
  },
  webview: {
    expected: "Expected:",
    loadFailed: "Codex Pet could not be loaded.",
    statusPrefix: "Status:",
    animationAria: (petName, state) => `${petName}, ${state} animation`,
    waveAction: "Wave hello",
    wavingStatus: "Waving",
    wavingAria: (petName) => `${petName}, waving hello`,
    canvasUnavailable: "Canvas rendering is not available.",
    spriteLoadFailed: "The sprite image could not be loaded from the Pet directory.",
    noPets: "No Codex Pets were found.",
    directoryMissing: "Codex Pet directory was not found.",
    disabled: "Codex Pet is disabled.",
    enableSetting: "Enable pet.enabled in Settings.",
    hookProviderLabel: "Hook provider",
    hookProviderHint: "Click to switch"
  },
  backgroundDescriptions: {
    none: ["None", "Use the VS Code theme background"],
    custom: ["Custom Image", "Use one local PNG, WebP, or GIF image"],
    arcade: ["Arcade", "Colorful cabinets and glowing game screens"],
    "autumn-forest": ["Autumn Forest", "A golden path beneath colorful leaves"],
    "blue-sky": ["Blue Sky", "A dreamy platform above the clouds"],
    office: ["Cozy Office", "Warm desk, books, and morning light"],
    "pro-office": ["Engineering Office", "A fully equipped modern software studio"],
    grassland: ["Grassland", "Sunny meadow and distant hills"],
    "japanese-festival": ["Japanese Festival", "Lanterns, food stalls, and distant fireworks"],
    "japanese-room": ["Japanese Room", "Tatami, shoji screens, and a garden view"],
    "living-room": ["Living Room", "Soft rug and a comfortable window seat"],
    "night-camp": ["Night Camp", "Stars, mountains, and a warm campfire"],
    "night-city": ["Night City", "A neon skyline above a rain-wet rooftop"],
    space: ["Outer Space", "A ringed planet beyond a space platform"],
    "rainy-cafe": ["Rainy Cafe", "Warm coffee beside a rain-streaked window"],
    treehouse: ["Secret Treehouse", "A warm hideaway high in the forest canopy"],
    "server-room": ["Server Room", "Cool server racks and blinking status lights"],
    "snowy-cabin": ["Snowy Cabin", "A warm cabin surrounded by falling snow"],
    sunset: ["Sunset Overlook", "Golden light over mountains and a lake"],
    terminal: ["Terminal", "Commands typed live in a programmer's terminal"],
    "tropical-beach": ["Tropical Beach", "Palm trees, white sand, and rolling waves"],
    underwater: ["Underwater", "A bright coral garden beneath the sea"]
  },
  speedDescriptions: {
    "0.25": "Very slow",
    "0.5": "Slow",
    "0.75": "Relaxed",
    "1": "Normal",
    "1.25": "Fast",
    "1.5": "Faster",
    "2": "Very fast",
    "3": "Maximum"
  }
};

export function selectLocale(_language: string): AppLocale {
  return "en";
}

export function getStrings(_language: string): UiStrings {
  return english;
}
