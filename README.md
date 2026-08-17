# Hermes Agent for VS Code

A full GUI chat interface for [Hermes Agent](https://hermes-agent.nousresearch.com/) by Nous Research — right inside VS Code. This is **not** a terminal wrapper. It connects to the Hermes WebSocket JSON-RPC API (the same protocol the Hermes desktop app uses) and renders a proper chat interface with streaming, tool calls, thinking sections, and session history.

![Hermes VS Code Extension](media/icon.png)

## Features

- **Full GUI Chat** — streaming message bubbles, real-time token rendering, no terminal required
- **Workspace Context** — automatically passes your workspace directory and current file path to Hermes so it knows what you're working on
- **Session History** — sidebar showing all past sessions with proper titles, message counts, and timestamps. Click to resume any session.
- **Tool Call Cards** — tool calls appear as expandable cards showing arguments and results
- **Thinking/Reasoning** — collapsible sections for reasoning tokens
- **Slash Commands** — full support for `/yolo`, `/model`, `/reset`, `/skills`, etc.
- **Profile Switching** — switch between Hermes profiles without leaving VS Code
- **Auto Server Management** — automatically starts `hermes serve` if needed
- **Right-Click Integration** — right-click any file to "Chat About Current File"

## Requirements

- [Hermes Agent](https://hermes-agent.nousresearch.com/) installed and on your PATH
- The `hermes` CLI must be accessible from a terminal

## Installation

### From VSIX

```bash
code --install-extension hermes-agent-vscode-0.2.0.vsix
```

### From Source

```bash
git clone https://github.com/varunsahni/hermes-vscode.git
cd hermes-vscode
npm install
npm run compile
# Press F5 in VS Code to launch an Extension Development Host
```

## Usage

1. The extension auto-starts the Hermes server on port 9119 if it's not already running.
2. Open the chat panel with the command palette: `Hermes: Open Chat`
3. Start typing. The extension automatically includes:
   - Your **workspace directory** as the session's working directory
   - Your **current file path** as context in each message

### Commands

| Command | Description |
|---------|-------------|
| `Hermes: Open Chat` | Open the chat panel |
| `Hermes: New Chat` | Start a new session |
| `Hermes: Refresh Sessions` | Refresh the session list |
| `Hermes: Switch Profile` | Switch Hermes profile |
| `Hermes: Stop Server` | Stop the Hermes backend server |
| `Hermes: Chat About Current File` | Send the current file as context |

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `hermes.serverPort` | `9119` | Port for the Hermes backend |
| `hermes.serverHost` | `127.0.0.1` | Host for the Hermes backend |
| `hermes.autoStartServer` | `true` | Auto-start server if not running |
| `hermes.defaultProfile` | `""` | Default Hermes profile |
| `hermes.sessionLimit` | `50` | Max sessions in sidebar |
| `hermes.includeFileContext` | `true` | Include current file path as context |
| `hermes.includeWorkspaceContext` | `true` | Set workspace dir as session cwd |

## Architecture

The extension connects to Hermes's JSON-RPC WebSocket API at `ws://127.0.0.1:9119/api/ws`. This is the same protocol used by the Hermes desktop app and web dashboard:

```
VS Code Webview ←→ WebSocket ←→ Hermes Server (hermes serve)
                                  ↓
                              Hermes Agent (LLM + Tools)
```

Key RPC methods used:
- `session.create` — create a new chat session
- `prompt.submit` — send a user message
- `session.list` — list past sessions
- `session.resume` — resume a past session
- `slash.exec` — execute slash commands
- `session.interrupt` — interrupt a running turn

Streaming events:
- `message.start` / `message.delta` / `message.complete` — assistant text
- `thinking.delta` / `reasoning.available` — reasoning tokens
- `tool.start` / `tool.delta` / `tool.end` — tool calls
- `session.title` — auto-generated session title
- `turn.end` — turn complete

## License

MIT

## Acknowledgments

- [Hermes Agent](https://hermes-agent.nousresearch.com/) by [Nous Research](https://nousresearch.com/)
- This extension is an unofficial community contribution and is not affiliated with Nous Research (yet!)