export const REGISTRY_ALIASES: Record<string, { kind: "install-manifest" | "petdex"; baseUrl: string }> = {
  codexpethub: { kind: "install-manifest", baseUrl: "https://codexpethub.com" },
  petdex: { kind: "petdex", baseUrl: "https://petdex.dev" }
};

export function resolveRegistry(registry: string): { kind: "install-manifest" | "petdex"; baseUrl: string } {
  const alias = REGISTRY_ALIASES[registry.toLowerCase()];
  if (alias) {
    return alias;
  }
  const baseUrl = registry.replace(/\/$/, "");
  if (!baseUrl.startsWith("https://")) {
    throw new Error("registry URL must be https");
  }
  return { kind: "install-manifest", baseUrl };
}
