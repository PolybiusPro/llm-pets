import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseInstallManifest } from "./registries/installManifest.js";
import { parsePetdexManifest } from "./registries/petdex.js";
import { resolveRegistry } from "./registries/resolve.js";

const PET_JSON_MAX_BYTES = 64 * 1024;
const SPRITESHEET_MAX_BYTES = 8 * 1024 * 1024;

export interface GetPetOptions {
  slug: string;
  registry: string;
  overwrite: boolean;
  petsDir?: string;
  fetch?: typeof fetch;
  homeDirectory?: string;
}

export async function getPet(options: GetPetOptions): Promise<string> {
  const fetchImpl = options.fetch ?? fetch;
  const petsDir = options.petsDir ?? path.join(options.homeDirectory ?? os.homedir(), ".pets");
  const dest = path.join(petsDir, options.slug);
  if (!options.overwrite) {
    try {
      await fs.stat(dest);
      throw new Error(`pet already exists: ${dest} (pass --overwrite)`);
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
    }
  }

  const files = await downloadPetFiles(options.slug, options.registry, fetchImpl);
  await fs.mkdir(petsDir, { recursive: true });
  const temp = await fs.mkdtemp(path.join(petsDir, `.${options.slug}-`));
  try {
    for (const file of files) {
      await fs.writeFile(path.join(temp, file.name), file.bytes);
    }
    if (options.overwrite) {
      await fs.rm(dest, { recursive: true, force: true });
    }
    await fs.rename(temp, dest);
  } catch (error) {
    await fs.rm(temp, { recursive: true, force: true });
    throw error;
  }
  return dest;
}

async function downloadPetFiles(
  slug: string,
  registry: string,
  fetchImpl: typeof fetch
): Promise<Array<{ name: string; bytes: Buffer }>> {
  const resolved = resolveRegistry(registry);
  if (resolved.kind === "petdex") {
    return downloadPetdex(slug, resolved.baseUrl, fetchImpl);
  }
  try {
    return await downloadInstallManifest(slug, resolved.baseUrl, fetchImpl);
  } catch (error) {
    if (REGISTRY_IS_NAMED_INSTALL_MANIFEST(registry)) {
      throw error;
    }
    return downloadPetdex(slug, resolved.baseUrl, fetchImpl);
  }
}

function REGISTRY_IS_NAMED_INSTALL_MANIFEST(registry: string): boolean {
  return registry.toLowerCase() === "codexpethub";
}

async function downloadInstallManifest(
  slug: string,
  baseUrl: string,
  fetchImpl: typeof fetch
): Promise<Array<{ name: string; bytes: Buffer }>> {
  const manifestUrl = `${baseUrl.replace(/\/$/, "")}/api/v1/pets/${encodeURIComponent(slug)}/install-manifest.json`;
  const manifest = parseInstallManifest(await fetchJson(fetchImpl, manifestUrl), slug);
  const files = [];
  for (const file of manifest.files) {
    const bytes = await fetchBytes(fetchImpl, file.url, maxBytesFor(file.name));
    if (file.sha256 && sha256(bytes) !== file.sha256.toLowerCase()) {
      throw new Error(`sha256 mismatch for ${file.name}`);
    }
    assertAllowedFile(file.name, bytes);
    files.push({ name: file.name, bytes });
  }
  return files;
}

async function downloadPetdex(
  slug: string,
  baseUrl: string,
  fetchImpl: typeof fetch
): Promise<Array<{ name: string; bytes: Buffer }>> {
  const manifestUrl = `${baseUrl.replace(/\/$/, "")}/api/manifest`;
  const entry = parsePetdexManifest(await fetchJson(fetchImpl, manifestUrl), slug);
  const sheetName = spritesheetName(entry.spritesheetUrl);
  const bytes = await fetchBytes(fetchImpl, entry.spritesheetUrl, SPRITESHEET_MAX_BYTES);
  assertAllowedFile(sheetName, bytes);
  return [
    { name: "pet.json", bytes: Buffer.from(JSON.stringify(entry.petJson, null, 2)) },
    { name: sheetName, bytes }
  ];
}

async function fetchJson(fetchImpl: typeof fetch, url: string): Promise<unknown> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`failed to fetch ${url}: ${response.status}`);
  }
  return response.json();
}

async function fetchBytes(fetchImpl: typeof fetch, url: string, maxBytes: number): Promise<Buffer> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`failed to fetch ${url}: ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxBytes) {
    throw new Error(`file exceeded the size cap: ${url}`);
  }
  return bytes;
}

function maxBytesFor(name: string): number {
  return name === "pet.json" ? PET_JSON_MAX_BYTES : SPRITESHEET_MAX_BYTES;
}

function assertAllowedFile(name: string, bytes: Buffer): void {
  if (name === "pet.json") {
    JSON.parse(bytes.toString("utf8"));
    return;
  }
  if (name.endsWith(".webp") && !(bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP")) {
    throw new Error("spritesheet is not a WebP image");
  }
  if (name.endsWith(".png") && bytes.subarray(0, 4).toString("hex") !== "89504e47") {
    throw new Error("spritesheet is not a PNG image");
  }
  if (name.endsWith(".gif") && bytes.subarray(0, 4).toString("ascii") !== "GIF8") {
    throw new Error("spritesheet is not a GIF image");
  }
}

function spritesheetName(url: string): string {
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith(".png")) return "spritesheet.png";
  if (pathname.endsWith(".gif")) return "spritesheet.gif";
  return "spritesheet.webp";
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}
