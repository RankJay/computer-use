# Actuate

Local-first Tauri + Vite + React control center with a BYOK agent loop (Anthropic or OpenAI), native tools (shell, screen capture, workspace files, optional UI automation), OS keychain secret storage, and JSONL session logs under app data.

## Dev

Prerequisites: [Bun](https://bun.sh) and Rust stable.

```bash
bun install
bun run tauri dev   # desktop: Vite + Tauri shell
```

**Web-only UI** (no native tools, bundled sample workspace):

```bash
bun run dev         # http://localhost:1420
```

**Scripts:** `bun test src` · `bun run lint` · `bun run format`

### First run

1. Open **Settings** (`/settings`).
2. Save an **Anthropic** and/or **OpenAI** API key (OS credential store on desktop; `localStorage` in the web build).
3. Pick a model and set **Agent mode** → **Live**.
4. Set **Workspace root** on desktop for scoped file tools and a sensible `cwd` for `terminal.run`.

**Demo:** **Agent mode** → **Demo fixture** runs the offline scripted tour (no API key).

**UI automation (desktop):** enable **Pointer / UI automation** in Settings before pointer/click/type tools can run; macOS may also require Screen Recording / Accessibility permissions for capture and input.

## Architecture

- [CONTEXT.md](CONTEXT.md) — domain glossary (events, timeline, projection, permissions, workspace, etc.).
- `.ai/shape.md` — code layout conventions for agents and reviewers (when present in your checkout).
- `.ai/adr/` — architecture decision records (local only; gitignored). See `.ai/adr/README.md` when present.

Stack map: `src/app` (routes/providers) → `src/features` (screens) → `src/agent` (session, tools, permissions) → `src-tauri` (IPC). Styling uses Tailwind v4 + shadcn tokens in `src/index.css`.

## Smoke (MVP gate)

On **Windows, macOS, and Linux** (desktop build):

1. **Demo fixture** — complete a run without API keys.
2. **Live + BYOK** — submit a task that uses `workspace.inspect` and `file.read` under the configured workspace root.
3. **Permissions** — confirm a risky tool shows the permission drawer; try **Allow once** and **Deny**.
4. **Optional** — `terminal.run` and `display.capture` after approval; pointer tools only with **Pointer / UI automation** enabled.

`bun test src` should pass before release.

## Recommended IDE

[VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer) + [Tailwind CSS IntelliSense](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss)
