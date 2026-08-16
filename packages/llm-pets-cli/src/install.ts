import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

export type RunCommand = (
  command: string,
  args: string[],
  options?: { cwd?: string }
) => { status: number | null; error?: Error };

export type WhichCommand = (name: string) => string | null;

export function findRepoRoot(start: string): string {
  let current = path.resolve(start);
  while (true) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("not inside the llm-pets repository");
    }
    current = parent;
  }
}

export async function installPackage(
  target: "extension" | "terminal",
  options: {
    repoRoot?: string;
    startDir?: string;
    run?: RunCommand;
    which?: WhichCommand;
  } = {}
): Promise<void> {
  const repoRoot = options.repoRoot ?? findRepoRoot(options.startDir ?? process.cwd());
  const run = options.run ?? defaultRun;
  if (target === "terminal") {
    const compile = run("pnpm", ["--filter", "llm-pets-terminal", "compile"], { cwd: repoRoot });
    if (compile.error) {
      throw compile.error;
    }
    if (compile.status !== 0) {
      throw new Error(`terminal compile failed with exit code ${compile.status ?? 1}`);
    }
    const mainJs = path.join(repoRoot, "packages", "llm-pets-terminal", "dist", "main.js");
    const result = run("node", [mainJs, "install"], {
      cwd: path.join(repoRoot, "packages", "llm-pets-terminal")
    });
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(`terminal install failed with exit code ${result.status ?? 1}`);
    }
    return;
  }

  const packageResult = run("pnpm", ["--filter", "llm-pets-extension", "run", "package"], { cwd: repoRoot });
  if (packageResult.error) {
    throw packageResult.error;
  }
  if (packageResult.status !== 0) {
    throw new Error(`extension package failed with exit code ${packageResult.status ?? 1}`);
  }

  const manifest = JSON.parse(
    readFileSync(path.join(repoRoot, "packages", "llm-pets-extension", "package.json"), "utf8")
  ) as { name: string; version: string };
  const vsixPath = path.join(
    repoRoot,
    "packages",
    "llm-pets-extension",
    "build",
    `${manifest.name}-${manifest.version}.vsix`
  );
  const which = options.which ?? defaultWhich;
  const editors = ["cursor", "code"].map((name) => which(name)).filter((value): value is string => Boolean(value));
  if (editors.length === 0) {
    throw new Error("neither cursor nor code was found on PATH");
  }
  for (const editor of editors) {
    const result = run(editor, ["--install-extension", vsixPath, "--force"]);
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(`failed to install into ${editor} (exit code ${result.status ?? 1})`);
    }
  }
}

function defaultRun(command: string, args: string[], options?: { cwd?: string }): { status: number | null; error?: Error } {
  const result = spawnSync(command, args, { stdio: "inherit", cwd: options?.cwd });
  return { status: result.status, error: result.error };
}

function defaultWhich(name: string): string | null {
  const result = spawnSync("command", ["-v", name], { encoding: "utf8", shell: true });
  const value = result.stdout?.trim();
  return value ? value : null;
}
