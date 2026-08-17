import * as vscode from 'vscode';

export class HermesConfig {
    private _config!: vscode.WorkspaceConfiguration;

    constructor() {
        this.reload();
    }

    reload(): void {
        this._config = vscode.workspace.getConfiguration('hermes');
    }

    get serverPort(): number {
        return this._config.get<number>('serverPort', 9119);
    }

    get serverHost(): string {
        return this._config.get<string>('serverHost', '127.0.0.1');
    }

    get autoStartServer(): boolean {
        return this._config.get<boolean>('autoStartServer', true);
    }

    get defaultProfile(): string {
        return this._config.get<string>('defaultProfile', '');
    }

    get sessionLimit(): number {
        return this._config.get<number>('sessionLimit', 50);
    }

    get includeFileContext(): boolean {
        return this._config.get<boolean>('includeFileContext', true);
    }

    get includeWorkspaceContext(): boolean {
        return this._config.get<boolean>('includeWorkspaceContext', true);
    }

    get hermesHome(): string {
        return `${process.env.HOME || process.env.USERPROFILE || ''}/.hermes`;
    }

    async setDefaultProfile(profile: string): Promise<void> {
        await this._config.update('defaultProfile', profile, vscode.ConfigurationTarget.Global);
        this.reload();
    }
}