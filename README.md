# Hermes Agent for VS Code

A first-class VS Code extension for [Hermes Agent](https://github.com/NousResearch/hermes-agent) by Nous Research.

## What it does

This extension wraps the **full Hermes TUI** inside VS Code, giving you the complete Hermes experience — every slash command, mode, tool card, skin, and approval prompt — right in your editor, with VS Code-native affordances on top.

### Why not just use a terminal?

You can — and many people do. This extension makes it better:

- **Sidebar session history** — browse and resume past conversations without leaving VS Code
- **Multi-agent management** — start, track, and stop multiple Hermes agents from one place
- **Profile switcher** — switch between Hermes profiles from the sidebar
- **Clickable file links** — file paths in Hermes tool output are clickable and open in the editor
- **Status bar** — see active model and running agent count at a glance
- **One-click start** — no need to type `hermes --tui` every time

## Features

```
┌─ VS Code ──────────────────────────────────────────────────┐
│                                                            │
│  Activity Bar: Hermes icon                                 │
│                                                            │
│  ┌─ Sidebar ──────────────┐  ┌─ Terminal Panel ──────────┐ │
│  │                        │  │                            │ │
│  │ [+ New Agent]          │  │  ┌──────────────────────┐  │ │
│  │ [🔄 Refresh]          │  │  │  hermes --tui        │  │ │
│  │                        │  │  │                      │  │ │
│  │ 📁 Sessions            │  │  │  > /yolo             │  │ │
│  │  ├ fix-auth-bug (2h)   │  │  │  > /model            │  │ │
│  │  ├ deploy-pipeline     │  │  │  > /history          │  │ │
│  │  └ refactor-api (3d)  │  │  │  > /skills            │  │ │
│  │                        │  │  │  ...                  │  │ │
│  │ 👤 Profiles            │  │  └──────────────────────┘  │ │
│  │  ├ default ● active    │  │                            │ │
│  │  └ worker             │  │  All slash commands work    │ │
│  │                        │  │  All modes work             │ │
│  └────────────────────────┘  └────────────────────────────┘ │
│                                                            │
│  Status Bar: Hermes: 2 agents • GLM-5.2                    │
└────────────────────────────────────────────────────────────┘
```

## Requirements

- [Hermes Agent](https://github.com/NousResearch/hermes-agent) installed and on your PATH
- VS Code 1.85+

## Installation

### From VSIX (manual)

```bash
code --install-extension hermes-agent-vscode-0.1.0.vsix
```

### From source

```bash
git clone https://github.com/varunsahni/hermes-vscode.git
cd hermes-vscode
npm install
npm run compile
# Press F5 in VS Code to launch an Extension Development Host
```

## Usage

1. **Start a new agent** — click the Hermes icon in the Activity Bar, then the `+` button, or run `Hermes: New Agent` from the command palette
2. **Resume a session** — click any session in the sidebar Sessions list
3. **Switch profiles** — click the profile name in the sidebar, or run `Hermes: Switch Profile`
4. **Stop agents** — run `Hermes: Stop Active Agent` or `Hermes: Stop All Agents`

All Hermes slash commands (`/yolo`, `/model`, `/reset`, `/history`, `/skills`, etc.) work exactly as they do in the terminal.

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `hermes.executablePath` | `hermes` | Path to the hermes executable |
| `hermes.useTui` | `true` | Use the full TUI (--tui flag) |
| `hermes.defaultProfile` | `""` | Default profile for new agents |
| `hermes.autoOpenFileLinks` | `true` | Make file paths in terminal output clickable |
| `hermes.sessionLimit` | `50` | Max sessions to show in sidebar |

## How it works

This extension does **not** reimplement Hermes' chat UI. It spawns the real `hermes --tui` process inside a VS Code managed terminal, then adds VS Code-native integration layers on top:

- **Session sidebar** reads from `~/.hermes/sessions/` (via `hermes sessions list --json` or filesystem fallback)
- **Profile sidebar** reads from `~/.hermes/profiles/`
- **File link provider** uses regex patterns to detect file paths in terminal output and makes them clickable
- **Status bar** reads model info from `~/.hermes/config.yaml`

This means you get 100% of Hermes features — nothing is lost, nothing is approximated.

## License

MIT

## Contributing

PRs welcome! This is a community extension — not officially affiliated with Nous Research (yet).