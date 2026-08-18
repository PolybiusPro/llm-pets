import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const definitions = JSON.parse(readFileSync(join(packageDirectory, "definitions.json"), "utf8"));
const template = readFileSync(join(packageDirectory, "hook.template.cjs"), "utf8");
const aliasesMarker = "/*__EVENT_ALIASES__*/";
const kindMarker = "/*__HOOK_KIND__*/";
if (!template.includes(aliasesMarker) || !template.includes(kindMarker)) {
  throw new Error("Hook template is missing a generation marker");
}
const outputs = ["extension", "terminal"].map((kind) => ({
  outputPath: join(packageDirectory, `${kind}-hook.cjs`),
  rendered: template
    .replace(aliasesMarker, JSON.stringify(definitions.aliases, null, 2))
    .replace(kindMarker, JSON.stringify(kind))
}));
const claudePluginCommand = 'node "$LLM_PETS_TERMINAL_HOOK" claude';
const claudePluginHooks = {
  hooks: Object.fromEntries(definitions.providers.claude.events.map((eventName) => [
    eventName,
    [{
      hooks: [{
        type: "command",
        command: claudePluginCommand,
        timeout: 5,
        statusMessage: "LLM Pets",
        async: true
      }]
    }]
  ]))
};
outputs.push({
  outputPath: join(packageDirectory, "..", "packages", "llm-pets-terminal", "claude-plugin", "hooks", "hooks.json"),
  rendered: `${JSON.stringify(claudePluginHooks, null, 2)}\n`
});

if (process.argv.includes("--check")) {
  for (const { outputPath, rendered } of outputs) {
    if (readFileSync(outputPath, "utf8") !== rendered) {
      throw new Error(`${outputPath} is stale; run pnpm hooks:generate`);
    }
  }
} else {
  for (const { outputPath, rendered } of outputs) {
    writeFileSync(outputPath, rendered, "utf8");
  }
}
