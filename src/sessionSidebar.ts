import * as vscode from 'vscode';
import { HermesConfig } from './config';
import { HermesServer } from './server';
import { getSessionListHtml } from './sessionListHtml';

export class SessionSidebarProvider implements vscode.WebviewViewProvider {
    private view: vscode.WebviewView | null = null;

    constructor(
        private context: vscode.ExtensionContext,
        private config: HermesConfig,
        private server: HermesServer
    ) {}

    resolveWebviewView(view: vscode.WebviewView): void {
        this.view = view;
        view.webview.options = { enableScripts: true };
        view.webview.html = getSessionListHtml();

        view.webview.onDidReceiveMessage(
            (msg) => this.handleMessage(msg),
            undefined,
            this.context.subscriptions
        );
    }

    refresh(): void {
        if (this.view) {
            this.view.webview.html = getSessionListHtml();
            this.view.webview.postMessage({ type: 'refresh' });
        }
    }

    private async handleMessage(msg: any): Promise<void> {
        switch (msg.type) {
            case 'loadSessions':
                await this.loadSessions();
                break;
            case 'newChat':
                vscode.commands.executeCommand('hermes.newChat');
                break;
            case 'resumeSession':
                vscode.commands.executeCommand('hermes.openChat');
                // Forward to chat panel via command
                vscode.commands.executeCommand('hermes.resumeSession', msg.sessionId, msg.storedId);
                break;
        }
    }

    private async loadSessions(): Promise<void> {
        const sessions = await this.server.listSessions(this.config.sessionLimit);
        this.view?.webview.postMessage({ type: 'sessionList', sessions });
    }
}