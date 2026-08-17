import * as vscode from 'vscode';
import { HermesConfig } from './config';
import * as path from 'path';
import * as os from 'os';

export interface AgentTerminal {
    terminal: vscode.Terminal;
    profile?: string;
    sessionId?: string;
    label: string;
    pid?: number;
    startedAt: number;
}

export interface StartAgentOptions {
    profile?: string;
    workdir?: string;
}

export class HermesTerminalManager {
    private agents: Map<string, AgentTerminal> = new Map();
    private agentCounter = 0;

    constructor(private config: HermesConfig) {}

    /**
     * Start a new Hermes agent in a VS Code terminal.
     */
    async startAgent(options: StartAgentOptions = {}): Promise<vscode.Terminal> {
        const id = `hermes-${++this.agentCounter}`;
        const profile = options.profile || this.config.defaultProfile || undefined;
        const cwd = options.workdir || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir();

        // Build the command
        const args: string[] = [];
        if (this.config.useTui) {
            args.push('--tui');
        }
        if (profile) {
            args.push('-p', profile);
        }

        const exe = this.config.executablePath;
        const fullArgs = args.join(' ');
        const label = profile ? `Hermes (${profile})` : `Hermes #${this.agentCounter}`;

        // Create terminal with a shell profile that runs hermes
        const terminal = vscode.window.createTerminal({
            name: label,
            shellPath: exe,
            shellArgs: args,
            cwd: cwd,
            env: {
                // Ensure TERM is set for the TUI
                TERM: process.env.TERM || 'xterm-256color',
            },
            isTransient: false,
        });

        const agentInfo: AgentTerminal = {
            terminal,
            profile,
            label,
            startedAt: Date.now(),
        };

        this.agents.set(id, agentInfo);

        // Show the terminal
        terminal.show(true);

        return terminal;
    }

    /**
     * Resume a session by ID.
     */
    async resumeSession(sessionId: string, title?: string): Promise<vscode.Terminal> {
        const id = `hermes-${++this.agentCounter}`;
        const profile = this.config.defaultProfile || undefined;
        const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir();

        const args: string[] = ['--resume', sessionId];
        if (this.config.useTui) {
            args.unshift('--tui');
        }
        if (profile) {
            args.unshift('-p', profile);
        }

        const exe = this.config.executablePath;
        const label = title ? `Hermes: ${title}` : `Hermes: ${sessionId}`;

        const terminal = vscode.window.createTerminal({
            name: label,
            shellPath: exe,
            shellArgs: args,
            cwd: cwd,
            env: {
                TERM: process.env.TERM || 'xterm-256color',
            },
        });

        const agentInfo: AgentTerminal = {
            terminal,
            profile,
            sessionId,
            label,
            startedAt: Date.now(),
        };

        this.agents.set(id, agentInfo);
        terminal.show(true);

        return terminal;
    }

    /**
     * Get all active agent terminals.
     */
    getActiveAgents(): AgentTerminal[] {
        return Array.from(this.agents.values()).filter(a => {
            // Check if terminal still exists
            return vscode.window.terminals.includes(a.terminal);
        });
    }

    /**
     * Stop a specific agent.
     */
    stopAgent(terminal: vscode.Terminal): void {
        for (const [id, agent] of this.agents) {
            if (agent.terminal === terminal) {
                terminal.dispose();
                this.agents.delete(id);
                return;
            }
        }
    }

    /**
     * Stop all agents.
     */
    stopAllAgents(): number {
        let count = 0;
        for (const [id, agent] of this.agents) {
            agent.terminal.dispose();
            this.agents.delete(id);
            count++;
        }
        return count;
    }

    /**
     * Handle terminal closed event.
     */
    onTerminalClosed(terminal: vscode.Terminal): void {
        for (const [id, agent] of this.agents) {
            if (agent.terminal === terminal) {
                this.agents.delete(id);
                return;
            }
        }
    }

    /**
     * Show a quick pick to choose which agent to stop.
     */
    async pickAgentToStop(): Promise<vscode.Terminal | undefined> {
        const agents = this.getActiveAgents();
        if (agents.length === 0) {
            vscode.window.showInformationMessage('Hermes: No active agents to stop.');
            return undefined;
        }
        if (agents.length === 1) {
            return agents[0].terminal;
        }

        const items = agents.map((a, i) => ({
            label: a.label,
            description: a.profile ? `Profile: ${a.profile}` : 'Default profile',
            detail: `Started ${new Date(a.startedAt).toLocaleTimeString()}`,
            terminal: a.terminal,
        }));

        const chosen = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select an agent to stop',
        });

        return chosen?.terminal;
    }

    /**
     * Get the active agent count.
     */
    get agentCount(): number {
        return this.getActiveAgents().length;
    }
}