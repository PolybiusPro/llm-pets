export type CliCommand =
  | { command: "help" }
  | {
      command: "get";
      slug: string;
      registry: string;
      overwrite: boolean;
      petsDir?: string;
    }
  | { command: "install"; target: "extension" | "terminal" };

export function parseArgs(argv: string[]): CliCommand {
  const args = [...argv];
  while (args[0] === "--") {
    args.shift();
  }
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    return { command: "help" };
  }

  const command = args.shift();
  if (command === "get") {
    const slug = args.shift();
    if (!slug || slug.startsWith("-")) {
      throw new Error("get requires a pet slug");
    }
    let registry = "codexpethub";
    let overwrite = false;
    let petsDir: string | undefined;
    while (args.length > 0) {
      const flag = args.shift();
      if (flag === "--overwrite") {
        overwrite = true;
      } else if (flag === "--registry") {
        registry = requireValue(args, "--registry");
      } else if (flag === "--pets-dir") {
        petsDir = requireValue(args, "--pets-dir");
      } else if (flag === "--help" || flag === "-h") {
        return { command: "help" };
      } else {
        throw new Error(`unknown flag: ${flag}`);
      }
    }
    return { command: "get", slug, registry, overwrite, petsDir };
  }

  if (command === "install") {
    const target = args.shift();
    if (target !== "extension" && target !== "terminal") {
      throw new Error("install requires extension or terminal");
    }
    return { command: "install", target };
  }

  throw new Error(`unknown command: ${command}`);
}

function requireValue(args: string[], flag: string): string {
  const value = args.shift();
  if (!value || value.startsWith("-")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}
