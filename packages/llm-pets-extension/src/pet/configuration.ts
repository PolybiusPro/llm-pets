export const PET_CONFIGURATION_SECTION = "pet";
export const LEGACY_PET_CONFIGURATION_SECTION = "cursorPet";

export const PET_CONFIGURATION_KEYS = [
  "enabled",
  "petDirectory",
  "scale",
  "background",
  "customBackground.imagePath",
  "customBackground.opacity",
  "animationSpeed",
  "pauseWhenHidden",
  "watchPetDirectory",
  "integrationMode",
  "hookProvider"
] as const;

export type PetConfigurationKey = (typeof PET_CONFIGURATION_KEYS)[number];

export type ConfigurationInspect = {
  globalValue?: unknown;
  workspaceValue?: unknown;
  workspaceFolderValue?: unknown;
};

export type ConfigurationTargetName = "global" | "workspace" | "workspaceFolder";

export function settingsToMigrate(
  legacy: ConfigurationInspect | undefined,
  current: ConfigurationInspect | undefined
): Array<{ target: ConfigurationTargetName; value: unknown }> {
  const copies: Array<{ target: ConfigurationTargetName; value: unknown }> = [];
  if (legacy?.globalValue !== undefined && current?.globalValue === undefined) {
    copies.push({ target: "global", value: legacy.globalValue });
  }
  if (legacy?.workspaceValue !== undefined && current?.workspaceValue === undefined) {
    copies.push({ target: "workspace", value: legacy.workspaceValue });
  }
  if (
    legacy?.workspaceFolderValue !== undefined &&
    current?.workspaceFolderValue === undefined
  ) {
    copies.push({ target: "workspaceFolder", value: legacy.workspaceFolderValue });
  }
  return copies;
}
