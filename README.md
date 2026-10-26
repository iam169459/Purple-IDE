# Purple IDE

A modern, lightweight code editor for the desktop — Electron + React + TypeScript + Vite, with a Monaco editor, integrated terminal, AI chat/agents, and Git source control.

## Features

- Monaco-powered editor: syntax highlighting, find/replace, folding, multi-cursor
- File explorer, global search, quick open (`Cmd/Ctrl+P`), command palette
- Integrated terminal (xterm + node-pty) and code runner
- AI chat and multi-agent workflows with configurable providers (including free/local endpoints)
- Four themes: Purple Dark, Dark Modern, Light Modern, High Contrast

## Development

```bash
npm install
npm run start        # build + launch the desktop app
npm run build        # build renderer and main process only
npm run dist         # package installers for the current platform
```

Requires Node.js 20+.

## Releasing updates

Installed builds check this repository's GitHub Releases for updates (Help → Check for Updates…, plus a check on launch).

1. Bump `version` in `package.json`.
2. Publish a release with a token that can write to this repo:

```bash
GH_TOKEN=<your-token> npm run dist -- --publish always
```

The target repository is configured in `package.json` under `build.publish`, and can be overridden with `PURPLE_UPDATE_REPO="owner/repo"`.

## License

MIT
