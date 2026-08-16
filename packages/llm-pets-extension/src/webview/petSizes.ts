import type { UiStrings } from "../localization.js";

export type PetScale = number | "auto";

export const PET_SCALE_VALUES = ["auto", 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3] as const;

export interface PetScaleOption {
  readonly value: PetScale;
  readonly label: string;
  readonly description: string;
}

export function normalizePetScale(value: unknown): PetScale {
  if (value === "auto") return value;
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0.25, Math.min(3, value))
    : 1;
}

export function petScaleOptions(strings: UiStrings): readonly PetScaleOption[] {
  return PET_SCALE_VALUES.map((value) => value === "auto"
    ? {
        value,
        label: strings.size.autoLabel,
        description: strings.size.autoDescription
      }
    : {
        value,
        label: `${Math.round(value * 100)}%`,
        description: strings.size.fixedDescription(value)
      }
  );
}
