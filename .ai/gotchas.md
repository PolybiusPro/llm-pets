# Gotchas

Traps that look like bugs if you violate them. Prefer facts from commit
messages, comments, and docs over speculation.

## VS Code id is publisher plus name

The pnpm package name is `llm-pets-extension` (same as the folder).
`--filter llm-pets-extension` is the one that works. The VS Code publisher is
still `llm-pets-code-extension`, so the extension id is
`llm-pets-code-extension.llm-pets-extension`. Commands, settings, and views
are `pet.*`.

## Terminal is a renderer, not a second CLI

`llm-pets-terminal` builds with esbuild to `dist/main.js`. Install links
`~/.local/bin/llm-pet` to that file. The CLI installs it by compiling, then
`node dist/main.js install`. Do not import renderer modules from the CLI.
Do not fold the renderer into the CLI package.

## Overlay vs probe

The daemon opens the agent pts `O_WRONLY | O_NOCTTY` and never reads it.
`llm-pet probe` is the only stdin reader; `llm-pet wrap` runs it before
the agent starts. Size is ioctl on the write fd, not
`process.stdout.columns`. Spawn the renderer detached (`stdio: "ignore"`,
`unref`). Do not background it with bash `&`.

## `llm-pets` vs `llm-pet`

`llm-pets` (plural) is the repo CLI. `llm-pet` (singular) is the terminal
daemon. Do not give them the same bin name.

## Pets live in `~/.pets`, then Codex

New downloads go to `~/.pets/<slug>/`. Viewers search that directory first.
Codex home is fallback so existing Dude installs still work.
`pet.petDirectory` and `$LLM_PETS_PET_DIR` still override. Do not
invent `~/.cursor/pets`. Do not modify `~/.codex/pets` from this tooling
unless the user asks to edit a pet.

## Extension and terminal hooks are deliberately separate

The extension installs `extension-hook.cjs` persistently and writes provider
subdirectories below `~/.local/state/llm-pets/extension-events/`.
`LLM_PETS_EXTENSION_EVENT_DIR` overrides that root; `CURSOR_PET_EVENT_DIR` is
deprecated extension-only compatibility. The wrapper injects
`terminal-hook.cjs` for one Codex or Claude invocation and reserves
`LLM_PETS_EVENT_DIR` for its private runtime spool. Neither hook starts a
renderer.

## Hook JSON is merged, never replaced

Extension install and uninstall rewrite only extension-managed command
entries. Cursor uses a flat hook entry; Codex and Claude use nested entries.
Claude's `settings.json` does not get a schema `version` field. Hooks mode
reconciles all available providers independently; VS Code-compatible hosts
never touch Cursor configuration. Provider selection changes only the
The receiver ensures that terminal wrapping does not persist active hook registrations.
Both scripts are fail-open and dependency-free, leaving every unrelated hook untouched.

## Cursor has no waiting hook

`permissionRequest` maps to `waiting`, but Cursor’s installed event list
does not include a permission hook. Waiting animations come from Codex or
Claude.

## Valid extension events are immutable until retention

Files that are older than five minutes and contain invalid JSON are deleted, while valid files are retained.
remain so multiple extension windows can observe them; receivers use an
Events outside an open workspace root are ignored.

## Sprite sheets cannot escape the pet folder

`spritesheetPath` is resolved inside the pet directory. Paths that walk `..`
are rejected. Look-direction cells exist only for sprite version 2 with the
default 8×11 layout.

## Versions live in the catalog

`pnpm-workspace.yaml` `catalog:` is the version source. Package manifests
use `"typescript": "catalog:"`. `catalogMode: prefer` means `pnpm add`
writes new deps into the catalog. Exception: `@types/vscode` in the
extension must be a real semver range. vsce parses that field and rejects
`catalog:`.

## `nodeLinker: hoisted`

So vsce and the extension host see a classic `node_modules` layout. pnpm 11
does not read `node-linker` from `.npmrc`.

## pnpm ignores dependency build scripts until allowlisted

`esbuild` / `@vscode/vsce-sign` / `keytar` / `sharp` / `koffi` need
`allowBuilds: true`. A failed keytar build is not a failed extension test.

## SGR reset before ECH

`clearSequence()` must lead with an SGR reset. ECH uses the current
background colour; without the reset, the agent’s colours show through
transparent pixels.

## Delete the previous kitty placement

Placements stack. Delete with lowercase `a=d,d=a`. Transmit frames lazily.
Every `_G` command includes `q=2`.

## Sixel cannot animate transparency here

In Konsole a Sixel over a Sixel fills untouched pixels with black. Do not
reintroduce it.

## Hosts are process names, not paths

`hosts.ts` reads `/proc/<pid>/stat`. Claude Code’s basename is a version
number. Matching on the path fails to find Claude, and the daemon exits
after startup grace.

## The wrapper owns terminal setup and cleanup

`llm-pet wrap` skips non-TTY invocations, `sixel|foot|mlterm`, Claude
The `--bare`/`--safe-mode` flags, along with explicit Codex hook-disable overrides, can be used inside.
tmux it starts `pane --ensure` with the session event path; outside tmux it
The agent exits, the wrapper closes the overlay child handle.
The tmux pet remains a dedicated pane after the renderer removes the spool.
drawn with `src/backends/blocks.ts`.

## Adding a terminal event fails quietly

There is one table: `hooks/definitions.json`. It owns aliases,
The system must regenerate canonical transitions, settle timing, and provider event lists.
both entrypoints and the Claude plugin definition after changing it; the root
The check fails if a generated asset has become outdated.

## Cell size is a guess

`CELL_WIDTH_PX` and `CELL_HEIGHT_PX` cannot be queried without a tty reply.
`region()` returns `undefined` when the terminal is too small. The blocks
backend shrinks to `MINIMUM_CELL_ROWS` (nine) before giving up.

## Sprite encodings and v2 rows

`"frames": [56, 57]` and `"row": 7, "startColumn": 0, "frameCount": 6` both
normalise to indices. `Animation.indexAt` returns the clip step. Load sheets
with `PetSpriteSheet.load()`. Do not infer v1 just because height is
divisible by 9. Bump `CACHE_VERSION` when kitty rendering changes.
`configuredPetId()` reads `[tui].pet` from Codex `config.toml`.

## Snapshot, not a git merge

This repo copied working trees. Do not write back to the original repos.
esbuild leaves `sharp` and `koffi` external so native bindings stay on disk.
