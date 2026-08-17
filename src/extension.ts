import * as vscode from 'vscode';
import { HermesTerminalManager } from './terminalManager';
import { SessionProvider } from './sessionProvider';
import { ProfileProvider } from './profileProvider';
import { StatusBarManager } from './statusBar';
import { HermesConfig } from './config';
import { FileLinkProvider } from './fileLinkProvider';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const config = new HermesConfig();
    const terminalManager = new HermesTerminalManager(config);
    const statusBar = new StatusBarManager(config, terminalManager);

    // --- Session history sidebar ---
    const sessionProvider = new SessionProvider(config);
    const sessionView = vscode.window.createTreeView('hermes.sessions', {
        treeDataProvider: sessionProvider,
        showCollapseAll: false,
    });

    // --- Profile sidebar ---
    const profileProvider = new ProfileProvider(config);
    const profileView = vscode.window.createTreeView('hermes.profiles', {
        treeDataProvider: profileProvider,
        showCollapseAll: false,
    });

    // --- File link provider (clickable paths in terminal output) ---
    const fileLinkProvider = new FileLinkProvider(config);
    context.subscriptions.push(
        vscode.window.registerTerminalLinkProvider(fileLinkProvider)
    );

    // --- Commands ---
    context.subscriptions.push(
        // New Agent — opens a fresh hermes --tui terminal
        vscode.commands.registerCommand('hermes.newAgent', async () => {
            const profile = config.defaultProfile || undefined;
            await terminalManager.startAgent({ profile });
            statusBar.update();
            sessionProvider.refresh();
        }),

        // New Agent with profile picker
        vscode.commands.registerCommand('hermes.newAgentProfile', async () => {
            const profile = await profileProvider.pickProfile();
            if (!profile) return;
            await terminalManager.startAgent({ profile });
            statusBar.update();
            sessionProvider.refresh();
        }),

        // Resume a session from sidebar
        vscode.commands.registerCommand('hermes.resumeSession', async (item: any) => {
            if (!item || !item.sessionId) return;
            await terminalManager.resumeSession(item.sessionId, item.title);
            statusBar.update();
        }),

        // Refresh sessions list
        vscode.commands.registerCommand('hermes.refreshSessions', () => {
            sessionProvider.refresh();
        }),

        // Switch profile (sets default, used for new agents)
        vscode.commands.registerCommand('hermes.switchProfile', async () => {
            const profile = await profileProvider.pickProfile();
            if (!profile) return;
            await config.setDefaultProfile(profile);
            profileProvider.refresh();
            statusBar.update();
            vscode.window.showInformationMessage(`Hermes: Default profile set to "${profile}"`);
        }),

        // Open settings
        vscode.commands.registerCommand('hermes.openSettings', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'hermes');
        }),

        // Stop active agent
        vscode.commands.registerCommand('hermes.stopAgent', async () => {
            const terminal = await terminalManager.pickAgentToStop();
            if (terminal) {
                terminalManager.stopAgent(terminal);
                statusBar.update();
            }
        }),

        // Stop all agents
        vscode.commands.registerCommand('hermes.stopAllAgents', () => {
            const count = terminalManager.stopAllAgents();
            statusBar.update();
            if (count > 0) {
                vscode.window.showInformationMessage(`Hermes: Stopped ${count} agent(s)`);
            }
        }),

        // Open diff (placeholder — future: parse patch from tool output)
        vscode.commands.registerCommand('hermes.openDiff', () => {
            vscode.window.showInformationMessage('Hermes: Diff detection from tool output is automatic. This command is reserved for future use.');
        }),
    );

    // --- Watch for terminal close events ---
    context.subscriptions.push(
        vscode.window.onDidCloseTerminal((terminal) => {
            terminalManager.onTerminalClosed(terminal);
            statusBar.update();
        })
    );

    // --- Watch for active terminal changes ---
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTerminal(() => {
            statusBar.update();
        })
    );

    // --- Config change ---
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('hermes')) {
                config.reload();
                statusBar.update();
                sessionProvider.refresh();
                profileProvider.refresh();
            }
        })
    );

    // --- Initial load ---
    context.subscriptions.push(sessionView, profileView);
    statusBar.update();
    sessionProvider.refresh();
    profileProvider.refresh();

    // Show a welcome message on first activation
    const hasShown = context.globalState.get<boolean>('hermes.welcomeShown', false);
    if (!hasShown) {
        vscode.window.showInformationMessage(
            'Hermes Agent: Extension activated. Click the Hermes icon in the sidebar to get started, or run "Hermes: New Agent" to start a session.',
            'New Agent',
            'Dismiss'
        ).then((choice) => {
            if (choice === 'New Agent') {
                vscode.commands.executeCommand('hermes.newAgent');
            }
        });
        context.globalState.update('hermes.welcomeShown', true);
    }
}

export function deactivate(): void {
    // Terminals are cleaned up by VS Code automatically
}