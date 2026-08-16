import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const vsixPath = path.join(root, "build", `${pkg.name}-${pkg.version}.vsix`);
const targets = ["code", "cursor"];

function run(command, args) {
  return spawnSync(command, args, { stdio: "inherit", cwd: root });
}

console.log("Packaging the extension...");
const packageResult = run("pnpm", ["run", "package"]);
if (packageResult.status !== 0) {
  console.error("Packaging failed; aborting deploy.");
  process.exit(packageResult.status ?? 1);
}

const failures = [];
for (const cli of targets) {
  console.log(`\nInstalling into ${cli}...`);
  const installResult = run(cli, ["--install-extension", vsixPath, "--force"]);
  if (installResult.error || installResult.status !== 0) {
    const reason = installResult.error ? installResult.error.message : `exit code ${installResult.status}`;
    console.error(`Could not install into ${cli}: ${reason}`);
    failures.push(cli);
  } else {
    console.log(`Installed into ${cli}.`);
  }
}

if (failures.length > 0) {
  console.error(`\nDeploy finished with failures: ${failures.join(", ")}`);
  process.exit(1);
}
console.log(`\nInstalled ${pkg.name} ${pkg.version} into: ${targets.join(", ")}`);
