import type { CodexPet, PetLoadResult } from "./types.js";
import { PetLoader } from "./PetLoader.js";

export class PetRepository {
  private result: PetLoadResult | undefined;
  private selectedPetId: string | undefined;

  public constructor(
    private readonly loader: PetLoader,
    selectedPetId?: string
  ) {
    this.selectedPetId = selectedPetId;
  }

  public async refresh(): Promise<PetLoadResult> {
    this.result = await this.loader.load();
    if (!this.result.pets.some((pet) => pet.id === this.selectedPetId)) {
      this.selectedPetId = this.result.pets[0]?.id;
    }
    return this.result;
  }

  public get loadResult(): PetLoadResult | undefined {
    return this.result;
  }

  public get selectedPet(): CodexPet | undefined {
    return this.result?.pets.find((pet) => pet.id === this.selectedPetId);
  }

  public get selectedId(): string | undefined {
    return this.selectedPetId;
  }

  public select(petId: string): CodexPet | undefined {
    const pet = this.result?.pets.find((candidate) => candidate.id === petId);
    if (pet) {
      this.selectedPetId = pet.id;
    }
    return pet;
  }
}
