export interface PetdexEntry {
  slug: string;
  petJson: unknown;
  spritesheetUrl: string;
}

export function parsePetdexManifest(value: unknown, slug: string): PetdexEntry {
  const entries = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { pets?: unknown }).pets)
      ? (value as { pets: unknown[] }).pets
      : null;
  if (!entries) {
    throw new Error("petdex manifest must be a list of pets");
  }
  const match = entries.find((entry) => petdexSlug(entry) === slug);
  if (!match || typeof match !== "object") {
    throw new Error(`pet ${slug} was not found in the petdex manifest`);
  }
  const record = match as Record<string, unknown>;
  const spritesheetUrl =
    urlField(record, "spritesheet") ??
    urlField(record, "spritesheetUrl") ??
    urlField(record, "spritesheet_url");
  if (!spritesheetUrl) {
    throw new Error(`petdex entry ${slug} is missing a spritesheet URL`);
  }
  const petJson = record.pet ?? record.manifest ?? record.petJson ?? {
    id: slug,
    displayName: typeof record.name === "string" ? record.name : slug,
    spritesheetPath: spritesheetFileName(spritesheetUrl)
  };
  return { slug, petJson, spritesheetUrl };
}

function petdexSlug(entry: unknown): string | undefined {
  if (!entry || typeof entry !== "object") {
    return undefined;
  }
  const record = entry as Record<string, unknown>;
  for (const key of ["slug", "id", "name"]) {
    if (typeof record[key] === "string" && record[key]) {
      return String(record[key]);
    }
  }
  return undefined;
}

function urlField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.startsWith("https://") ? value : undefined;
}

function spritesheetFileName(url: string): string {
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith(".png")) return "spritesheet.png";
  if (pathname.endsWith(".gif")) return "spritesheet.gif";
  return "spritesheet.webp";
}
