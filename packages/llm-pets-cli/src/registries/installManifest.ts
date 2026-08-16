export interface ManifestFile {
  name: string;
  url: string;
  sha256?: string;
}

export interface ParsedManifest {
  slug: string;
  files: ManifestFile[];
}

const ALLOWED_NAMES = new Set(["pet.json", "spritesheet.webp", "spritesheet.png", "spritesheet.gif"]);

export function parseInstallManifest(value: unknown, fallbackSlug: string): ParsedManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("install manifest must be an object");
  }
  const record = value as Record<string, unknown>;
  if (record.schema_version !== "codexpethub.install.v1") {
    throw new Error(`unsupported schema_version: ${String(record.schema_version)}`);
  }
  const slug = typeof record.slug === "string" && record.slug.trim() ? record.slug.trim() : fallbackSlug;
  if (!Array.isArray(record.files)) {
    throw new Error("install manifest is missing files");
  }
  const files: ManifestFile[] = record.files.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`files[${index}] is invalid`);
    }
    const file = entry as Record<string, unknown>;
    const name = typeof file.name === "string" ? file.name : "";
    const url = typeof file.url === "string" ? file.url : "";
    if (!ALLOWED_NAMES.has(name)) {
      throw new Error(`file name not allowed: ${name || "(empty)"}`);
    }
    if (!url.startsWith("https://")) {
      throw new Error(`file url must be https: ${name}`);
    }
    const sha256 = typeof file.sha256 === "string" ? file.sha256 : undefined;
    return { name, url, sha256 };
  });
  if (!files.some((file) => file.name === "pet.json")) {
    throw new Error("install manifest is missing pet.json");
  }
  if (!files.some((file) => file.name.startsWith("spritesheet."))) {
    throw new Error("install manifest is missing a spritesheet");
  }
  return { slug, files };
}
