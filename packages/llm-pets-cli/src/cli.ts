import { parseArgs } from "./parseArgs.js";
import { getPet } from "./getPet.js";
import { installPackage } from "./install.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HELP = `llm-pets — download Codex pets and install LLM Pets packages

Usage:
  llm-pets get <slug> [--registry codexpethub|petdex|<url>] [--overwrite] [--pets-dir <dir>]
  llm-pets install extension
  llm-pets install extension-windows
  llm-pets install terminal
  llm-pets --help

Pets are written to ~/.pets/<slug>/. The extension and terminal look there
first, then fall back to ~/.codex/pets.
`;

export async function main(argv = process.argv.slice(2)): Promise<number> {
  try {
    const command = parseArgs(argv);
    if (command.command === "help") {
      console.log(HELP);
      return 0;
    }
    if (command.command === "get") {
      const dest = await getPet(command);
      console.log(`installed ${command.slug} -> ${dest}`);
      return 0;
    }
    const startDir = path.dirname(fileURLToPath(import.meta.url));
    await installPackage(command.target, { startDir });
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    return /unknown command|requires/.test(message) ? 64 : 1;
  }
}

const code = await main();
process.exit(code);
