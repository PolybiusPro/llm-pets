import type { UiStrings } from "../localization.js";

export interface AnimationSpeedOption {
  readonly value: number;
  readonly label: string;
  readonly description: string;
}

export const ANIMATION_SPEED_VALUES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const;

export function animationSpeedsForDisplay(strings: UiStrings): readonly AnimationSpeedOption[] {
  return ANIMATION_SPEED_VALUES.map((value) => ({
    value,
    label: `${value}x`,
    description: strings.speedDescriptions[String(value)] ?? String(value)
  }));
}
