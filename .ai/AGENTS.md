# llm-pets

Monorepo for LLM Pets. A Cursor/VS Code extension and Linux terminal renderer share the root `hooks/` protocol module; the CLI orchestrates installs. Pets stay on disk under `~/.pets` (then Codex home). They are never bundled here.

## Commands

```sh
pnpm install
pnpm test
pnpm test:extension
pnpm test:terminal
pnpm test:terminal:visual
pnpm test:cli
pnpm check
pnpm compile
pnpm llm-pets --help
pnpm llm-pets get <slug>
pnpm llm-pets install extension
pnpm llm-pets install terminal
```

Package manager is **pnpm** (`devEngines.packageManager`: pnpm `11.22.0`). Use pnpm, not npm or yarn. Shared dependency versions live in `pnpm-workspace.yaml` `catalog:`. Runtime is Node.js 24+. TypeScript `target` / `lib` is ES2025; esbuild `target` is `node24`.

Renderer after install:

```sh
llm-pet check
llm-pet probe
llm-pet run --tty /dev/pts/N [--backend kitty|blocks]
llm-pet pane
llm-pet wrap codex
```

## Agent context

Standing rules live here. Load the rest on demand:

- [architecture.md](architecture.md) — how the pieces fit
- [conventions.md](conventions.md) — naming, layout, testing
- [gotchas.md](gotchas.md) — traps that look like bugs
- [skills/](skills/) — project skills (`*/SKILL.md`)

## Rules

- Do not invent a shared pet-format package unless the user asks. Hook protocol code belongs in the plain root `hooks/` folder; the products remain independently buildable and otherwise do not import each other. The CLI may spawn `node dist/main.js install`; that is not an import.
- Do not modify `/mnt/x-drive/Code/llm-pets-code-extension` or `/mnt/x-drive/Code/linux-llm-pets` from this repo’s tooling. Work stays in `llm-pets`.
- Keep the extension’s public command, setting, and view ids in the `pet.*` namespace. The pnpm package name is `llm-pets-extension`. The VS Code publisher stays `llm-pets-code-extension`.
- The repo CLI bin is `llm-pets` (plural). The terminal daemon is `llm-pet` (singular). Do not merge those names.
- The terminal package is the renderer, not a second CLI. Overlay opens the agent pts `O_WRONLY | O_NOCTTY`. Never read that tty. Probe is the only stdin reader (`llm-pet wrap` / `llm-pet probe` before the agent starts). Every kitty graphics command carries `q=2`. Do not reintroduce Sixel.
- Inside tmux, the pet is a dedicated pane (`pane --ensure` / `pane --watch`) drawn with half-blocks. Do not remove `src/backends/blocks.ts`. Auto-select does not overlay the agent’s tmux pane.
- Match terminal hosts on the process *name* from `/proc/<pid>/stat`, never the executable path. Claude Code’s basename is a version number.
- Add hook aliases, transitions, provider event lists, priorities, and settle timing only in `hooks/definitions.json` or its shared state tracker. Run the hooks compile step to regenerate `hook.cjs`.
- Extension hooks are fail-open: write an event file and exit 0. Merge into the selected agent’s user hook file; never overwrite the file. Installing one provider removes this extension’s handlers from the other two. The hook script and event spool are shared with the terminal (`~/.local/share/llm-pets/hook.cjs`, `~/.local/state/llm-pets/events/`).
- Pets: `~/.pets` first, then Codex home. Do not invent `~/.cursor/pets`. Do not modify files under `~/.codex/pets` unless the user asks to edit a pet.
- Keep the package ESM at the workspace root (`"type": "module"`). Extension host code is still bundled as CJS by esbuild (`format: "cjs"`) because VS Code’s extension entry is CommonJS.
- Use pnpm for Node installs and scripts. Mixing npm/yarn would fork the lockfile.
- Do not add root `AGENTS.md` or `CLAUDE.md`. Agent instructions stay under `.ai/`.
- Headless Vitest is not enough for the renderer. Confirm Konsole ± tmux (`pnpm test:terminal:visual`).
- Do not commit unless the user asks. Do not commit or push implementation work directly to `main`. Create a branch, implement there, then merge into `main`.
- Do not add AI attribution, `Co-Authored-By` trailers, or `Generated with` lines. Preserve upstream license and attribution.
