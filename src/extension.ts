import * as vscode from 'vscode';
import { HermesServer } from './server';
import { ChatPanel } from './chatPanel';
import { SessionSidebarProvider } from './sessionSidebar';
import { HermesConfig } from './config';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const config = new HermesConfig();
    const server = new HermesServer(config);

    // --- Chat panel (webview) ---
    const chatPanel = new ChatPanel(context, config, server);

    // --- Session sidebar ---
    const sessionProvider = new SessionSidebarProvider(context, config, server);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('hermes.sessions', sessionProvider, {
            webviewOptions: { retainContextWhenHidden: true },
        })
    );

    // --- Commands ---
    context.subscriptions.push(
        vscode.commands.registerCommand('hermes.openChat', () => {
            chatPanel.show();
        }),

        vscode.commands.registerCommand('hermes.newChat', () => {
            chatPanel.show();
            chatPanel.newSession();
        }),

        vscode.commands.registerCommand('hermes.refreshSessions', () => {
            sessionProvider.refresh();
        }),

        vscode.commands.registerCommand('hermes.switchProfile', async () => {
            const profiles = await server.listProfiles();
            if (!profiles || profiles.length === 0) {
                vscode.window.showInformationMessage('Hermes: No profiles found.');
                return;
            }
            const items = profiles.map((p: string) => ({ label: p }));
            const chosen = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a Hermes profile',
            });
            if (chosen) {
                await config.setDefaultProfile(chosen.label);
                vscode.window.showInformationMessage(`Hermes: Profile set to "${chosen.label}"`);
            }
        }),

        vscode.commands.registerCommand('hermes.stopServer', async () => {
            await server.stop();
            vscode.window.showInformationMessage('Hermes: Server stopped.');
        }),

        vscode.commands.registerCommand('hermes.sendCurrentFile', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('Hermes: No active file to send.');
                return;
            }
            chatPanel.show();
            chatPanel.chatAboutFile(editor.document.uri.fsPath);
        }),

        vscode.commands.registerCommand('hermes.resumeSession', (sessionId: string, storedId?: string) => {
            chatPanel.show();
            chatPanel.resumeSession(sessionId, storedId);
        }),
    );

    // --- Track active editor changes for context ---
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(() => {
            chatPanel.updateContext();
        })
    );

    // --- Config change ---
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('hermes')) {
                config.reload();
            }
        })
    );

    // --- Auto-start server if needed ---
    if (config.autoStartServer) {
        try {
            await server.ensureRunning();
        } catch (err) {
            console.error('[Hermes] Failed to auto-start server:', err);
        }
    }

    // Show welcome
    const hasShown = context.globalState.get<boolean>('hermes.welcomeShown', false);
    if (!hasShown) {
        const choice = await vscode.window.showInformationMessage(
            'Hermes Agent: Extension activated. Open the chat panel to start talking to Hermes.',
            'Open Chat',
            'Dismiss'
        );
        if (choice === 'Open Chat') {
            chatPanel.show();
        }
        context.globalState.update('hermes.welcomeShown', true);
    }
}

export function deactivate(): void {}