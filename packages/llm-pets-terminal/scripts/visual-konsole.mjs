#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const petBin = path.join(pkg, "dist", "main.js");
const auto = Boolean(process.env.LLM_PETS_VISUAL_AUTO);
const only = process.env.LLM_PETS_VISUAL_ONLY ?? "";
const holdSeconds = process.env.LLM_PETS_VISUAL_SECONDS ?? "12";
const socket = `llm-pets-visual-${process.pid}`;
const session = "visual";
const workdir = mkdtempSync(path.join(os.tmpdir(), "llm-pets-visual-"));
const fakeCodex = path.join(workdir, "codex");
const cleanPath = `${path.dirname(process.execPath)}:/usr/bin:/bin`;

function need(name) {
  const result = spawnSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" });
  if (result.status !== 0) {
    console.error(`visual-konsole: need ${name} on PATH`);
    process.exit(1);
  }
}

need("konsole");
need("tmux");
need("timeout");
need("pnpm");

if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
  console.error("visual-konsole: need DISPLAY or WAYLAND_DISPLAY");
  process.exit(1);
}

function findPetDir() {
  if (process.env.LLM_PETS_PET_DIR && existsSync(path.join(process.env.LLM_PETS_PET_DIR, "pet.json"))) {
    return process.env.LLM_PETS_PET_DIR;
  }
  const roots = [
    path.join(os.homedir(), ".pets"),
    path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "llm-pets", "pets"),
    path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "pets")
  ];
  for (const root of roots) {
    if (existsSync(path.join(root, "dude", "pet.json"))) {
      return path.join(root, "dude");
    }
    if (!existsSync(root)) {
      continue;
    }
    for (const name of readdirSync(root)) {
      const dir = path.join(root, name);
      if (existsSync(path.join(dir, "pet.json"))) {
        return dir;
      }
    }
  }
  return undefined;
}

const petDir = findPetDir();
if (!petDir) {
  console.error("visual-konsole: no pet.json under ~/.pets or Codex home");
  console.error("Install one with: pnpm llm-pets get <slug>");
  process.exit(1);
}
const petId = path.basename(petDir);

console.log("Compiling llm-pets-terminal...");
const compile = spawnSync("pnpm", ["--filter", "llm-pets-terminal", "compile"], { stdio: "inherit" });
if (compile.status !== 0) {
  process.exit(compile.status ?? 1);
}
chmodSync(petBin, 0o755);

const sleepBin = spawnSync("sh", ["-c", "command -v sleep"], { encoding: "utf8" }).stdout.trim();
copyFileSync(sleepBin, fakeCodex);
chmodSync(fakeCodex, 0o755);

const overlayJs = path.join(workdir, "overlay.mjs");
const tmuxJs = path.join(workdir, "tmux.mjs");

writeFileSync(
  overlayJs,
  `
import { spawnSync } from "node:child_process";
import { readlinkSync } from "node:fs";
import { createInterface } from "node:readline/promises";
const petBin = ${JSON.stringify(petBin)};
const petId = ${JSON.stringify(petId)};
const hold = ${JSON.stringify(holdSeconds)};
const auto = ${auto};
console.log("=== Konsole, no tmux: kitty overlay ===");
console.log("Pass: the pet draws over this text. Fail: a black box or nothing.");
console.log("");
spawnSync(petBin, ["--pet", petId, "check"], { stdio: "inherit" });
console.log("");
let tty = "/dev/tty";
try { tty = readlinkSync("/proc/self/fd/0"); } catch {}
spawnSync("timeout", [hold, petBin, "--pet", petId, "run", "--tty", tty, "--backend", "kitty"], { stdio: "inherit" });
console.log("");
if (!auto) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await rl.question("Press enter to close. ");
  rl.close();
}
`
);

writeFileSync(
  tmuxJs,
  `
import { spawn, spawnSync } from "node:child_process";
const petBin = ${JSON.stringify(petBin)};
const petId = ${JSON.stringify(petId)};
const socket = ${JSON.stringify(socket)};
const session = ${JSON.stringify(session)};
const fakeCodex = ${JSON.stringify(fakeCodex)};
const hold = ${JSON.stringify(holdSeconds)};
const auto = ${auto};
process.env.PATH = ${JSON.stringify(cleanPath)};
console.log("=== Konsole + tmux: half-block pane ===");
console.log("Pass: pet in the right pane. Fail: overlay on the left, or a black box.");
spawnSync("tmux", ["-L", socket, "-f", "/dev/null", "new-session", "-d", "-s", session, "exec " + JSON.stringify(fakeCodex) + " 120"], { stdio: "inherit" });
const left = spawnSync("tmux", ["-L", socket, "display-message", "-p", "-t", session, "#{pane_id}"], { encoding: "utf8" }).stdout.trim();
spawnSync("tmux", ["-L", socket, "-f", "/dev/null", "split-window", "-h", "-l", "40%", "-t", session, petBin + " --pet " + petId + " pane --render --state idle --source-pane " + left], { stdio: "inherit" });
if (auto) {
  spawn("sleep " + hold + "; tmux -L " + socket + " kill-server", { shell: true, stdio: "ignore" }).unref();
}
spawnSync("tmux", ["-L", socket, "attach", "-t", session], { stdio: "inherit" });
`
);

function cleanup() {
  spawnSync("tmux", ["-L", socket, "kill-server"], { stdio: "ignore" });
  rmSync(workdir, { recursive: true, force: true });
}
process.on("exit", cleanup);

const konsoleFlags = [
  "--separate",
  "--nofork",
  "--hide-menubar",
  "--hide-toolbars",
  "--notransparency"
];
if (auto) {
  konsoleFlags.push("--fullscreen");
}

function startKonsole(title, script) {
  return spawn("konsole", [...konsoleFlags, "-p", `LocalTabTitleFormat=${title}`, "-e", process.execPath, script], {
    stdio: "ignore"
  });
}

console.log("Opening Konsole without tmux (kitty overlay) and with tmux (blocks pane).");
console.log(`Pet: ${petId} (${petDir})`);
console.log("Pass without tmux: sprite over the text, not a black box.");
console.log("Pass with tmux: sprite in the right pane; left (fake agent) has no overlay.");

function waitChild(child) {
  return new Promise((resolve) => {
    child.on("exit", (code) => resolve(code ?? 0));
  });
}

const runOverlay = only !== "tmux";
const runTmux = only !== "overlay";

if (auto) {
  if (runOverlay) {
    await waitChild(startKonsole("LLM Pets overlay", overlayJs));
  }
  if (runTmux) {
    await waitChild(startKonsole("LLM Pets tmux", tmuxJs));
  }
} else {
  const kids = [];
  if (runOverlay) {
    kids.push(waitChild(startKonsole("LLM Pets overlay", overlayJs)));
  }
  if (runTmux) {
    kids.push(waitChild(startKonsole("LLM Pets tmux", tmuxJs)));
  }
  await Promise.all(kids);
}

console.log("visual-konsole: both Konsole windows closed.");
