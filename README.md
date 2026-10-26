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

## Installers

Every tagged release is built by GitHub Actions on macOS, Windows and Linux:

| Platform | Files |
| --- | --- |
| macOS (Intel + Apple Silicon) | `.dmg` installer, `.zip` (update payload) |
| Windows x64 | NSIS setup `.exe`, portable `.exe` |
| Linux x64 | `.AppImage`, `.deb` |

Unsigned builds: macOS may require right-click → Open on first launch, and Windows shows a SmartScreen prompt.

## Releasing an update

The git tag is the single source of truth for the version. `package.json` is the only place a version is written; the release manifest is generated from it at build time.

1. Adjust release policy in `update-policy.json` if needed (`critical`, `minimumVersion`, `notes`). It deliberately contains no version.
2. Cut the release and push the tag:

```bash
npm version patch        # or minor / major
git push --follow-tags
```

3. CI builds all installers, generates `version.json`, and publishes the GitHub release for `v<version>`.

`version.json` is served from the newest release (`releases/latest/download/version.json`) so the policy a client reads always belongs to a real, downloadable release. A tag that disagrees with `package.json` fails the release job.

### Update behavior

Installed builds check for updates on launch and from **Help → Check for Updates…**.

- **Normal update:** a dialog offers **Install Now** or **Later**; choosing Later installs it when the app quits.
- **Critical update** (`critical: true` in `update-policy.json`, or a running version below `minimumVersion`): no prompt. It installs silently once no editor has unsaved changes (5-second grace period), or when the app quits otherwise.

Silent updates on macOS require a signed and notarized build; unsigned builds can download but may be blocked from applying.

The target repository is configured in `package.json` under `build.publish`, and can be overridden with `PURPLE_UPDATE_REPO="owner/repo"`.

## License

MIT
