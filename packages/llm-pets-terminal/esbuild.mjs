import { chmodSync } from "node:fs";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  outfile: "dist/main.js",
  format: "esm",
  platform: "node",
  target: "node24",
  banner: { js: "#!/usr/bin/env node" },
  external: ["koffi", "sharp"],
  logLevel: "info"
});
chmodSync("dist/main.js", 0o755);
