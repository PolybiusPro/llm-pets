import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PetLoader } from "../src/pet/PetLoader.js";

let temporaryRoot: string;

beforeEach(async () => {
  temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-pet-test-"));
});

afterEach(async () => {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
});

describe("PetLoader", () => {
  it("reports a missing pets directory", async () => {
    const result = await new PetLoader(path.join(temporaryRoot, "missing")).load();
    expect(result.directoryExists).toBe(false);
    expect(result.pets).toEqual([]);
  });

  it("loads the observed v2 Pet layout", async () => {
    const directory = path.join(temporaryRoot, "pets", "penguin");
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(
      path.join(directory, "pet.json"),
      JSON.stringify({
        id: "penguin",
        displayName: "Penguin",
        description: "A test Pet",
        spriteVersionNumber: 2,
        spritesheetPath: "spritesheet.webp",
        kind: "animal"
      })
    );
    await fs.writeFile(path.join(directory, "spritesheet.webp"), makeVp8x(1536, 2288));

    const result = await new PetLoader(path.join(temporaryRoot, "pets")).load();
    expect(result.issues).toEqual([]);
    expect(result.pets[0]).toMatchObject({
      id: "penguin",
      name: "Penguin",
      columns: 8,
      rows: 11,
      frameWidth: 192,
      frameHeight: 208
    });
    expect(result.pets[0]?.animations.idle).toMatchObject({ row: 0, frameCount: 6, loop: true });
    expect(result.pets[0]?.animations).toMatchObject({
      waving: {
        row: 3,
        frameCount: 4,
        frameDurationsMs: [140, 140, 140, 280],
        loop: false
      },
      running: { row: 7, frameCount: 6 },
      waiting: { row: 6, frameCount: 6 },
      review: { row: 8, frameCount: 6 },
      failed: { row: 5, frameCount: 8 }
    });
    expect(result.pets[0]?.lookDirections).toEqual([
      { row: 9, column: 0 },
      { row: 9, column: 1 },
      { row: 9, column: 2 },
      { row: 9, column: 3 },
      { row: 9, column: 4 },
      { row: 9, column: 5 },
      { row: 9, column: 6 },
      { row: 9, column: 7 },
      { row: 10, column: 0 },
      { row: 10, column: 1 },
      { row: 10, column: 2 },
      { row: 10, column: 3 },
      { row: 10, column: 4 },
      { row: 10, column: 5 },
      { row: 10, column: 6 },
      { row: 10, column: 7 }
    ]);
  });

  it("does not attach look directions to a v1 Pet", async () => {
    const directory = path.join(temporaryRoot, "pets", "dude");
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(
      path.join(directory, "pet.json"),
      JSON.stringify({
        id: "dude",
        displayName: "Dude",
        spritesheetPath: "spritesheet.webp"
      })
    );
    await fs.writeFile(path.join(directory, "spritesheet.webp"), makeVp8x(1536, 1872));

    const result = await new PetLoader(path.join(temporaryRoot, "pets")).load();
    expect(result.issues).toEqual([]);
    expect(result.pets[0]).toMatchObject({
      id: "dude",
      columns: 8,
      rows: 9,
      frameWidth: 192,
      frameHeight: 208
    });
    expect(result.pets[0]?.lookDirections).toBeUndefined();
  });

  it("skips corrupt manifests while preserving valid Pets", async () => {
    const pets = path.join(temporaryRoot, "pets");
    await createValidPet(path.join(pets, "valid"));
    await fs.mkdir(path.join(pets, "broken"), { recursive: true });
    await fs.writeFile(path.join(pets, "broken", "pet.json"), "{broken");

    const result = await new PetLoader(pets).load();
    expect(result.pets).toHaveLength(1);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.directoryName).toBe("broken");
  });

  it("rejects sprite paths outside the Pet directory", async () => {
    const directory = path.join(temporaryRoot, "pets", "unsafe");
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, "pet.json"), JSON.stringify({ spritesheetPath: "../outside.webp" }));

    const result = await new PetLoader(path.join(temporaryRoot, "pets")).load();
    expect(result.pets).toHaveLength(0);
    expect(result.issues[0]?.message).toMatch(/must stay inside/);
  });

  it("skips a Pet with no sprite image", async () => {
    const directory = path.join(temporaryRoot, "pets", "missing-image");
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, "pet.json"), "{}");

    const result = await new PetLoader(path.join(temporaryRoot, "pets")).load();
    expect(result.pets).toEqual([]);
    expect(result.issues[0]?.message).toMatch(/No supported sprite image/);
  });

  it("loads ~/.pets first and fills in Codex pets without replacing ids", async () => {
    const llmPets = path.join(temporaryRoot, ".pets");
    const codexPets = path.join(temporaryRoot, ".codex", "pets");
    await createValidPet(path.join(llmPets, "dude"));
    await createValidPet(path.join(codexPets, "dude"));
    await createValidPet(path.join(codexPets, "penguin"));
    await fs.writeFile(
      path.join(llmPets, "dude", "pet.json"),
      JSON.stringify({ id: "dude", displayName: "Local Dude", spriteVersionNumber: 2, spritesheetPath: "spritesheet.webp" })
    );

    const result = await new PetLoader([llmPets, codexPets]).load();
    expect(result.petsDirectory).toBe(llmPets);
    expect(result.directoryExists).toBe(true);
    expect(result.pets.map((pet) => pet.id).sort()).toEqual(["dude", "penguin"]);
    expect(result.pets.find((pet) => pet.id === "dude")?.name).toBe("Local Dude");
    expect(result.pets.find((pet) => pet.id === "dude")?.directoryPath).toBe(path.join(llmPets, "dude"));
  });
});

const bananaCatDirectory = path.join(os.homedir(), ".codex", "pets");
const bananaCatManifest = path.join(bananaCatDirectory, "banana-cat", "pet.json");

describe.skipIf(!existsSync(bananaCatManifest))("installed banana-cat", () => {
  it("loads as a v2 Pet with 16 look-direction cells", async () => {
    const result = await new PetLoader(bananaCatDirectory).load();
    const pet = result.pets.find((candidate) => candidate.id === "banana-cat");
    expect(result.issues.find((issue) => issue.directoryName === "banana-cat")).toBeUndefined();
    expect(pet).toMatchObject({
      id: "banana-cat",
      spriteVersionNumber: 2,
      columns: 8,
      rows: 11,
      frameWidth: 192,
      frameHeight: 208
    });
    expect(pet?.lookDirections).toHaveLength(16);
    expect(pet?.lookDirections?.[0]).toEqual({ row: 9, column: 0 });
    expect(pet?.lookDirections?.[8]).toEqual({ row: 10, column: 0 });
  });
});

async function createValidPet(directory: string): Promise<void> {
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    path.join(directory, "pet.json"),
    JSON.stringify({ id: path.basename(directory), spriteVersionNumber: 2, spritesheetPath: "spritesheet.webp" })
  );
  await fs.writeFile(path.join(directory, "spritesheet.webp"), makeVp8x(1536, 2288));
}

function makeVp8x(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(30);
  buffer.write("RIFF", 0, "ascii");
  buffer.write("WEBP", 8, "ascii");
  buffer.write("VP8X", 12, "ascii");
  buffer.writeUIntLE(width - 1, 24, 3);
  buffer.writeUIntLE(height - 1, 27, 3);
  return buffer;
}
