import * as vscode from 'vscode';

export class HermesConfig {
    private _config!: vscode.WorkspaceConfiguration;

    constructor() {
        this.reload();
    }

    reload(): void {
        this._config = vscode.workspace.getConfiguration('hermes');
    }

    get executablePath(): string {
        return this._config.get<string>('executablePath', 'hermes');
    }

    get useTui(): boolean {
        return this._config.get<boolean>('useTui', true);
    }

    get defaultProfile(): string {
        return this._config.get<string>('defaultProfile', '');
    }

    get autoOpenFileLinks(): boolean {
        return this._config.get<boolean>('autoOpenFileLinks', true);
    }

    get sessionLimit(): number {
        return this._config.get<number>('sessionLimit', 50);
    }

    async setDefaultProfile(profile: string): Promise<void> {
        await this._config.update('defaultProfile', profile, vscode.ConfigurationTarget.Global);
        this.reload();
    }

    /**
     * Get the hermes home directory (~/.hermes by default).
     */
    get hermesHome(): string {
        const home = process.env.HOME || process.env.USERPROFILE || '';
        return `${home}/.hermes`;
    }

    /**
     * Get the profiles directory.
     */
    get profilesDir(): string {
        return `${this.hermesHome}/profiles`;
    }

    /**
     * Get the sessions database path.
     */
    get sessionsDbPath(): string {
        return `${this.hermesHome}/state.db`;
    }
}