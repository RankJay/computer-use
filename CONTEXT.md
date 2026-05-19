# Actuate domain glossary

Terms used across the agent loop, settings UI, and docs. Prefer these words in ADRs and architecture discussion.

## Agent run

A single user task from prompt submit through terminal events. One run has a `taskId`. The chat timeline is a projection of run events, not a separate log.

## Agent mode

How the session runner executes:

- **Live** — cloud model (Anthropic or OpenAI BYOK) with native tools.
- **Demo fixture** — offline scripted session (`demoAgentSession`); no API key.

Configured in Settings; wired in `sessionRunner.ts`.

## Permission mode

How often the user must approve tool calls before they run:

- `ask_risky` — prompt for risky consequence classes.
- `ask_all` — prompt for every gated tool.
- `session_low_risk` — auto-allow low-risk classes after first approval in the session.

Stored in settings; enforced in `permissionOrchestrator`.

## Permission choice

User response to a permission prompt: `allow_once`, `allow_session`, `allow_always`, or `deny`. Labels live in `toolContract.ts` (`PERMISSION_CHOICE_LABELS`).

## Consequence risk class

Blast-radius category for a tool: `observe`, `execute_local`, `ui_automation`, `mutate_workspace`. Drives permission policy. See `.ai/adr/003-permission-model.md`.

## Tool contract

Frozen registry (`TOOL_CONTRACT`, `AGENT_TOOL_NAMES`) of model-callable tools: stable ids, risk class, display names, default permission copy. UI and IPC must not invent parallel tool strings.

## Workspace root

Directory scoped for `file.read` / `file.write` and default `cwd` for `terminal.run`. Null uses app defaults; browser builds use `BROWSER_SAMPLE_WORKSPACE_ROOT` unless overridden.

## Workspace adapter

Seam for workspace file I/O: Tauri IPC on desktop, fetch against `/browser-samples` in the web build. See `.ai/adr/007-workspace-adapter-seam.md`.

## BYOK

Bring-your-own-key: Anthropic and/or OpenAI API keys stored in the OS credential store (desktop) or browser `localStorage` (web). Never sent to an Actuate server.

## Demo fixture

Offline agent script with canned steps for tours and smoke tests without cloud access.

## Session log

JSONL (and related artifacts) under app data for debugging and retention. Distinct from the in-memory timeline (`reset session` clears UI state only).
