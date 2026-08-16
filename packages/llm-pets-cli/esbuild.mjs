import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/cli.ts"],
  bundle: true,
  outfile: "dist/cli.js",
  format: "esm",
  platform: "node",
  target: "node24",
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "info"
});
