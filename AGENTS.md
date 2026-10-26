# Build & Run

```bash
npm run build          # builds React + Electron (TypeScript)
npm run build:react    # Vite build only
npm run build:electron # tsc + copy preload
npm run start          # build + launch
npm run dev            # same as start
npm run generate-icons # generate app icons for all platforms
npm run pack           # package for current platform (electron-builder --dir)
npm run dist           # build distributable for current platform
```

# Supported Platforms

- **macOS**: x64 + arm64 (Apple Silicon). Uses native traffic light buttons via `titleBarStyle: 'hidden'`. Custom controls hidden.
- **Windows**: x64 via NSIS installer or portable. Paths normalized to forward slashes. Code runner uses `cmd` instead of `bash`.
- **Linux**: x64 via AppImage or deb. Same as macOS code paths.

# Key Facts

- Electron + React + TypeScript + Vite
- ESM (`"type": "module"`), frameless window on Win/Linux (`frame: false`), hidden title bar on macOS (`titleBarStyle: 'hidden'`)
- Preload must be `.cjs` (CommonJS) — Electron sandbox rejects ESM `import`
- Uses `loadFile()` not `loadURL()` — no Vite dev server
- Monaco Editor (`@monaco-editor/react`) for syntax highlighting, line numbers, find/replace, folding, multi-cursor
- Build: `tsc && cp src/main/preload.cjs dist/main/` then `vite build`
- `npm install @monaco-editor/react` was added for Monaco

# Architecture

- Main process: `src/main/index.ts` — BrowserWindow, IPC handlers, app menu
- Preload: `src/main/preload.cjs` — 18+ methods exposed via `contextBridge`
- Types: `src/renderer/electron.d.ts` — all IPC method signatures
- App: `src/renderer/App.tsx` — root component
- Editor: `src/renderer/components/Editor.tsx` — Monaco Editor wrapper
- FileExplorer: `src/renderer/components/FileExplorer.tsx` — tree view with context menu
- SearchPanel: `src/renderer/components/SearchPanel.tsx` — global search
- QuickOpen: `src/renderer/components/QuickOpen.tsx` — Ctrl+P file search
- OutputPanel: `src/renderer/components/OutputPanel.tsx` — code execution output
- SettingsPanel: `src/renderer/components/SettingsPanel.tsx` — theme + font size
- TitleBar: `src/renderer/components/TitleBar.tsx` — custom frameless title bar
- Sidebar: `src/renderer/components/Sidebar.tsx` — activity bar icons
- StatusBar: `src/renderer/components/StatusBar.tsx` — status bar
- Icons: `src/renderer/components/icons.tsx` — all SVG icons
- Styles: `src/renderer/styles/app.css` — VSCode Dark+/Light+ themed (~900 lines)

# Theme Support

- Dark/Light mode via CSS variables (`--bg-primary`, `--text-primary`, etc.)
- Monaco 'vs-dark' / 'vs' theme follows app theme
- Sidebar stays dark in light mode (VSCode style)

# Editor Features (Monaco)

- Syntax highlighting for 40+ languages
- Line numbers, minimap, folding, bracket colorization
- Find/Replace (Ctrl+F), multiple cursors, auto-indent
- Ctrl+S saves, Ctrl+P opens Quick Open
- Real-time cursor position in status bar

# Code Runner

- Supports: .c, .cpp, .cc, .cxx, .py, .js, .ts, .go, .rs, .rb, .sh, .java
- Spawns child process with 30s timeout
- Output panel shows stdout (white), stderr (red), exit code
