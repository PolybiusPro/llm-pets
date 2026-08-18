# Conventions

## Layout

```text
package.json                 private workspace root
pnpm-workspace.yaml          packages/*, catalog, nodeLinker, allowBuilds
tsconfig.json                shared compilerOptions; packages extend this
.editorconfig                shared whitespace and newline defaults
.vscode/                     F5 Extension Development Host + compile task
.gitignore                   whole repo (no package-level copies)
packages/llm-pets-extension/  Cursor / VS Code extension
packages/llm-pets-terminal/   Linux terminal renderer
packages/llm-pets-cli/        llm-pets CLI
hooks/                        Shared hook protocol and generated script
README.md                    user-facing docs for the whole repo
.ai/                         agent context (this directory)
.cursor/rules/               loads .ai/AGENTS.md
docs/superpowers/            design spec and implementation plan
```

Each product package keeps its own `src/`, tests, `esbuild.mjs`, and a thin `tsconfig.json` that extends the root. TypeScript, Node types, and Vitest are root dev dependencies inherited by all children; packages declare only package-specific tooling and runtime dependencies. The plain root `hooks/` folder uses that root toolchain and its generator instead of package metadata. Do not flatten product packages into `src/` at the repo root. Do not add package-level `.ai/`, `.vscode/`, `.gitignore`, README, or CONTRIBUTING files. The extension keeps `.vscodeignore` (VSIX packaging) and `LICENSE`. User-facing docs live in the root `README.md` only. Agent instructions live only under the root `.ai/`.

### Extension

```text
src/cursor/      Hook providers, config merge, event spool
src/pet/         Pet discovery, loading, and state
src/webview/     Panel HTML, backgrounds, sizes, host↔webview messages
src/extension.ts Activation and commands
scripts/extension-hook.cjs Copied from root hooks/ at compile (shipped in the VSIX)
scripts/deploy.mjs            Local VSIX install (not packaged)
test/            Vitest, one file per unit
```

TypeScript is `tsc --noEmit` (ES2025, NodeNext) and esbuild from `src/extension.ts` to `dist/extension.js` (`target: node24`). `vscode` stays external. `.vscodeignore` keeps source, tests, sourcemaps, and `scripts/deploy.mjs` out of the VSIX.

### Hooks

```text
definitions.json          Event aliases, transitions, and provider event lists
src/index.ts              Shared parser, state tracker, and JSON merge/remove helpers
hook.template.cjs         Dependency-free hook template
extension-hook.cjs        Generated persistent extension entrypoint
require('./terminal-hook.cjs') terminal-hook js` as session-only entry point
scripts/generate-hook.mjs Regenerates both hooks and the Claude plugin definition
test/                     Shared protocol and script tests
```

### Terminal

```text
dist/main.js             renderer bin (esbuild, node shebang)
src/wrap.ts              wraps codex/claude; probe; start daemon
src/main.ts              run / probe / check / pane / wrap / install
src/daemon.ts src/events.ts src/terminal.ts src/posix.ts
src/hosts.ts src/sprites.ts src/tmuxpane.ts src/install.ts
src/backends/kitty.ts src/backends/blocks.ts
claude-plugin/            Inert session plugin passed only through --plugin-dir
test/*.test.ts           synthetic sheets; do not open a real terminal
scripts/visual-konsole.mjs
```

Runtime paths are XDG: extension events under `~/.local/state/llm-pets/extension-events/<provider>/`; terminal events under `$XDG_RUNTIME_DIR/llm-pets-UID/session-*/events/`; locks under `~/.local/state/llm-pets/runtime/`; probe cache and frames under `~/.cache/llm-pets/`. Sprites are not shipped.

## Naming

- Repo: `llm-pets`
- Product folders / pnpm names: `llm-pets-extension`, `llm-pets-cli`, `llm-pets-terminal`. Root `hooks/` is plain shared infrastructure.
- VS Code publisher: `llm-pets-code-extension`
- Public extension surface: `pet.*`
- Terminal command: `llm-pet` (singular). Repo CLI: `llm-pets` (plural)
- Pet states: `idle`, `running`, `waiting`, `review`, `failed`
- TypeScript imports use `.js` extensions (NodeNext)
- Hook provider ids: `cursor`, `codex`, `claude`. Integration modes: `manual`, `hooks`
- Cursor hook events are camelCase; Codex and Claude are PascalCase. Both hooks canonicalize them to PascalCase in version 2 events with a required provider field.

## Testing

```sh
pnpm test
pnpm test:extension
pnpm test:terminal
pnpm test:terminal:visual
pnpm test:cli
pnpm check
```

Hook tests: `hooks/test/`. Extension tests: `packages/llm-pets-extension/test/`. Terminal tests: `packages/llm-pets-terminal/test/` (synthetic sheets, no real tty). Headless tests are not enough for the renderer: Konsole ± tmux is required. CLI tests: `packages/llm-pets-cli/test/`, no network.

When changing one product, run that product’s suite. Run `pnpm test` before claiming the monorepo is healthy.

## Git

Implement on a branch, then merge into `main`. Do not commit or push work directly to `main`.

Prefer short, imperative messages that say why. Do not add AI attribution, `Co-Authored-By` trailers, or `Generated with` lines. Do not commit unless the user asks. Preserve upstream license and attribution (yutat23 and Wes Sitzes in the extension `LICENSE`).
