import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const definitions = JSON.parse(readFileSync(join(packageDirectory, "definitions.json"), "utf8"));
const template = readFileSync(join(packageDirectory, "hook.template.cjs"), "utf8");
const marker = "/*__EVENT_ALIASES__*/";
if (!template.includes(marker)) {
  throw new Error(`Hook template is missing ${marker}`);
}
const rendered = template.replace(marker, JSON.stringify(definitions.aliases, null, 2));
const outputPath = join(packageDirectory, "hook.cjs");

if (process.argv.includes("--check")) {
  if (readFileSync(outputPath, "utf8") !== rendered) {
    throw new Error("hook.cjs is stale; run pnpm hooks:generate");
  }
} else {
  writeFileSync(outputPath, rendered, "utf8");
}
