import { describe, expect, it } from "vitest";
import { parseInstallManifest } from "../src/registries/installManifest.js";

describe("parseInstallManifest", () => {
  it("reads CodexPetHub install-manifest v1 files", () => {
    const parsed = parseInstallManifest(
      {
        schema_version: "codexpethub.install.v1",
        slug: "null-puff",
        files: [
          {
            name: "pet.json",
            url: "https://assets.codexpethub.com/pets/null-puff/pet.json",
            sha256: "abc"
          },
          {
            name: "spritesheet.webp",
            url: "https://assets.codexpethub.com/pets/null-puff/spritesheet.webp",
            sha256: "def"
          }
        ]
      },
      "null-puff"
    );
    expect(parsed.slug).toBe("null-puff");
    expect(parsed.files.map((file) => file.name)).toEqual(["pet.json", "spritesheet.webp"]);
  });

  it("rejects an unknown schema", () => {
    expect(() => parseInstallManifest({ schema_version: "nope", files: [] }, "x")).toThrow(
      /schema_version/
    );
  });

  it("rejects files outside pet.json and spritesheet images", () => {
    expect(() =>
      parseInstallManifest(
        {
          schema_version: "codexpethub.install.v1",
          files: [
            { name: "pet.json", url: "https://assets.codexpethub.com/pet.json", sha256: "a" },
            { name: "hook.js", url: "https://assets.codexpethub.com/hook.js", sha256: "b" }
          ]
        },
        "x"
      )
    ).toThrow(/not allowed/);
  });
});
