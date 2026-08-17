import * as vscode from 'vscode';
import { HermesConfig } from './config';
import { HermesServer } from './server';
import { getChatHtml } from './chatHtml';

export class ChatPanel {
    private panel: vscode.WebviewPanel | null = null;
    private currentSessionId: string | null = null;
    private currentFile: string | null = null;
    private currentCwd: string | null = null;

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

        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(
            (msg) => this.handleMessage(msg),
            undefined,
            this.context.subscriptions
        );

        this.panel.onDidDispose(() => {
            this.panel = null;
        });

        // Send initial context
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

    private async handleMessage(msg: any): Promise<void> {
        switch (msg.type) {
            case 'ensureServer':
                await this.ensureServer();
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

    private serverReady = false;

    private async ensureServer(): Promise<void> {
        if (this.serverReady) {
            this.postMessage({ type: 'serverReady', wsUrl: this.server.wsUrlWithToken });
            return;
        }

        const healthy = await this.server.checkHealth();
        if (healthy) {
            // Server already running — try to discover token
            await this.server.discoverToken();
            // If we can't find the token (macOS doesn't show env in ps),
            // restart the server with our own token
            if (!this.server.token) {
                // Test if the server accepts connections without a token
                const ok = await this.server.testNoTokenWs();
                if (!ok) {
                    // Kill and restart with our token
                    await this.server.killExistingServer();
                    const started = await this.server.start();
                    if (!started) {
                        this.postMessage({ type: 'serverError', error: 'Failed to restart Hermes server with auth token.' });
                        return;
                    }
                }
            }
        } else if (this.config.autoStartServer) {
            const started = await this.server.start();
            if (!started) {
                this.postMessage({ type: 'serverError', error: 'Failed to start Hermes server. Is hermes installed?' });
                return;
            }
        } else {
            this.postMessage({ type: 'serverError', error: 'Hermes server is not running. Enable auto-start or run \'hermes serve\' manually.' });
            return;
        }

        this.serverReady = true;
        this.postMessage({ type: 'serverReady', wsUrl: this.server.wsUrlWithToken });
    }

    private async createSession(cwd?: string, profile?: string, model?: string): Promise<void> {
        // The webview's JS will handle this via WebSocket directly
        // But we provide the workspace context here
        const sessionCwd = cwd || (this.config.includeWorkspaceContext ? this.getWorkspaceRoot() : undefined);
        this.postMessage({
            type: 'sessionContext',
            cwd: sessionCwd,
            file: this.config.includeFileContext ? this.currentFile : null,
            defaultProfile: this.config.defaultProfile,
        });
    }

    private async sendMessage(text: string, sessionId: string): Promise<void> {
        // Inject file context if enabled
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