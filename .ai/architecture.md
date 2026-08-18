# Architecture

`llm-pets` is a private pnpm workspace with three product packages and a plain root hooks module. The extension and terminal import the shared hook protocol; the CLI downloads pets and installs the two renderers.

```text
packages/llm-pets-extension  →  Cursor / VS Code webview panel
packages/llm-pets-terminal   →  per-tty TypeScript daemon drawing into /dev/pts/N
packages/llm-pets-cli        →  llm-pets get / install
hooks/                       ->  hook protocol, provider definitions, generated extension/terminal hooks
```

## Workspace

Root `package.json` is private and owns the shared TypeScript, Node types, and Vitest toolchain. Child tsconfigs extend the root configuration. `pnpm-workspace.yaml` lists `packages/*`, a dependency catalog, `nodeLinker: hoisted` (so vsce and the extension host see a classic `node_modules`), and `allowBuilds` for `esbuild`, `@vscode/vsce-sign`, `keytar`, `sharp`, and `koffi`. Root scripts generate and test the plain `hooks/` folder.

Pets are never bundled. Search `~/.pets` first, then Codex `pets/`. The CLI (`llm-pets get`) is what writes into `~/.pets`. Do not invent `~/.cursor/pets`.

The two renderers do not exchange data in-process and do not share a spool. The extension consumes persistent provider-tagged events; each wrapped terminal session consumes a private runtime directory.

## Hooks

The root `hooks/` module owns the version 2 event contract, aliases, canonical transitions, provider event lists, JSON merge/remove utilities, state priority, settle timing, and fail-open hook template. `definitions.json` is the data source; `scripts/generate-hook.mjs` generates dependency-free `extension-hook.cjs`, `terminal-hook.cjs`, and the Claude terminal plugin hook definition.

## Extension

VS Code-compatible Cursor extension. Fork of Pet Viewer for Codex 0.7.1. pnpm name `llm-pets-extension`; publisher `llm-pets-code-extension`. Codex App Server is not used.

- **`src/extension.ts`** — activation, commands, settings, status bar. Owns selected-pet global state and hook install/uninstall.
- **`src/pet/`** — resolve `~/.pets` then Codex home, load `pet.json` plus sprite sheets, watch for changes, state machine. No Cursor-specific logic.
- **`src/webview/`** — PET panel and preview. `getWebviewHtml.ts` inlines the renderer. `messages.ts` is the only host↔webview contract.
- **`src/cursor/`** — hook provider targets, merge/remove of hook JSON, event-spool watcher, session aggregation.

When `pet.integrationMode` is `hooks`, `HookReconciler` installs `~/.local/share/llm-pets/extension-hook.cjs` and merges provider-tagged commands into every available provider. Cursor hosts may configure Cursor, Codex, and Claude; VS Code-compatible hosts never inspect or modify Cursor hooks. Provider failures are isolated. `HookEventReceiver` watches only `~/.local/state/llm-pets/extension-events/<selected-provider>/*.json`; changing `pet.hookProvider` restarts the receiver without configuration writes. Valid in-workspace files remain for other extension windows, and each receiver tracks seen paths in memory.

## Terminal

`llm-pet wrap` creates a private mode-0700 runtime spool, injects the terminal hook only for that invocation, and starts the renderer with the same path. Codex receives command-line hook configuration and the trust-bypass flag; Claude receives the packaged plugin through `--plugin-dir`.

```
agent hook -> hooks/terminal-hook.cjs -> $XDG_RUNTIME_DIR/llm-pets-UID/session-*/events/*.json
                                          |
                    src/daemon.ts      <--+
                             |
                    backends/{kitty,blocks}.ts -> /dev/pts/N
```

- **`src/wrap.ts`** - creates session hooks/spool, starts the renderer before the agent, and owns renderer/spool cleanup. Install writes `~/.bashrc.d/llm-pets.sh` that calls `llm-pet wrap`.
- **`src/daemon.ts`** — loop, lock, lifecycle. Overlay open is `O_WRONLY | O_NOCTTY`. Must never call `probeKittyGraphics`.
- **`src/events.ts`** — filters spool files by tty/cwd and delegates canonical event state to the root `hooks/index.ts`. Failed and review states settle to idle; `SessionEnd` briefly shows review.
- **`src/backends/kitty.ts`** — kitty graphics, real alpha. Overlay outside tmux.
- **`src/backends/blocks.ts`** — half-block cells. Dedicated tmux pane. Do not remove this file.
- **`src/tmuxpane.ts`**, **`src/terminal.ts`**, **`src/posix.ts`** (koffi `flock` / `TIOCGWINSZ`), **`src/hosts.ts`**, **`src/sprites.ts`** (sharp; `indexAt` returns clip step), **`src/paths.ts`**, **`src/install.ts`**, **`src/main.ts`** (renderer argv, not a workspace CLI).

`llm-pet wrap` probes, then starts `run` or `pane --ensure` with the session event path. The wrapper owns normal cleanup; process-tree detection handles unexpected wrapper death. Wrapper skip list: `sixel|foot|mlterm`. Auto-select never overlays inside tmux.

## CLI

`llm-pets` bin. `get` downloads a pet into `~/.pets/<slug>/`. `install extension` packages the VSIX. `install terminal` compiles the renderer then runs `node dist/main.js install`. Default registry is CodexPetHub install-manifest v1.

## Constraints

- Shared hook protocol changes stay in the plain root `hooks/` folder; do not add cross-product imports elsewhere without an explicit request.
- Source repos are read-only copies. Do not write back.
- Product pnpm names match their folders. The root `hooks/` folder is not a package. Publisher remains `llm-pets-code-extension`.
- Extension commands, settings, and views are `pet.*`. Hook files are merged, never overwritten. Hook script is fail-open.
- Terminal daemon never reads the agent tty. `q=2` on every kitty command. No Sixel.
