import type { UiStrings } from "../localization.js";

export const PET_BACKGROUND_IDS = [
  "none", "arcade", "autumn-forest", "blue-sky", "office", "pro-office",
  "grassland", "japanese-festival", "japanese-room", "living-room", "night-camp",
  "night-city", "space", "rainy-cafe", "treehouse", "server-room", "snowy-cabin",
  "sunset", "terminal", "tropical-beach", "underwater"
] as const;

export type PetBackgroundId = (typeof PET_BACKGROUND_IDS)[number];
export type PetBackgroundSelection = PetBackgroundId | "custom";

export function isPetBackgroundSelection(value: unknown): value is PetBackgroundSelection {
  return value === "custom" || PET_BACKGROUND_IDS.some((id) => id === value);
}

export function petBackgroundsForDisplay(strings: UiStrings): Array<{
  id: PetBackgroundSelection;
  label: string;
  description: string;
}> {
  const backgrounds = PET_BACKGROUND_IDS.map((id) => {
    const [label, description] = strings.backgroundDescriptions[id] ?? [id, id];
    return { id, label, description };
  });
  const [none, ...scenes] = backgrounds;
  const [customLabel, customDescription] = strings.backgroundDescriptions.custom ?? ["Custom", "Custom"];
  const custom = { id: "custom" as const, label: customLabel, description: customDescription };
  return [none!, custom, ...scenes.sort((left, right) =>
    left.label.localeCompare(right.label, strings.languageTag)
  )];
}
