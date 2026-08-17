import * as vscode from 'vscode';
import { HermesConfig } from './config';
import { HermesServer } from './server';
import { getChatHtml } from './chatHtml';
import * as ws from 'ws';

export class ChatPanel {
    private panel: vscode.WebviewPanel | null = null;
    private currentSessionId: string | null = null;
    private currentFile: string | null = null;
    private currentCwd: string | null = null;
    private ws: ws.WebSocket | null = null;
    private serverReady = false;
    private rpcId = 0;
    private pendingRpc: Map<number, { resolve: (r: any) => void; reject: (e: any) => void }> = new Map();

    constructor(
        private context: vscode.ExtensionContext,
        private config: HermesConfig,
        private server: HermesServer
    ) {}

    show(): void {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Active);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'hermes.chat',
            'Hermes Chat',
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [],
            }
        );

        this.panel.webview.html = getChatHtml();

        this.panel.webview.onDidReceiveMessage(
            (msg) => this.handleMessage(msg),
            undefined,
            this.context.subscriptions
        );

        this.panel.onDidDispose(() => {
            this.panel = null;
            this.disconnectWs();
        });

        this.updateContext();
    }

    newSession(): void {
        this.currentSessionId = null;
        if (this.panel) {
            this.panel.webview.postMessage({ type: 'newSession' });
        }
    }

    resumeSession(sessionId: string, storedId?: string): void {
        this.currentSessionId = sessionId;
        if (this.panel) {
            this.panel.webview.postMessage({ type: 'resumeSessionAck', sessionId, storedId });
        }
    }

    chatAboutFile(filePath: string): void {
        this.currentFile = filePath;
        if (this.panel) {
            this.panel.webview.postMessage({
                type: 'contextUpdate',
                file: filePath,
                cwd: this.getWorkspaceRoot(),
            });
        }
    }

    updateContext(): void {
        const editor = vscode.window.activeTextEditor;
        this.currentFile = editor ? editor.document.uri.fsPath : null;
        this.currentCwd = this.getWorkspaceRoot();
        if (this.panel) {
            this.panel.webview.postMessage({
                type: 'contextUpdate',
                file: this.currentFile,
                cwd: this.currentCwd,
            });
        }
    }

    private getWorkspaceRoot(): string {
        return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ||
               process.env.HOME || process.env.USERPROFILE || '';
    }

    // ── WebSocket relay (extension host → webview) ──

    private connectWs(): void {
        if (this.ws && this.ws.readyState === ws.OPEN) return;

        const url = this.server.wsUrlWithToken;
        console.log('[Hermes] Extension host connecting WS to:', url);
        this.ws = new ws.WebSocket(url);

        this.ws.on('open', () => {
            console.log('[Hermes] WS connected');
        });

        this.ws.on('message', (data: string) => {
            try {
                const msg = JSON.parse(data);
                // Check if it's an RPC response
                if (msg.id && this.pendingRpc.has(msg.id)) {
                    const cb = this.pendingRpc.get(msg.id)!;
                    this.pendingRpc.delete(msg.id);
                    if (msg.error) {
                        cb.reject(msg.error);
                    } else {
                        cb.resolve(msg.result);
                    }
                    return;
                }
                // Forward all events to the webview
                this.postMessage({ type: 'wsEvent', data: msg });
            } catch (e) {
                console.error('[Hermes] WS parse error:', e);
            }
        });

        this.ws.on('error', (err) => {
            console.error('[Hermes] WS error:', err.message || err);
            this.postMessage({ type: 'wsError', error: err.message || 'WebSocket error' });
        });

        this.ws.on('close', (code, reason) => {
            console.log('[Hermes] WS closed:', code, reason);
            this.postMessage({ type: 'wsClosed', code, reason: reason?.toString() });
            // Auto-reconnect after 3s
            setTimeout(() => {
                if (this.panel && this.serverReady) {
                    this.connectWs();
                }
            }, 3000);
        });
    }

    private disconnectWs(): void {
        if (this.ws) {
            this.ws.removeAllListeners();
            this.ws.close();
            this.ws = null;
        }
    }

    private sendRpc(method: string, params: any): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== ws.OPEN) {
                reject(new Error('WebSocket not connected'));
                return;
            }
            const id = ++this.rpcId;
            const msg = { jsonrpc: '2.0', id, method, params };
            this.pendingRpc.set(id, { resolve, reject });
            this.ws.send(JSON.stringify(msg));
        });
    }

    // ── Message handling ──

    private async handleMessage(msg: any): Promise<void> {
        switch (msg.type) {
            case 'ensureServer':
                await this.ensureServer();
                break;
            case 'wsSendRpc':
                // Webview wants to send an RPC — relay through our WS
                try {
                    const result = await this.sendRpc(msg.method, msg.params);
                    this.postMessage({ type: 'wsRpcResult', id: msg.id, result });
                } catch (err: any) {
                    this.postMessage({ type: 'wsRpcResult', id: msg.id, error: err.message || String(err) });
                }
                break;
            case 'createSession':
                await this.createSession(msg.cwd, msg.profile, msg.model);
                break;
            case 'sendMessage':
                await this.sendMessage(msg.text, msg.sessionId);
                break;
            case 'resumeSession':
                await this.resumeSession(msg.sessionId);
                break;
            case 'slashCommand':
                await this.slashCommand(msg.command, msg.sessionId);
                break;
            case 'interrupt':
                await this.interrupt(msg.sessionId);
                break;
            case 'getSessions':
                await this.sendSessionList();
                break;
            case 'getProfiles':
                await this.sendProfileList();
                break;
            case 'openFile':
                if (msg.path) {
                    const uri = vscode.Uri.file(msg.path);
                    await vscode.window.showTextDocument(uri, { preview: false });
                }
                break;
        }
    }

    private async ensureServer(): Promise<void> {
        if (this.serverReady && this.server.token) {
            this.connectWs();
            this.postMessage({ type: 'serverReady' });
            return;
        }

        try {
            const ok = await this.server.ensureRunning();
            if (!ok) {
                this.postMessage({ type: 'serverError', error: 'Failed to start Hermes server. Make sure "hermes" is installed and in PATH.' });
                return;
            }
            this.serverReady = true;
            this.connectWs();
            // Wait for WS to connect, then notify
            setTimeout(() => {
                this.postMessage({ type: 'serverReady' });
            }, 1000);
        } catch (err) {
            console.error('[Hermes] ensureServer error:', err);
            this.postMessage({ type: 'serverError', error: `Hermes server error: ${err}` });
        }
    }

    private async createSession(cwd?: string, profile?: string, model?: string): Promise<void> {
        const sessionCwd = cwd || (this.config.includeWorkspaceContext ? this.getWorkspaceRoot() : undefined);
        this.postMessage({
            type: 'sessionContext',
            cwd: sessionCwd,
            file: this.config.includeFileContext ? this.currentFile : null,
            defaultProfile: this.config.defaultProfile,
        });
    }

    private async sendMessage(text: string, sessionId: string): Promise<void> {
        let finalText = text;
        if (this.config.includeFileContext && this.currentFile && !text.startsWith('/')) {
            const fileName = this.currentFile.split('/').pop() || this.currentFile;
            finalText = `[Context: editing ${this.currentFile}]\n\n${text}`;
        }
        this.postMessage({ type: 'sendMessageAck', text: finalText, originalText: text });
    }

    private async slashCommand(command: string, sessionId: string): Promise<void> {
        this.postMessage({ type: 'slashCommandAck', command, sessionId });
    }

    private async interrupt(sessionId: string): Promise<void> {
        this.postMessage({ type: 'interruptAck', sessionId });
    }

    private async sendSessionList(): Promise<void> {
        const sessions = await this.server.listSessions(this.config.sessionLimit);
        this.postMessage({ type: 'sessionList', sessions });
    }

    private async sendProfileList(): Promise<void> {
        const profiles = await this.server.listProfiles();
        this.postMessage({ type: 'profileList', profiles });
    }

    private postMessage(msg: any): void {
        this.panel?.webview.postMessage(msg);
    }
}