# Actuate

Local-first Tauri + Vite + React control center with an Anthropic (BYOK) agent loop, native tools (shell, screen, workspace files, optional UI automation), OS keychain secret storage, and JSONL session logs under app data.

## Dev

- Install [Bun](https://bun.sh) and Rust stable.
- `bun install`
- `bun run tauri dev` (starts Vite + desktop shell).

**BYOK:** open Settings → save Anthropic API key (stored in the OS credential store). Choose **Live** agent mode. Set **Workspace root** for scoped file tools and sensible `cwd` for shell.

**Demo:** Settings → Agent mode → **Demo fixture** runs the offline scripted tour (no API key).

## Architecture

- [CONTEXT.md](CONTEXT.md) — domain glossary (agent run, permission mode, workspace root, etc.).
- `.ai/adr/` — architecture decision records (local only; directory is gitignored). See `.ai/adr/README.md` when present.

UI uses typed Actuate design tokens in `src/index.css` (`@theme --color-actuate-*`) and `src/features/theme/actuateTheme.ts`. Install the [Tailwind CSS IntelliSense](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss) extension for `className` autocomplete.

## Smoke (MVP gate)

Run the checklist in `to-do.md` § *Smoke checklist* on Windows, macOS, and Linux. Pointer/keyboard tools require **Allow pointer / click / type** in Settings and appropriate OS permissions.

## Recommended IDE

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
