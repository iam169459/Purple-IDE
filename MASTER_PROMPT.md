# MASTER PROMPT — Purple IDE: Full-Featured Cloud-Code/VSCode-Style Editor

You are working in `/Users/Apple/Documents/purple-IDE` (Electron + React + TypeScript + Vite, ESM, frameless window). AGENTS.md is the source of build/run truth. Do not ask clarifying questions; implement fully and verify with `npm run build`.

## Mission

Turn Purple IDE into a fully working, production-grade coding IDE that combines the best of **Cloud Code** (Claude Code style agentic coding) and **VSCode**, with:

1. All built-in tools + full **MCP (Model Context Protocol)** client support (tools, resources, prompts, sampling).
2. UI matching Cloud Code + VSCode: activity bar, sidebar panels, editor tabs, integrated terminal, output, problems, search, git, extensions, command palette, status bar, breadcrumbs, minimap.
3. Fully customizable: themes (dark/light/custom), keybindings, settings, layout (draggable panels, resizable splits), snippets, user/project settings.
4. AI agent support: autonomous multi-step agent with tool loop, planning, memory, context management, diff review, approval gates.
5. Multiple coding modes: Vibe (autonomous), Plan (plan-then-execute), Ask (read-only), Edit (single-file), Review (PR review), Debug, Test.
6. All providers & APIs: OpenAI, Anthropic, Google Gemini, Groq, DeepSeek, Mistral, Ollama, LM Studio/llama.cpp (OpenAI-compatible), Azure OpenAI, Bedrock, Vertex, custom endpoints, MCP servers.
7. Per-task AI support: each task (chat, edit, refactor, test, review, commit) can pick its own model/provider/temperature/system prompt; parallel sub-agents.

## Architecture (existing)

- Main: `src/main/index.ts` (BrowserWindow, IPC, menu)
- Preload: `src/main/preload.cjs` (contextBridge) — extend methods here + `src/renderer/electron.d.ts`
- MCP: `mcp-server/` (Express) + `window.electronAPI.mcp*`
- AI: `src/renderer/components/AIAgent.tsx` (chat + tool loop)
- Editor: Monaco in `src/renderer/components/Editor.tsx`
- Styles: `src/renderer/styles/app.css`

## Required Work

### A. Tools & MCP
- Implement MCP client in main process: connect to configured servers (stdio + SSE + HTTP), list tools/resources/prompts, call tools, subscribe to resources, handle sampling.
- Expose IPC: `mcpConnect`, `mcpDisconnect`, `mcpListServers`, `mcpListTools`, `mcpCallTool`, `mcpListResources`, `mcpReadResource`, `mcpListPrompts`, `mcpGetPrompt`.
- Tool registry combining built-in (file ops, search, run_code, git, terminal) + MCP tools; route by name.
- Tool result streaming + cancellation; per-tool timeout; error normalization.
- Add missing tools: `apply_patch`, `rename_symbol`, `format_document`, `run_tests`, `diagnostics`, `web_fetch`, `memory_*`.

### B. UI (Cloud Code + VSCode)
- Activity bar (left) with icons: Explorer, Search, Git, AI Agent, Extensions, Settings.
- Resizable panels via split panes; drag-to-reorder tabs; panel visibility toggles.
- Command palette (Ctrl/Cmd+Shift+P) with fuzzy search over commands.
- Quick Open (Ctrl+P), Go to Symbol, Go to Line.
- Integrated terminal (xterm + node-pty) multi-instance.
- Problems panel from diagnostics; Output panel channels.
- Breadcrumbs, minimap, sticky scroll, bracket pair colorization.
- Status bar: branch, language, encoding, line/col, AI status, notifications.
- Notification toasts; modal dialogs; context menus.
- Light/Dark/High-contrast themes + custom theme JSON import.

### C. Customization
- Settings store (JSON) in userData; settings UI with search; per-workspace overrides.
- Keybindings editor; user snippets; theme editor.
- Layout persistence (panel sizes, open tabs, sidebar state) to localStorage + file.
- Extension host (minimal): load VSCode-compatible extensions from folder (contribute commands, themes, languages).

### D. AI Agent
- Agent loop with planning step, tool execution, reflection, stop conditions.
- Modes: Vibe, Plan, Ask, Edit, Review, Debug, Test — each with system prompt + allowed tools + approval policy.
- Approval gates: auto-approve reads, confirm writes/destructive in non-Vibe modes.
- Diff preview with accept/reject per hunk; undo last AI change.
- Memory: project + global, vector-ish keyword search; auto-capture summaries.
- Context: active file, selection, open tabs, git diff, diagnostics, terminal output; token budget with pruning.

### E. Providers & APIs
- Unified provider interface: chat, stream, embeddings, models list.
- Providers: OpenAI, Anthropic (Messages API), Google (Gemini), Groq, DeepSeek, Mistral, Ollama, OpenAI-compatible (LM Studio/llama.cpp/vLLM), Azure OpenAI, AWS Bedrock, GCP Vertex, custom.
- API key management: secure storage via OS keychain (electron safeStorage); per-provider config.
- Model picker with capability tags (vision, tools, reasoning) and context window.
- Retry/backoff, rate limiting, error surfacing.

### F. Per-Task AI
- Task runner: define task (prompt, mode, model, provider, temperature, tools, files) → run in background with progress + cancellation.
- Parallel tasks with isolated context; results aggregated.
- Per-task token/cost tracking; history.

## Verification

- `npm run build` must pass (tsc + vite).
- `npm run dev` launches; smoke test: open folder, edit file, run code, chat with tool call, MCP tool call, theme switch.
- No console errors in renderer/main.

## Constraints

- Keep ESM; preload must stay `.cjs`.
- Use existing libs where present (monaco, xterm, node-pty, js-tiktoken); add deps only when needed.
- Never commit secrets; store keys via safeStorage.
- Minimal comments; match existing code style.

## Deliverable

Implement incrementally: A → B → C → D → E → F. After each section, run build and fix errors before proceeding. Report final status with changed files.