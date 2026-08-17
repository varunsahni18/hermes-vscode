import * as vscode from 'vscode';
import { HermesConfig } from './config';
import { HermesTerminalManager } from './terminalManager';

export class StatusBarManager {
    private statusItem: vscode.StatusBarItem;

    constructor(
        private config: HermesConfig,
        private terminalManager: HermesTerminalManager
    ) {
        this.statusItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            50
        );
        this.statusItem.command = 'hermes.newAgent';
    }

    update(): void {
        const count = this.terminalManager.agentCount;
        const profile = this.config.defaultProfile || 'default';
        const model = this.getActiveModel();

        if (count > 0) {
            this.statusItem.text = `$(terminal) Hermes: ${count} agent${count > 1 ? 's' : ''} • ${model}`;
            this.statusItem.tooltip = `Profile: ${profile}\nModel: ${model}\nClick to start a new agent`;
            this.statusItem.show();
        } else {
            this.statusItem.text = `$(terminal) Hermes: ${model}`;
            this.statusItem.tooltip = `Profile: ${profile}\nModel: ${model}\nClick to start a new agent`;
            this.statusItem.show();
        }
    }

    /**
     * Try to determine the active model from config.
     */
    private getActiveModel(): string {
        // Read from config.yaml if available
        try {
            const fs = require('fs');
            const home = process.env.HOME || process.env.USERPROFILE || '';
            const configPath = `${home}/.hermes/config.yaml`;
            if (fs.existsSync(configPath)) {
                const content = fs.readFileSync(configPath, 'utf8');
                const match = content.match(/^model:\s*\n\s+default:\s*(.+)$/m) ||
                              content.match(/^model:\s*\n\s+default:\s*["'](.+?)["']/m);
                if (match) return match[1].trim().replace(/['"]/g, '');
            }
        } catch {
            // Ignore
        }
        return 'configured';
    }

    dispose(): void {
        this.statusItem.dispose();
    }
}