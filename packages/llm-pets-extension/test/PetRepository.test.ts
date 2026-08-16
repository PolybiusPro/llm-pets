import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PetLoader } from "../src/pet/PetLoader.js";
import { PetRepository } from "../src/pet/PetRepository.js";

let temporaryRoot: string | undefined;

afterEach(async () => {
  if (temporaryRoot) {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
    temporaryRoot = undefined;
  }
});

describe("PetRepository", () => {
  it("restores a saved Pet id and falls back when it disappears", async () => {
    temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-pet-repository-"));
    await createPet(temporaryRoot, "alpha");
    await createPet(temporaryRoot, "beta");
    const repository = new PetRepository(new PetLoader(temporaryRoot), "beta");

    await repository.refresh();
    expect(repository.selectedId).toBe("beta");

    await fs.rm(path.join(temporaryRoot, "beta"), { recursive: true });
    await repository.refresh();
    expect(repository.selectedId).toBe("alpha");
  });
});

async function createPet(root: string, id: string): Promise<void> {
  const directory = path.join(root, id);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    path.join(directory, "pet.json"),
    JSON.stringify({ id, displayName: id, spriteVersionNumber: 2, spritesheetPath: "spritesheet.webp" })
  );
  const image = Buffer.alloc(30);
  image.write("RIFF", 0, "ascii");
  image.write("WEBP", 8, "ascii");
  image.write("VP8X", 12, "ascii");
  image.writeUIntLE(1535, 24, 3);
  image.writeUIntLE(2287, 27, 3);
  await fs.writeFile(path.join(directory, "spritesheet.webp"), image);
}
