import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

export type InstallTarget = "extension" | "extension-windows" | "terminal";

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
  target: InstallTarget,
  options: {
    repoRoot?: string;
    startDir?: string;
    run?: RunCommand;
    which?: WhichCommand;
    platform?: NodeJS.Platform;
  } = {}
): Promise<void> {
  const repoRoot = options.repoRoot ?? findRepoRoot(options.startDir ?? process.cwd());
  const platform = options.platform ?? process.platform;
  if (target === "extension-windows" && platform !== "win32") {
    throw new Error("extension-windows is only supported on Windows");
  }
  const run = options.run ?? (target === "extension-windows" ? defaultWindowsRun : defaultRun);
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

  const extensionRoot = path.join(repoRoot, "packages", "llm-pets-extension");
  const manifest = readExtensionManifest(extensionRoot);
  const vsixPath = path.join(
    extensionRoot,
    "build",
    `${manifest.name}-${manifest.version}.vsix`
  );
  if (target === "extension-windows") {
    packageExtensionForWindows(repoRoot, extensionRoot, vsixPath, manifest, run);
  } else {
    const packageResult = run("pnpm", ["--filter", "llm-pets-extension", "run", "package"], { cwd: repoRoot });
    assertCommandSucceeded(packageResult, "extension package");
  }

  const which = options.which ?? (target === "extension-windows" ? defaultWindowsWhich : defaultWhich);
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

type ExtensionManifest = {
  name: string;
  version: string;
  scripts?: Record<string, string>;
};

function readExtensionManifest(extensionRoot: string): ExtensionManifest {
  return JSON.parse(readFileSync(path.join(extensionRoot, "package.json"), "utf8")) as ExtensionManifest;
}

function packageExtensionForWindows(
  repoRoot: string,
  extensionRoot: string,
  vsixPath: string,
  manifest: ExtensionManifest,
  run: RunCommand
): void {
  const prepublish = run("pnpm", ["--filter", "llm-pets-extension", "run", "vscode:prepublish"], {
    cwd: repoRoot
  });
  assertCommandSucceeded(prepublish, "extension prepublish");

  mkdirSync(path.dirname(vsixPath), { recursive: true });
  const stagingRoot = mkdtempSync(path.join(os.tmpdir(), "llm-pets-extension-windows-"));
  const stagingExtension = path.join(stagingRoot, "extension");
  try {
    cpSync(extensionRoot, stagingExtension, {
      recursive: true,
      filter: (source) => {
        const relative = path.relative(extensionRoot, source);
        const topLevel = relative.split(path.sep)[0];
        return topLevel !== "build" && topLevel !== "node_modules" && topLevel !== "-p";
      }
    });
    const stagedManifest: ExtensionManifest = {
      ...manifest,
      scripts: manifest.scripts ? { ...manifest.scripts } : undefined
    };
    delete stagedManifest.scripts?.["vscode:prepublish"];
    writeFileSync(path.join(stagingExtension, "package.json"), `${JSON.stringify(stagedManifest, null, 2)}\n`);

    const vsceCli = path.join(repoRoot, "node_modules", "@vscode", "vsce", "vsce");
    const packageResult = run(
      "node",
      [
        vsceCli,
        "package",
        "--allow-missing-repository",
        "--no-rewrite-relative-links",
        "--no-dependencies",
        "--out",
        vsixPath
      ],
      { cwd: stagingExtension }
    );
    assertCommandSucceeded(packageResult, "extension package");
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
  }
}

function assertCommandSucceeded(result: { status: number | null; error?: Error }, label: string): void {
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 1}`);
  }
}

function defaultRun(command: string, args: string[], options?: { cwd?: string }): { status: number | null; error?: Error } {
  const result = spawnSync(command, args, { stdio: "inherit", cwd: options?.cwd });
  return { status: result.status, error: result.error };
}

function defaultWindowsRun(
  command: string,
  args: string[],
  options?: { cwd?: string }
): { status: number | null; error?: Error } {
  const executable = path.isAbsolute(command) ? command : (defaultWindowsWhich(command) ?? command);
  const result = spawnSync(executable, args, {
    stdio: "inherit",
    cwd: options?.cwd,
    shell: /\.(?:cmd|bat)$/i.test(executable)
  });
  return { status: result.status, error: result.error };
}

function defaultWhich(name: string): string | null {
  const result = spawnSync("command", ["-v", name], { encoding: "utf8", shell: true });
  const value = result.stdout?.trim();
  return value ? value : null;
}

function defaultWindowsWhich(name: string): string | null {
  const result = spawnSync("where.exe", [name], { encoding: "utf8" });
  if (result.status !== 0) {
    return null;
  }
  const candidates = result.stdout
    ?.split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
  const candidate = candidates?.find((value) => /\.(?:exe|cmd|bat)$/i.test(value)) ?? candidates?.[0];
  return candidate ? path.basename(candidate) : null;
}
