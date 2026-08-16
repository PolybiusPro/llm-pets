import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPet } from "../src/getPet.js";

const WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.alloc(4),
  Buffer.from("WEBP"),
  Buffer.from("VP8X"),
  Buffer.alloc(18)
]);

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "llm-pets-cli-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("getPet", () => {
  it("downloads an install-manifest pet into ~/.pets/<slug>", async () => {
    const petJson = JSON.stringify({ id: "null-puff", displayName: "Null Puff" });
    const files = new Map<string, Buffer>([
      ["https://assets.codexpethub.com/pet.json", Buffer.from(petJson)],
      ["https://assets.codexpethub.com/sheet.webp", WEBP]
    ]);
    const fetchLike: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/install-manifest.json")) {
        return jsonResponse({
          schema_version: "codexpethub.install.v1",
          slug: "null-puff",
          files: [
            {
              name: "pet.json",
              url: "https://assets.codexpethub.com/pet.json",
              sha256: sha256(petJson)
            },
            {
              name: "spritesheet.webp",
              url: "https://assets.codexpethub.com/sheet.webp",
              sha256: sha256(WEBP)
            }
          ]
        });
      }
      const body = files.get(url);
      if (!body) {
        return new Response("missing", { status: 404 });
      }
      return new Response(new Uint8Array(body), { status: 200 });
    };

    const dest = await getPet({
      slug: "null-puff",
      registry: "codexpethub",
      petsDir: path.join(root, ".pets"),
      overwrite: false,
      fetch: fetchLike
    });

    expect(dest).toBe(path.join(root, ".pets", "null-puff"));
    expect(JSON.parse(await fs.readFile(path.join(dest, "pet.json"), "utf8"))).toEqual({
      id: "null-puff",
      displayName: "Null Puff"
    });
    expect(await fs.readFile(path.join(dest, "spritesheet.webp"))).toEqual(WEBP);
  });

  it("refuses to overwrite an existing pet", async () => {
    const dest = path.join(root, ".pets", "null-puff");
    await fs.mkdir(dest, { recursive: true });
    await fs.writeFile(path.join(dest, "pet.json"), "{}");
    await expect(
      getPet({
        slug: "null-puff",
        registry: "codexpethub",
        petsDir: path.join(root, ".pets"),
        overwrite: false,
        fetch: async () => new Response("nope", { status: 500 })
      })
    ).rejects.toThrow(/exists/);
  });

  it("downloads a petdex gallery entry", async () => {
    const petJson = {
      id: "boba",
      displayName: "Boba",
      spritesheetPath: "spritesheet.webp"
    };
    const fetchLike: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/manifest")) {
        return jsonResponse({
          pets: [
            {
              slug: "boba",
              name: "Boba",
              spritesheet: "https://cdn.petdex.dev/boba.webp",
              pet: petJson
            }
          ]
        });
      }
      if (url === "https://cdn.petdex.dev/boba.webp") {
        return new Response(new Uint8Array(WEBP), { status: 200 });
      }
      return new Response("missing", { status: 404 });
    };

    const dest = await getPet({
      slug: "boba",
      registry: "petdex",
      petsDir: path.join(root, ".pets"),
      overwrite: false,
      fetch: fetchLike
    });
    expect(JSON.parse(await fs.readFile(path.join(dest, "pet.json"), "utf8")).id).toBe("boba");
    expect(await fs.readFile(path.join(dest, "spritesheet.webp"))).toEqual(WEBP);
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
